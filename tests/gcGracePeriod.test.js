import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// CASH-118: the manual upload flow writes the file to storage *before* the
// invoice row is inserted (src/hooks/useUpload.js). If the GC cron fires in
// that window, a legitimate, about-to-be-linked attachment previously looked
// indistinguishable from an abandoned upload and was permanently deleted.
// partitionByGrace() (and runGc using it) must only delete an orphan once
// it's older than the 1hr grace threshold.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');
const storagePath  = require.resolve('../server/lib/storage.js');
const gcPath       = require.resolve('../server/routes/gc.js');

const freshGc = (supabaseExports, storageExports) => {
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseExports };
  require.cache[storagePath]  = { id: storagePath, filename: storagePath, loaded: true, exports: storageExports };
  delete require.cache[gcPath];
  return require('../server/routes/gc.js');
};

describe('partitionByGrace (CASH-118)', () => {
  it('skips an orphan younger than the grace threshold and deletes one older than it', () => {
    const { partitionByGrace } = freshGc({}, {});
    const now = Date.now();
    const lastModifiedByKey = new Map([
      ['user1/just-uploaded.pdf', now - 5 * 60 * 1000],       // 5 min ago — mid in-flight upload
      ['user1/long-abandoned.pdf', now - 2 * 60 * 60 * 1000], // 2 hours ago — genuinely orphaned
    ]);

    const { toDelete, skippedGrace } = partitionByGrace(
      ['user1/just-uploaded.pdf', 'user1/long-abandoned.pdf'],
      lastModifiedByKey,
      { now },
    );

    expect(toDelete).toEqual(['user1/long-abandoned.pdf']);
    expect(skippedGrace).toEqual(['user1/just-uploaded.pdf']);
  });

  it('treats an unknown last-modified time as too recent to delete', () => {
    const { partitionByGrace } = freshGc({}, {});
    const now = Date.now();
    const lastModifiedByKey = new Map([['user1/unknown-age.pdf', null]]);

    const { toDelete, skippedGrace } = partitionByGrace(['user1/unknown-age.pdf'], lastModifiedByKey, { now });

    expect(toDelete).toEqual([]);
    expect(skippedGrace).toEqual(['user1/unknown-age.pdf']);
  });

  it('respects a custom grace threshold', () => {
    const { partitionByGrace } = freshGc({}, {});
    const now = Date.now();
    const lastModifiedByKey = new Map([['user1/f.pdf', now - 30 * 60 * 1000]]); // 30 min ago

    const shortGrace = partitionByGrace(['user1/f.pdf'], lastModifiedByKey, { now, graceMs: 10 * 60 * 1000 });
    expect(shortGrace.toDelete).toEqual(['user1/f.pdf']);

    const longGrace = partitionByGrace(['user1/f.pdf'], lastModifiedByKey, { now, graceMs: 60 * 60 * 1000 });
    expect(longGrace.skippedGrace).toEqual(['user1/f.pdf']);
  });
});

describe('runGc end-to-end (CASH-118: grace period protects an in-flight upload)', () => {
  it('does not delete a recent orphan but deletes an old one, and reports both counts', async () => {
    const now = Date.now();
    const supabaseMock = {
      from: () => {
        const builder = {
          select: () => builder,
          not: () => builder,
          order: () => builder,
          range: () => Promise.resolve({ data: [], error: null }), // no invoices reference anything
        };
        return builder;
      },
    };
    const deleted = [];
    const storageMock = {
      activeBackend: () => 'supabase',
      listAllKeys: async () => [
        { key: 'user1/mid-upload.pdf', lastModified: now - 5 * 60 * 1000 },     // 5 min ago
        { key: 'user1/abandoned.pdf', lastModified: now - 2 * 60 * 60 * 1000 }, // 2 hours ago
      ],
      deleteAttachment: async key => { deleted.push(key); },
    };
    const { runGc } = freshGc(supabaseMock, storageMock);

    const req = { headers: { authorization: 'Bearer test-secret' }, query: {} }; // dryRun off — real delete pass
    let statusCode = 200, body = null;
    const res = { status: c => { statusCode = c; return res; }, json: b => { body = b; return res; } };

    const prevSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-secret';
    try {
      await runGc(req, res);
    } finally {
      process.env.CRON_SECRET = prevSecret;
    }

    expect(statusCode).toBe(200);
    expect(deleted).toEqual(['user1/abandoned.pdf']);
    expect(body.orphans).toBe(2);
    expect(body.skippedGrace).toBe(1);
    expect(body.deleted).toBe(1);
  });
});
