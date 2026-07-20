import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// CASH-94 (2026-07-19 incident): package.json's "engines" field silently
// overrides Vercel's Project Settings Node.js version — pinning it to "20.x"
// (a deprecated runtime with known connection-handling issues) took down
// every /api/* route in production for hours, with no trace in Supabase or
// Anthropic's logs, because the hang happened at the Node HTTP client level
// before requests ever completed. Vercel's own build log confirmed the
// runtime silently changed from the working "24.x" to "20.x" the moment this
// field was added. This test only guards the version string itself — it
// can't catch "someone removes the engines field entirely," but it stops the
// exact wrong-value regression that caused the incident.
describe('package.json engines.node pin (CASH-94 incident regression)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  it('pins Node to 24.x, matching Vercel Project Settings — not the deprecated 20.x', () => {
    expect(pkg.engines?.node).toBe('24.x');
  });
});
