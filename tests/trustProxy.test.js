import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import express from 'express';

// Regression test for CASH-5: express-rate-limit keys on req.ip. Behind Vercel's
// edge, req.ip resolved to the Vercel proxy address (not the client) because
// `trust proxy` was never set, so every limiter shared one global bucket across
// all users. Fix: `app.set('trust proxy', 1)` — trust exactly one hop.
//
// Both server bootstrap files (local dev + Vercel serverless entrypoint) must
// carry the setting; requiring them directly isn't viable here since both call
// app.listen()/depend on required env vars, so we assert the source directly
// and verify the real Express behavior it enables in an isolated app.

const readSource = (relPath) =>
  fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');

describe('trust proxy configuration (CASH-5)', () => {
  it('server/index.js sets trust proxy to exactly 1 hop', () => {
    const src = readSource('server/index.js');
    expect(src).toMatch(/app\.set\(\s*['"]trust proxy['"]\s*,\s*1\s*\)/);
  });

  it('api/index.js (Vercel serverless entrypoint) sets trust proxy to exactly 1 hop', () => {
    const src = readSource('api/index.js');
    expect(src).toMatch(/app\.set\(\s*['"]trust proxy['"]\s*,\s*1\s*\)/);
  });

  it('does not trust-all (no `true`/blanket trust) in either entrypoint', () => {
    for (const file of ['server/index.js', 'api/index.js']) {
      const src = readSource(file);
      expect(src).not.toMatch(/app\.set\(\s*['"]trust proxy['"]\s*,\s*true\s*\)/);
    }
  });

  describe('behavioral: trust proxy = 1 resolves req.ip correctly and resists spoofing', () => {
    let server;

    afterEach(() => {
      server?.close();
      server = undefined;
    });

    const request = (port, xForwardedFor) =>
      new Promise((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port, path: '/', headers: xForwardedFor ? { 'X-Forwarded-For': xForwardedFor } : {} },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve(JSON.parse(data)));
          },
        );
        req.on('error', reject);
        req.end();
      });

    const startApp = (trustSetting) => {
      const app = express();
      app.set('trust proxy', trustSetting);
      app.get('/', (req, res) => res.json({ ip: req.ip }));
      server = app.listen(0);
      return server.address().port;
    };

    it('with trust proxy=1, req.ip is the real client, not the proxy address', async () => {
      const port = startApp(1);
      // The immediate TCP peer (our test client, 127.0.0.1) is trusted as the one
      // hop; the header value it forwarded (the real client) is honored.
      const { ip } = await request(port, '203.0.113.7');
      expect(ip).toBe('203.0.113.7');
    });

    it('with trust proxy=1, a spoofed extra hop beyond the trusted proxy is ignored', async () => {
      const port = startApp(1);
      // Attacker prepends a fake IP hoping it's read as the client; only the
      // single trusted hop is honored, so the outer (attacker-supplied) entry
      // is discarded and the value closest to the trusted proxy wins.
      const { ip } = await request(port, '198.51.100.9, 203.0.113.7');
      expect(ip).toBe('203.0.113.7');
      expect(ip).not.toBe('198.51.100.9');
    });

    it('two different clients bucket to two different req.ip values (per-client limiting works)', async () => {
      const port = startApp(1);
      const a = await request(port, '203.0.113.1');
      const b = await request(port, '203.0.113.2');
      expect(a.ip).not.toBe(b.ip);
    });

    it('without trust proxy set, req.ip ignores X-Forwarded-For entirely (the pre-fix bug)', async () => {
      const port = startApp(false);
      const a = await request(port, '203.0.113.1');
      const b = await request(port, '203.0.113.2');
      // Pre-fix behavior: every request resolves to the same (proxy) address,
      // regardless of the real client — this is exactly the shared-bucket bug.
      expect(a.ip).toBe(b.ip);
    });
  });
});
