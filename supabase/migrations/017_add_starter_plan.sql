-- Adds the 'starter' tier (replaces 'basic' for new sales — see server/lib/plans.js
-- and src/constants/plans.js). Purely additive: 'basic' stays in the allowed set and
-- existing 'basic' subscribers are left untouched. No data migration here — moving
-- legacy 'basic' customers to 'starter'/'pro' is a separate, notice-driven change.
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('free','basic','starter','pro','enterprise'));
