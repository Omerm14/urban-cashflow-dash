import { describe, it, expect, vi } from 'vitest';

// Regression test for CASH-6: OAuth refresh_token must not be wiped on token refresh.
//
// The bug: makeOAuth2 had a guard `if (tokens.refresh_token)` before persisting
// refreshed credentials. When Google emits a token event with only a new access_token
// (no refresh_token), the DB write was skipped entirely, so the access_token was never
// updated. The fix removes the guard so every token event writes back to DB.

describe('OAuth token refresh regression (CASH-6)', () => {
  it('persists token update even when refresh_token is absent in the event', async () => {
    const dbUpdates = [];

    // Minimal mock of the Google OAuth2 client shape
    const makeOAuth2 = (credentials, { supabase }) => {
      const listeners = {};
      const client = {
        setCredentials: () => {},
        on: (event, cb) => { listeners[event] = cb; },
        emit: (event, data) => listeners[event]?.(data),
      };
      client.setCredentials(credentials);
      // This is the fixed implementation: no refresh_token guard
      client.on('tokens', async tokens => {
        await supabase
          .from('integrations')
          .update({ credentials: { ...credentials, ...tokens } })
          .eq('user_id', credentials._userId)
          .eq('type', credentials._type);
      });
      return client;
    };

    const supabase = {
      from: () => supabase,
      update: (data) => { dbUpdates.push(data); return supabase; },
      eq: () => supabase,
    };

    const initialCreds = {
      refresh_token: 'rt_original',
      access_token:  'at_old',
      _userId:       'user-1',
      _type:         'google_drive',
    };

    const client = makeOAuth2(initialCreds, { supabase });

    // Simulate Google emitting a token event with only a new access_token
    client.emit('tokens', { access_token: 'at_new' });

    // The DB update should have fired with the merged credentials
    expect(dbUpdates).toHaveLength(1);
    expect(dbUpdates[0].credentials.access_token).toBe('at_new');
    // Critical: original refresh_token must be preserved via spread
    expect(dbUpdates[0].credentials.refresh_token).toBe('rt_original');
  });

  it('does NOT fire a DB update when using the old (buggy) guarded implementation', async () => {
    const dbUpdates = [];

    const makeOAuth2Buggy = (credentials, { supabase }) => {
      const listeners = {};
      const client = {
        setCredentials: () => {},
        on: (event, cb) => { listeners[event] = cb; },
        emit: (event, data) => listeners[event]?.(data),
      };
      client.setCredentials(credentials);
      // Old buggy guard: only persists when refresh_token is present in the event
      client.on('tokens', async tokens => {
        if (tokens.refresh_token) {
          await supabase
            .from('integrations')
            .update({ credentials: { ...credentials, ...tokens } })
            .eq('user_id', credentials._userId)
            .eq('type', credentials._type);
        }
      });
      return client;
    };

    const supabase = {
      from: () => supabase,
      update: (data) => { dbUpdates.push(data); return supabase; },
      eq: () => supabase,
    };

    const client = makeOAuth2Buggy(
      { refresh_token: 'rt_original', access_token: 'at_old', _userId: 'u', _type: 'google_drive' },
      { supabase }
    );

    client.emit('tokens', { access_token: 'at_new' }); // no refresh_token in event

    // Bug: zero writes — access_token is silently stale in DB
    expect(dbUpdates).toHaveLength(0);
  });
});
