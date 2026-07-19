import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// CASH-28: server routes were forwarding raw error.message (often straight from
// Supabase/Postgres) to HTTP clients. These tests seed require.cache with a fake
// Supabase client before each route module is required — the same technique
// tests/plans.test.js uses, since these routes pull in server/lib/supabase.js via
// a plain CommonJS require() that `vi.mock` cannot intercept.
const require   = createRequire(import.meta.url);
const root      = join(dirname(fileURLToPath(import.meta.url)), '..');
const supabasePath = require.resolve('../server/lib/supabase.js');

const LEAK = 'relation "invoices" does not exist — column user_id violates fk_constraint_xyz';

const mockSupabase = (exportsObj) => {
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: exportsObj };
};

// Force a clean require of a route module (and anything under server/ it pulls
// in) so it picks up the just-seeded supabase mock rather than a stale one
// cached by an earlier test.
const freshRequire = (relPath) => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/server/') && key !== supabasePath) delete require.cache[key];
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
  process.env.CRON_SECRET = 'test-secret';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('gc.js runGc', () => {
  it('returns a generic error and logs the real one when the referenced-set query fails', async () => {
    mockSupabase({ from: () => ({ select: () => ({ not: () => Promise.resolve({ data: null, error: { message: LEAK } }) }) }) });
    const gc = freshRequire('../server/routes/gc.js');

    const res = makeRes();
    await gc.runGc({ headers: { authorization: 'Bearer test-secret' }, query: {} }, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });
});

describe('cron.js runSync', () => {
  it('returns a generic error and logs the real one when the integrations query fails', async () => {
    mockSupabase({ from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: { message: LEAK } }) }) }) }) });
    const cron = freshRequire('../server/routes/cron.js');

    const res = makeRes();
    await cron.runSync({ headers: { authorization: 'Bearer test-secret' } }, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });
});

describe('migrate.js runMigrate', () => {
  const baseEnv = () => { process.env.STORAGE_BACKEND = 'r2'; };

  it('returns a generic error and logs the real one when the remaining-count query fails', async () => {
    baseEnv();
    mockSupabase({ from: () => ({ select: () => ({ eq: () => ({ not: () => Promise.resolve({ data: null, count: null, error: { message: LEAK } }) }) }) }) });
    const migrate = freshRequire('../server/routes/migrate.js');

    const res = makeRes();
    await migrate.runMigrate({ headers: { authorization: 'Bearer test-secret' }, query: {} }, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });

  it('returns a generic error and logs the real one on an unexpected throw', async () => {
    baseEnv();
    mockSupabase({ from: () => { throw new Error(LEAK); } });
    const migrate = freshRequire('../server/routes/migrate.js');

    const res = makeRes();
    await migrate.runMigrate({ headers: { authorization: 'Bearer test-secret' }, query: {} }, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });
});

describe('account.js deleteAccount', () => {
  it('returns a generic error and logs the real one when account deletion throws', async () => {
    // CASH-44: deleteUserData() now also selects the user's invoice attachments
    // (to delete them from storage) before deleting rows, so `from()` must
    // support that select().eq().not() chain too, not just delete().eq().
    mockSupabase({
      from: () => ({
        delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        select: () => ({ eq: () => ({ not: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
      auth: { admin: { deleteUser: () => Promise.resolve({ error: { message: LEAK } }) } },
    });
    const account = freshRequire('../server/routes/account.js');

    const res = makeRes();
    await account.deleteAccount({ user: { id: 'u1' } }, res);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain(LEAK);
    expect(res.body).toEqual({ error: 'Failed to delete account' });
    expect(loggedTheRealError(consoleSpy)).toBe(true);
  });
});

describe('api/index.js global error handler (prod entrypoint)', () => {
  // The prod handler is registered inline in a large Express bootstrap file with
  // many real dependencies (Stripe, Google OAuth, etc.) that aren't worth
  // constructing just to reach one middleware — mirrors tests/routeParity.test.js's
  // approach of asserting on the route table via source inspection.
  const prodSrc = readFileSync(join(root, 'api/index.js'), 'utf8');
  const devSrc  = readFileSync(join(root, 'server/index.js'), 'utf8');

  it('no longer echoes err.message to the client on the global error handler', () => {
    const handler = prodSrc.slice(prodSrc.indexOf('app.use((err, req, res, next)'));
    expect(handler).not.toMatch(/error:\s*err\.message/);
    expect(handler).toMatch(/error:\s*'Internal server error'/);
  });

  it('matches the dev entrypoint\'s already-correct generic-error pattern', () => {
    const prodHandler = prodSrc.slice(prodSrc.indexOf('app.use((err, req, res, next)'));
    const devHandler  = devSrc.slice(devSrc.indexOf('app.use((err, req, res, next)'));
    expect(prodHandler).toContain("res.status(500).json({ error: 'Internal server error' })");
    expect(devHandler).toContain("res.status(500).json({ error: 'Internal server error' })");
  });
});
