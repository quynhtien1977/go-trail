-- A02 / SCRUM-62: approved A03 mapping. Apply with the matching five-role app
-- while application writes are stopped; the enum swap briefly locks users.
BEGIN;

SET LOCAL lock_timeout = '5s';
-- Same lock as Admin account-access changes; take it before locking users.
SELECT pg_advisory_xact_lock(717002);
LOCK TABLE public.users IN ACCESS EXCLUSIVE MODE;

-- audit_logs.user_id is non-null: automated events reference the affected user,
-- not an invented Admin operator. Metadata explicitly identifies the migration.
WITH legacy AS MATERIALIZED (
    SELECT user_id, status::text AS previous_status
    FROM public.users WHERE role::text = 'Accountant'
), changed AS (
    UPDATE public.users AS u
    SET role = 'Customer', status = 'Locked', auth_version = u.auth_version + 1
    FROM legacy WHERE u.user_id = legacy.user_id
    RETURNING u.user_id, legacy.previous_status
)
INSERT INTO public.audit_logs (user_id, action, table_name, record_id, description)
SELECT user_id, 'RoleChanged', 'users', user_id::text,
    jsonb_build_object('action', 'RoleChanged', 'record_id', user_id,
        'from', 'Accountant', 'to', 'Customer', 'source', 'SystemMigration',
        'migration', '20261021000000_five_roles')::text
FROM changed
UNION ALL
SELECT user_id, 'AccountStatusChanged', 'users', user_id::text,
    jsonb_build_object('action', 'AccountStatusChanged', 'record_id', user_id,
        'from', previous_status, 'to', 'Locked', 'source', 'SystemMigration',
        'migration', '20261021000000_five_roles')::text
FROM changed WHERE previous_status <> 'Locked';

-- PostgreSQL cannot DROP VALUE from an enum. Data has been migrated first;
-- replace only its type, preserving the role column/default and every FK row.
CREATE TYPE public."UserRole_new" AS ENUM ('Customer', 'Leader', 'RouteMgr', 'HRMgr', 'Admin');
ALTER TABLE public.users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.users ALTER COLUMN role TYPE public."UserRole_new"
    USING (role::text::public."UserRole_new");
ALTER TYPE public."UserRole" RENAME TO "UserRole_old";
ALTER TYPE public."UserRole_new" RENAME TO "UserRole";
DROP TYPE public."UserRole_old";
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'Customer'::public."UserRole";

COMMIT;
