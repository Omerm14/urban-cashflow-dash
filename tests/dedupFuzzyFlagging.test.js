import { describe, it, expect } from 'vitest';
import { classifyDuplicateMatch, isDuplicate } from '../server/services/syncProcessor.js';

// CASH-13: when invoice_no is absent (or differs), the {supplier, amount, date}
// fallback previously caused a false-positive skip — e.g. two legitimate
// same-day deliveries from one supplier had the second silently dropped, with
// no signal. classifyDuplicateMatch() distinguishes 'exact' (same invoice_no —
// unambiguous, always a true duplicate) from 'fuzzy' (same supplier/amount/date,
// no invoice_no to confirm) so callers can import-and-flag instead of
// silently skipping the fuzzy case.

const INV = (supplier, invoice_no, amount, invoice_date) => ({ supplier, invoice_no, amount, invoice_date });

describe('classifyDuplicateMatch (CASH-13)', () => {
  const existing = [
    INV('Acme Ltd', 'INV-001', 100, '2024-01-15'),
    INV('Beta Corp', null,     200, '2024-02-10'),
  ];

  it('returns "exact" for a matching supplier + invoice_no', () => {
    expect(classifyDuplicateMatch(INV('Acme Ltd', 'INV-001', 999, '2099-01-01'), existing)).toBe('exact');
  });

  it('returns "fuzzy" for matching supplier/amount/date with no invoice_no on either side', () => {
    expect(classifyDuplicateMatch(INV('Beta Corp', null, 200, '2024-02-10'), existing)).toBe('fuzzy');
  });

  it('returns "fuzzy" (not "exact") when invoice_no differs but supplier/amount/date match', () => {
    // A second, genuinely different delivery on the same day shouldn't be silently
    // dropped just because it happens to share amount+date with an existing invoice.
    expect(classifyDuplicateMatch(INV('Acme Ltd', 'INV-002', 100, '2024-01-15'), existing)).toBe('fuzzy');
  });

  it('returns null when nothing matches', () => {
    expect(classifyDuplicateMatch(INV('Unknown Co', 'INV-999', 999, '2020-01-01'), existing)).toBeNull();
  });

  it('returns null for a fuzzy-only match when strict=true (same-batch exact-only mode)', () => {
    expect(classifyDuplicateMatch(INV('Beta Corp', null, 200, '2024-02-10'), existing, true)).toBeNull();
  });

  it('still finds an exact match when strict=true', () => {
    expect(classifyDuplicateMatch(INV('Acme Ltd', 'INV-001', 999, '2099-01-01'), existing, true)).toBe('exact');
  });

  it('isDuplicate() still collapses both exact and fuzzy to true (unchanged boolean semantics)', () => {
    expect(isDuplicate(INV('Acme Ltd', 'INV-001', 999, '2099-01-01'), existing)).toBe(true);
    expect(isDuplicate(INV('Beta Corp', null, 200, '2024-02-10'), existing)).toBe(true);
    expect(isDuplicate(INV('Unknown Co', 'INV-999', 999, '2020-01-01'), existing)).toBe(false);
  });
});
