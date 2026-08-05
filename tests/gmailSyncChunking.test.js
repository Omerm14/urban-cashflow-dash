import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// syncGmail previously had no per-run processing cap or sync_jobs-style
// chunking (unlike syncGoogleDrive), so a single Gmail integration with a
// large new-message backlog could alone exceed Vercel's 60s function limit
// (confirmed via a live 504 FUNCTION_INVOCATION_TIMEOUT after re-enabling the
// auto-sync cron). The fix mirrors Drive's pattern: cap per-run processing,
// hand overflow to a sync_jobs row (now tagged `type: 'gmail'`), guard against
// starting new discovery while a job is still active, and resume via the same
// stale-job pickup cron already has for Drive.
//
// syncGmail's internals talk to the live Gmail API and aren't unit-testable
// without an integration harness (see syncGmailSkipImported.test.js), so
// these tests pin the new dispatch logic that routes work by `job.type` and
// that a `blocked` result doesn't advance last_sync — the two places a
// regression here would silently reintroduce the drop/duplicate risk.
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

describe('cron stale-job resume dispatches by job.type', () => {
  const integration = { id: 'int1', user_id: 'user1', type: 'gmail', sync_count: 0 };
  const gmailJob = {
    id: 'job1', integration_id: 'int1', user_id: 'user1', type: 'gmail', status: 'pending',
    cursor: 0, file_list: [{ id: 'msg1' }], total_files: 3, added: 0, errors: 0,
    updated_at: new Date(0).toISOString(),
  };

  it('calls processGmailMessageBatch, not processGoogleDriveFileBatch, for a gmail-typed job', async () => {
    process.env.CRON_SECRET = 'test-secret';
    let gmailBatchCalled = false, driveBatchCalled = false;

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'integrations') {
            const c = {
              select: () => c, eq: () => c,
              single: () => Promise.resolve({ data: integration, error: null }),
              then: (resolve) => resolve({ data: [], error: null }),
            };
            return c;
          }
          if (table === 'sync_jobs') {
            const c = {
              select: () => c, update: () => c, in: () => c, lt: () => c, eq: () => c,
              limit: () => Promise.resolve({ data: [gmailJob], error: null }),
              maybeSingle: () => Promise.resolve({ data: gmailJob, error: null }),
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
      exports: {
        processGmailMessageBatch: async () => { gmailBatchCalled = true; return { results: [{ id: 'inv1' }], skipped: 0, errors: 0 }; },
        processGoogleDriveFileBatch: async () => { driveBatchCalled = true; return { results: [], skipped: 0, errors: 0 }; },
      },
    };

    const cron = freshRequire('../server/routes/cron.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(gmailBatchCalled).toBe(true);
    expect(driveBatchCalled).toBe(false);
    expect(res.body.jobsResumed).toBe(1);
  });

  it('falls back to processGoogleDriveFileBatch for a job with no type (pre-migration rows)', async () => {
    process.env.CRON_SECRET = 'test-secret';
    let gmailBatchCalled = false, driveBatchCalled = false;
    const untypedJob = { ...gmailJob, type: undefined };

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'integrations') {
            const c = {
              select: () => c, eq: () => c,
              single: () => Promise.resolve({ data: { ...integration, type: 'google_drive' }, error: null }),
              then: (resolve) => resolve({ data: [], error: null }),
            };
            return c;
          }
          if (table === 'sync_jobs') {
            const c = {
              select: () => c, update: () => c, in: () => c, lt: () => c, eq: () => c,
              limit: () => Promise.resolve({ data: [untypedJob], error: null }),
              maybeSingle: () => Promise.resolve({ data: untypedJob, error: null }),
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
      exports: {
        processGmailMessageBatch: async () => { gmailBatchCalled = true; return { results: [], skipped: 0, errors: 0 }; },
        processGoogleDriveFileBatch: async () => { driveBatchCalled = true; return { results: [{ id: 'inv1' }], skipped: 0, errors: 0 }; },
      },
    };

    const cron = freshRequire('../server/routes/cron.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(driveBatchCalled).toBe(true);
    expect(gmailBatchCalled).toBe(false);
  });
});

describe('cron.runSync — Gmail blocked by an active sync_jobs run', () => {
  const integration = {
    id: 'int1', user_id: 'user1', type: 'gmail',
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
              update: () => { integrationsUpdateCalled = true; return { eq: () => Promise.resolve({ data: null, error: null }) }; },
              then: (resolve) => resolve({ data: [integration], error: null }),
            };
            return c;
          }
          if (table === 'sync_jobs') {
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
        syncGmail: async () => ({ added: 0, skipped: 0, filesFound: 0, errors: 0, blocked: 'active_job', jobId: 'stuck-job-1' }),
      },
    };

    const cron = freshRequire('../server/routes/cron.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(integrationsUpdateCalled).toBe(false);
    expect(res.body.results).toEqual([
      { id: 'int1', type: 'gmail', added: 0, skipped: 'blocked:active_job' },
    ]);
  });
});
