import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// CASH-53: server/routes/admin.js's usage dashboard previously priced every
// api_calls row at claude-haiku-4-5 rates ($0.80/$4.00 per 1M in/out tokens)
// regardless of which model actually served the call. Production traffic
// runs on claude-sonnet-4-6 ($3.00/$15.00 per 1M), so the dashboard silently
// underreported real spend by ~3.75x. Pricing is now looked up per-row off
// api_calls.model so a second model can be added without another silent
// mispricing bug.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');

const mockModule = (path, exportsObj) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports: exportsObj };
};

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

const setupSupabase = (calls) => {
  mockModule(supabasePath, {
    from: (table) => {
      if (table === 'api_calls') {
        return { select: () => ({ order: () => Promise.resolve({ data: calls, error: null }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    auth: { admin: { listUsers: () => Promise.resolve({ data: { users: [] }, error: null } ) } },
  });
};

describe('admin.js usage — per-model pricing (CASH-53)', () => {
  it('prices a claude-sonnet-4-6 call at $3.00/$15.00 per 1M tokens, not the old flat Haiku rate', async () => {
    setupSupabase([
      { user_id: 'u1', model: 'claude-sonnet-4-6', input_tokens: 1_000_000, output_tokens: 1_000_000, ts: '2026-06-01T00:00:00Z' },
    ]);
    const admin = freshRequire('../server/routes/admin.js');
    const usage = admin.usage[admin.usage.length - 1];

    const res = makeRes();
    await usage({}, res);

    expect(res.statusCode).toBeNull();
    expect(res.body.totals.estimatedCostUSD).toBeCloseTo(3.00 + 15.00, 6);
    expect(res.body.byUser[0].estimatedCostUSD).toBeCloseTo(18.00, 6);
  });

  it('prices a claude-haiku-4-5 call at $0.80/$4.00 per 1M tokens', async () => {
    setupSupabase([
      { user_id: 'u1', model: 'claude-haiku-4-5', input_tokens: 1_000_000, output_tokens: 1_000_000, ts: '2026-06-01T00:00:00Z' },
    ]);
    const admin = freshRequire('../server/routes/admin.js');
    const usage = admin.usage[admin.usage.length - 1];

    const res = makeRes();
    await usage({}, res);

    expect(res.body.totals.estimatedCostUSD).toBeCloseTo(0.80 + 4.00, 6);
  });

  it('mixed-model calls sum to the correct blended total, not a single flat rate applied to all', async () => {
    setupSupabase([
      { user_id: 'u1', model: 'claude-sonnet-4-6', input_tokens: 1_000_000, output_tokens: 0, ts: '2026-06-01T00:00:00Z' },
      { user_id: 'u1', model: 'claude-haiku-4-5',  input_tokens: 1_000_000, output_tokens: 0, ts: '2026-06-02T00:00:00Z' },
    ]);
    const admin = freshRequire('../server/routes/admin.js');
    const usage = admin.usage[admin.usage.length - 1];

    const res = makeRes();
    await usage({}, res);

    expect(res.body.totals.estimatedCostUSD).toBeCloseTo(3.00 + 0.80, 6);
  });

  it('falls back to the cheapest known rate for an unrecognized/legacy model instead of throwing', async () => {
    setupSupabase([
      { user_id: 'u1', model: 'some-future-model', input_tokens: 1_000_000, output_tokens: 1_000_000, ts: '2026-06-01T00:00:00Z' },
    ]);
    const admin = freshRequire('../server/routes/admin.js');
    const usage = admin.usage[admin.usage.length - 1];

    const res = makeRes();
    await usage({}, res);

    expect(res.statusCode).toBeNull();
    expect(res.body.totals.estimatedCostUSD).toBeCloseTo(0.80 + 4.00, 6);
  });
});
