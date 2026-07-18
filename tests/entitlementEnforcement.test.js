import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// CASH-95: csvExport, bulkActions, and auditTrail were plan entitlement flags
// gated client-side only (UI hides the button) — a Free/Starter-tier user
// with a valid session could bypass every one of them by calling the same
// Supabase client directly (their own JWT), since RLS enforces user_id
// isolation but not plan tier. These endpoints now assertEntitlement()
// server-side before touching data. Per the confirmed decision ("server
// endpoint checks entitlements"), the fix routes each formerly-direct-to-
// Supabase path through a server route instead of adding an RLS policy.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');

const makeRes = () => ({
  statusCode: null, body: null, headers: {},
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  setHeader(k, v) { this.headers[k] = v; },
  send(body) { this.body = body; return this; },
});

const freshRequire = (relPath, keepPaths) => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/server/') && !keepPaths.includes(key)) delete require.cache[key];
  }
  return require(require.resolve(relPath));
};

// A supabase mock generic enough for plans.js's assertEntitlement
// (subscriptions select/eq/single) plus whatever `extra` per-table handling
// a given test needs (invoices, integrations, sync_events).
const entitlementSupabase = ({ plan = 'free', extra = {} } = {}) => ({
  from: (table) => {
    if (extra[table]) return extra[table]();
    const chain = {
      select: () => chain,
      eq:     () => chain,
      in:     () => chain,
      order:  () => chain,
      limit:  () => chain,
      update: () => chain,
      delete: () => chain,
      single:      () => Promise.resolve({ data: { plan, status: 'active' }, error: null }),
      maybeSingle: () => Promise.resolve({ data: { plan, status: 'active' }, error: null }),
      then:        (resolve) => resolve({ data: [], error: null }),
    };
    return chain;
  },
});

const setupSupabase = (opts) => {
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: entitlementSupabase(opts) };
};

describe('bulkRemove (server/routes/invoices.js) — bulkActions entitlement', () => {
  it('rejects a free-plan user with 403 before any invoice lookup', async () => {
    let lookedUp = false;
    setupSupabase({ plan: 'free', extra: { invoices: () => { lookedUp = true; return { select: () => ({}) }; } } });
    const invoices = freshRequire('../server/routes/invoices.js', [supabasePath]);

    const res = makeRes();
    await invoices.bulkRemove({ user: { id: 'u1' }, body: { ids: ['a', 'b'] } }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'ENTITLEMENT_REQUIRED', entitlement: 'bulkActions', plan: 'free' });
    expect(lookedUp).toBe(false);
  });

  it('allows a pro-plan user through to the delete logic', async () => {
    setupSupabase({
      plan: 'pro',
      extra: {
        invoices: () => {
          const chain = {
            select: () => chain, eq: () => chain, in: () => chain, delete: () => chain,
            then: (resolve) => resolve({ data: [{ id: 'a', attachment_path: null }], error: null }),
          };
          return chain;
        },
      },
    });
    const invoices = freshRequire('../server/routes/invoices.js', [supabasePath]);

    const res = makeRes();
    await invoices.bulkRemove({ user: { id: 'u1' }, body: { ids: ['a'] } }, res);

    expect(res.statusCode).not.toBe(403);
    expect(res.body).toMatchObject({ ok: true });
  });
});

describe('bulkUpdateStatus (server/routes/invoices.js) — bulkActions entitlement', () => {
  it('rejects a starter-plan user with 403', async () => {
    setupSupabase({ plan: 'starter' });
    const invoices = freshRequire('../server/routes/invoices.js', [supabasePath]);

    const res = makeRes();
    await invoices.bulkUpdateStatus({ user: { id: 'u1' }, body: { ids: ['a'], status: 'Paid' } }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'ENTITLEMENT_REQUIRED', entitlement: 'bulkActions', plan: 'starter' });
  });

  it('updates status for an enterprise-plan user', async () => {
    setupSupabase({
      plan: 'enterprise',
      extra: {
        invoices: () => {
          const chain = { update: () => chain, in: () => chain, eq: () => chain, select: () => Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null }) };
          return chain;
        },
      },
    });
    const invoices = freshRequire('../server/routes/invoices.js', [supabasePath]);

    const res = makeRes();
    await invoices.bulkUpdateStatus({ user: { id: 'u1' }, body: { ids: ['a', 'b'], status: 'Paid' } }, res);

    expect(res.statusCode).not.toBe(403);
    expect(res.body).toMatchObject({ ok: true, updated: 2 });
  });

  it('rejects an invalid status value even for an entitled plan', async () => {
    setupSupabase({ plan: 'pro' });
    const invoices = freshRequire('../server/routes/invoices.js', [supabasePath]);

    const res = makeRes();
    await invoices.bulkUpdateStatus({ user: { id: 'u1' }, body: { ids: ['a'], status: 'Overdue' } }, res);

    expect(res.statusCode).toBe(400);
  });
});

describe('checkExportEntitlement (server/routes/invoices.js) — csvExport entitlement', () => {
  it('rejects a free-plan user with 403', async () => {
    setupSupabase({ plan: 'free' });
    const invoices = freshRequire('../server/routes/invoices.js', [supabasePath]);

    const res = makeRes();
    await invoices.checkExportEntitlement({ user: { id: 'u1' } }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'ENTITLEMENT_REQUIRED', entitlement: 'csvExport', plan: 'free' });
  });

  it('allows a starter-plan user (csvExport: true even below pro)', async () => {
    setupSupabase({ plan: 'starter' });
    const invoices = freshRequire('../server/routes/invoices.js', [supabasePath]);

    const res = makeRes();
    await invoices.checkExportEntitlement({ user: { id: 'u1' } }, res);

    expect(res.statusCode).toBeNull();
    expect(res.body).toMatchObject({ ok: true, plan: 'starter' });
  });
});

describe('listActivity (server/routes/activity.js) — auditTrail entitlement', () => {
  it('rejects a pro-tier-lookalike-but-actually-free user with 403 before reading sync_events', async () => {
    let readSyncEvents = false;
    setupSupabase({ plan: 'free', extra: { sync_events: () => { readSyncEvents = true; return { select: () => ({}) }; } } });
    const activity = freshRequire('../server/routes/activity.js', [supabasePath]);

    const res = makeRes();
    await activity.listActivity({ user: { id: 'u1' } }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'ENTITLEMENT_REQUIRED', entitlement: 'auditTrail', plan: 'free' });
    expect(readSyncEvents).toBe(false);
  });

  it('rejects a starter-plan user (auditTrail is pro+ only) with 403', async () => {
    setupSupabase({ plan: 'starter' });
    const activity = freshRequire('../server/routes/activity.js', [supabasePath]);

    const res = makeRes();
    await activity.listActivity({ user: { id: 'u1' } }, res);

    expect(res.statusCode).toBe(403);
  });

  it('returns events and integrations for a pro-plan user', async () => {
    setupSupabase({
      plan: 'pro',
      extra: {
        sync_events: () => {
          const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => Promise.resolve({ data: [{ id: 'ev1' }], error: null }) };
          return chain;
        },
        integrations: () => {
          const chain = { select: () => chain, eq: () => Promise.resolve({ data: [{ id: 'int1', type: 'gmail' }], error: null }) };
          return chain;
        },
      },
    });
    const activity = freshRequire('../server/routes/activity.js', [supabasePath]);

    const res = makeRes();
    await activity.listActivity({ user: { id: 'u1' } }, res);

    expect(res.statusCode).toBeNull();
    expect(res.body).toEqual({ events: [{ id: 'ev1' }], integrations: [{ id: 'int1', type: 'gmail' }] });
  });
});
