import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// CASH-22: gc.js's "referenced" attachment-path set was built from a single
// unbounded .select(), which PostgREST silently caps at 1000 rows. Past that
// cap, real files a live invoice still points to were treated as orphans and
// physically deleted — irreversible data loss. fetchAllReferencedPaths()
// paginates so every referenced path is collected regardless of table size.
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

const paginatedInvoicesMock = allRows => ({
  from: () => {
    const builder = {
      select: () => builder,
      not: () => builder,
      range: (from, to) => Promise.resolve({ data: allRows.slice(from, to + 1), error: null }),
    };
    return builder;
  },
});

describe('fetchAllReferencedPaths (CASH-22: paginate past the 1000-row PostgREST cap)', () => {
  it('collects attachment_path across multiple pages', async () => {
    const allRows = Array.from({ length: 2500 }, (_, i) => ({ attachment_path: `user/${i}.pdf` }));
    const { fetchAllReferencedPaths } = freshGc(paginatedInvoicesMock(allRows), { activeBackend: () => 'supabase' });

    const paths = await fetchAllReferencedPaths();

    expect(paths).toHaveLength(2500);
    expect(paths).toContain('user/0.pdf');
    expect(paths).toContain('user/2499.pdf'); // past the old 1000-row cap
  });

  it('stops after a single page when there is fewer than the page size (small accounts unaffected)', async () => {
    const allRows = [{ attachment_path: 'a.pdf' }, { attachment_path: 'b.pdf' }];
    const { fetchAllReferencedPaths } = freshGc(paginatedInvoicesMock(allRows), { activeBackend: () => 'supabase' });

    const paths = await fetchAllReferencedPaths();

    expect(paths).toEqual(['a.pdf', 'b.pdf']);
  });

  it('propagates a query error instead of silently returning a partial set', async () => {
    const failingSupabase = {
      from: () => {
        const builder = {
          select: () => builder,
          not: () => builder,
          range: () => Promise.resolve({ data: null, error: { message: 'connection reset' } }),
        };
        return builder;
      },
    };
    const { fetchAllReferencedPaths } = freshGc(failingSupabase, { activeBackend: () => 'supabase' });

    await expect(fetchAllReferencedPaths()).rejects.toThrow('connection reset');
  });
});

describe('runGc (CASH-22: no orphan false-positives past 1000 referenced attachments)', () => {
  it('does not treat a >1000th referenced file as an orphan', async () => {
    const allRows = Array.from({ length: 1200 }, (_, i) => ({ attachment_path: `user/${i}.pdf` }));
    const supabaseMock = paginatedInvoicesMock(allRows);
    const storageMock = {
      activeBackend: () => 'supabase',
      listAllKeys: async () => allRows.map(r => r.attachment_path), // storage has exactly what's referenced
      deleteAttachment: async () => {},
    };
    const { runGc } = freshGc(supabaseMock, storageMock);

    const req = { headers: { authorization: 'Bearer test-secret' }, query: { dryRun: '1' } };
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
    expect(body.referenced).toBe(1200);
    expect(body.orphans).toBe(0); // every file (including past row 1000) is correctly recognized as referenced
  });
});
