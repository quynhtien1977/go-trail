BEGIN;

-- Keep existing catalog visible; retirement preserves all trip and financial history.
ALTER TABLE public.trips ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Approved catalog rule: retired trips cannot receive new or reopened departures.
-- FOR SHARE conflicts with trip retirement/update locks, preventing a check/write race.
-- Existing departures may still close, run, end, cancel or reschedule independently.
CREATE FUNCTION public.enforce_active_trip_departure() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE trip_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.trip_id = OLD.trip_id AND (NEW.status <> 'Open' OR OLD.status = 'Open') THEN
      RETURN NEW;
    END IF;
  END IF;
  SELECT is_active INTO trip_active FROM public.trips WHERE trip_id = NEW.trip_id FOR SHARE;
  IF trip_active = false THEN
    RAISE EXCEPTION 'Departures require an active trip'
      USING ERRCODE = '23514', CONSTRAINT = 'departures_active_trip_check';
  END IF;
  -- Missing parents remain subject to the existing FK, rather than masking its error.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_active_trip_departure() FROM PUBLIC;
-- Supabase can grant routine access through default privileges as well as PUBLIC.
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.enforce_active_trip_departure() FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
CREATE TRIGGER departures_active_trip_check
  BEFORE INSERT OR UPDATE OF trip_id, status ON public.departures
  FOR EACH ROW EXECUTE FUNCTION public.enforce_active_trip_departure();

COMMIT;
