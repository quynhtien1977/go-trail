BEGIN;

-- PRD 6.3/7.12 (I01/SCRUM-67): one MVP warehouse. Stock is never stored; it is the sum of an
-- append-only ledger, so every receipt, issue to a departure, return and disposal stays traceable.
CREATE TYPE "SupplyCategory" AS ENUM ('Food', 'Drink', 'Gear');
CREATE TYPE "SupplyTransactionType" AS ENUM ('Receive', 'Issue', 'Return', 'Dispose');

CREATE TABLE public.supply_items (
  item_id serial PRIMARY KEY,
  name text NOT NULL,
  category "SupplyCategory" NOT NULL,
  -- One counted unit, e.g. "chai 500ml" or "gói 100g"; quantities are whole numbers of it.
  unit text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT supply_items_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT supply_items_unit_check CHECK (length(btrim(unit)) BETWEEN 1 AND 50)
);
CREATE UNIQUE INDEX "supply_items_name_key" ON public.supply_items (name);

CREATE TABLE public.supply_transactions (
  txn_id serial PRIMARY KEY,
  item_id integer NOT NULL REFERENCES public.supply_items(item_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  txn_type "SupplyTransactionType" NOT NULL,
  quantity integer NOT NULL,
  departure_id integer REFERENCES public.departures(departure_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_by_user_id integer NOT NULL REFERENCES public.users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  idempotency_key text NOT NULL,
  note text,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT supply_transactions_quantity_check CHECK (quantity > 0),
  -- Issue/Return belong to a departure; Receive/Dispose are warehouse-only.
  CONSTRAINT supply_transactions_departure_check CHECK ((txn_type IN ('Issue', 'Return')) = (departure_id IS NOT NULL)),
  CONSTRAINT supply_transactions_key_check CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  CONSTRAINT supply_transactions_note_check CHECK (note IS NULL OR length(btrim(note)) BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX "supply_transactions_idempotency_key_key" ON public.supply_transactions (idempotency_key);
CREATE INDEX "supply_transactions_item_id_created_at_idx" ON public.supply_transactions (item_id, created_at);
CREATE INDEX "supply_transactions_departure_id_idx" ON public.supply_transactions (departure_id);
CREATE INDEX "supply_transactions_created_by_user_id_idx" ON public.supply_transactions (created_by_user_id);

-- Corrections are new rows (Return/Dispose/Receive), never edits or deletes.
CREATE FUNCTION public.reject_supply_ledger_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'supply_transactions is append-only'
    USING ERRCODE = '23001', CONSTRAINT = 'supply_transactions_append_only';
END;
$$;
CREATE TRIGGER supply_transactions_append_only
  BEFORE UPDATE OR DELETE ON public.supply_transactions
  FOR EACH ROW EXECUTE FUNCTION public.reject_supply_ledger_change();

ALTER TABLE public.supply_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.supply_items, public.supply_transactions FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.supply_items_item_id_seq, public.supply_transactions_txn_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_supply_ledger_change() FROM PUBLIC;
-- Supabase can grant table, sequence and routine access through default privileges as well as PUBLIC.
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.supply_items, public.supply_transactions FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.supply_items_item_id_seq, public.supply_transactions_txn_id_seq FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON FUNCTION public.reject_supply_ledger_change() FROM %I', api_role);
    END IF;
  END LOOP;
END $$;

COMMIT;
