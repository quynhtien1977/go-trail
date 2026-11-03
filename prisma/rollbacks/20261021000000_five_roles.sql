-- Manual, schema-only compatibility recovery. NOT a Prisma forward migration.
-- Do not automatically restore Accountant privileges, unlock users or decrement
-- auth_version: that would revive revoked access. Keep all migration audit rows.
-- Review Prisma migration-history reconciliation before returning to deploy.
ALTER TYPE public."UserRole" ADD VALUE IF NOT EXISTS 'Accountant' BEFORE 'Admin';
