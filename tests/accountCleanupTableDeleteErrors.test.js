import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// CASH-57: deleteUserData() previously ignored the { error } result of each per-table
// .delete() call and always proceeded to the irreversible supabase.auth.admin.deleteUser()
// step, even if some table rows failed to delete — permanently orphaning those rows (no
// auth user left to own/query them under RLS, no clean way to retry). This file asserts the
// fix: any table delete error must abort before the Auth user is deleted, and the failure
// must be surfaced by throwing.
//
// Same require.cache-seeding technique as tests/accountCleanupAttachments.test.js —
// accountCleanup.js pulls in server/lib/supabase.js and server/lib/storage.js via plain
// CommonJS require() that `vi.mock` cannot intercept.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');
const storagePath  = require.resolve('../server/lib/storage.js');

const mockModule = (path, exportsObj) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports: exportsObj };
};

const freshRequire = (relPath) => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/server/') && key !== supabasePath && key !== storagePath) delete require.cache[key];
  }
  return require(require.resolve(relPath));
};

// Minimal chainable/thenable query builder mirroring the real supabase-js shape, tracking
// which table each .delete() targets so a specific table's delete can be made to fail.
function makeSupabase({ invoices = [], deleteErrors = {}, deleteUserSpy } = {}) {
  const builder = (table) => {
    let type = null;
    const self = {
      select: () => { type = 'select'; return self; },
      delete: () => { type = 'delete'; return self; },
      eq: () => self,
      not: () => self,
      then: (resolve) => {
        if (type === 'select' && table === 'invoices') return resolve({ data: invoices, error: null });
        if (type === 'delete' && deleteErrors[table]) return resolve({ data: null, error: deleteErrors[table] });
        return resolve({ data: null, error: null });
      },
    };
    return self;
  };
  return {
    from: builder,
    auth: { admin: { deleteUser: deleteUserSpy || (() => Promise.resolve({ error: null })) } },
  };
}

let consoleSpy;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('accountCleanup.js deleteUserData — per-table delete error handling', () => {
  it('deletes the Auth user when every table delete succeeds', async () => {
    const deleteUserSpy = vi.fn().mockResolvedValue({ error: null });
    mockModule(supabasePath, makeSupabase({ deleteUserSpy }));
    mockModule(storagePath, { deleteAttachment: vi.fn() });

    const { deleteUserData } = freshRequire('../server/lib/accountCleanup.js');
    await expect(deleteUserData('u1')).resolves.toBeUndefined();

    expect(deleteUserSpy).toHaveBeenCalledTimes(1);
    expect(deleteUserSpy).toHaveBeenCalledWith('u1');
  });

  it('does NOT delete the Auth user and throws when one table delete fails', async () => {
    const deleteUserSpy = vi.fn().mockResolvedValue({ error: null });
    mockModule(supabasePath, makeSupabase({
      deleteErrors: { invoices: { message: 'connection reset' } },
      deleteUserSpy,
    }));
    mockModule(storagePath, { deleteAttachment: vi.fn() });

    const { deleteUserData } = freshRequire('../server/lib/accountCleanup.js');
    await expect(deleteUserData('u1')).rejects.toThrow(/invoices/);

    expect(deleteUserSpy).not.toHaveBeenCalled();
    expect(consoleSpy.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && a.includes('invoices')) &&
      args.some(a => typeof a === 'string' && a.includes('connection reset'))
    )).toBe(true);
  });

  it('does NOT delete the Auth user and reports every failed table when multiple deletes fail', async () => {
    const deleteUserSpy = vi.fn().mockResolvedValue({ error: null });
    mockModule(supabasePath, makeSupabase({
      deleteErrors: {
        suppliers: { message: 'timeout' },
        subscriptions: { message: 'fk violation' },
      },
      deleteUserSpy,
    }));
    mockModule(storagePath, { deleteAttachment: vi.fn() });

    const { deleteUserData } = freshRequire('../server/lib/accountCleanup.js');
    let thrown;
    try {
      await deleteUserData('u1');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toContain('suppliers');
    expect(thrown.message).toContain('subscriptions');
    expect(deleteUserSpy).not.toHaveBeenCalled();
  });
});
