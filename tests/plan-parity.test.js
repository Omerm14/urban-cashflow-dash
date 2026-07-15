import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { PLAN_LIMITS, PLAN_SOURCES, PLAN_PRICES } from '../src/constants/plans.js';

// server/lib/plans.js and src/constants/plans.js are two hand-maintained
// copies of the same plan data (ESM frontend vs CommonJS backend — see
// CLAUDE.md). This test fails if someone edits one side and forgets the
// other, the same role tests/theme.test.js and tests/i18n.test.js play for
// their respective config pairs.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: { from: () => ({ select: function () { return this; }, eq: function () { return this; } }) },
};
const { PLANS } = await import('../server/lib/plans.js');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const heHtml    = readFileSync(join(root, 'he.html'), 'utf8');

describe('plan config stays in sync: frontend <-> backend', () => {
  const tiers = ['free', 'starter', 'pro', 'enterprise'];

  it('invoice caps match', () => {
    for (const tier of tiers) {
      expect(PLANS[tier].invoicesPerMonth, tier).toBe(PLAN_LIMITS[tier]);
    }
  });

  it('sync-source caps match', () => {
    for (const tier of tiers) {
      expect(PLANS[tier].sources, tier).toBe(PLAN_SOURCES[tier]);
    }
  });

  it('prices match', () => {
    for (const tier of tiers) {
      expect(PLANS[tier].price, tier).toBe(PLAN_PRICES[tier]);
    }
  });

  it('legacy basic tier is present on both sides (retired from sale, not deleted)', () => {
    expect(PLANS.basic.invoicesPerMonth).toBe(PLAN_LIMITS.basic);
    expect(PLANS.basic.price).toBe(PLAN_PRICES.basic);
  });
});

describe('plan config stays in sync: backend <-> marketing site', () => {
  it('index.html displays the current Starter and Pro prices', () => {
    expect(indexHtml).toContain(`₪${PLANS.starter.price}<small>/month</small>`);
    expect(indexHtml).toContain(`₪${PLANS.pro.price}<small>/month</small>`);
  });

  it('he.html displays the current Starter and Pro prices', () => {
    expect(heHtml).toContain(`₪${PLANS.starter.price}<small>/חודש</small>`);
    expect(heHtml).toContain(`₪${PLANS.pro.price}<small>/חודש</small>`);
  });

  it('neither marketing page references the retired ₪99/₪199 Basic pricing', () => {
    expect(indexHtml).not.toContain('₪99');
    expect(heHtml).not.toContain('₪99');
  });
});
