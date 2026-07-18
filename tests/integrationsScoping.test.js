import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// CASH-60: three internal `integrations` lookups (fetch by id only) are now
// scoped by user_id too, as defense-in-depth against a future IDOR if one of
// these patterns is ever reused without re-verifying ownership. These tests
// seed require.cache with a fake Supabase client (and, where the handler also
// calls into syncProcessor.js, a fake sync client) before each route/service
// module is required — same technique as tests/plans.test.js and
// tests/errorLeak.test.js, since these modules pull in server/lib/supabase.js
// via a plain CommonJS require() that `vi.mock` cannot intercept.
const require = createRequire(import.meta.url);
const supabasePath      = require.resolve('../server/lib/supabase.js');
const syncProcessorPath = require.resolve('../server/services/syncProcessor.js');

const makeRes = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

// Clears every other server/ module from the require cache so a route module
// picks up freshly-seeded mocks rather than a stale cache from an earlier test.
const freshRequire = (relPath, keepPaths) => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/server/') && !keepPaths.includes(key)) delete require.cache[key];
  }
  return require(require.resolve(relPath));
};

describe('isCancelRequested (syncProcessor.js, real module, mocked Supabase)', () => {
  it('scopes the cancel_requested lookup by both id and user_id', async () => {
    const eqCalls = [];
    const chain = {
      select: () => chain,
      eq: (col, val) => { eqCalls.push([col, val]); return chain; },
      single: () => Promise.resolve({ data: { cancel_requested: true }, error: null }),
    };
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: { from: (table) => { if (table !== 'integrations') throw new Error(`unexpected table ${table}`); return chain; } },
    };

    const syncProcessor = freshRequire('../server/services/syncProcessor.js', [supabasePath]);
    const result = await syncProcessor.isCancelRequested('int1', 'user1');

    expect(result).toBe(true);
    expect(eqCalls).toEqual([['id', 'int1'], ['user_id', 'user1']]);
  });
});

describe('processSyncJob (integrations.js, real module, mocked Supabase + sync)', () => {
  it('scopes the mid-batch integration lookup by both id and user_id', async () => {
    const job = {
      id: 'job1', integration_id: 'int1', user_id: 'user1', status: 'pending',
      cursor: 0, file_list: ['f1.pdf'], total_files: 5, added: 0, dupes: 0, errors: 0,
      updated_at: new Date(0).toISOString(),
    };
    const integration = { id: 'int1', user_id: 'user1', sync_count: 0 };
    const integrationEqCalls = [];

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'sync_jobs') {
            const c = {
              select: () => c, update: () => c, eq: () => c, or: () => c,
              single: () => Promise.resolve({ data: job, error: null }),
              maybeSingle: () => Promise.resolve({ data: job, error: null }), // atomic claim succeeds
              then: (resolve) => resolve({ data: null, error: null }),
            };
            return c;
          }
          if (table === 'integrations') {
            const c = {
              select: () => c,
              eq: (col, val) => { integrationEqCalls.push([col, val]); return c; },
              single: () => Promise.resolve({ data: integration, error: null }),
            };
            return c;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { processGoogleDriveFileBatch: async () => ({ results: [], skipped: 0, errors: 0 }) },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await integrations.processSyncJob({ params: { jobId: 'job1' }, user: { id: 'user1' } }, res);

    expect(integrationEqCalls).toEqual([['id', 'int1'], ['user_id', 'user1']]);
    expect(res.body.done).toBe(false);
  });
});

describe('runSync stale-job resume (cron.js, real module, mocked Supabase + sync)', () => {
  it('scopes the stale-job integration lookup by both id and user_id', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const job = {
      id: 'job1', integration_id: 'int1', user_id: 'user1', status: 'pending',
      cursor: 0, file_list: ['f1.pdf'], total_files: 5, added: 0, errors: 0,
      updated_at: new Date(0).toISOString(),
    };
    const integration = { id: 'int1', user_id: 'user1', sync_count: 0 };
    const integrationEqCalls = [];
    let integrationsCallCount = 0;

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'integrations') {
            integrationsCallCount++;
            const isStaleLookup = integrationsCallCount > 1; // 1st call = "due for auto-sync" query
            const c = {
              select: () => c,
              eq: (col, val) => { if (isStaleLookup) integrationEqCalls.push([col, val]); return c; },
              single: () => Promise.resolve({ data: integration, error: null }),
              then: (resolve) => resolve({ data: [], error: null }), // no integrations due
            };
            return c;
          }
          if (table === 'sync_jobs') {
            const c = {
              select: () => c, update: () => c, in: () => c, lt: () => c, eq: () => c,
              limit: () => Promise.resolve({ data: [job], error: null }),
              maybeSingle: () => Promise.resolve({ data: job, error: null }), // atomic claim succeeds
              then: (resolve) => resolve({ data: null, error: null }),
            };
            return c;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { processGoogleDriveFileBatch: async () => ({ results: [], errors: 0 }) },
    };

    const cron = freshRequire('../server/routes/cron.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(integrationEqCalls).toEqual([['id', 'int1'], ['user_id', 'user1']]);
    expect(res.body.jobsResumed).toBe(1);
  });
});
