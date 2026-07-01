const express  = require('express');
const Stripe   = require('stripe');
const supabase = require('../lib/supabase');
const { PLANS } = require('../lib/plans');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const PRICE_IDS = {
  basic: process.env.STRIPE_PRICE_BASIC,
  pro:   process.env.STRIPE_PRICE_PRO,
};

// ─── Authenticated router ─────────────────────────────────────────────────────
const router = express.Router();

// POST /api/stripe/checkout  { plan: 'basic' | 'pro' }
router.post('/checkout', async (req, res) => {
  const { plan } = req.body;
  if (!PRICE_IDS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_placeholder') {
    return res.status(503).json({ error: 'Stripe not configured yet. Add STRIPE_SECRET_KEY to .env.local.' });
  }

  try {
    // Re-use existing Stripe customer if one exists for this user
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', req.user.id)
      .single();

    const origin = process.env.FRONTEND_URL || 'http://localhost:5173';

    const sessionParams = {
      mode:                'subscription',
      line_items:          [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url:         `${origin}/app?checkout=success&plan=${plan}`,
      cancel_url:          `${origin}/`,
      client_reference_id: req.user.id,
      metadata:            { user_id: req.user.id, plan },
      allow_promotion_codes: true,
    };

    if (sub?.stripe_customer_id) {
      sessionParams.customer = sub.stripe_customer_id;
    } else {
      sessionParams.customer_email = req.user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Optimistically store customer_id so the next checkout reuses it
    if (!sub?.stripe_customer_id && session.customer) {
      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: session.customer })
        .eq('user_id', req.user.id);
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] checkout error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/stripe/portal  — customer self-service (cancel, change card, etc.)
router.post('/portal', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_placeholder') {
    return res.status(503).json({ error: 'Stripe not configured yet.' });
  }

  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', req.user.id)
      .single();

    if (!sub?.stripe_customer_id) {
      return res.status(404).json({ error: 'No billing account found' });
    }

    const origin = process.env.FRONTEND_URL || 'http://localhost:5173';
    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: `${origin}/app?view=settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] portal error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stripe/usage — frontend polls for current plan + usage
router.get('/usage', async (req, res) => {
  const { getPlanUsage } = require('../lib/plans');
  try {
    const usage = await getPlanUsage(req.user.id);
    res.json(usage);
  } catch (err) {
    console.error('[stripe] usage error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Webhook (no auth — verified by Stripe signature) ─────────────────────────
exports.webhook = async (req, res) => {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    // Stripe not configured — accept webhook silently to avoid 500 noise
    return res.json({ received: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('[stripe] webhook signature error:', err.message);
    return res.status(400).json({ error: 'Webhook error' });
  }

  try {
    await handleWebhookEvent(event);
  } catch (err) {
    console.error('[stripe] webhook handler error:', err.message);
    // Still return 200 so Stripe doesn't retry indefinitely
  }

  res.json({ received: true });
};

async function handleWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription') break;

      const userId = session.client_reference_id || session.metadata?.user_id;
      const plan   = session.metadata?.plan || 'basic';
      if (!userId) { console.error('[stripe] checkout.session.completed: no user_id in metadata'); break; }

      // Fetch full subscription details from Stripe
      const stripeSub = session.subscription
        ? await stripe.subscriptions.retrieve(session.subscription)
        : null;

      await upsertSubscription(userId, {
        plan,
        status:                  'active',
        stripe_customer_id:      session.customer,
        stripe_subscription_id:  session.subscription,
        current_period_start:    stripeSub ? new Date(stripeSub.current_period_start * 1000).toISOString() : null,
        current_period_end:      stripeSub ? new Date(stripeSub.current_period_end   * 1000).toISOString() : null,
      });
      console.log(`[stripe] upgraded user ${userId} to ${plan}`);
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const userId = await userIdForCustomer(sub.customer);
      if (!userId) break;

      const plan = planFromStripeSub(sub);
      await upsertSubscription(userId, {
        plan,
        status:                 stripeStatusToLocal(sub.status),
        stripe_subscription_id: sub.id,
        current_period_start:   new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end:     new Date(sub.current_period_end   * 1000).toISOString(),
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = await userIdForCustomer(sub.customer);
      if (!userId) break;

      await upsertSubscription(userId, {
        plan:                   'free',
        status:                 'canceled',
        stripe_subscription_id: null,
        current_period_start:   null,
        current_period_end:     null,
      });
      console.log(`[stripe] downgraded user ${userId} to free`);
      break;
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object;
      const userId = await userIdForCustomer(inv.customer);
      if (!userId) break;
      await supabase.from('subscriptions').update({ status: 'past_due' }).eq('user_id', userId);
      break;
    }
  }
}

async function upsertSubscription(userId, fields) {
  await supabase
    .from('subscriptions')
    .upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' });
}

async function userIdForCustomer(customerId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.user_id || null;
}

function planFromStripeSub(stripeSub) {
  // Map Stripe price IDs back to plan names
  const priceId = stripeSub.items?.data?.[0]?.price?.id;
  if (priceId === process.env.STRIPE_PRICE_PRO)   return 'pro';
  if (priceId === process.env.STRIPE_PRICE_BASIC) return 'basic';
  return 'basic';
}

function stripeStatusToLocal(stripeStatus) {
  const map = { active: 'active', trialing: 'trialing', past_due: 'past_due', canceled: 'canceled', unpaid: 'past_due' };
  return map[stripeStatus] || 'active';
}

exports.router = router;
