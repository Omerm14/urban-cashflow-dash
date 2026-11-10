-- 020_collections.sql
-- Collections (גבייה): customers and the receivables they owe the user.
--
-- Additive only — creates two new tables, touches no existing table or row.
-- Receivables live in their own table rather than in `invoices` on purpose:
-- `invoices` is the supplier-payables model and feeds supplier KPIs, the
-- Dashboard, dedup, sync, plan invoice limits and the Calendar. Mixing
-- money-owed-to-the-user into it would require a filter in every one of those.
--
-- Status is derived, never stored:
--   collected_date IS NOT NULL            → collected
--   collected_date IS NULL, expected < today → overdue
--   otherwise                              → open
--
-- Frontend reads/writes both tables directly with the anon key; RLS below scopes
-- every row to its owner. Run on staging first. Rollback block at the bottom.

-- ─── customers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) > 0),
  phone      text,
  email      text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Target for the composite FK below, so a receivable can only reference a
  -- customer owned by the same user.
  CONSTRAINT customers_id_user_unique UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers (user_id);

-- ─── receivables ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receivables (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  expected_date  date NOT NULL,
  collected_date date,
  reference      text,
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- RESTRICT: a customer with receivables cannot be deleted (no silent data loss).
  CONSTRAINT receivables_customer_fk FOREIGN KEY (customer_id, user_id)
    REFERENCES customers (id, user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_receivables_user_expected ON receivables (user_id, expected_date);
CREATE INDEX IF NOT EXISTS idx_receivables_customer     ON receivables (customer_id);

-- Keep updated_at honest on every UPDATE.
CREATE OR REPLACE FUNCTION receivables_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_receivables_updated_at ON receivables;
CREATE TRIGGER trg_receivables_updated_at
  BEFORE UPDATE ON receivables
  FOR EACH ROW EXECUTE FUNCTION receivables_set_updated_at();

-- ─── RLS (same owner policies as suppliers in 007_schema_baseline.sql) ───────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_select_own" ON customers;
DROP POLICY IF EXISTS "customers_insert_own" ON customers;
DROP POLICY IF EXISTS "customers_update_own" ON customers;
DROP POLICY IF EXISTS "customers_delete_own" ON customers;
CREATE POLICY "customers_select_own" ON customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "customers_insert_own" ON customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customers_update_own" ON customers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customers_delete_own" ON customers FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "receivables_select_own" ON receivables;
DROP POLICY IF EXISTS "receivables_insert_own" ON receivables;
DROP POLICY IF EXISTS "receivables_update_own" ON receivables;
DROP POLICY IF EXISTS "receivables_delete_own" ON receivables;
CREATE POLICY "receivables_select_own" ON receivables FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "receivables_insert_own" ON receivables FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "receivables_update_own" ON receivables FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "receivables_delete_own" ON receivables FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── ROLLBACK (manual; destroys collections data — only before real use) ─────
-- DROP TRIGGER IF EXISTS trg_receivables_updated_at ON receivables;
-- DROP FUNCTION IF EXISTS receivables_set_updated_at();
-- DROP TABLE IF EXISTS receivables;
-- DROP TABLE IF EXISTS customers;
