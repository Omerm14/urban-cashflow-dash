-- Lets a user request cancellation of an in-progress blocking sync (Gmail, Green Invoice).
-- Drive already supports cancellation via sync_jobs.status; this covers the two integration
-- types that still run as a single blocking request instead of a polled job.
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false;
