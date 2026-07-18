import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runGc } from '../server/routes/gc.js';
import { runMigrate } from '../server/routes/migrate.js';

// CASH-40: gc.js and migrate.js both documented a `?key=` query-param auth
// path ("open a URL in a browser — no terminal / header-setting tool
// required") that was never implemented — secretOk() only ever read the
// Authorization header. Rather than add query-string secret support (which
// leaks into access logs, browser history, and Referer headers), the docs
// were corrected to say header-only. These tests pin that behavior: a
// request carrying the secret only as ?key= must still be rejected, and only
// a matching Authorization: Bearer header is accepted.

const makeRes = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

describe('cron endpoint auth is header-only (CASH-40)', () => {
  const prevSecret = process.env.CRON_SECRET;
  beforeEach(() => { process.env.CRON_SECRET = 'test-secret'; });
  afterEach(() => { process.env.CRON_SECRET = prevSecret; });

  for (const [name, handler] of [['runGc', runGc], ['runMigrate', runMigrate]]) {
    describe(name, () => {
      it('rejects a request with no Authorization header and no secret at all', async () => {
        const res = makeRes();
        await handler({ headers: {}, query: {} }, res);
        expect(res.statusCode).toBe(401);
      });

      it('rejects a request that supplies the correct secret only via ?key=, not the header', async () => {
        const res = makeRes();
        await handler({ headers: {}, query: { key: 'test-secret' } }, res);
        expect(res.statusCode).toBe(401);
      });

      it('rejects a wrong Authorization header', async () => {
        const res = makeRes();
        await handler({ headers: { authorization: 'Bearer wrong-secret' }, query: {} }, res);
        expect(res.statusCode).toBe(401);
      });
    });
  }
});
