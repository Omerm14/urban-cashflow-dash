const supabase = require('./supabase');

// Canonical plan config (server). Mirrors src/constants/plans.js — cross-
// checked by tests/plan-parity.test.js so the two can't silently drift.
//
// `basic` (₪99) is retired from sale but kept fully intact for existing
// subscribers — it is never offered in any new-purchase UI, only used to
// resolve legacy accounts correctly.
const PLANS = {
  free:       { invoicesPerMonth: 20,  sources: 1, autoSync: false, bulkActions: false, csvExport: false, auditTrail: false, price: 0,   name: 'Free' },
  basic:      { invoicesPerMonth: 50,  sources: 2, autoSync: false, bulkActions: false, csvExport: true,  auditTrail: false, price: 99,  name: 'Basic' },
  starter:    { invoicesPerMonth: 75,  sources: 2, autoSync: false, bulkActions: false, csvExport: true,  auditTrail: false, price: 199, name: 'Starter' },
  pro:        { invoicesPerMonth: 300, sources: 4, autoSync: true,  bulkActions: true,  csvExport: true,  auditTrail: true,  price: 399, name: 'Pro' },
  enterprise: { invoicesPerMonth: Infinity, sources: 4, autoSync: true, bulkActions: true, csvExport: true, auditTrail: true, price: 799, name: 'Enterprise' },
};

// Ensure a subscription row exists for the user (idempotent). Called on first
// API request if the auth trigger somehow missed the signup.
async function ensureSubscription(userId) {
  await supabase
    .from('subscriptions')
    .upsert({ user_id: userId, plan: 'free', status: 'active' }, { onConflict: 'user_id', ignoreDuplicates: true });
}

// Returns { plan, limit, used, remaining, pct }
async function getPlanUsage(userId) {
  await ensureSubscription(userId);

  const [subResult, countResult] = await Promise.all([
    supabase.from('subscriptions').select('plan,status').eq('user_id', userId).single(),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  const plan  = subResult.data?.plan  || 'free';
  const limit = PLANS[plan]?.invoicesPerMonth ?? 20;
  const used  = countResult.count ?? 0;
  const remaining = Math.max(0, limit === Infinity ? Infinity : limit - used);
  const pct   = limit === Infinity ? 0 : used / limit;

  return { plan, limit, used, remaining, pct };
}

// Invoice caps are soft: this never blocks ingestion. Callers use the
// returned usage to decide whether to show an upgrade nudge.
async function checkInvoiceLimit(userId) {
  return getPlanUsage(userId);
}

// Throws a structured 402 error if the user has reached their plan's monthly
// invoice quota — hard-blocks ingestion (unlike checkInvoiceLimit's soft
// nudge), so a client can't exceed their plan's invoicesPerMonth by any
// ingestion path (manual upload, sync trigger, resync, translate, cron
// auto-sync, WhatsApp webhook).
async function assertInvoiceLimit(userId) {
  const usage = await getPlanUsage(userId);
  if (usage.limit !== Infinity && usage.used >= usage.limit) {
    const err = new Error('Plan invoice limit reached');
    err.statusCode = 402;
    err.code = 'PLAN_LIMIT_REACHED';
    err.used  = usage.used;
    err.limit = usage.limit;
    err.plan  = usage.plan;
    throw err;
  }
  return usage;
}

// Throws a structured 403 error if connecting `type` would exceed the plan's
// sync-source cap. Reconnecting an already-owned source type never counts
// against the cap — only counts distinct *connected* types.
async function assertSourceLimit(userId, type) {
  const [subResult, sourcesResult] = await Promise.all([
    supabase.from('subscriptions').select('plan').eq('user_id', userId).single(),
    supabase.from('integrations').select('type').eq('user_id', userId).eq('status', 'connected'),
  ]);

  const plan  = subResult.data?.plan || 'free';
  const limit = PLANS[plan]?.sources ?? 1;
  const connectedTypes = new Set((sourcesResult.data || []).map(r => r.type));

  if (connectedTypes.has(type)) return { plan, limit, used: connectedTypes.size };

  if (connectedTypes.size >= limit) {
    const err = new Error('Plan sync-source limit reached');
    err.statusCode = 403;
    err.code = 'SOURCE_LIMIT_REACHED';
    err.used  = connectedTypes.size;
    err.limit = limit;
    err.plan  = plan;
    throw err;
  }

  return { plan, limit, used: connectedTypes.size };
}

// Throws a structured 403 error if the user's plan doesn't include auto-sync
// (only pro/enterprise do — see PLANS above). Enforces the same cap client-side
// UI already advertises, so a direct API call can't enable it on a plan that
// shouldn't have it.
async function assertAutoSyncAllowed(userId) {
  const { data: sub } = await supabase.from('subscriptions').select('plan').eq('user_id', userId).single();
  const plan = sub?.plan || 'free';
  if (!PLANS[plan]?.autoSync) {
    const err = new Error('Plan does not include auto-sync');
    err.statusCode = 403;
    err.code = 'AUTO_SYNC_NOT_AVAILABLE';
    err.plan = plan;
    throw err;
  }
  return { plan };
}

// Throws a structured 403 error if the user's plan doesn't have `entitlement`
// (one of PLANS[plan]'s boolean feature flags — csvExport, bulkActions,
// auditTrail). These flags were previously enforced client-side only (UI
// hides the button), which a valid-session user could bypass entirely by
// calling the Supabase client or this API directly — RLS scopes by user_id,
// not by plan tier.
async function assertEntitlement(userId, entitlement) {
  const { data: sub } = await supabase.from('subscriptions').select('plan').eq('user_id', userId).single();
  const plan = sub?.plan || 'free';
  if (!PLANS[plan]?.[entitlement]) {
    const err = new Error(`Plan does not include ${entitlement}`);
    err.statusCode = 403;
    err.code = 'ENTITLEMENT_REQUIRED';
    err.entitlement = entitlement;
    err.plan = plan;
    throw err;
  }
  return { plan };
}

module.exports = { PLANS, getPlanUsage, checkInvoiceLimit, assertInvoiceLimit, assertSourceLimit, assertAutoSyncAllowed, assertEntitlement, ensureSubscription };
