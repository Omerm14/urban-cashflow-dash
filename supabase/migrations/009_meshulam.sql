-- Rename Stripe columns to Meshulam equivalents
ALTER TABLE subscriptions RENAME COLUMN stripe_customer_id TO meshulam_user_token;
ALTER TABLE subscriptions RENAME COLUMN stripe_subscription_id TO meshulam_subscription_ref;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS meshulam_card_token text;
