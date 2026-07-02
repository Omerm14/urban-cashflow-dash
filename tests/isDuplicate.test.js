import { describe, it, expect } from 'vitest';

// Inline the pure logic extracted from syncProcessor.js so tests don't need
// to import the full module (which has side-effectful requires for Supabase etc.)

const normSup = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

const isDuplicate = (candidate, existing, strict = false) => existing.some(inv => {
  const sameSup    = normSup(inv.supplier)  === normSup(candidate.supplier);
  const exactMatch = sameSup && inv.invoice_no && candidate.invoice_no &&
                     inv.invoice_no.trim() === candidate.invoice_no.trim();
  const fuzzyMatch = !strict && sameSup &&
                     Number(inv.amount) === Number(candidate.amount) &&
                     inv.invoice_date   === candidate.invoice_date;
  return exactMatch || fuzzyMatch;
});

const INV = (supplier, invoice_no, amount, invoice_date) =>
  ({ supplier, invoice_no, amount, invoice_date });

describe('isDuplicate', () => {
  const existing = [
    INV('Acme Ltd', 'INV-001', 100, '2024-01-15'),
    INV('Beta Corp', null,     200, '2024-02-10'),
  ];

  it('detects exact match by supplier + invoice_no', () => {
    expect(isDuplicate(INV('Acme Ltd', 'INV-001', 999, '2099-01-01'), existing)).toBe(true);
  });

  it('is case/whitespace insensitive for supplier on exact match', () => {
    expect(isDuplicate(INV('  acme ltd ', 'INV-001', 999, '2099-01-01'), existing)).toBe(true);
  });

  it('does not exact-match when invoice_no differs (may still fuzzy-match on amount+date)', () => {
    // INV-002 vs INV-001 differ, but same amount+date triggers fuzzy match — expected behaviour
    expect(isDuplicate(INV('Acme Ltd', 'INV-002', 100, '2024-01-15'), existing)).toBe(true);
  });

  it('does not match when supplier, amount, and date all differ', () => {
    expect(isDuplicate(INV('Unknown Co', 'INV-999', 999, '2020-01-01'), existing)).toBe(false);
  });

  it('detects fuzzy match (no invoice_no) by supplier + amount + date', () => {
    expect(isDuplicate(INV('Beta Corp', null, 200, '2024-02-10'), existing)).toBe(true);
  });

  it('does not fuzzy-match when amount differs', () => {
    expect(isDuplicate(INV('Beta Corp', null, 201, '2024-02-10'), existing)).toBe(false);
  });

  it('does not fuzzy-match when date differs', () => {
    expect(isDuplicate(INV('Beta Corp', null, 200, '2024-02-11'), existing)).toBe(false);
  });

  it('strict mode disables fuzzy match (allows recurring invoices with same sup/amount/date)', () => {
    const candidate = INV('Beta Corp', null, 200, '2024-02-10');
    expect(isDuplicate(candidate, existing, true)).toBe(false);
  });

  it('strict mode still allows exact invoice_no match', () => {
    const candidate = INV('Acme Ltd', 'INV-001', 100, '2024-01-15');
    expect(isDuplicate(candidate, existing, true)).toBe(true);
  });

  it('returns false for empty existing list', () => {
    expect(isDuplicate(INV('Acme Ltd', 'INV-001', 100, '2024-01-15'), [])).toBe(false);
  });
});
