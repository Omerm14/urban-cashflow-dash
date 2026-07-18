import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// server/lib/plans.js pulls in server/lib/supabase.js via a plain CommonJS
// require() at import time. Vitest's `vi.mock` only intercepts ESM import
// specifiers reachable from the test file's own import graph — it does not
// see a require() call made from inside an already-CommonJS module, so a
// factory-based vi.mock of '../server/lib/supabase.js' silently has no
// effect here. Instead we substitute the dependency the same way Node's own
// module loader resolves it: by seeding require.cache for the resolved path
// before plans.js is first required, so plans.js's own require('./supabase')
// gets our fake client instead of constructing a real one.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');

const mockState = {
  subscription: { plan: 'free', status: 'active' },
  invoiceCount: 0,
  connectedTypes: [],
};

const queryBuilder = (table) => ({
  select: () => queryBuilder(table),
  eq: () => queryBuilder(table),
  gte: () => queryBuilder(table),
  upsert: () => Promise.resolve({ data: null, error: null }),
  single: () => Promise.resolve({ data: mockState.subscription, error: null }),
  // The invoice-count / integrations queries are awaited directly (no
  // .single()), so the builder itself must be thenable — mirrors the real
  // supabase-js builder.
  then: (resolve) => {
    if (table === 'integrations') {
      return resolve({ data: mockState.connectedTypes.map(type => ({ type })), error: null });
    }
    return resolve({ data: null, error: null, count: mockState.invoiceCount });
  },
});

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { from: (table) => queryBuilder(table) },
};

const { PLANS, checkInvoiceLimit, assertInvoiceLimit, assertSourceLimit, assertAutoSyncAllowed, getPlanUsage } = await import('../server/lib/plans.js');

describe('PLANS config (real module)', () => {
  it('is backed by the real server/lib/plans.js export, not a shadow copy', () => {
    expect(typeof checkInvoiceLimit).toBe('function');
  });

  it('free plan has 20 invoice limit', () => {
    expect(PLANS.free.invoicesPerMonth).toBe(20);
  });

  it('basic plan is kept intact for legacy subscribers (retired from sale, not deleted)', () => {
    expect(PLANS.basic.invoicesPerMonth).toBe(50);
    expect(PLANS.basic.price).toBe(99);
  });

  it('starter plan has 75 invoice limit and 2 sources', () => {
    expect(PLANS.starter.invoicesPerMonth).toBe(75);
    expect(PLANS.starter.sources).toBe(2);
    expect(PLANS.starter.price).toBe(199);
  });

  it('pro plan has 300 invoice limit, price 399, and autoSync enabled', () => {
    expect(PLANS.pro.invoicesPerMonth).toBe(300);
    expect(PLANS.pro.price).toBe(399);
    expect(PLANS.pro.autoSync).toBe(true);
  });

  it('enterprise plan has unlimited invoices', () => {
    expect(PLANS.enterprise.invoicesPerMonth).toBe(Infinity);
  });

  it('all plans have required fields', () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(plan, `${key}.invoicesPerMonth`).toHaveProperty('invoicesPerMonth');
      expect(plan, `${key}.sources`).toHaveProperty('sources');
      expect(plan, `${key}.autoSync`).toHaveProperty('autoSync');
      expect(plan, `${key}.auditTrail`).toHaveProperty('auditTrail');
      expect(plan, `${key}.price`).toHaveProperty('price');
    }
  });
});

describe('checkInvoiceLimit (real module, mocked Supabase) — caps are soft', () => {
  it('never throws for a free user at exactly the cap', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    mockState.invoiceCount = 20;
    const usage = await checkInvoiceLimit('user-1');
    expect(usage).toMatchObject({ plan: 'free', limit: 20, used: 20, remaining: 0 });
    expect(usage.pct).toBeGreaterThanOrEqual(1);
  });

  it('never throws for a free user well over the cap', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    mockState.invoiceCount = 500;
    const usage = await checkInvoiceLimit('user-1');
    expect(usage.remaining).toBe(0);
  });

  it('never throws for a pro user over the cap', async () => {
    mockState.subscription = { plan: 'pro', status: 'active' };
    mockState.invoiceCount = 301;
    const usage = await checkInvoiceLimit('user-1');
    expect(usage).toMatchObject({ plan: 'pro', limit: 300, used: 301 });
  });

  it('never blocks enterprise (unlimited)', async () => {
    mockState.subscription = { plan: 'enterprise', status: 'active' };
    mockState.invoiceCount = 1_000_000;
    const usage = await checkInvoiceLimit('user-1');
    expect(usage.remaining).toBe(Infinity);
  });

  it('getPlanUsage returns plan/limit/used/remaining/pct for the starter tier', async () => {
    mockState.subscription = { plan: 'starter', status: 'active' };
    mockState.invoiceCount = 10;
    const usage = await getPlanUsage('user-1');
    expect(usage).toMatchObject({ plan: 'starter', limit: 75, used: 10, remaining: 65 });
  });
});

describe('assertInvoiceLimit (real module, mocked Supabase) — hard-blocks over quota', () => {
  it('allows a free user under the cap', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    mockState.invoiceCount = 19;
    const usage = await assertInvoiceLimit('user-1');
    expect(usage).toMatchObject({ plan: 'free', limit: 20, used: 19 });
  });

  it('blocks a free user exactly at the cap', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    mockState.invoiceCount = 20;
    await expect(assertInvoiceLimit('user-1')).rejects.toMatchObject({
      statusCode: 402,
      code: 'PLAN_LIMIT_REACHED',
      plan: 'free',
      limit: 20,
      used: 20,
    });
  });

  it('blocks a pro user over the cap', async () => {
    mockState.subscription = { plan: 'pro', status: 'active' };
    mockState.invoiceCount = 301;
    await expect(assertInvoiceLimit('user-1')).rejects.toMatchObject({
      statusCode: 402,
      code: 'PLAN_LIMIT_REACHED',
      plan: 'pro',
      limit: 300,
      used: 301,
    });
  });

  it('never blocks enterprise (unlimited)', async () => {
    mockState.subscription = { plan: 'enterprise', status: 'active' };
    mockState.invoiceCount = 1_000_000;
    const usage = await assertInvoiceLimit('user-1');
    expect(usage.remaining).toBe(Infinity);
  });
});

describe('assertAutoSyncAllowed (CASH-43: real module, mocked Supabase)', () => {
  it('rejects a free-plan user (autoSync: false)', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    await expect(assertAutoSyncAllowed('user-1')).rejects.toMatchObject({
      statusCode: 403, code: 'AUTO_SYNC_NOT_AVAILABLE', plan: 'free',
    });
  });

  it('rejects a starter-plan user (autoSync: false)', async () => {
    mockState.subscription = { plan: 'starter', status: 'active' };
    await expect(assertAutoSyncAllowed('user-1')).rejects.toMatchObject({
      statusCode: 403, code: 'AUTO_SYNC_NOT_AVAILABLE', plan: 'starter',
    });
  });

  it('allows a pro-plan user (autoSync: true)', async () => {
    mockState.subscription = { plan: 'pro', status: 'active' };
    await expect(assertAutoSyncAllowed('user-1')).resolves.toMatchObject({ plan: 'pro' });
  });

  it('allows an enterprise-plan user (autoSync: true)', async () => {
    mockState.subscription = { plan: 'enterprise', status: 'active' };
    await expect(assertAutoSyncAllowed('user-1')).resolves.toMatchObject({ plan: 'enterprise' });
  });
});

describe('assertSourceLimit (real module, mocked Supabase)', () => {
  it('allows connecting a new source type under the limit', async () => {
    mockState.subscription = { plan: 'starter', status: 'active' };
    mockState.connectedTypes = ['gmail'];
    const result = await assertSourceLimit('user-1', 'google_drive');
    expect(result).toMatchObject({ plan: 'starter', limit: 2, used: 1 });
  });

  it('blocks connecting a new source type at the limit', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    mockState.connectedTypes = ['gmail'];
    await expect(assertSourceLimit('user-1', 'google_drive')).rejects.toMatchObject({
      statusCode: 403,
      code: 'SOURCE_LIMIT_REACHED',
      plan: 'free',
      limit: 1,
      used: 1,
    });
  });

  it('allows reconnecting an already-owned source type at the limit', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    mockState.connectedTypes = ['gmail'];
    const result = await assertSourceLimit('user-1', 'gmail');
    expect(result).toMatchObject({ plan: 'free', limit: 1, used: 1 });
  });

  it('never blocks enterprise (4 sources, all types allowed)', async () => {
    mockState.subscription = { plan: 'enterprise', status: 'active' };
    mockState.connectedTypes = ['gmail', 'google_drive', 'whatsapp'];
    const result = await assertSourceLimit('user-1', 'green_invoice');
    expect(result).toMatchObject({ plan: 'enterprise', limit: 4, used: 3 });
  });
});
