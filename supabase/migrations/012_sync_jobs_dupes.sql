-- Add duplicate-skipped counter to sync_jobs for bell notification display
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS dupes INT NOT NULL DEFAULT 0;
