const supabase = require('./supabase');

const PLANS = {
  free:       { invoicesPerMonth: 20,  sources: 1, autoSync: false, auditTrail: false, name: 'Free' },
  basic:      { invoicesPerMonth: 50,  sources: 2, autoSync: false, auditTrail: false, name: 'Basic' },
  pro:        { invoicesPerMonth: 150, sources: 4, autoSync: true,  auditTrail: true,  name: 'Pro' },
  enterprise: { invoicesPerMonth: Infinity, sources: 4, autoSync: true, auditTrail: true, name: 'Enterprise' },
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

// Throws a structured 402 error object if the user is at or over their limit.
// Callers should catch and respond with res.status(402).json(err).
async function assertInvoiceLimit(userId) {
  const usage = await getPlanUsage(userId);
  if (usage.pct >= 1) {
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

module.exports = { PLANS, getPlanUsage, assertInvoiceLimit, ensureSubscription };
