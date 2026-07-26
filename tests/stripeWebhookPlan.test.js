import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

// CASH-112: planFromStripeSub() used to fall through to 'starter' for any
// unrecognized Stripe price ID (unset/mistyped env var, or a price
// archived/replaced in the Stripe dashboard), silently downgrading a paying
// Pro/Enterprise subscriber's entitlements on their next
// customer.subscription.updated webhook. It must now leave the existing
// plan untouched and log an error instead.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');
const stripeRoutePath = require.resolve('../server/routes/stripe.js');

const upsertsFor = (userId) => {
  const upserts = [];
  const supabaseMock = {
    from: (table) => {
      expect(table).toBe('subscriptions');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { user_id: userId }, error: null }),
          }),
        }),
        upsert: async (fields) => {
          upserts.push(fields);
          return { data: null, error: null };
        },
      };
    },
  };
  return { supabaseMock, upserts };
};

const freshStripeRoute = (supabaseExports) => {
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseExports };
  delete require.cache[stripeRoutePath];
  return require('../server/routes/stripe.js');
};

const makeSub = (priceId) => ({
  id: 'sub_123',
  customer: 'cus_123',
  status: 'active',
  current_period_start: 1700000000,
  current_period_end: 1702600000,
  items: { data: [{ price: { id: priceId } }] },
});

describe('planFromStripeSub (CASH-112)', () => {
  const prevPro = process.env.STRIPE_PRICE_PRO;
  const prevStarter = process.env.STRIPE_PRICE_STARTER;
  const prevBasic = process.env.STRIPE_PRICE_BASIC;

  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO = 'price_pro';
    process.env.STRIPE_PRICE_STARTER = 'price_starter';
    process.env.STRIPE_PRICE_BASIC = 'price_basic';
  });

  afterEach(() => {
    process.env.STRIPE_PRICE_PRO = prevPro;
    process.env.STRIPE_PRICE_STARTER = prevStarter;
    process.env.STRIPE_PRICE_BASIC = prevBasic;
  });

  it('maps a known price ID to its plan', () => {
    const { supabaseMock } = upsertsFor('user1');
    const { planFromStripeSub } = freshStripeRoute(supabaseMock);
    expect(planFromStripeSub(makeSub('price_pro'))).toBe('pro');
    expect(planFromStripeSub(makeSub('price_starter'))).toBe('starter');
    expect(planFromStripeSub(makeSub('price_basic'))).toBe('basic');
  });

  it('returns null (not "starter") for an unrecognized price ID', () => {
    const { supabaseMock } = upsertsFor('user1');
    const { planFromStripeSub } = freshStripeRoute(supabaseMock);
    expect(planFromStripeSub(makeSub('price_unknown'))).toBeNull();
  });

  it('logs an error including the price ID and subscription ID for an unrecognized price', () => {
    const { supabaseMock } = upsertsFor('user1');
    const { planFromStripeSub } = freshStripeRoute(supabaseMock);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      planFromStripeSub(makeSub('price_unknown'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('price_unknown'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('sub_123'));
    } finally {
      spy.mockRestore();
    }
  });
});

describe('customer.subscription.updated handling (CASH-112)', () => {
  const prevPro = process.env.STRIPE_PRICE_PRO;
  const prevStarter = process.env.STRIPE_PRICE_STARTER;
  const prevBasic = process.env.STRIPE_PRICE_BASIC;

  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO = 'price_pro';
    process.env.STRIPE_PRICE_STARTER = 'price_starter';
    process.env.STRIPE_PRICE_BASIC = 'price_basic';
  });

  afterEach(() => {
    process.env.STRIPE_PRICE_PRO = prevPro;
    process.env.STRIPE_PRICE_STARTER = prevStarter;
    process.env.STRIPE_PRICE_BASIC = prevBasic;
  });

  it('writes the recognized plan into subscriptions', async () => {
    const { supabaseMock, upserts } = upsertsFor('user1');
    const { handleWebhookEvent } = freshStripeRoute(supabaseMock);

    await handleWebhookEvent({ type: 'customer.subscription.updated', data: { object: makeSub('price_pro') } });

    expect(upserts).toHaveLength(1);
    expect(upserts[0].plan).toBe('pro');
  });

  it('does not write a plan (leaves existing plan unchanged) for an unrecognized price, and does not throw', async () => {
    const { supabaseMock, upserts } = upsertsFor('user1');
    const { handleWebhookEvent } = freshStripeRoute(supabaseMock);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(
        handleWebhookEvent({ type: 'customer.subscription.updated', data: { object: makeSub('price_unknown') } })
      ).resolves.not.toThrow();
    } finally {
      spy.mockRestore();
    }

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).not.toHaveProperty('plan');
    expect(upserts[0].status).toBe('active'); // other fields still update normally
  });
});
