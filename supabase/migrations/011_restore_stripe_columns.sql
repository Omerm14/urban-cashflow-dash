-- 011_restore_stripe_columns.sql
-- Migration 009 renamed stripe_customer_id → meshulam_user_token and
-- stripe_subscription_id → meshulam_subscription_ref, breaking the Stripe
-- webhook handler. Both billing systems must coexist (see CLAUDE.md).
--
-- Restore dedicated Stripe columns alongside the Meshulam ones.
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Fast lookup by Stripe IDs (for webhook event routing)
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id
  ON subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id
  ON subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
