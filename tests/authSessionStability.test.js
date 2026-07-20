import { describe, it, expect } from 'vitest';
import { stableSession, stableUser } from '../src/contexts/authSessionStability.js';

// Regression test for the integrations-page slowdown: Supabase's
// onAuthStateChange re-emits the current session for reasons unrelated to an
// actual auth change (redundant INITIAL_SESSION emission, cross-tab sync).
// AuthContext used to hand consumers a brand-new user/session object on every
// firing, so any useEffect(..., [user]) (useIntegrationErrors, usePlan,
// useInvoiceData, ...) refired and re-hit the API on every redundant event.
describe('authSessionStability', () => {
  const userA = { id: 'user-1', email: 'a@example.com' };
  const sessionA = { access_token: 'token-1', user: userA };

  describe('stableSession', () => {
    it('returns the previous reference when access_token is unchanged', () => {
      const next = { access_token: 'token-1', user: { ...userA } };
      expect(stableSession(sessionA, next)).toBe(sessionA);
    });

    it('returns the new session when access_token changed (real refresh)', () => {
      const next = { access_token: 'token-2', user: userA };
      expect(stableSession(sessionA, next)).toBe(next);
    });

    it('returns the new session on sign-in from null', () => {
      expect(stableSession(null, sessionA)).toBe(sessionA);
    });

    it('returns the new (null) session on sign-out', () => {
      expect(stableSession(sessionA, null)).toBe(null);
    });
  });

  describe('stableUser', () => {
    it('returns the previous reference when the user id is unchanged', () => {
      const next = { access_token: 'token-2', user: { id: 'user-1', email: 'a@example.com' } };
      expect(stableUser(userA, next)).toBe(userA);
    });

    it('returns the new user when the user id changed (account switch)', () => {
      const next = { access_token: 'token-1', user: { id: 'user-2', email: 'b@example.com' } };
      const result = stableUser(userA, next);
      expect(result).toBe(next.user);
      expect(result.id).toBe('user-2');
    });

    it('returns the new user on sign-in from null', () => {
      expect(stableUser(null, sessionA)).toBe(userA);
    });

    it('returns null on sign-out', () => {
      expect(stableUser(userA, null)).toBe(null);
    });
  });
});
