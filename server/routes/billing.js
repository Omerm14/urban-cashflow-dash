const express = require('express');
const router = express.Router();
const { getPlanUsage, ensureSubscription } = require('../lib/plans');
const { verifyResponseMac } = require('../lib/hyp');
const { isUUID } = require('../lib/validate');
const supabase = require('../lib/supabase');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// GET /api/billing/usage — return current plan and invoice usage
router.get('/usage', async (req, res) => {
  try {
    await ensureSubscription(req.user.id);
    const usage = await getPlanUsage(req.user.id);
    res.json(usage);
  } catch (err) {
    console.error('billing/usage error', err);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// GET /api/billing/redirect — Hyp sends the client's browser here after a
// payment-page checkout (success, error, or cancel all land here — see
// server/routes/admin.js generateBillingLink, which sets successUrl/errorUrl/
// cancelUrl to this same route). No auth middleware: this is a plain browser
// redirect target, not an API call the client makes directly.
//
// There is no public route that *creates* a checkout — only an admin can do
// that (see generateBillingLink). This route only *confirms* one, and it
// only trusts the responseMac, which is keyed by the merchant password the
// client's browser cannot know. Everything else in the query string
// (including userId/plan, both embedded in uniqueID) is treated as untrusted
// input until the MAC check passes.
async function redirect(req, res) {
  const { uniqueID, txId, errorCode, cardToken, cardExp, personalId, responseMac } = req.query;

  const [userId, plan] = String(uniqueID || '').split(':');

  if (!txId || !uniqueID || !isUUID(userId) || !plan) {
    console.warn('[hyp] redirect missing required fields');
    return res.redirect(`${FRONTEND_URL}/?checkout=error`);
  }

  const macValid = verifyResponseMac(
    { password: process.env.HYP_API_PASSWORD, txId, errorCode, cardToken, cardExp, personalId, uniqueId: uniqueID },
    responseMac,
  );
  const transactionOk = !errorCode || errorCode === '000';

  if (!macValid || !transactionOk) {
    console.warn('[hyp] redirect rejected', { userId, plan, macValid, errorCode: errorCode || null });
    return res.redirect(`${FRONTEND_URL}/?checkout=error`);
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  const { error } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    plan,
    status: 'active',
    hyp_card_token: cardToken || null,
    hyp_card_exp: cardExp || null,
    hyp_terminal_number: process.env.HYP_TERMINAL_NUMBER || null,
    hyp_last_charge_uid: txId,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'user_id' });

  if (error) {
    console.error('[hyp] subscription activation failed:', error.message);
    return res.redirect(`${FRONTEND_URL}/?checkout=error`);
  }

  res.redirect(`${FRONTEND_URL}/app?checkout=success`);
}

module.exports = { router, redirect };
