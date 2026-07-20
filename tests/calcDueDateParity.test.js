import { describe, it, expect } from 'vitest';
import { calcDueDate as calcDueDateBackend } from '../server/services/syncProcessor.js';
import { calcDueDate as calcDueDateFrontend } from '../src/utils/dates.js';

// syncProcessor.js's calcDueDate is documented as a mirror of src/utils/dates.js's
// calcDueDate. They take different argument shapes (backend: (invoiceDate, terms) —
// frontend: (invoiceDate, supplier)) and return different types (backend: ISO date
// string — frontend: Date object), so we compare them by normalizing both to an ISO
// date string for the same (invoiceDate, terms) inputs.

const toISO = d => (d instanceof Date ? d.toISOString().split('T')[0] : d);

const CASES = [
  ['immediate',        '2026-01-15'],
  ['shotef',           '2026-01-15'],
  ['shotef_plus(15)',  '2026-01-15'],
  ['shotef_plus(30)',  '2026-06-01'],
  ['net30',            '2026-01-15'],
  ['net45',            '2026-01-15'],
  ['net75',            '2026-01-15'],
];

describe('calcDueDate parity (backend mirror vs frontend source of truth)', () => {
  it.each(CASES)('matches for terms=%s, invoiceDate=%s', (terms, invoiceDate) => {
    const backend  = calcDueDateBackend(invoiceDate, terms);
    const frontend = calcDueDateFrontend(invoiceDate, { terms });
    expect(toISO(backend)).toBe(toISO(frontend));
  });

  it('both return null for unrecognized terms', () => {
    expect(calcDueDateBackend('2026-01-15', 'bogus_terms')).toBeNull();
    expect(calcDueDateFrontend('2026-01-15', { terms: 'bogus_terms' })).toBeNull();
  });
});
