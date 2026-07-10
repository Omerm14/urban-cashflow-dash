import { describe, it, expect } from 'vitest';
import { mergeTokenUpdate } from '../server/lib/mergeTokenUpdate.js';

describe('mergeTokenUpdate (CASH-6: OAuth refresh_token preservation)', () => {
  it('keeps the stored refresh_token when a refresh event carries none', () => {
    const stored = {
      access_token: 'old-access-token',
      refresh_token: 'X',
      _userId: 'user-1',
      _type: 'gmail',
    };
    const tokensEvent = { access_token: 'new-access-token', expiry_date: 12345 };

    const result = mergeTokenUpdate(stored, tokensEvent);

    expect(result.refresh_token).toBe('X');
    expect(result.access_token).toBe('new-access-token');
    expect(result.expiry_date).toBe(12345);
  });

  it('updates the refresh_token when a refresh event includes a new one', () => {
    const stored = { access_token: 'old', refresh_token: 'X' };
    const tokensEvent = { access_token: 'new', refresh_token: 'Y' };

    const result = mergeTokenUpdate(stored, tokensEvent);

    expect(result.refresh_token).toBe('Y');
  });

  it('never writes an explicit undefined over an existing field', () => {
    const stored = { access_token: 'old', refresh_token: 'X', scope: 'drive' };
    const tokensEvent = { access_token: 'new', refresh_token: undefined, scope: undefined };

    const result = mergeTokenUpdate(stored, tokensEvent);

    expect(result.refresh_token).toBe('X');
    expect(result.scope).toBe('drive');
  });
});

describe('mergeTokenUpdate (CASH-34: strip internal _userId/_type bookkeeping)', () => {
  it('does not persist _userId/_type into the merged credentials', () => {
    const stored = {
      access_token: 'old-access-token',
      refresh_token: 'X',
      _userId: 'user-1',
      _type: 'gmail',
    };
    const tokensEvent = { access_token: 'new-access-token', expiry_date: 12345 };

    const result = mergeTokenUpdate(stored, tokensEvent);

    expect(result).not.toHaveProperty('_userId');
    expect(result).not.toHaveProperty('_type');
    expect(result.access_token).toBe('new-access-token');
    expect(result.refresh_token).toBe('X');
  });

  it('strips _userId/_type even when the tokens event does not touch them', () => {
    const stored = { access_token: 'old', refresh_token: 'X', _userId: 'user-2', _type: 'google_drive' };
    const tokensEvent = { access_token: 'new' };

    const result = mergeTokenUpdate(stored, tokensEvent);

    expect(Object.keys(result)).not.toContain('_userId');
    expect(Object.keys(result)).not.toContain('_type');
  });
});
