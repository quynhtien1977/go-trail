BEGIN;

-- PRD 6.2: snapshot the responsible RouteMgr on each new invoice at hold time.
-- Existing invoices stay NULL rather than receiving an invented owner.
ALTER TABLE "invoices"
  ADD COLUMN "responsible_user_id" INTEGER,
  ADD COLUMN "responsible_name_snapshot" TEXT,
  ADD COLUMN "responsible_role_snapshot" "UserRole",
  ADD COLUMN "idempotency_key" TEXT;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_responsible_user_id_fkey"
  FOREIGN KEY ("responsible_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- The snapshot is all-or-nothing so no invoice names a half-recorded owner.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_responsible_snapshot_check" CHECK (
  ("responsible_user_id" IS NULL) = ("responsible_name_snapshot" IS NULL)
  AND ("responsible_user_id" IS NULL) = ("responsible_role_snapshot" IS NULL));
CREATE INDEX "invoices_responsible_user_id_idx" ON "invoices"("responsible_user_id");
-- A retried hold request with the same key returns the invoice it already created.
CREATE UNIQUE INDEX "invoices_customer_id_idempotency_key_key" ON "invoices"("customer_id", "idempotency_key");

COMMIT;
