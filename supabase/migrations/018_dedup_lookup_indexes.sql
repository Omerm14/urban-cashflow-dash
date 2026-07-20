-- 018_dedup_lookup_indexes.sql
-- CASH-8: dedup lookups now query Postgres directly per-candidate (exact
-- invoice_no match, or fuzzy amount+invoice_date match) instead of loading a
-- user's entire invoice history into memory. Add covering indexes for both
-- query shapes so those lookups stay fast at scale. Additive and idempotent.

CREATE INDEX IF NOT EXISTS idx_invoices_user_invoice_no
  ON invoices (user_id, invoice_no);

CREATE INDEX IF NOT EXISTS idx_invoices_user_amount_date
  ON invoices (user_id, amount, invoice_date);

-- Reversible:
-- DROP INDEX IF EXISTS idx_invoices_user_invoice_no;
-- DROP INDEX IF EXISTS idx_invoices_user_amount_date;
