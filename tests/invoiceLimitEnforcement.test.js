import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// CASH-19 / CASH-82 / CASH-41: invoice caps used to be soft everywhere (a
// discarded checkInvoiceLimit() call, never actually blocking ingestion) —
// per explicit product direction, plan quotas are now hard-enforced via
// assertInvoiceLimit() (402 PLAN_LIMIT_REACHED) across every ingestion path:
// manual sync trigger, manual resync, cron auto-sync, translate mode, and the
// WhatsApp webhook (CASH-95's entitlement work is separate and not covered here).
const require = createRequire(import.meta.url);
const supabasePath      = require.resolve('../server/lib/supabase.js');
const syncProcessorPath = require.resolve('../server/services/syncProcessor.js');
const extractionPath    = require.resolve('../server/lib/extraction.js');

const makeRes = () => ({
  statusCode: null, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const freshRequire = (relPath, keepPaths) => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/server/') && !keepPaths.includes(key)) delete require.cache[key];
  }
  return require(require.resolve(relPath));
};

// A supabase mock generic enough for plans.js's getPlanUsage/ensureSubscription
// (subscriptions select/upsert, invoices count select) plus whatever `extra`
// per-table handling a given test needs (sync_jobs, integrations, etc).
const planLimitSupabase = ({ plan = 'free', invoiceCount = 0, extra = {} } = {}) => ({
  from: (table) => {
    if (extra[table]) return extra[table]();
    const chain = {
      select: () => chain,
      eq:     () => chain,
      in:     () => chain,
      or:     () => chain,
      update: () => chain,
      insert: () => chain,
      single:      () => Promise.resolve({ data: { plan, status: 'active' }, error: null }),
      maybeSingle: () => Promise.resolve({ data: { plan, status: 'active' }, error: null }),
      upsert:      () => Promise.resolve({ data: null, error: null }),
      gte:         () => Promise.resolve({ data: null, error: null, count: invoiceCount }),
      then:        (resolve) => resolve({ data: null, error: null, count: invoiceCount }),
    };
    return chain;
  },
});

describe('triggerSync (CASH-19 area: manual sync trigger hard-blocks over quota)', () => {
  it('returns 402 PLAN_LIMIT_REACHED and never looks up the integration when over limit', async () => {
    let integrationsLookedUp = false;
    const supa = planLimitSupabase({
      plan: 'free', invoiceCount: 20,
      extra: { integrations: () => { integrationsLookedUp = true; return { select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }) }; } },
    });
    require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supa };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath]);
    const res = makeRes();
    await integrations.triggerSync({ params: { id: 'int1' }, user: { id: 'user1' } }, res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({ error: 'PLAN_LIMIT_REACHED', used: 20, limit: 20, plan: 'free' });
    expect(integrationsLookedUp).toBe(false);
  });
});

describe('resync (CASH-82: manual integration resync hard-blocks over quota)', () => {
  it('returns 402 and does not clear last_sync or trigger any sync when over limit', async () => {
    let lastSyncCleared = false;
    const integration = { id: 'int1', user_id: 'user1', type: 'gmail', sync_count: 0 };
    const supa = planLimitSupabase({
      plan: 'starter', invoiceCount: 75,
      extra: {
        integrations: () => {
          const chain = {
            select: () => chain,
            eq: () => chain,
            single: () => Promise.resolve({ data: integration, error: null }),
            update: (patch) => { if ('last_sync' in patch) lastSyncCleared = true; return chain; },
            then: (resolve) => resolve({ data: null, error: null }),
          };
          return chain;
        },
      },
    });
    require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supa };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { syncGmail: async () => { throw new Error('should not be called'); } },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await integrations.resync({ params: { id: 'int1' }, user: { id: 'user1' } }, res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({ error: 'PLAN_LIMIT_REACHED', used: 75, limit: 75, plan: 'starter' });
    expect(lastSyncCleared).toBe(false);
  });

  it('proceeds normally when under limit', async () => {
    const integration = { id: 'int1', user_id: 'user1', type: 'gmail', sync_count: 0 };
    const supa = planLimitSupabase({
      plan: 'starter', invoiceCount: 10,
      extra: {
        integrations: () => {
          const chain = {
            select: () => chain, eq: () => chain, update: () => chain,
            single: () => Promise.resolve({ data: integration, error: null }),
            then: (resolve) => resolve({ data: null, error: null }),
          };
          return chain;
        },
      },
    });
    require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supa };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { syncGmail: async () => ({ added: 3, filesFound: 3, errors: 0 }) },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await integrations.resync({ params: { id: 'int1' }, user: { id: 'user1' } }, res);

    expect(res.statusCode).toBe(null); // res.json() doesn't set statusCode in this fake — absence of 402 is the point
    expect(res.body).toMatchObject({ ok: true, added: 3 });
  });
});

describe('runSync cron auto-sync (CASH-19: skips, does not error, an over-limit integration)', () => {
  it('skips an over-limit integration without marking it error, and still processes an under-limit one', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const overLimitIntegration  = { id: 'int-over',  user_id: 'user-over',  type: 'gmail', status: 'connected', auto_sync_enabled: true, sync_count: 0 };
    const underLimitIntegration = { id: 'int-under', user_id: 'user-under', type: 'gmail', status: 'connected', auto_sync_enabled: true, sync_count: 0 };
    const errorUpdates = [];

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'integrations') {
            const chain = {
              select: () => chain, eq: () => chain,
              then: (resolve) => resolve({ data: [overLimitIntegration, underLimitIntegration], error: null }),
              update: (patch) => { if (patch.status === 'error') errorUpdates.push(patch); return { eq: () => Promise.resolve({ data: null, error: null }) }; },
            };
            return chain;
          }
          if (table === 'subscriptions') {
            const chain = {
              select: () => chain,
              eq: (col, val) => { chain.__userId = val; return chain; },
              single: () => Promise.resolve({ data: { plan: chain.__userId === 'user-over' ? 'free' : 'pro' }, error: null }),
              upsert: () => Promise.resolve({ data: null, error: null }),
            };
            return chain;
          }
          if (table === 'invoices') {
            const chain = {
              select: () => chain,
              eq: (col, val) => { chain.__userId = val; return chain; },
              gte: () => Promise.resolve({ data: null, error: null, count: chain.__userId === 'user-over' ? 20 : 5 }),
            };
            return chain;
          }
          if (table === 'sync_jobs') {
            const chain = {
              select: () => chain, in: () => chain, lt: () => chain,
              limit: () => Promise.resolve({ data: [], error: null }), // no stale jobs
            };
            return chain;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { syncGmail: async (integration) => ({ added: integration.id === 'int-under' ? 2 : 999, filesFound: 0, errors: 0 }) },
    };

    const cron = freshRequire('../server/routes/cron.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(res.body.synced).toBe(2); // both resolve (fulfilled) — one skipped, one synced, neither rejected
    expect(res.body.failed).toBe(0);
    expect(res.body.results.find(r => r.id === 'int-over')).toMatchObject({ added: 0, skipped: 'plan_limit_reached' });
    expect(res.body.results.find(r => r.id === 'int-under')).toMatchObject({ added: 2 });
    expect(errorUpdates).toEqual([]); // the over-limit integration is never marked 'error'
  });

  // Pre-merge review fix: a transient Supabase error on the plan-lookup query
  // must not be treated the same as a real sync failure — the integration
  // used to get marked 'error' (and the user notified of a "broken"
  // integration) purely from an infra hiccup unrelated to that integration.
  it('skips (does not mark "error") an integration whose plan-lookup query itself fails', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const integration = { id: 'int-1', user_id: 'user-1', type: 'gmail', status: 'connected', auto_sync_enabled: true, sync_count: 0 };
    const errorUpdates = [];

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'integrations') {
            const chain = {
              select: () => chain, eq: () => chain,
              then: (resolve) => resolve({ data: [integration], error: null }),
              update: (patch) => { if (patch.status === 'error') errorUpdates.push(patch); return { eq: () => Promise.resolve({ data: null, error: null }) }; },
            };
            return chain;
          }
          if (table === 'subscriptions') {
            const chain = {
              select: () => chain, eq: () => chain,
              single: () => Promise.resolve({ data: null, error: { message: 'connection reset', code: '08006' } }),
              upsert: () => Promise.resolve({ data: null, error: null }),
            };
            return chain;
          }
          if (table === 'invoices') {
            const chain = { select: () => chain, eq: () => chain, gte: () => Promise.resolve({ data: null, error: null, count: 0 }) };
            return chain;
          }
          if (table === 'sync_jobs') {
            const chain = { select: () => chain, in: () => chain, lt: () => chain, limit: () => Promise.resolve({ data: [], error: null }) };
            return chain;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { syncGmail: async () => ({ added: 999, filesFound: 0, errors: 0 }) }, // must never be called
    };

    const cron = freshRequire('../server/routes/cron.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(res.body.synced).toBe(1); // resolves (fulfilled), not rejected
    expect(res.body.failed).toBe(0);
    expect(res.body.results.find(r => r.id === 'int-1')).toMatchObject({ added: 0, skipped: 'plan_lookup_failed' });
    expect(errorUpdates).toEqual([]); // never marked 'error' from the transient lookup failure
  });
});

describe('updateAutoSync (CASH-43: hard-blocks enabling auto-sync on a plan without it)', () => {
  it('returns 403 AUTO_SYNC_NOT_AVAILABLE and never updates the row for a free-plan user', async () => {
    let updated = false;
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from: (table) => {
          if (table === 'subscriptions') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { plan: 'free' }, error: null }) }) }) };
          if (table === 'integrations') return { update: () => { updated = true; return { eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }; } };
          throw new Error(`unexpected table ${table}`);
        },
      },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath]);
    const res = makeRes();
    await integrations.updateAutoSync({ params: { id: 'int1' }, user: { id: 'user1' }, body: { auto_sync_enabled: true } }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'AUTO_SYNC_NOT_AVAILABLE', plan: 'free' });
    expect(updated).toBe(false);
  });

  it('allows a pro-plan user to enable auto-sync', async () => {
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from: (table) => {
          if (table === 'subscriptions') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { plan: 'pro' }, error: null }) }) }) };
          if (table === 'integrations') return { update: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }) };
          throw new Error(`unexpected table ${table}`);
        },
      },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath]);
    const res = makeRes();
    await integrations.updateAutoSync({ params: { id: 'int1' }, user: { id: 'user1' }, body: { auto_sync_enabled: true } }, res);

    expect(res.body).toEqual({ ok: true });
  });

  it('allows disabling auto-sync on any plan without a plan check', async () => {
    let checkedSubscription = false;
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from: (table) => {
          if (table === 'subscriptions') { checkedSubscription = true; return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { plan: 'free' }, error: null }) }) }) }; }
          if (table === 'integrations') return { update: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }) };
          throw new Error(`unexpected table ${table}`);
        },
      },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath]);
    const res = makeRes();
    await integrations.updateAutoSync({ params: { id: 'int1' }, user: { id: 'user1' }, body: { auto_sync_enabled: false } }, res);

    expect(checkedSubscription).toBe(false);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('presignUpload (invoices.js: manual browser upload also hard-blocks over quota)', () => {
  it('returns 402 and never presigns an upload URL when over limit', async () => {
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: planLimitSupabase({ plan: 'free', invoiceCount: 20 }),
    };

    const invoicesRoute = freshRequire('../server/routes/invoices.js', [supabasePath]);
    const res = makeRes();
    await invoicesRoute.presignUpload({ user: { id: 'user1' }, body: { filename: 'invoice.pdf', contentType: 'application/pdf' } }, res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({ error: 'PLAN_LIMIT_REACHED', used: 20, limit: 20, plan: 'free' });
  });
});

describe('WhatsApp webhook (CASH-19-adjacent: unattended ingestion also hard-blocks over quota)', () => {
  it('does not process the media and sends a quota-specific reply when the routed user is over limit', async () => {
    process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
    delete process.env.WHATSAPP_API_TOKEN; // sendWhatsAppReply no-ops without it, but still gets called
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;

    const integration = { id: 'int1', user_id: 'user-over', type: 'whatsapp', status: 'connected', config: {} };
    let processWhatsAppMediaCalled = false;

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'integrations') {
            const chain = { select: () => chain, eq: () => chain, filter: () => chain, contains: () => chain, maybeSingle: () => Promise.resolve({ data: integration, error: null }) };
            return chain;
          }
          if (table === 'subscriptions') {
            const chain = { select: () => chain, eq: () => chain, single: () => Promise.resolve({ data: { plan: 'free' }, error: null }), upsert: () => Promise.resolve({ data: null, error: null }) };
            return chain;
          }
          if (table === 'invoices') {
            const chain = { select: () => chain, eq: () => chain, gte: () => Promise.resolve({ data: null, error: null, count: 20 }) };
            return chain;
          }
          throw new Error(`unexpected table ${table}`);
        },
        rpc: () => Promise.resolve({ data: null, error: null }),
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { processWhatsAppMedia: async () => { processWhatsAppMediaCalled = true; return []; } },
    };

    const webhook = freshRequire('../server/routes/webhook.js', [supabasePath, syncProcessorPath]);
    const crypto = require('node:crypto');
    const obj = {
      entry: [{ changes: [{ field: 'messages', value: { messages: [{
        id: 'wamid.MEDIA1', type: 'document', from: '+972501234567',
        document: { mime_type: 'application/pdf', caption: 'CODE1', id: 'media-abc' },
      }] } }] }],
    };
    const raw = Buffer.from(JSON.stringify(obj));
    const sign = (body, secret) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    const req = { headers: { 'x-hub-signature-256': sign(raw, 'test-app-secret') }, rawBody: raw, body: obj };
    const res = makeRes();

    await webhook.handleWhatsApp(req, res);

    expect(res.statusCode).toBe(200); // always ack the webhook regardless
    expect(processWhatsAppMediaCalled).toBe(false);

    delete process.env.WHATSAPP_APP_SECRET;
  });
});

describe('processSyncJob (CASH-42: re-checks the plan quota on every batch, not just once at trigger)', () => {
  it('halts a job at the quota boundary, marks it limit_reached, and preserves progress made so far', async () => {
    const job = {
      id: 'job1', integration_id: 'int1', user_id: 'user-over', status: 'pending',
      cursor: 5, file_list: Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, name: `f${i}.pdf` })),
      total_files: 20, added: 5, dupes: 0, errors: 0, updated_at: new Date(0).toISOString(),
    };
    let batchProcessed = false;
    let updatedStatus  = null;

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'sync_jobs') {
            const chain = {
              select: () => chain, eq: () => chain, or: () => chain,
              update: (patch) => { if (patch.status) updatedStatus = patch.status; return chain; },
              maybeSingle: () => Promise.resolve({ data: job, error: null }), // claim succeeds
              then: (resolve) => resolve({ data: null, error: null }),
            };
            return chain;
          }
          if (table === 'subscriptions') {
            const chain = { select: () => chain, eq: () => chain, single: () => Promise.resolve({ data: { plan: 'free' }, error: null }), upsert: () => Promise.resolve({ data: null, error: null }) };
            return chain;
          }
          if (table === 'invoices') {
            const chain = { select: () => chain, eq: () => chain, gte: () => Promise.resolve({ data: null, error: null, count: 20 }) }; // at free-plan cap (20)
            return chain;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { processGoogleDriveFileBatch: async () => { batchProcessed = true; return { results: [], skipped: 0, errors: 0 }; } },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await integrations.processSyncJob({ params: { jobId: 'job1' }, user: { id: 'user-over' } }, res);

    expect(batchProcessed).toBe(false); // no further files processed once over quota
    expect(updatedStatus).toBe('limit_reached');
    expect(res.statusCode).toBe(402);
    expect(res.body).toMatchObject({
      error: 'PLAN_LIMIT_REACHED', used: 20, limit: 20, plan: 'free',
      done: true, cursor: 5, added: 5, totalFiles: 20, // progress made so far is preserved, not reset
    });
  });

  it('processes the batch normally when under limit', async () => {
    const job = {
      id: 'job1', integration_id: 'int1', user_id: 'user-under', status: 'pending',
      cursor: 0, file_list: [{ id: 'f0', name: 'f0.pdf' }], total_files: 1, added: 0, dupes: 0, errors: 0,
      updated_at: new Date(0).toISOString(),
    };
    const integration = { id: 'int1', user_id: 'user-under', sync_count: 0 };
    let batchProcessed = false;

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'sync_jobs') {
            const chain = {
              select: () => chain, eq: () => chain, or: () => chain, update: () => chain,
              maybeSingle: () => Promise.resolve({ data: job, error: null }),
              then: (resolve) => resolve({ data: null, error: null }),
            };
            return chain;
          }
          if (table === 'subscriptions') {
            const chain = { select: () => chain, eq: () => chain, single: () => Promise.resolve({ data: { plan: 'pro' }, error: null }), upsert: () => Promise.resolve({ data: null, error: null }) };
            return chain;
          }
          if (table === 'invoices') {
            const chain = { select: () => chain, eq: () => chain, gte: () => Promise.resolve({ data: null, error: null, count: 5 }) };
            return chain;
          }
          if (table === 'integrations') {
            const chain = { select: () => chain, eq: () => chain, update: () => chain, single: () => Promise.resolve({ data: integration, error: null }), then: (resolve) => resolve({ data: null, error: null }) };
            return chain;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { processGoogleDriveFileBatch: async () => { batchProcessed = true; return { results: [{ id: 'inv1' }], skipped: 0, errors: 0 }; } },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await integrations.processSyncJob({ params: { jobId: 'job1' }, user: { id: 'user-under' } }, res);

    expect(batchProcessed).toBe(true);
    expect(res.body.added).toBe(1);
  });
});

describe('extract.js translate mode (CASH-41: no longer exempt from the quota check)', () => {
  let consoleErrorSpy;
  beforeEach(() => { consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { consoleErrorSpy.mockRestore(); });

  it('returns 402 and never calls extraction.translate when over limit', async () => {
    let translateCalled = false;
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: planLimitSupabase({ plan: 'free', invoiceCount: 20 }),
    };
    require.cache[extractionPath] = {
      id: extractionPath, filename: extractionPath, loaded: true,
      exports: { translate: async () => { translateCalled = true; return 'translated'; } },
    };

    const extract = freshRequire('../server/routes/extract.js', [supabasePath, extractionPath]);
    const res = makeRes();
    await extract({ user: { id: 'user1' }, body: { text: 'hello', mode: 'translate' } }, res);

    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({ error: 'PLAN_LIMIT_REACHED', used: 20, limit: 20, plan: 'free' });
    expect(translateCalled).toBe(false);
  });

  it('proceeds to translate when under limit', async () => {
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: planLimitSupabase({ plan: 'free', invoiceCount: 5 }),
    };
    require.cache[extractionPath] = {
      id: extractionPath, filename: extractionPath, loaded: true,
      exports: { translate: async () => 'שלום' },
    };

    const extract = freshRequire('../server/routes/extract.js', [supabasePath, extractionPath]);
    const res = makeRes();
    await extract({ user: { id: 'user1' }, body: { text: 'hello', mode: 'translate' } }, res);

    expect(res.body).toEqual({ result: 'שלום' });
  });
});
