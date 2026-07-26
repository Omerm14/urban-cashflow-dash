import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// CASH-47: profile.js's uploadLogo stores company logos in the same bucket as
// invoice attachments (logos/{userId}/{ts}.ext), but no invoices row ever
// references a logo key. Without an exemption, gc.js's orphan-detection treats
// every uploaded logo as indistinguishable from an abandoned upload and deletes
// it the next time /api/cron/gc runs without dryRun. computeOrphans() exempts
// the logos/ prefix from the orphan candidate set entirely.
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

describe('computeOrphans (CASH-47: logos/ keys are never treated as orphans)', () => {
  it('excludes a logos/ key with no matching invoice row from the orphan set', async () => {
    const { computeOrphans } = freshGc({}, {});
    const allKeys = ['logos/user1/1700000000000.png', 'user1/inv-1.pdf'];
    const referenced = new Set(['user1/inv-1.pdf']); // logo is NOT referenced by any invoice

    const orphans = computeOrphans(allKeys, referenced);

    expect(orphans).toEqual([]);
  });

  it('still flags a genuinely orphaned (non-logo) invoice attachment', async () => {
    const { computeOrphans } = freshGc({}, {});
    const allKeys = ['user1/inv-1.pdf', 'user1/abandoned-upload.pdf'];
    const referenced = new Set(['user1/inv-1.pdf']);

    const orphans = computeOrphans(allKeys, referenced);

    expect(orphans).toEqual(['user1/abandoned-upload.pdf']);
  });

  it('exempts multiple users\' logos while still catching a real orphan among them', async () => {
    const { computeOrphans } = freshGc({}, {});
    const allKeys = [
      'logos/user1/1.png', 'logos/user2/2.png',
      'user1/inv-1.pdf', 'user2/orphaned.pdf',
    ];
    const referenced = new Set(['user1/inv-1.pdf']);

    const orphans = computeOrphans(allKeys, referenced);

    expect(orphans).toEqual(['user2/orphaned.pdf']);
  });
});

describe('runGc end-to-end (CASH-47: logos survive a live, non-dry-run pass)', () => {
  it('never deletes a logos/ key, referenced or not', async () => {
    const deleted = [];
    const supabaseMock = {
      from: () => {
        const builder = {
          select: () => builder,
          not: () => builder,
          order: () => builder,
          range: () => Promise.resolve({ data: [{ attachment_path: 'user1/inv-1.pdf' }], error: null }),
        };
        return builder;
      },
    };
    const oldEnough = Date.now() - 2 * 60 * 60 * 1000; // outside the CASH-118 1hr grace period
    const storageMock = {
      activeBackend: () => 'supabase',
      listAllKeys: async () => [
        { key: 'user1/inv-1.pdf', lastModified: oldEnough },
        { key: 'logos/user1/1700000000000.png', lastModified: oldEnough },
        { key: 'user1/abandoned.pdf', lastModified: oldEnough },
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
    expect(body.orphans).toBe(1);
  });
});
