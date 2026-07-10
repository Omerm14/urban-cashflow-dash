import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// server/services/syncProcessor.js pulls in server/lib/supabase.js via a
// plain CommonJS require() at import time (see tests/plans.test.js for the
// precedent) — seed require.cache with a stub so requiring the module here
// doesn't try to construct a real Supabase client.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { from: () => ({}) },
};

const { parseAmount } = await import('../server/services/syncProcessor.js');

describe('parseAmount (CASH-26: unparseable OCR amount)', () => {
  it('returns the absolute value for a genuine numeric amount', () => {
    expect(parseAmount(1234.5)).toBe(1234.5);
    expect(parseAmount(-42)).toBe(42);
  });

  it('returns the absolute value for a numeric string', () => {
    expect(parseAmount('1234.5')).toBe(1234.5);
  });

  it('treats a genuinely-zero amount as 0, not unparseable', () => {
    expect(parseAmount(0)).toBe(0);
    expect(parseAmount('0')).toBe(0);
  });

  it('returns null (unparseable) for a dash placeholder', () => {
    expect(parseAmount('—')).toBeNull();
  });

  it('returns null (unparseable) for undefined', () => {
    expect(parseAmount(undefined)).toBeNull();
  });

  it('returns null (unparseable) for a value still containing a currency symbol/formatting', () => {
    expect(parseAmount('₪1,234 (est)')).toBeNull();
  });
});
