-- Background sync jobs table
-- Allows large Drive/Gmail syncs to be chunked across multiple short requests,
-- surviving Vercel's 60s function limit and browser tab closure.

CREATE TABLE IF NOT EXISTS sync_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | error
  file_list      JSONB NOT NULL DEFAULT '[]',       -- [{id,name,mimeType}, ...]
  cursor         INT  NOT NULL DEFAULT 0,           -- index of next file to process
  total_files    INT  NOT NULL DEFAULT 0,
  added          INT  NOT NULL DEFAULT 0,
  errors         INT  NOT NULL DEFAULT 0,
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_jobs_user_status  ON sync_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS sync_jobs_stale_pickup ON sync_jobs(status, updated_at);

ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_jobs_own ON sync_jobs
  USING (user_id = auth.uid());
