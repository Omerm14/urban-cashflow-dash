import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// CASH-25: an insert failure during Green Invoice sync must produce a
// console.error, an 'ocr_failed' sync_events row with the real error message,
// and a real `errors` count in the return value — not the old silent
// `errors: 0` behaviour. Uses the same require.cache-seeding technique as
// tests/plans.test.js: syncProcessor.js pulls in server/lib/supabase.js via
// a plain CommonJS require(), which vi.mock cannot intercept.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');

const FAILING_SOURCE_FILE = 'green_invoice_g2';

const thenable = value => ({ then: resolve => resolve(value) });

// Minimal per-table query builder covering exactly the chains syncGreenInvoice
// (and the helpers it calls: getSuppliers, getExistingInvoices, isCancelRequested,
// logSyncEvent) exercise.
const makeBuilder = table => {
  let insertPayload = null;
  const builder = {
    select: () => builder,
    eq:     () => builder,
    insert: payload => { insertPayload = payload; return table === 'sync_events' ? thenable({ error: null }) : builder; },
    single: () => {
      if (table === 'integrations') return Promise.resolve({ data: { cancel_requested: false }, error: null });
      // table === 'invoices', insert().select().single() save path
      if (insertPayload?.source_file === FAILING_SOURCE_FILE) {
        return Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint' } });
      }
      return Promise.resolve({ data: { id: `saved-${insertPayload?.source_file}`, ...insertPayload }, error: null });
    },
    then: resolve => {
      // select().eq(...) awaited directly — getSuppliers / getExistingInvoices
      if (table === 'suppliers') return resolve({ data: [], error: null });
      return resolve({ data: [], error: null }); // no pre-existing invoices
    },
  };
  return builder;
};

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { from: table => makeBuilder(table) },
};

const { syncGreenInvoice } = await import('../server/services/syncProcessor.js');

const greenInvoiceDoc = (id, amount = 100) => ({
  id, amount, number: id, date: '2026-01-01T00:00:00Z', supplier: { name: `Supplier ${id}` },
});

describe('syncGreenInvoice error handling (CASH-25)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn(async url => {
      if (url.includes('/account/token')) {
        return { ok: true, json: async () => ({ token: 'test-token' }) };
      }
      if (url.includes('/expenses/search')) {
        return {
          ok: true,
          json: async () => ({ items: [greenInvoiceDoc('g1'), greenInvoiceDoc('g2'), greenInvoiceDoc('g3')] }),
        };
      }
      throw new Error(`unexpected fetch url ${url}`);
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete global.fetch;
  });

  it('counts a per-doc insert failure in `errors` instead of hardcoding 0', async () => {
    const integration = { id: 'int-1', credentials: { apiKey: 'k', apiSecret: 's' }, config: {} };
    const result = await syncGreenInvoice(integration, 'user-1');

    expect(result.errors).toBe(1);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('logs console.error and an ocr_failed sync_event with the real error message on insert failure', async () => {
    const integration = { id: 'int-1', credentials: { apiKey: 'k', apiSecret: 's' }, config: {} };
    await syncGreenInvoice(integration, 'user-1');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('green_invoice save failed'),
      expect.stringContaining('duplicate key value violates unique constraint'),
    );
  });

  it('leaves the successful-path behavior (added count, saved rows) unaffected', async () => {
    const integration = { id: 'int-2', credentials: { apiKey: 'k', apiSecret: 's' }, config: {} };
    global.fetch = vi.fn(async url => {
      if (url.includes('/account/token')) return { ok: true, json: async () => ({ token: 'test-token' }) };
      if (url.includes('/expenses/search')) {
        return { ok: true, json: async () => ({ items: [greenInvoiceDoc('g10'), greenInvoiceDoc('g11')] }) };
      }
      throw new Error(`unexpected fetch url ${url}`);
    });

    const result = await syncGreenInvoice(integration, 'user-1');

    expect(result).toEqual({ added: 2, skipped: 0, filesFound: 2, errors: 0 });
  });
});
