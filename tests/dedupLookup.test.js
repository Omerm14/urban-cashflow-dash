import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// CASH-8: getExistingInvoices() used to load a user's ENTIRE invoice history
// into memory for dedup — silently missing rows past PostgREST's 1000-row cap
// (duplicate imports) and OOMing at 10k+ invoices. findDuplicateCandidates()
// replaces that with narrow, indexed per-candidate queries; getSeenFilenames()
// replaces the full 5-column load behind the Drive seenFiles pre-filter with a
// paginated single-column fetch that no longer drops rows past 1000.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');
const syncProcessorPath = require.resolve('../server/services/syncProcessor.js');

// Mirrors the freshRequire pattern used in tests/accountCleanupAttachments.test.js —
// seed the supabase mock, then force a fresh require() of syncProcessor.js so it
// picks up this test's mock instead of a previous test's cached module.
const freshSyncProcessor = mockExports => {
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: mockExports };
  delete require.cache[syncProcessorPath];
  return require('../server/services/syncProcessor.js');
};

const buildInvoicesMock = ({ onEq = () => {}, byInvoiceNo = {}, byAmountDate = {}, allRows = [] } = {}) => {
  const state = { filters: {} };
  const builder = {
    select: () => builder,
    eq: (col, val) => { state.filters[col] = val; onEq(col, val); return builder; },
    order: () => builder,
    range: (from, to) => Promise.resolve({ data: allRows.slice(from, to + 1), error: null }),
    then: resolve => {
      if (state.filters.invoice_no !== undefined) {
        return resolve({ data: byInvoiceNo[state.filters.invoice_no] || [], error: null });
      }
      if (state.filters.amount !== undefined && state.filters.invoice_date !== undefined) {
        const key = `${state.filters.amount}|${state.filters.invoice_date}`;
        return resolve({ data: byAmountDate[key] || [], error: null });
      }
      return resolve({ data: [], error: null });
    },
  };
  return builder;
};

describe('findDuplicateCandidates (CASH-8: targeted Postgres queries, not full-table load)', () => {
  it('queries by invoice_no and by amount+invoice_date, always scoped by user_id', async () => {
    const eqCalls = [];
    const { findDuplicateCandidates } = freshSyncProcessor({
      from: () => buildInvoicesMock({
        onEq: (col, val) => eqCalls.push([col, val]),
        byInvoiceNo: { 'INV-1': [{ supplier: 'Acme', invoice_no: 'INV-1', amount: 100, invoice_date: '2026-01-01' }] },
      }),
    });

    const matches = await findDuplicateCandidates('user-1', {
      invoice_no: 'INV-1', amount: 100, invoice_date: '2026-01-01',
    });

    expect(matches).toEqual([{ supplier: 'Acme', invoice_no: 'INV-1', amount: 100, invoice_date: '2026-01-01' }]);
    expect(eqCalls.some(([col]) => col === 'user_id')).toBe(true);
  });

  it('finds a fuzzy match by amount+invoice_date even with no invoice_no', async () => {
    const { findDuplicateCandidates } = freshSyncProcessor({
      from: () => buildInvoicesMock({
        byAmountDate: { '200|2026-02-10': [{ supplier: 'Beta Corp', invoice_no: null, amount: 200, invoice_date: '2026-02-10' }] },
      }),
    });

    const matches = await findDuplicateCandidates('user-1', {
      invoice_no: '', amount: 200, invoice_date: '2026-02-10',
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].supplier).toBe('Beta Corp');
  });

  it('makes zero DB calls (returns []) when the candidate has neither invoice_no nor an amount', async () => {
    let calls = 0;
    const { findDuplicateCandidates } = freshSyncProcessor({
      from: () => { calls++; return buildInvoicesMock(); },
    });

    const matches = await findDuplicateCandidates('user-1', { invoice_no: '', amount: null, invoice_date: '' });

    expect(matches).toEqual([]);
    expect(calls).toBe(0);
  });

  // Pre-merge review fix: OCR can extract invoice_no with stray whitespace
  // ("INV-100 ") that classifyDuplicateMatch()'s trim-tolerant comparison
  // would recognize as the same invoice — but the DB query itself was
  // untrimmed, an exact match, so it returned zero rows and the trim-aware
  // comparison never got a chance to run against the real duplicate.
  it('trims invoice_no before querying, so OCR whitespace variance does not defeat the exact-match dedup path', async () => {
    const eqCalls = [];
    const { findDuplicateCandidates } = freshSyncProcessor({
      from: () => buildInvoicesMock({
        onEq: (col, val) => eqCalls.push([col, val]),
        byInvoiceNo: { 'INV-100': [{ supplier: 'Acme', invoice_no: 'INV-100', amount: 100, invoice_date: '2026-01-01' }] },
      }),
    });

    const matches = await findDuplicateCandidates('user-1', {
      invoice_no: '  INV-100 ', amount: 100, invoice_date: '2026-01-01',
    });

    expect(eqCalls).toContainEqual(['invoice_no', 'INV-100']);
    expect(matches).toHaveLength(1);
  });

  // Pre-merge review fix: extraction always produces a string invoice_date
  // ('' when OCR found none — never null/undefined, see the candidate
  // construction in processFile()/syncGreenInvoice()), so the old
  // `&& candidate.invoice_date` truthy guard skipped the fuzzy amount+date
  // lookup entirely whenever both invoice_no and invoice_date were blank —
  // the exact case a low-quality scan produces. A true duplicate arriving in
  // a later, separate sync run got zero cross-run dedup checking.
  it('still runs the fuzzy amount+date lookup when invoice_date is blank (not skipped as falsy)', async () => {
    const eqCalls = [];
    const { findDuplicateCandidates } = freshSyncProcessor({
      from: () => buildInvoicesMock({
        onEq: (col, val) => eqCalls.push([col, val]),
        byAmountDate: { '150|': [{ supplier: 'Acme', invoice_no: '', amount: 150, invoice_date: '' }] },
      }),
    });

    const matches = await findDuplicateCandidates('user-1', {
      invoice_no: '', amount: 150, invoice_date: '',
    });

    expect(eqCalls).toContainEqual(['invoice_date', '']);
    expect(matches).toHaveLength(1);
  });
});

describe('getSeenFilenames (CASH-8: paginates past the 1000-row PostgREST cap)', () => {
  it('collects filenames across multiple pages instead of silently stopping at 1000', async () => {
    const allRows = Array.from({ length: 1500 }, (_, i) => ({ source_file: `file-${i}.pdf` }));
    const { getSeenFilenames } = freshSyncProcessor({ from: () => buildInvoicesMock({ allRows }) });

    const seen = await getSeenFilenames('user-1');

    expect(seen.size).toBe(1500);
    expect(seen.has('file-0.pdf')).toBe(true);
    expect(seen.has('file-1499.pdf')).toBe(true); // past the old 1000-row cap
  });

  it('strips the "(page N)" suffix so multi-page PDFs match their base filename', async () => {
    const allRows = [{ source_file: 'invoice.pdf (page 2)' }];
    const { getSeenFilenames } = freshSyncProcessor({ from: () => buildInvoicesMock({ allRows }) });

    const seen = await getSeenFilenames('user-1');

    expect(seen.has('invoice.pdf')).toBe(true);
  });
});
