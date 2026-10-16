BEGIN;
CREATE TYPE "TripMediaPlacement" AS ENUM ('Cover', 'Hero', 'Highlight', 'Schedule');
CREATE TABLE public.trip_media (
  media_id serial PRIMARY KEY,
  trip_id integer NOT NULL REFERENCES public.trips(trip_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  placement "TripMediaPlacement" NOT NULL,
  sort_order integer NOT NULL,
  source_url text NOT NULL,
  storage_url text NOT NULL,
  content_sha256 char(64) NOT NULL,
  alt_text text NOT NULL,
  caption text,
  title text,
  body text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT trip_media_order_check CHECK (sort_order BETWEEN 0 AND 99 AND (placement <> 'Cover' OR sort_order = 0)),
  CONSTRAINT trip_media_hash_check CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT trip_media_highlight_check CHECK (
    (placement = 'Highlight' AND title IS NOT NULL AND length(btrim(title)) > 0 AND (body IS NULL OR length(btrim(body)) > 0))
    OR (placement <> 'Highlight' AND title IS NULL AND body IS NULL)),
  CONSTRAINT trip_media_trip_id_placement_sort_order_key UNIQUE (trip_id, placement, sort_order)
);
ALTER TABLE public.trip_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trip_media FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.trip_media_media_id_seq FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.trip_media FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.trip_media_media_id_seq FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
