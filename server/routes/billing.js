const express = require('express');
const router = express.Router();
const { getPlanUsage, ensureSubscription } = require('../lib/plans');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MESHULAM_USER_ID  = process.env.MESHULAM_USER_ID  || '';
const MESHULAM_API_KEY  = process.env.MESHULAM_API_KEY  || '';
const MESHULAM_PAGE_CODE = process.env.MESHULAM_PAGE_CODE || '';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

const PLAN_AMOUNTS = { basic: 99, pro: 199 };

// POST /api/billing/checkout — create a Meshulam hosted payment URL
router.post('/checkout', async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLAN_AMOUNTS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    await ensureSubscription(req.user.id);

    const sum = PLAN_AMOUNTS[plan];
    const ipnUrl = `${APP_URL}/api/billing/ipn`;

    // If Meshulam credentials not yet configured, return a placeholder
    if (!MESHULAM_USER_ID || !MESHULAM_PAGE_CODE) {
      return res.json({ url: `${APP_URL}/app?checkout=pending&plan=${plan}` });
    }

    const params = new URLSearchParams({
      pageCode:    MESHULAM_PAGE_CODE,
      userId:      MESHULAM_USER_ID,
      apiKey:      MESHULAM_API_KEY,
      sum:         String(sum),
      description: `Cashflow ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
      email:       req.user.email,
      successUrl:  `${APP_URL}/app?checkout=success`,
      cancelUrl:   `${APP_URL}/?checkout=cancel`,
      ipnUrl,
      maxPayments: '1',
      // Pass plan through a custom field so IPN can identify it
      'custom[plan]': plan,
      'custom[userId]': req.user.id,
    });

    const url = `https://secure.meshulam.co.il/paying/index.php?${params.toString()}`;
    res.json({ url });
  } catch (err) {
    console.error('billing/checkout error', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

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

// POST /api/billing/ipn — Meshulam calls this after payment (no auth middleware)
async function ipn(req, res) {
  try {
    const data = req.body;

    // Basic validation — confirm this is from our Meshulam account
    if (data.userId && data.userId !== MESHULAM_USER_ID) {
      console.warn('IPN userId mismatch', data.userId);
      return res.status(400).send('invalid');
    }

    const success = data.transactionStatus === '1' || data.status === 'success' || data.transactionStatus === 'success';
    const plan    = data['custom[plan]'] || data.customFields?.plan || null;
    const userId  = data['custom[userId]'] || data.customFields?.userId || null;
    const cardToken = data.cardToken || data.token || null;

    if (!userId || !plan) {
      console.warn('IPN missing userId or plan', data);
      return res.status(200).send('ok'); // Always 200 to prevent Meshulam retries
    }

    if (success) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30);

      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan,
        status: 'active',
        meshulam_card_token: cardToken,
        meshulam_subscription_ref: data.transactionId || data.transaction_id || null,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: 'user_id' });
    } else {
      await supabase.from('subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('billing/ipn error', err);
    res.status(200).send('ok'); // Always 200 — Meshulam retries on non-200
  }
}

module.exports = { router, ipn };
