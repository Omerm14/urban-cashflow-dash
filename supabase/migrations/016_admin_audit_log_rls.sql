-- admin_audit_log — server-only (written via service-role). Enable RLS with NO
-- authenticated/anon policy → denies all direct client access, allows service
-- role. Matches the api_calls pattern in 007_schema_baseline.sql; the table's
-- own original comment claimed this was already the case, but no
-- ENABLE ROW LEVEL SECURITY statement had ever been run for it.
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
