// GET /api/activity — the audit trail (every auto-synced file's origin,
// timestamp, outcome). CASH-95: ActivityView previously read sync_events
// directly from Supabase under the user's own JWT and gated the UI on
// entitlements.auditTrail client-side only — RLS scopes by user_id, not by
// plan tier, so a Free/Starter user could call supabase.from('sync_events')
// directly and read data the UI hides from them. This endpoint is the
// server-side gate: it 403s before the read for a non-entitled plan.
const supabase = require('../lib/supabase');
const { assertEntitlement } = require('../lib/plans');
const { handlePlanCheckError } = require('../lib/planErrors');

exports.listActivity = async (req, res) => {
  try {
    await assertEntitlement(req.user.id, 'auditTrail');
  } catch (entErr) {
    if (entErr.code === 'ENTITLEMENT_REQUIRED') {
      return res.status(403).json({ error: entErr.code, entitlement: entErr.entitlement, plan: entErr.plan });
    }
    if (handlePlanCheckError(entErr, res, 'activity:listActivity')) return;
    throw entErr;
  }

  const [{ data: events, error: evErr }, { data: integrations, error: intErr }] = await Promise.all([
    supabase.from('sync_events').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(200),
    supabase.from('integrations').select('id,type').eq('user_id', req.user.id),
  ]);
  if (evErr)  { console.error('[activity] events error:', evErr.message); return res.status(500).json({ error: 'Internal server error' }); }
  if (intErr) { console.error('[activity] integrations error:', intErr.message); return res.status(500).json({ error: 'Internal server error' }); }

  res.json({ events: events || [], integrations: integrations || [] });
};
