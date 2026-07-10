import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// CASH-49: registerPhone() in server/routes/webhook.js used to read
// integration.config, mutate it in JS, then write the whole object back —
// a read-modify-write race where two concurrent webhook deliveries for the
// same integration could silently drop one registration. The fix delegates
// to a single atomic Postgres RPC call (register_whatsapp_phone) instead.
//
// Same require.cache-seeding technique as tests/errorLeak.test.js /
// tests/plans.test.js, since server/lib/supabase.js is a plain CommonJS
// require() that `vi.mock` cannot intercept.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');

const freshRequire = (relPath) => {
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/server/') && key !== supabasePath) delete require.cache[key];
  }
  return require(require.resolve(relPath));
};

// Models what the register_whatsapp_phone() Postgres function does: the whole
// "find+remove from other integration, then add to target" operation runs as
// one atomic step per rpc() call, so a real DB would serialize concurrent
// callers on the row lock instead of letting one clobber the other. This mock
// enforces that same atomicity by mutating `store` synchronously inside the
// rpc() call, with no `await` between reading and writing a row's config —
// which is exactly the property the old two-step select-then-update code lacked.
function makeMockSupabase(store) {
  return {
    rpc: (fnName, params) => {
      if (fnName !== 'register_whatsapp_phone') return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fnName}` } });
      const { p_integration_id, p_phone } = params;
      let prevId = null;

      for (const integ of store.integrations) {
        if (integ.id === p_integration_id) continue;
        if (integ.type !== 'whatsapp' || integ.status !== 'connected') continue;
        const phones = integ.config.whitelisted_phones || [];
        if (phones.includes(p_phone)) {
          integ.config = { ...integ.config, whitelisted_phones: phones.filter(p => p !== p_phone) };
          prevId = integ.id;
        }
      }

      const target = store.integrations.find(i => i.id === p_integration_id);
      const phones = target.config.whitelisted_phones || [];
      if (!phones.includes(p_phone)) {
        target.config = { ...target.config, whitelisted_phones: [...phones, p_phone] };
      }

      return Promise.resolve({ data: prevId, error: null });
    },
  };
}

const mockSupabase = (exportsObj) => {
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: exportsObj };
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('webhook.js registerPhone', () => {
  it('does not lose either registration when two phones register on the same integration concurrently', async () => {
    const store = { integrations: [{ id: 'int-1', type: 'whatsapp', status: 'connected', config: {} }] };
    mockSupabase(makeMockSupabase(store));
    const webhook = freshRequire('../server/routes/webhook.js');
    const integration = store.integrations[0];

    await Promise.all([
      webhook.registerPhone('+111', integration),
      webhook.registerPhone('+222', integration),
    ]);

    expect(store.integrations[0].config.whitelisted_phones.sort()).toEqual(['+111', '+222']);
  });

  it('re-assigns a phone from one integration to another under concurrent conditions', async () => {
    const store = {
      integrations: [
        { id: 'int-1', type: 'whatsapp', status: 'connected', config: { whitelisted_phones: ['+111'] } },
        { id: 'int-2', type: 'whatsapp', status: 'connected', config: {} },
      ],
    };
    mockSupabase(makeMockSupabase(store));
    const webhook = freshRequire('../server/routes/webhook.js');
    const [int1, int2] = store.integrations;

    await Promise.all([
      webhook.registerPhone('+111', int2),
      webhook.registerPhone('+333', int1),
    ]);

    expect(store.integrations[0].config.whitelisted_phones).toEqual(['+333']);
    expect(store.integrations[1].config.whitelisted_phones).toEqual(['+111']);
  });

  it('logs the rpc error and does not throw when the atomic update fails', async () => {
    mockSupabase({ rpc: () => Promise.resolve({ data: null, error: { message: 'db unavailable' } }) });
    const webhook = freshRequire('../server/routes/webhook.js');

    await expect(webhook.registerPhone('+111', { id: 'int-1', config: {} })).resolves.toBeUndefined();
  });

  it('is a no-op when phone is falsy', async () => {
    const rpc = vi.fn();
    mockSupabase({ rpc });
    const webhook = freshRequire('../server/routes/webhook.js');

    await webhook.registerPhone(undefined, { id: 'int-1', config: {} });
    expect(rpc).not.toHaveBeenCalled();
  });
});
