import { describe, it, expect } from 'vitest';
import { findDuplicates } from '../src/utils/invoice.js';

// Performance audit follow-up: findDuplicates() previously compared every
// pair of invoices with a nested loop (O(n²)), including pairs from
// completely different suppliers that could never be a duplicate. It now
// groups by normalized supplier first and only compares within each group —
// same result, since a duplicate always requires a matching supplier, but
// avoids the wasted cross-supplier comparisons.
describe('findDuplicates', () => {
  it('flags two invoices from the same supplier with the same invoice_no', () => {
    const invoices = [
      { id: 1, supplier: 'Acme', invoiceNo: 'INV-1', amount: 100, invoiceDate: '2026-01-01' },
      { id: 2, supplier: 'Acme', invoiceNo: 'INV-1', amount: 999, invoiceDate: '2026-06-06' },
    ];
    expect(findDuplicates(invoices)).toEqual(new Set([1, 2]));
  });

  it('flags two invoices from the same supplier with the same amount+date (fuzzy match) when invoiceNo is blank', () => {
    const invoices = [
      { id: 1, supplier: 'Acme', invoiceNo: '', amount: 150, invoiceDate: '2026-02-10' },
      { id: 2, supplier: 'Acme', invoiceNo: '', amount: 150, invoiceDate: '2026-02-10' },
    ];
    expect(findDuplicates(invoices)).toEqual(new Set([1, 2]));
  });

  it('does not flag matching amount+date across two different suppliers', () => {
    const invoices = [
      { id: 1, supplier: 'Acme', invoiceNo: '', amount: 150, invoiceDate: '2026-02-10' },
      { id: 2, supplier: 'Beta Corp', invoiceNo: '', amount: 150, invoiceDate: '2026-02-10' },
    ];
    expect(findDuplicates(invoices)).toEqual(new Set());
  });

  it('does not flag the same supplier with different invoice_no, amount, and date', () => {
    const invoices = [
      { id: 1, supplier: 'Acme', invoiceNo: 'INV-1', amount: 100, invoiceDate: '2026-01-01' },
      { id: 2, supplier: 'Acme', invoiceNo: 'INV-2', amount: 200, invoiceDate: '2026-02-02' },
    ];
    expect(findDuplicates(invoices)).toEqual(new Set());
  });

  it('is tolerant of trailing punctuation/whitespace/case differences in the supplier name', () => {
    const invoices = [
      { id: 1, supplier: 'Acme Ltd.', invoiceNo: 'INV-1', amount: 100, invoiceDate: '2026-01-01' },
      { id: 2, supplier: '  acme ltd  ', invoiceNo: 'INV-1', amount: 999, invoiceDate: '2026-09-09' },
    ];
    expect(findDuplicates(invoices)).toEqual(new Set([1, 2]));
  });

  it('flags every member of a 3-way duplicate group, not just one pair', () => {
    const invoices = [
      { id: 1, supplier: 'Acme', invoiceNo: 'INV-1', amount: 100, invoiceDate: '2026-01-01' },
      { id: 2, supplier: 'Acme', invoiceNo: 'INV-1', amount: 100, invoiceDate: '2026-01-01' },
      { id: 3, supplier: 'Acme', invoiceNo: 'INV-1', amount: 100, invoiceDate: '2026-01-01' },
      { id: 4, supplier: 'Acme', invoiceNo: 'INV-2', amount: 500, invoiceDate: '2026-03-03' },
    ];
    expect(findDuplicates(invoices)).toEqual(new Set([1, 2, 3]));
  });

  it('handles a large invoice set spread across many suppliers without hanging', () => {
    // 5,000 invoices across 100 suppliers (50 each) — the O(n²) full
    // cross-product version would do ~12.5M comparisons; the grouped version
    // does ~100 groups of 50²/2 ≈ 1,225 comparisons each (~122K total).
    const invoices = [];
    for (let s = 0; s < 100; s++) {
      for (let k = 0; k < 50; k++) {
        invoices.push({
          id: s * 50 + k,
          supplier: `Supplier ${s}`,
          invoiceNo: `INV-${s}-${k}`,
          amount: 100 + k,
          invoiceDate: `2026-01-${String((k % 28) + 1).padStart(2, '0')}`,
        });
      }
    }
    const start = performance.now();
    const dupes = findDuplicates(invoices);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(dupes.size).toBe(0); // every invoice_no is unique within this fixture
  });
});
