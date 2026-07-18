import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { REQUIRED_ENV_VARS } from '../server/lib/requiredEnv.js';

// CASH-35: api/index.js (Vercel's actual deploy target) previously had no
// fail-fast check for required env vars at all, unlike server/index.js (dev).
// A misconfigured deployment failed per-request in confusing ways instead of
// failing visibly at cold start. Both entrypoints now import the same
// REQUIRED_ENV_VARS list (server/lib/requiredEnv.js) so they can't drift
// apart again, and api/index.js throws synchronously at module scope rather
// than process.exit(1) — safe under Vercel's container-reuse model, where
// exiting the process could kill concurrent in-flight invocations.
const require = createRequire(import.meta.url);
const apiIndexPath = require.resolve('../api/index.js');

describe('required env vars (CASH-35)', () => {
  it('is a non-empty list shared by both entrypoints', () => {
    expect(REQUIRED_ENV_VARS.length).toBeGreaterThan(0);
    expect(REQUIRED_ENV_VARS).toEqual(
      expect.arrayContaining(['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FRONTEND_URL'])
    );
  });

  describe('api/index.js fails fast when a required var is missing', () => {
    const originalEnv = {};
    beforeEach(() => {
      for (const key of REQUIRED_ENV_VARS) {
        originalEnv[key] = process.env[key];
        process.env[key] = `test-${key}`;
      }
      delete require.cache[apiIndexPath];
    });
    afterEach(() => {
      for (const key of REQUIRED_ENV_VARS) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
      }
      delete require.cache[apiIndexPath];
    });

    it('throws synchronously (not process.exit) when a required var is unset', () => {
      delete process.env.SUPABASE_URL;
      expect(() => require(apiIndexPath)).toThrow(/SUPABASE_URL/);
    });

    it('does not throw when every required var is set', () => {
      // Requiring api/index.js pulls in its full route tree (Vite transforms
      // each CJS module on first load), which can exceed vitest's 5s default.
      expect(() => require(apiIndexPath)).not.toThrow();
    }, 15000);
  });
});
