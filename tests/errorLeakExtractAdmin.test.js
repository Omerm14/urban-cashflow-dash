import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// CASH-46: extends tests/errorLeak.test.js's coverage (CASH-28) to two routes that
// missed that redaction pass: server/routes/extract.js (raw Claude API / err.message
// forwarded to the client) and server/routes/admin.js's deleteUser/banUser/unbanUser
// (raw err.message forwarded). Same require.cache-seeding technique, since these
// pull in server/lib/supabase.js and server/lib/extraction.js via plain CommonJS
// require() that `vi.mock` cannot intercept.
const require = createRequire(import.meta.url);
const supabasePath   = require.resolve('../server/lib/supabase.js');
const extractionPath = require.resolve('../server/lib/extraction.js');

const LEAK = 'relation "invoices" does not exist — column user_id violates fk_constraint_xyz';

const mockModule = (path, exportsObj) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports: exportsObj };
};

// Force a clean require of a route module (and anything under server/ it pulls in) so
// it picks up the just-seeded mocks rather than a stale one cached by an earlier test.
const freshRequire = (relPath) => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/server/') && key !== supabasePath && key !== extractionPath) delete require.cache[key];
  }
  return require(require.resolve(relPath));
};

const makeRes = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const loggedTheRealError = (spy) =>
  spy.mock.calls.some(args => args.some(a =>
    (typeof a === 'string' && a.includes(LEAK)) ||
    (a && typeof a === 'object' && a.message === LEAK)
  ));

let consoleSpy;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('extract.js error handler', () => {
  it('returns a generic error and logs the real one on an unexpected extraction failure', async () => {
    mockModule(extractionPath, { translate: () => Promise.reject(new Error(LEAK)) });
    mockModule(supabasePath, {});
    const extract = freshRequire('../server/routes/extract.js');

    const res = makeRes();
    await extract({ user: { id: 'u1' }, body: { text: 'Acme Inc', mode: 'translate' } }, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });

  it('does not forward a raw Claude API error body (err.error.error.message) to the client', async () => {
    const claudeErr = { status: 429, error: { error: { message: LEAK } }, message: 'Request failed' };
    mockModule(extractionPath, { translate: () => Promise.reject(claudeErr) });
    mockModule(supabasePath, {});
    const extract = freshRequire('../server/routes/extract.js');

    const res = makeRes();
    await extract({ user: { id: 'u1' }, body: { text: 'Acme Inc', mode: 'translate' } }, res);

    expect(res.statusCode).toBe(429);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });
});

describe('admin.js deleteUser/banUser/unbanUser', () => {
  const validUserId = '11111111-1111-1111-1111-111111111111';

  it('deleteUser returns a generic error and logs the real one when cleanup throws', async () => {
    mockModule(supabasePath, { from: () => { throw new Error(LEAK); } });
    const admin = freshRequire('../server/routes/admin.js');
    const deleteUser = admin.deleteUser[admin.deleteUser.length - 1];

    const res = makeRes();
    await deleteUser({ user: { email: 'admin@x.com' }, params: { userId: validUserId } }, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });

  it('banUser returns a generic error and logs the real one when the Supabase Admin API errors', async () => {
    mockModule(supabasePath, { auth: { admin: { updateUserById: () => Promise.resolve({ error: { message: LEAK } }) } } });
    const admin = freshRequire('../server/routes/admin.js');
    const banUser = admin.banUser[admin.banUser.length - 1];

    const res = makeRes();
    await banUser({ user: { email: 'admin@x.com' }, params: { userId: validUserId } }, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });

  it('unbanUser returns a generic error and logs the real one when the Supabase Admin API errors', async () => {
    mockModule(supabasePath, { auth: { admin: { updateUserById: () => Promise.resolve({ error: { message: LEAK } }) } } });
    const admin = freshRequire('../server/routes/admin.js');
    const unbanUser = admin.unbanUser[admin.unbanUser.length - 1];

    const res = makeRes();
    await unbanUser({ user: { email: 'admin@x.com' }, params: { userId: validUserId } }, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });
});
