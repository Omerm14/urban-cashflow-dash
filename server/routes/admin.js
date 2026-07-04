const auth     = require('../middleware/auth');
const isAdmin  = require('../middleware/isAdmin');
const supabase = require('../lib/supabase');
const { PLANS } = require('../lib/plans');
const { deleteUserData } = require('../lib/accountCleanup');
const { isUUID } = require('../lib/validate');

const STATUSES = ['active', 'canceled', 'past_due', 'trialing'];

const logAdminAction = (adminEmail, action, targetUserId, details = {}) => {
  supabase.from('admin_audit_log').insert({
    admin_email: adminEmail, action, target_user_id: targetUserId, details,
  }).then(({ error }) => { if (error) console.error('[admin_audit_log]', error.message); });
};

// GET /api/admin/whoami — [auth] only, no isAdmin gate: its job is to *report* admin
// status so the frontend knows whether to show the Admin nav item, not to require it.
// Never returns the email list itself.
exports.whoami = [auth, (req, res) => {
  const email = req.user?.email?.toLowerCase();
  res.json({ isAdmin: !!email && isAdmin.adminEmails().includes(email) });
}];

// Cost per 1M tokens (claude-haiku-4-5): $0.80 input, $4.00 output
const INPUT_COST  = 0.80 / 1_000_000;
const OUTPUT_COST = 4.00 / 1_000_000;

// GET /api/admin/usage — existing Claude-API cost dashboard, unchanged logic.
exports.usage = [auth, isAdmin, async (req, res) => {
  try {
    const { data: calls, error } = await supabase
      .from('api_calls')
      .select('user_id, model, input_tokens, output_tokens, ts')
      .order('ts', { ascending: true });
    if (error) throw error;

    const userIds = [...new Set(calls.map(c => c.user_id).filter(Boolean))];
    const emailMap = {};
    if (userIds.length) {
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      users.forEach(u => { emailMap[u.id] = u.email; });
    }

    const byUserMap = {};
    let totalCalls = 0, totalInput = 0, totalOutput = 0;
    calls.forEach(c => {
      const email = emailMap[c.user_id] || c.user_id || 'unknown';
      if (!byUserMap[email]) byUserMap[email] = { email, calls: 0, inputTokens: 0, outputTokens: 0 };
      byUserMap[email].calls++;
      byUserMap[email].inputTokens  += c.input_tokens  || 0;
      byUserMap[email].outputTokens += c.output_tokens || 0;
      totalCalls++;
      totalInput  += c.input_tokens  || 0;
      totalOutput += c.output_tokens || 0;
    });

    const byUser = Object.values(byUserMap).map(u => ({
      ...u,
      estimatedCostUSD: u.inputTokens * INPUT_COST + u.outputTokens * OUTPUT_COST,
    })).sort((a, b) => b.calls - a.calls);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dayMap = {};
    calls.filter(c => c.ts >= thirtyDaysAgo).forEach(c => {
      const day = c.ts.split('T')[0];
      dayMap[day] = (dayMap[day] || 0) + 1;
    });
    const timeline = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, calls]) => ({ date, calls }));

    res.json({
      totals: {
        calls: totalCalls,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        estimatedCostUSD: totalInput * INPUT_COST + totalOutput * OUTPUT_COST,
      },
      byUser,
      timeline,
    });
  } catch (err) {
    console.error('Admin usage error:', err.message);
    res.status(500).json({ error: err.message });
  }
}];

// GET /api/admin/users?query=&page=&perPage= — list every user, joined with plan + this
// month's invoice count. Supabase's listUsers paginates server-side; `query` filters within
// the fetched page only (the Admin API has no global search), which is fine at this scale.
exports.listUsers = [auth, isAdmin, async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage, 10) || 20));
    const query   = (req.query.query || '').trim().toLowerCase();

    const { data: { users, total }, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const filtered = query ? users.filter(u => u.email?.toLowerCase().includes(query)) : users;
    const ids = filtered.map(u => u.id);

    const [{ data: subs }, { data: monthInvoices }] = await Promise.all([
      ids.length ? supabase.from('subscriptions').select('*').in('user_id', ids) : { data: [] },
      ids.length
        ? supabase.from('invoices').select('user_id')
            .in('user_id', ids)
            .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
        : { data: [] },
    ]);
    const subByUser   = Object.fromEntries((subs || []).map(s => [s.user_id, s]));
    const usageByUser = {};
    (monthInvoices || []).forEach(i => { usageByUser[i.user_id] = (usageByUser[i.user_id] || 0) + 1; });

    res.json({
      users: filtered.map(u => ({
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        bannedUntil: u.banned_until || null,
        plan: subByUser[u.id]?.plan || 'free',
        status: subByUser[u.id]?.status || 'active',
        invoicesThisMonth: usageByUser[u.id] || 0,
      })),
      page, perPage, total,
    });
  } catch (err) {
    console.error('[admin] listUsers error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}];

// DELETE /api/admin/users/:userId — reuses the same cleanup sequence self-service account
// deletion uses, parameterized to an arbitrary target instead of always req.user.id.
exports.deleteUser = [auth, isAdmin, async (req, res) => {
  const { userId } = req.params;
  if (!isUUID(userId)) return res.status(400).json({ error: 'Invalid user id' });
  try {
    await deleteUserData(userId);
    logAdminAction(req.user.email, 'user.delete', userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] deleteUser error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
}];

// POST /api/admin/users/:userId/ban — temporarily block sign-in without deleting data.
exports.banUser = [auth, isAdmin, async (req, res) => {
  const { userId } = req.params;
  if (!isUUID(userId)) return res.status(400).json({ error: 'Invalid user id' });
  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' }); // ~100 years
    if (error) throw error;
    logAdminAction(req.user.email, 'user.ban', userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] banUser error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to ban user' });
  }
}];

// POST /api/admin/users/:userId/unban
exports.unbanUser = [auth, isAdmin, async (req, res) => {
  const { userId } = req.params;
  if (!isUUID(userId)) return res.status(400).json({ error: 'Invalid user id' });
  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    if (error) throw error;
    logAdminAction(req.user.email, 'user.unban', userId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] unbanUser error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to unban user' });
  }
}];

// GET /api/admin/subscriptions — every subscription row, joined with email, annotated with
// a providerConflict flag when both Stripe and Meshulam ID columns are populated on one row
// (the table has no provider/source column, so there's no way to tell "who's right" beyond
// surfacing both raw ID sets for manual investigation).
exports.listSubscriptions = [auth, isAdmin, async (req, res) => {
  try {
    const [{ data: subs, error }, { data: { users } }] = await Promise.all([
      supabase.from('subscriptions').select('*'),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    if (error) throw error;
    const emailMap = Object.fromEntries((users || []).map(u => [u.id, u.email]));

    res.json({
      subscriptions: (subs || []).map(s => ({
        userId: s.user_id,
        email: emailMap[s.user_id] || s.user_id,
        plan: s.plan,
        status: s.status,
        currentPeriodEnd: s.current_period_end,
        stripeCustomerId: s.stripe_customer_id,
        stripeSubscriptionId: s.stripe_subscription_id,
        meshulamUserToken: s.meshulam_user_token,
        meshulamSubscriptionRef: s.meshulam_subscription_ref,
        providerConflict: Boolean(
          (s.stripe_customer_id || s.stripe_subscription_id) &&
          (s.meshulam_user_token || s.meshulam_subscription_ref)
        ),
      })),
    });
  } catch (err) {
    console.error('[admin] listSubscriptions error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}];

// PATCH /api/admin/subscriptions/:userId  { plan, status } — writes directly to the
// subscriptions row ONLY. Does not call Stripe/Meshulam — a future webhook/IPN for this
// user can silently overwrite this override, which the frontend must make visibly clear.
exports.updateSubscription = [auth, isAdmin, async (req, res) => {
  const { userId } = req.params;
  const { plan, status } = req.body;
  if (!isUUID(userId)) return res.status(400).json({ error: 'Invalid user id' });
  if (!Object.keys(PLANS).includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  try {
    const { data: before } = await supabase.from('subscriptions').select('plan,status').eq('user_id', userId).single();
    const { error } = await supabase.from('subscriptions').update({ plan, status }).eq('user_id', userId);
    if (error) throw error;
    logAdminAction(req.user.email, 'subscription.override', userId, { before, after: { plan, status } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin] updateSubscription error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}];
