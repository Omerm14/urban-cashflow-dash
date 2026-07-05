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
};

const queryBuilder = () => ({
  select: () => queryBuilder(),
  eq: () => queryBuilder(),
  gte: () => queryBuilder(),
  upsert: () => Promise.resolve({ data: null, error: null }),
  single: () => Promise.resolve({ data: mockState.subscription, error: null }),
  // The invoice-count query is awaited directly (no .single()), so the
  // builder itself must be thenable — mirrors the real supabase-js builder.
  then: (resolve) => resolve({ data: null, error: null, count: mockState.invoiceCount }),
});

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { from: () => queryBuilder() },
};

const { PLANS, assertInvoiceLimit, getPlanUsage } = await import('../server/lib/plans.js');

describe('PLANS config (real module)', () => {
  it('is backed by the real server/lib/plans.js export, not a shadow copy', () => {
    expect(typeof assertInvoiceLimit).toBe('function');
  });

  it('free plan has 20 invoice limit', () => {
    expect(PLANS.free.invoicesPerMonth).toBe(20);
  });

  it('basic plan has 50 invoice limit', () => {
    expect(PLANS.basic.invoicesPerMonth).toBe(50);
  });

  it('pro plan has 150 invoice limit and autoSync enabled', () => {
    expect(PLANS.pro.invoicesPerMonth).toBe(150);
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
    }
  });
});

describe('assertInvoiceLimit (real module, mocked Supabase)', () => {
  it('blocks free user at exactly 20 invoices', async () => {
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

  it('allows free user at 19 invoices', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    mockState.invoiceCount = 19;
    const usage = await assertInvoiceLimit('user-1');
    expect(usage.pct).toBeLessThan(1);
  });

  it('blocks pro user at 150 invoices', async () => {
    mockState.subscription = { plan: 'pro', status: 'active' };
    mockState.invoiceCount = 150;
    await expect(assertInvoiceLimit('user-1')).rejects.toMatchObject({
      statusCode: 402,
      code: 'PLAN_LIMIT_REACHED',
      plan: 'pro',
      limit: 150,
    });
  });

  it('never blocks enterprise (unlimited)', async () => {
    mockState.subscription = { plan: 'enterprise', status: 'active' };
    mockState.invoiceCount = 1_000_000;
    const usage = await assertInvoiceLimit('user-1');
    expect(usage.remaining).toBe(Infinity);
  });

  it('getPlanUsage returns plan/limit/used/remaining/pct for a real subscription row', async () => {
    mockState.subscription = { plan: 'basic', status: 'active' };
    mockState.invoiceCount = 10;
    const usage = await getPlanUsage('user-1');
    expect(usage).toMatchObject({ plan: 'basic', limit: 50, used: 10, remaining: 40 });
  });
});
