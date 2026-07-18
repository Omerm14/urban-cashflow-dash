import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// CASH-99: the AAA credit backlink (index.html, he.html, public/privacy.html,
// public/terms.html) had rel="noopener" only — no noreferrer (leaks the
// referring URL on click) and no nofollow/sponsored (standard SEO guidance
// for a third-party promotional link). Confirmed authorized; kept, with the
// full rel set added consistently across all 4 files.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'he.html', 'public/privacy.html', 'public/terms.html'];
const FULL_REL = 'noopener noreferrer nofollow sponsored';

describe('AAA backlink rel attributes (CASH-99)', () => {
  it.each(FILES)('%s has the full rel attribute set on the aaa-tech.com link', (relPath) => {
    const html = readFileSync(join(root, relPath), 'utf8');
    const match = html.match(/<a href="https:\/\/aaa-tech\.com"[^>]*>/);
    expect(match, `no aaa-tech.com link found in ${relPath}`).not.toBeNull();
    expect(match[0]).toContain(`rel="${FULL_REL}"`);
  });

  it('every occurrence of the link across the repo uses the identical rel value (no partial/inconsistent fix)', () => {
    const relValues = FILES.map((relPath) => {
      const html = readFileSync(join(root, relPath), 'utf8');
      return html.match(/<a href="https:\/\/aaa-tech\.com"[^>]*rel="([^"]*)"/)?.[1];
    });
    expect(relValues.every(v => v === FULL_REL)).toBe(true);
  });
});
