-- 019_activity_and_quota_indexes.sql
-- Performance audit follow-up: two hot query shapes had no covering index.
--
-- sync_events(user_id, created_at) — the Activity page (server/routes/activity.js)
-- and the notification bell (integrations.js listNotifications) both filter by
-- user_id and sort by created_at desc. Only a single-column user_id index
-- existed, so Postgres had to sort every one of that user's events in memory
-- on every request — this is the concrete query behind the "Integrations page
-- slow to load" report.
--
-- invoices(user_id, created_at) — assertInvoiceLimit (server/lib/plans.js)
-- counts a user's invoices created since their billing period started. It
-- runs on nearly every ingestion path (extract, Drive/Gmail/WhatsApp sync,
-- resync, manual upload, every cron tick per due integration) and had the
-- same gap.
--
-- integrations(type, status) — the WhatsApp webhook (server/routes/webhook.js)
-- looks up a connected integration by type+status on every inbound message,
-- scanning all integrations of that type with no supporting index.
--
-- Additive and idempotent — safe to run against the live table with no data
-- or behavior change; only adds a query-plan option.

CREATE INDEX IF NOT EXISTS idx_sync_events_user_created
  ON sync_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_user_created
  ON invoices (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_integrations_type_status
  ON integrations (type, status);

-- Reversible:
-- DROP INDEX IF EXISTS idx_sync_events_user_created;
-- DROP INDEX IF EXISTS idx_invoices_user_created;
-- DROP INDEX IF EXISTS idx_integrations_type_status;
