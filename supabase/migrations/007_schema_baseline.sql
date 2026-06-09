-- 007_schema_baseline.sql
-- Security & schema hardening. Idempotent and additive — safe to run on the
-- existing live database. Does NOT recreate or drop any table.
--
--   1. Enable Row-Level Security + owner policies on user-owned tables.
--   2. Add storage-backend / dedup / status columns to invoices.
--   3. Normalise invoices.amount to numeric(12,2).
--   4. Add covering indexes for the hot query paths.
--
-- The frontend (anon key + user JWT → role `authenticated`) only ever queries
-- `invoices` and `suppliers` directly, always filtered by user_id — so the
-- `auth.uid() = user_id` policies below match existing behaviour and are
-- non-breaking. The backend uses the service-role key, which bypasses RLS.

-- ─── 1. New columns on invoices ──────────────────────────────────────────────
-- attachment_backend: which object store the original file lives in.
--   'supabase' (legacy / default) | 'r2' (Cloudflare R2).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS attachment_backend text NOT NULL DEFAULT 'supabase';
-- file_hash: md5 of the original file bytes — content-dedup + idempotency.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_hash text;
-- attachment_status: 'present' (file stored & openable) | 'pending' (row saved,
--   upload not yet confirmed) | 'missing' (upload failed — needs repair).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS attachment_status text NOT NULL DEFAULT 'present';

-- Backfill: any legacy row with no attachment_path can't be opened — flag it so
-- it surfaces for repair instead of silently 404-ing in the preview modal.
UPDATE invoices
   SET attachment_status = 'missing'
 WHERE attachment_path IS NULL
   AND attachment_status = 'present';

-- ─── 2. amount → numeric(12,2) ───────────────────────────────────────────────
-- Money must never be a float. No-op if already numeric.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'amount'
      AND data_type IN ('double precision', 'real')
  ) THEN
    ALTER TABLE invoices ALTER COLUMN amount TYPE numeric(12,2) USING round(amount::numeric, 2);
  END IF;
END $$;

-- ─── 3. Indexes for hot paths ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_user_id        ON invoices   (user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_status    ON invoices   (user_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_file_hash      ON invoices   (user_id, file_hash);
CREATE INDEX IF NOT EXISTS idx_suppliers_user_id       ON suppliers  (user_id);

-- These tables may not exist in every environment; guard each index.
DO $$
BEGIN
  IF to_regclass('public.sync_events') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sync_events_user_id ON sync_events (user_id);
    CREATE INDEX IF NOT EXISTS idx_sync_events_integration ON sync_events (integration_id, created_at DESC);
  END IF;
  IF to_regclass('public.sync_jobs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs (status, updated_at);
  END IF;
  IF to_regclass('public.integrations') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_integrations_autosync ON integrations (auto_sync_enabled, status);
  END IF;
END $$;

-- ─── 4. Row-Level Security ───────────────────────────────────────────────────
-- Helper: (re)create an owner-scoped policy idempotently.
-- invoices — full CRUD for the owning user (frontend reads/writes directly).
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_select_own" ON invoices;
DROP POLICY IF EXISTS "invoices_insert_own" ON invoices;
DROP POLICY IF EXISTS "invoices_update_own" ON invoices;
DROP POLICY IF EXISTS "invoices_delete_own" ON invoices;
CREATE POLICY "invoices_select_own" ON invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "invoices_insert_own" ON invoices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "invoices_update_own" ON invoices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "invoices_delete_own" ON invoices FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- suppliers — full CRUD for the owning user (frontend reads/writes directly).
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_select_own" ON suppliers;
DROP POLICY IF EXISTS "suppliers_insert_own" ON suppliers;
DROP POLICY IF EXISTS "suppliers_update_own" ON suppliers;
DROP POLICY IF EXISTS "suppliers_delete_own" ON suppliers;
CREATE POLICY "suppliers_select_own" ON suppliers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "suppliers_insert_own" ON suppliers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppliers_update_own" ON suppliers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppliers_delete_own" ON suppliers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- api_calls — server-only (written/read via service-role). Enable RLS with NO
-- authenticated policy → denies all direct client access, allows service role.
ALTER TABLE api_calls ENABLE ROW LEVEL SECURITY;

-- Server-mediated, user-owned tables: enable RLS + read-own policy as defence in
-- depth. The backend (service role) bypasses these; the frontend never queries
-- them directly today, so this cannot break the app.
DO $$
BEGIN
  IF to_regclass('public.integrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE integrations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "integrations_select_own" ON integrations';
    EXECUTE 'CREATE POLICY "integrations_select_own" ON integrations FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF to_regclass('public.sync_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "sync_events_select_own" ON sync_events';
    EXECUTE 'CREATE POLICY "sync_events_select_own" ON sync_events FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF to_regclass('public.sync_jobs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "sync_jobs_select_own" ON sync_jobs';
    EXECUTE 'CREATE POLICY "sync_jobs_select_own" ON sync_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
END $$;
