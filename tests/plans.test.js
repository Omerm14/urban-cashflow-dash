import { describe, it, expect, afterEach } from 'vitest';
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
  integrationsEqFields: [], // tracks .eq() field names applied to the 'integrations' query (CASH-97)
  subscriptionError: null,  // simulates a Supabase query error on the subscriptions lookup
  invoiceCountError: null,  // simulates a Supabase query error on the invoice-count lookup
  integrationsError: null,  // simulates a Supabase query error on the integrations lookup
};

const queryBuilder = (table) => ({
  select: () => queryBuilder(table),
  eq: (field) => { if (table === 'integrations') mockState.integrationsEqFields.push(field); return queryBuilder(table); },
  gte: () => queryBuilder(table),
  upsert: () => Promise.resolve({ data: null, error: null }),
  single: () => Promise.resolve(
    mockState.subscriptionError
      ? { data: null, error: mockState.subscriptionError }
      : { data: mockState.subscription, error: null }
  ),
  // The invoice-count / integrations queries are awaited directly (no
  // .single()), so the builder itself must be thenable — mirrors the real
  // supabase-js builder.
  then: (resolve) => {
    if (table === 'integrations') {
      if (mockState.integrationsError) return resolve({ data: null, error: mockState.integrationsError });
      return resolve({ data: mockState.connectedTypes.map(type => ({ type })), error: null });
    }
    if (mockState.invoiceCountError) return resolve({ data: null, error: mockState.invoiceCountError, count: null });
    return resolve({ data: null, error: null, count: mockState.invoiceCount });
  },
});

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { from: (table) => queryBuilder(table) },
};

const { PLANS, checkInvoiceLimit, assertInvoiceLimit, assertSourceLimit, assertAutoSyncAllowed, assertEntitlement, getPlanUsage } = await import('../server/lib/plans.js');

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

// A Supabase query error must never silently read as "plan: free" — that
// wrongly hard-blocks a paying customer on a transient infra hiccup instead
// of surfacing a distinct, retry-able 500. Covers assertInvoiceLimit (via
// getPlanUsage), assertSourceLimit, assertAutoSyncAllowed, and
// assertEntitlement — all four independently query `subscriptions`.
describe('plan-lookup failures never silently resolve to "free" / never block over quota (pre-merge review fix)', () => {
  afterEach(() => {
    mockState.subscriptionError = null;
    mockState.invoiceCountError = null;
    mockState.integrationsError = null;
  });

  it('assertInvoiceLimit throws a distinct 500 (not 402) when the subscription lookup errors', async () => {
    mockState.subscriptionError = { message: 'connection reset', code: '08006' };
    await expect(assertInvoiceLimit('user-1')).rejects.toMatchObject({
      statusCode: 500, code: 'PLAN_LOOKUP_FAILED',
    });
  });

  it('assertInvoiceLimit throws a distinct 500 when the invoice-count lookup errors (must not fail open as used:0)', async () => {
    mockState.invoiceCountError = { message: 'timeout', code: '57014' };
    await expect(assertInvoiceLimit('user-1')).rejects.toMatchObject({
      statusCode: 500, code: 'PLAN_LOOKUP_FAILED',
    });
  });

  it('assertSourceLimit throws a distinct 500 when the subscription lookup errors', async () => {
    mockState.subscriptionError = { message: 'connection reset', code: '08006' };
    await expect(assertSourceLimit('user-1', 'gmail')).rejects.toMatchObject({
      statusCode: 500, code: 'PLAN_LOOKUP_FAILED',
    });
  });

  it('assertSourceLimit throws a distinct 500 when the integrations lookup errors', async () => {
    mockState.integrationsError = { message: 'timeout', code: '57014' };
    await expect(assertSourceLimit('user-1', 'gmail')).rejects.toMatchObject({
      statusCode: 500, code: 'PLAN_LOOKUP_FAILED',
    });
  });

  it('assertAutoSyncAllowed throws a distinct 500 when the subscription lookup errors', async () => {
    mockState.subscriptionError = { message: 'connection reset', code: '08006' };
    await expect(assertAutoSyncAllowed('user-1')).rejects.toMatchObject({
      statusCode: 500, code: 'PLAN_LOOKUP_FAILED',
    });
  });

  it('assertEntitlement throws a distinct 500 when the subscription lookup errors', async () => {
    mockState.subscriptionError = { message: 'connection reset', code: '08006' };
    await expect(assertEntitlement('user-1', 'bulkActions')).rejects.toMatchObject({
      statusCode: 500, code: 'PLAN_LOOKUP_FAILED',
    });
  });

  it('a brand-new user with no subscription row yet (PGRST116) still resolves to the free-plan default, not a 500', async () => {
    mockState.subscriptionError = { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' };
    // assertAutoSyncAllowed/assertEntitlement don't call ensureSubscription first
    // (unlike getPlanUsage), so this is the realistic "brand-new user" case for them.
    await expect(assertAutoSyncAllowed('user-1')).rejects.toMatchObject({
      statusCode: 403, code: 'AUTO_SYNC_NOT_AVAILABLE', plan: 'free',
    });
    await expect(assertEntitlement('user-1', 'bulkActions')).rejects.toMatchObject({
      statusCode: 403, code: 'ENTITLEMENT_REQUIRED', plan: 'free',
    });
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

describe('assertEntitlement (CASH-95: real module, mocked Supabase)', () => {
  it('rejects a free-plan user for bulkActions', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    await expect(assertEntitlement('user-1', 'bulkActions')).rejects.toMatchObject({
      statusCode: 403, code: 'ENTITLEMENT_REQUIRED', entitlement: 'bulkActions', plan: 'free',
    });
  });

  it('rejects a starter-plan user for bulkActions and auditTrail (csvExport-only tier)', async () => {
    mockState.subscription = { plan: 'starter', status: 'active' };
    await expect(assertEntitlement('user-1', 'bulkActions')).rejects.toMatchObject({ code: 'ENTITLEMENT_REQUIRED', plan: 'starter' });
    await expect(assertEntitlement('user-1', 'auditTrail')).rejects.toMatchObject({ code: 'ENTITLEMENT_REQUIRED', plan: 'starter' });
  });

  it('allows a starter-plan user for csvExport', async () => {
    mockState.subscription = { plan: 'starter', status: 'active' };
    await expect(assertEntitlement('user-1', 'csvExport')).resolves.toMatchObject({ plan: 'starter' });
  });

  it('allows a pro-plan user for all three entitlements', async () => {
    mockState.subscription = { plan: 'pro', status: 'active' };
    await expect(assertEntitlement('user-1', 'bulkActions')).resolves.toMatchObject({ plan: 'pro' });
    await expect(assertEntitlement('user-1', 'csvExport')).resolves.toMatchObject({ plan: 'pro' });
    await expect(assertEntitlement('user-1', 'auditTrail')).resolves.toMatchObject({ plan: 'pro' });
  });

  it('allows an enterprise-plan user for all three entitlements', async () => {
    mockState.subscription = { plan: 'enterprise', status: 'active' };
    await expect(assertEntitlement('user-1', 'bulkActions')).resolves.toMatchObject({ plan: 'enterprise' });
    await expect(assertEntitlement('user-1', 'csvExport')).resolves.toMatchObject({ plan: 'enterprise' });
    await expect(assertEntitlement('user-1', 'auditTrail')).resolves.toMatchObject({ plan: 'enterprise' });
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

  // CASH-97: "already owned" must include rows in any status (error,
  // disconnected), not just 'connected' — otherwise a source that broke
  // (e.g. after a plan downgrade left the user over their new cap) can never
  // be re-authorized: assertSourceLimit would treat it as a brand-new add
  // and 403 the user on their own already-paid-for integration.
  it('allows re-authorizing an owned type even at the cap, regardless of that row\'s status', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    // The mock doesn't model per-row status (it only tracks types), which is
    // exactly the point: the query must no longer filter by status at all.
    mockState.connectedTypes = ['gmail'];
    const result = await assertSourceLimit('user-1', 'gmail');
    expect(result).toMatchObject({ plan: 'free', limit: 1, used: 1 });
  });

  it('does not filter the integrations query by status (fetches all rows for the user, any status)', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    mockState.connectedTypes = ['gmail'];
    mockState.integrationsEqFields = [];
    await assertSourceLimit('user-1', 'gmail');
    expect(mockState.integrationsEqFields).toEqual(['user_id']);
    expect(mockState.integrationsEqFields).not.toContain('status');
  });

  it('still blocks a genuinely new type for a user already at the cap', async () => {
    mockState.subscription = { plan: 'free', status: 'active' };
    mockState.connectedTypes = ['gmail'];
    await expect(assertSourceLimit('user-1', 'whatsapp')).rejects.toMatchObject({
      statusCode: 403, code: 'SOURCE_LIMIT_REACHED', plan: 'free', limit: 1, used: 1,
    });
  });
});
