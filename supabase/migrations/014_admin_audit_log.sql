-- Accountability log for admin-initiated writes (user delete/ban, subscription override).
-- Service-role only — no RLS policies, never exposed via anon/authenticated roles, matching
-- how subscriptions writes already work.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email     text NOT NULL,
  action          text NOT NULL,  -- 'user.delete' | 'user.ban' | 'user.unban' | 'subscription.override'
  target_user_id  uuid,
  details         jsonb,
  created_at      timestamptz DEFAULT now()
);
