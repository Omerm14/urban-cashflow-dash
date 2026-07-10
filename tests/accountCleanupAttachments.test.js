import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// CASH-44: deleteUserData() deleted invoice/supplier/etc. rows but never removed the
// storage objects those invoice rows pointed to, silently orphaning files forever
// (nothing downstream, including GC, can ever discover them once the rows are gone).
// Same require.cache-seeding technique as tests/plans.test.js — accountCleanup.js
// pulls in server/lib/supabase.js and server/lib/storage.js via plain CommonJS
// require() that `vi.mock` cannot intercept.
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

// Minimal chainable/thenable query builder mirroring the real supabase-js shape
// closely enough for accountCleanup.js's calls: .select().eq().not() (awaited
// directly, no .single()) for the attachment lookup, and .delete().eq() for each
// table's row deletion.
function makeSupabase({ invoices, deleteUserError = null }) {
  const builder = (table) => {
    let type = null;
    const self = {
      select: () => { type = 'select'; return self; },
      delete: () => { type = 'delete'; return self; },
      eq: () => self,
      not: () => self,
      then: (resolve) => {
        if (type === 'select' && table === 'invoices') return resolve({ data: invoices, error: null });
        return resolve({ data: null, error: null });
      },
    };
    return self;
  };
  return {
    from: builder,
    auth: { admin: { deleteUser: () => Promise.resolve({ error: deleteUserError }) } },
  };
}

let consoleSpy;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('accountCleanup.js deleteUserData — attachment cleanup', () => {
  it('deletes every invoice attachment via storage.deleteAttachment', async () => {
    const invoices = [
      { attachment_path: 'u1/a1.pdf', attachment_backend: 'supabase' },
      { attachment_path: 'u1/a2.pdf', attachment_backend: 'r2' },
    ];
    mockModule(supabasePath, makeSupabase({ invoices }));
    const deleteAttachment = vi.fn().mockResolvedValue(undefined);
    mockModule(storagePath, { deleteAttachment });

    const { deleteUserData } = freshRequire('../server/lib/accountCleanup.js');
    await deleteUserData('u1');

    expect(deleteAttachment).toHaveBeenCalledTimes(2);
    expect(deleteAttachment).toHaveBeenCalledWith('u1/a1.pdf', 'supabase');
    expect(deleteAttachment).toHaveBeenCalledWith('u1/a2.pdf', 'r2');
  });

  it('completes account deletion even when one attachment delete rejects', async () => {
    const invoices = [
      { attachment_path: 'u1/bad.pdf', attachment_backend: 'supabase' },
      { attachment_path: 'u1/good.pdf', attachment_backend: 'supabase' },
    ];
    mockModule(supabasePath, makeSupabase({ invoices }));
    const deleteAttachment = vi.fn()
      .mockRejectedValueOnce(new Error('object not found'))
      .mockResolvedValueOnce(undefined);
    mockModule(storagePath, { deleteAttachment });

    const { deleteUserData } = freshRequire('../server/lib/accountCleanup.js');
    await expect(deleteUserData('u1')).resolves.toBeUndefined();

    expect(deleteAttachment).toHaveBeenCalledTimes(2);
    expect(consoleSpy.mock.calls.some(args => args.some(a => typeof a === 'string' && a.includes('bad.pdf')))).toBe(true);
  });

  it('skips attachment deletion cleanly when the user has no attachments', async () => {
    mockModule(supabasePath, makeSupabase({ invoices: [] }));
    const deleteAttachment = vi.fn();
    mockModule(storagePath, { deleteAttachment });

    const { deleteUserData } = freshRequire('../server/lib/accountCleanup.js');
    await deleteUserData('u1');

    expect(deleteAttachment).not.toHaveBeenCalled();
  });
});
