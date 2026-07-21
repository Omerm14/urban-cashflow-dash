import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// CASH-98: src/main.jsx (the authenticated app entry point) calls Vercel
// Web Analytics' inject(), but public/privacy.html claimed "We do not use
// tracking, advertising, or third-party analytics cookies" — a direct,
// code-verifiable contradiction. Confirmed resolution: disclose the
// analytics usage in the policy rather than removing it. This test pins
// both halves of that fix so they can't silently drift apart again.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainJsx = readFileSync(join(root, 'src/main.jsx'), 'utf8');
const privacyHtml = readFileSync(join(root, 'public/privacy.html'), 'utf8');

describe('privacy policy matches actual analytics usage (CASH-98)', () => {
  it('src/main.jsx still injects Vercel Web Analytics (sanity check the premise holds)', () => {
    expect(mainJsx).toMatch(/@vercel\/analytics/);
    expect(mainJsx).toMatch(/inject\(\)/);
  });

  it('privacy.html discloses Vercel Web Analytics rather than claiming no analytics are used', () => {
    expect(privacyHtml).toMatch(/Vercel Web Analytics/);
    // The old blanket claim must be gone — it directly contradicted inject().
    expect(privacyHtml).not.toMatch(/We do not use tracking, advertising, or third-party analytics cookies/);
  });
});
