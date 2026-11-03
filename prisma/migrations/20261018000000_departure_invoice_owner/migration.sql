BEGIN;

-- PRD 6.2: each departure names the RouteMgr responsible for its new invoices.
-- Existing departures stay NULL rather than receiving an invented owner.
ALTER TABLE "departures" ADD COLUMN "invoice_owner_user_id" INTEGER;
ALTER TABLE "departures" ADD CONSTRAINT "departures_invoice_owner_user_id_fkey"
  FOREIGN KEY ("invoice_owner_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "departures_invoice_owner_user_id_idx" ON "departures"("invoice_owner_user_id");

COMMIT;
