BEGIN;

-- Cron is a system actor, not a human. Existing user-linked audit entries remain unchanged.
ALTER TABLE public.audit_logs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_system_actor_check
  CHECK (user_id IS NOT NULL OR (action = 'DepartureStatusChanged' AND table_name = 'departures'));

COMMIT;
