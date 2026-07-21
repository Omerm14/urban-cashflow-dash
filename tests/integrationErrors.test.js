import { describe, it, expect } from 'vitest';
import { friendlyErrorCode, friendlyError } from '../src/utils/integrationErrors.js';
import en from '../src/i18n/en.js';
import he from '../src/i18n/he.js';

// CASH-96: IntegrationsPage.jsx's re-authorize flow showed the raw
// "SOURCE_LIMIT_REACHED" string instead of a translated message —
// IntegrationWizard.jsx had its own local friendlyErrorCode() that never got
// reused elsewhere. Extracted to a shared util so both call sites translate
// the same codes instead of drifting.
const tFor = (dict) => (key) => dict[key] ?? key;

describe('friendlyErrorCode / friendlyError (CASH-96)', () => {
  it('translates SOURCE_LIMIT_REACHED in English', () => {
    expect(friendlyErrorCode('SOURCE_LIMIT_REACHED', tFor(en))).toBe(en.int_source_limit_reached);
  });

  it('translates SOURCE_LIMIT_REACHED in Hebrew', () => {
    expect(friendlyErrorCode('SOURCE_LIMIT_REACHED', tFor(he))).toBe(he.int_source_limit_reached);
  });

  it('translates PLAN_LIMIT_REACHED in both locales', () => {
    expect(friendlyErrorCode('PLAN_LIMIT_REACHED', tFor(en))).toBe(en.plan_limit_reached);
    expect(friendlyErrorCode('PLAN_LIMIT_REACHED', tFor(he))).toBe(he.plan_limit_reached);
  });

  it('falls back to the raw message for an unrecognized code', () => {
    expect(friendlyErrorCode('Network error', tFor(en))).toBe('Network error');
  });

  it('friendlyError() reads e.message', () => {
    expect(friendlyError(new Error('SOURCE_LIMIT_REACHED'), tFor(en))).toBe(en.int_source_limit_reached);
  });
});
