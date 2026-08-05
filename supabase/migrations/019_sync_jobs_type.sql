-- sync_jobs was documented as chunking "large Drive/Gmail syncs" (see 004_sync_jobs.sql)
-- but only Drive ever actually used it — Gmail synced everything in one unbounded
-- blocking request, which could exceed Vercel's 60s function limit on a large backlog.
-- Adding `type` lets a job row say which resume path (Drive file batch vs Gmail
-- message batch) should process it; existing rows are all Drive, hence the default.
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'google_drive';
