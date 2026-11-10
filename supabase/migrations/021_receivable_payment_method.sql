-- 021_receivable_payment_method.sql
-- How a receivable was paid (Collections v2). Additive only: one nullable column,
-- so every existing row stays valid (NULL = not recorded / not collected yet).
-- The allowed values mirror PAYMENT_METHODS in src/utils/collections.js and
-- server/lib/collectionsImport.js (tests/collectionsPaymentMethods.test.js keeps all three in sync).
-- Run on production BEFORE merging the PR that uses it.

ALTER TABLE receivables ADD COLUMN IF NOT EXISTS payment_method text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_payment_method_check') THEN
    ALTER TABLE receivables ADD CONSTRAINT receivables_payment_method_check
      CHECK (payment_method IS NULL OR payment_method IN
        ('bank_transfer', 'credit_card', 'cash', 'cheque', 'bit_paybox', 'other'));
  END IF;
END $$;

-- ─── ROLLBACK (manual) ───────────────────────────────────────────────────────
-- ALTER TABLE receivables DROP CONSTRAINT IF EXISTS receivables_payment_method_check;
-- ALTER TABLE receivables DROP COLUMN IF EXISTS payment_method;
