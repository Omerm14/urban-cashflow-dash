-- 008_subscriptions.sql
-- Subscription / plan management table.
-- Supports free | basic | pro | enterprise tiers with Stripe billing.
--
-- Design decisions:
--   • One row per user. Upserted by the backend on signup and after every
--     Stripe webhook event (checkout.session.completed, subscription.updated,
--     subscription.deleted, invoice.payment_failed).
--   • Frontend reads its own row directly (SELECT policy below).
--     All writes go through the service-role backend only.
--   • Free plan row is created automatically on first login via a Postgres
--     function + trigger on auth.users, so the frontend always has a row.

-- ─── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Plan tier
  plan                    text NOT NULL DEFAULT 'free'
                            CHECK (plan IN ('free','basic','pro','enterprise')),

  -- Stripe billing state
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','canceled','past_due','trialing')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- One subscription row per user
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique ON subscriptions (user_id);

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);

-- Fast lookup by Stripe IDs (for webhook processing)
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ─── updated_at auto-stamp ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Auto-create free subscription on new user signup ────────────────────────
CREATE OR REPLACE FUNCTION create_free_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_free_subscription();

-- ─── Row-Level Security ───────────────────────────────────────────────────────
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription (frontend needs this for usePlan hook)
DROP POLICY IF EXISTS "subscriptions_select_own" ON subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE for authenticated role — service role only.
-- This prevents clients from self-upgrading their plan.
