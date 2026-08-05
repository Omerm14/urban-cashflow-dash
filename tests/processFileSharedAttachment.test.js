import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// A live 504 FUNCTION_INVOCATION_TIMEOUT traced back to processFile()
// re-uploading the SAME source-file buffer to storage once per extracted
// page — for a 17-page PDF, that's 17 redundant uploads of identical bytes,
// slow enough alone to blow past Vercel's 60s limit on a large scanned
// batch. The fix uploads the file once (keyed by its content hash) and
// points every page's invoice row at that same object — same user-visible
// result (each row still has a working attachment, the full source file),
// just without the N-way redundant upload.
const require = createRequire(import.meta.url);
const supabasePath   = require.resolve('../server/lib/supabase.js');
const storagePath    = require.resolve('../server/lib/storage.js');
const extractionPath = require.resolve('../server/lib/extraction.js');
const syncProcessorPath = require.resolve('../server/services/syncProcessor.js');

const freshRequire = (relPath, keepPaths) => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/server/') && !keepPaths.includes(key)) delete require.cache[key];
  }
  return require(require.resolve(relPath));
};

describe('processFile — shared attachment upload for multi-page files', () => {
  it('uploads the source file once regardless of page count, and every saved row points at the same object', async () => {
    let putAttachmentCalls = 0;
    const insertedIds = [];

    require.cache[storagePath] = {
      id: storagePath, filename: storagePath, loaded: true,
      exports: {
        putAttachment: async ({ key }) => { putAttachmentCalls++; return { key, backend: 'supabase' }; },
      },
    };
    require.cache[extractionPath] = {
      id: extractionPath, filename: extractionPath, loaded: true,
      exports: {
        // Simulates a 3-page PDF: three distinct invoices extracted from one file.
        extractFromBuffer: async () => ([
          { supplier: 'Acme',  amount: '100', invoiceDate: '2026-01-01', invoiceNo: 'A1' },
          { supplier: 'Acme',  amount: '200', invoiceDate: '2026-01-02', invoiceNo: 'A2' },
          { supplier: 'Acme',  amount: '300', invoiceDate: '2026-01-03', invoiceNo: 'A3' },
        ]),
      },
    };
    require.cache[supabasePath] = {
      id: supabasePath, filename: supabasePath, loaded: true,
      exports: {
        from(table) {
          if (table === 'invoices') {
            let lastInsert = null;
            const c = {
              select: () => c,
              eq: () => c,
              in: () => c,
              gte: () => c,
              or: () => c,
              limit: () => Promise.resolve({ data: [], error: null }), // no existing dupes
              insert: (row) => { lastInsert = row; return c; },
              update: () => c,
              single: () => {
                const id = `inv${insertedIds.length + 1}`;
                insertedIds.push(id);
                return Promise.resolve({ data: { id, ...lastInsert }, error: null });
              },
              then: (resolve) => resolve({ data: [], error: null }), // findDuplicateCandidates' bare select
            };
            return c;
          }
          if (table === 'sync_events') {
            return { insert: () => Promise.resolve({ error: null }) };
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    };

    const sync = freshRequire('../server/services/syncProcessor.js', [storagePath, extractionPath, supabasePath]);
    const { saved } = await sync.processFile(
      Buffer.from('fake pdf bytes'), 'batch.pdf', 'application/pdf',
      'user1', [], 'int1', 'google_drive', {},
    );

    expect(putAttachmentCalls).toBe(1);
    expect(saved).toHaveLength(3);
    expect(new Set(saved.map(r => r.attachment_backend))).toEqual(new Set(['supabase']));
    expect(new Set(saved.map(r => r.attachment_path)).size).toBe(1); // all rows share the same stored key
  });
});
