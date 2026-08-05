import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// A Drive integration whose previous run handed overflow files to sync_jobs
// blocks new discovery (syncGoogleDrive's activeJob guard) until that job is
// resumed. Previously this silently returned added:0 with last_sync advanced
// to now — indistinguishable from "nothing new to sync" and, worse, it moved
// the cutoff window forward past files the stuck job hadn't reached yet.
// This pins the fix: a blocked run is reported distinctly and last_sync is
// left untouched so the next tick's cutoff doesn't skip anything.
const require = createRequire(import.meta.url);
const supabasePath      = require.resolve('../server/lib/supabase.js');
const syncProcessorPath = require.resolve('../server/services/syncProcessor.js');

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

describe('cron.runSync — Drive blocked by an active sync_jobs run', () => {
  const integration = {
    id: 'int1', user_id: 'user1', type: 'google_drive',
    auto_sync_enabled: true, status: 'connected', last_sync: null, sync_count: 0,
  };

  it('does not advance last_sync and reports the block instead of a plain zero-result', async () => {
    process.env.CRON_SECRET = 'test-secret';
    let integrationsUpdateCalled = false;

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'integrations') {
            const c = {
              select: () => c, eq: () => c,
              update: (payload) => { integrationsUpdateCalled = true; return { eq: () => Promise.resolve({ data: null, error: null }) }; },
              then: (resolve) => resolve({ data: [integration], error: null }),
            };
            return c;
          }
          if (table === 'sync_jobs') {
            // No stale jobs to resume in this test — separate from the active-job guard inside syncGoogleDrive.
            const c = { select: () => c, in: () => c, lt: () => c, limit: () => Promise.resolve({ data: [], error: null }) };
            return c;
          }
          if (table === 'subscriptions') {
            const c = { select: () => c, eq: () => c, single: () => Promise.resolve({ data: { plan: 'pro' }, error: null }), upsert: () => Promise.resolve({ data: null, error: null }) };
            return c;
          }
          if (table === 'invoices') {
            const c = { select: () => c, eq: () => c, gte: () => Promise.resolve({ data: null, error: null, count: 0 }) };
            return c;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: {
        syncGoogleDrive: async () => ({ added: 0, skipped: 0, filesFound: 0, errors: 0, blocked: 'active_job', jobId: 'stuck-job-1' }),
      },
    };

    const cron = freshRequire('../server/routes/cron.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(integrationsUpdateCalled).toBe(false);
    expect(res.body.results).toEqual([
      { id: 'int1', type: 'google_drive', added: 0, skipped: 'blocked:active_job' },
    ]);
  });
});
