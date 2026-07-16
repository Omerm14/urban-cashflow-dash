-- Hyp payment gateway billing state. Purely additive — no changes to existing
-- columns (Stripe/Meshulam) or data. Checkouts are admin-generated only (see
-- server/routes/admin.js generateBillingLink); these columns get populated
-- once a client completes payment via the MAC-verified redirect handler in
-- server/routes/billing.js, and read by the recurring-billing cron job in
-- server/routes/cron.js.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS hyp_card_token text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS hyp_card_exp text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS hyp_terminal_number text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS hyp_last_charge_uid text;
