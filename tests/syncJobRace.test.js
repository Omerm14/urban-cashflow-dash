import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// CASH-23: two independent callers — the browser-polled POST /api/sync-jobs/:id/process
// (processSyncJob) and cron's stale-job resume (runSync) — could both read a
// claimable sync_jobs row before either had written status='running', and both
// proceed to process the same batch: duplicate paid Claude OCR spend, and cursor
// corruption from two racing cursor writes. The fix replaces "read status, then
// separately update" with a single atomic UPDATE ... WHERE <still-claimable>
// RETURNING * — only one caller's claim can match.
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

describe('processSyncJob atomic claim (CASH-23)', () => {
  const job = {
    id: 'job1', integration_id: 'int1', user_id: 'user1', status: 'running',
    cursor: 0, file_list: ['f1.pdf'], total_files: 5, added: 0, dupes: 0, errors: 0,
    updated_at: new Date().toISOString(), // fresh — another caller is actively working it
  };
  const integration = { id: 'int1', user_id: 'user1', sync_count: 0 };

  it('does not process a batch when the atomic claim UPDATE matches zero rows (already claimed)', async () => {
    let batchCalled = false;
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'sync_jobs') {
            const c = {
              select: () => c, update: () => c, eq: () => c, or: () => c,
              // The claim UPDATE...WHERE matches nothing (another caller holds it) —
              // a real Postgres UPDATE with no matching rows returns [] via .select().
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              single: () => Promise.resolve({ data: job, error: null }), // re-fetch after missed claim
            };
            return c;
          }
          if (table === 'integrations') {
            const c = { select: () => c, eq: () => c, single: () => Promise.resolve({ data: integration, error: null }) };
            return c;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { processGoogleDriveFileBatch: async () => { batchCalled = true; return { results: [], skipped: 0, errors: 0 }; } },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await integrations.processSyncJob({ params: { jobId: 'job1' }, user: { id: 'user1' } }, res);

    expect(batchCalled).toBe(false);
    expect(res.body).toEqual({ done: false, cursor: 0, totalFiles: 5, added: 0, dupes: 0, errors: 0, filesAdded: [] });
  });

  it('processes the batch when the atomic claim succeeds (job was pending)', async () => {
    let batchCalled = false;
    const pendingJob = { ...job, status: 'pending' };
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'sync_jobs') {
            const c = {
              select: () => c, update: () => c, eq: () => c, or: () => c,
              maybeSingle: () => Promise.resolve({ data: pendingJob, error: null }), // claim succeeds
              then: (resolve) => resolve({ data: null, error: null }),
            };
            return c;
          }
          if (table === 'integrations') {
            const c = { select: () => c, eq: () => c, single: () => Promise.resolve({ data: integration, error: null }) };
            return c;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { processGoogleDriveFileBatch: async () => { batchCalled = true; return { results: [{ id: 'inv1' }], skipped: 0, errors: 0 }; } },
    };

    const integrations = freshRequire('../server/routes/integrations.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await integrations.processSyncJob({ params: { jobId: 'job1' }, user: { id: 'user1' } }, res);

    expect(batchCalled).toBe(true);
    expect(res.body.added).toBe(1);
  });
});

describe('runSync stale-job atomic claim (CASH-23)', () => {
  const job = {
    id: 'job1', integration_id: 'int1', user_id: 'user1', status: 'pending',
    cursor: 0, file_list: ['f1.pdf'], total_files: 5, added: 0, errors: 0,
    updated_at: new Date(0).toISOString(),
  };
  const integration = { id: 'int1', user_id: 'user1', sync_count: 0 };

  it('skips a stale job whose atomic claim UPDATE matches zero rows (already claimed by a browser poll)', async () => {
    process.env.CRON_SECRET = 'test-secret';
    let batchCalled = false;

    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'integrations') {
            const c = {
              select: () => c, eq: () => c,
              single: () => Promise.resolve({ data: integration, error: null }),
              then: (resolve) => resolve({ data: [], error: null }), // no integrations due for auto-sync
            };
            return c;
          }
          if (table === 'sync_jobs') {
            const c = {
              select: () => c, update: () => c, in: () => c, lt: () => c, eq: () => c,
              limit: () => Promise.resolve({ data: [job], error: null }),
              maybeSingle: () => Promise.resolve({ data: null, error: null }), // lost the race
            };
            return c;
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };
    require.cache[syncProcessorPath] = {
      id: syncProcessorPath, filename: syncProcessorPath, loaded: true,
      exports: { processGoogleDriveFileBatch: async () => { batchCalled = true; return { results: [], errors: 0 }; } },
    };

    const cron = freshRequire('../server/routes/cron.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(batchCalled).toBe(false);
    expect(res.body.jobsResumed).toBe(0);
  });

  it('processes a stale job when the atomic claim succeeds', async () => {
    process.env.CRON_SECRET = 'test-secret';
    let batchCalled = false;

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
              limit: () => Promise.resolve({ data: [job], error: null }),
              maybeSingle: () => Promise.resolve({ data: job, error: null }), // claim succeeds
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
      exports: { processGoogleDriveFileBatch: async () => { batchCalled = true; return { results: [{ id: 'inv1' }], errors: 0 }; } },
    };

    const cron = freshRequire('../server/routes/cron.js', [supabasePath, syncProcessorPath]);
    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(batchCalled).toBe(true);
    expect(res.body.jobsResumed).toBe(1);
  });
});
