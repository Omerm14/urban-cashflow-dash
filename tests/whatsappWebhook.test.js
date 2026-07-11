import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

// CASH-55: server/routes/webhook.js is the ONE endpoint in the app that does
// NOT require a Supabase JWT — an HMAC-SHA256 signature check (crypto.timingSafeEqual)
// is the sole gate in front of handleWhatsApp, and registerPhone() can move a phone
// number across tenants. This file had zero coverage before this ticket.
//
// Same require.cache-seeding technique as tests/errorLeak.test.js / tests/plans.test.js /
// tests/whatsappPhoneRace.test.js, since server/lib/supabase.js is a plain CommonJS
// require() that `vi.mock` cannot intercept.
const require = createRequire(import.meta.url);
const supabasePath = require.resolve('../server/lib/supabase.js');

const mockSupabase = (exportsObj) => {
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: exportsObj };
};

// Force a clean require of webhook.js (and anything under server/ it pulls in,
// e.g. server/services/syncProcessor.js, server/lib/plans.js) so it picks up the
// just-seeded supabase mock rather than a stale one cached by an earlier test.
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
  send(body) { this.body = body; return this; },
});

const APP_SECRET = 'test-app-secret';

// Builds a raw JSON body (Buffer) + the matching parsed object, mirroring what
// server/index.js's raw-body-capture middleware hands to handleWhatsApp:
// req.rawBody is the raw Buffer used for HMAC verification, req.body is the
// JSON.parse()'d object the handler actually reads fields from.
const makeTextMessagePayload = (textBody, from = '+972501234567') => {
  const obj = {
    entry: [{
      changes: [{
        field: 'messages',
        value: { messages: [{ id: 'wamid.TEST1', type: 'text', text: { body: textBody }, from }] },
      }],
    }],
  };
  const raw = Buffer.from(JSON.stringify(obj));
  return { raw, obj };
};

const sign = (rawBody, secret) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

// A fluent supabase mock that always resolves the terminal .maybeSingle() call
// to `integrationsResult`, and records every top-level .from() table name and
// every .rpc() call so tests can assert whether processing actually happened.
const makeHandlerSupabaseMock = ({ integrationsResult = { data: null, error: null }, rpc } = {}) => {
  const fromCalls = [];
  const chain = () => ({
    select: () => chain(),
    eq: () => chain(),
    filter: () => chain(),
    contains: () => chain(),
    maybeSingle: () => Promise.resolve(integrationsResult),
  });
  return {
    from: vi.fn((table) => { fromCalls.push(table); return chain(); }),
    rpc: rpc || vi.fn(() => Promise.resolve({ data: null, error: null })),
    __fromCalls: fromCalls,
  };
};

let consoleLogSpy, consoleWarnSpy, consoleErrorSpy;

beforeEach(() => {
  consoleLogSpy   = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleWarnSpy  = vi.spyOn(console, 'warn').mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  // Ensure sendWhatsAppReply's own early-return path (no token) is exercised
  // rather than an accidental real network call.
  delete process.env.WHATSAPP_API_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WHATSAPP_APP_SECRET;
});

describe('handleWhatsApp — signature gate', () => {
  it('accepts a valid HMAC signature and processes the payload', async () => {
    const supa = makeHandlerSupabaseMock();
    mockSupabase(supa);
    const webhook = freshRequire('../server/routes/webhook.js');

    const { raw, obj } = makeTextMessagePayload('ABC123');
    const req = {
      headers: { 'x-hub-signature-256': sign(raw, APP_SECRET) },
      rawBody: raw,
      body: obj,
    };
    const res = makeRes();

    await webhook.handleWhatsApp(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // Proof the payload was actually processed: the text-message handler looks
    // up an integration by inbox code before doing anything else.
    expect(supa.from).toHaveBeenCalledWith('integrations');
  });

  it('rejects an invalid signature but still returns HTTP 200 without processing', async () => {
    const supa = makeHandlerSupabaseMock();
    mockSupabase(supa);
    const webhook = freshRequire('../server/routes/webhook.js');

    const { raw, obj } = makeTextMessagePayload('ABC123');
    const req = {
      headers: { 'x-hub-signature-256': sign(raw, 'wrong-secret') },
      rawBody: raw,
      body: obj,
    };
    const res = makeRes();

    await webhook.handleWhatsApp(req, res);

    // Meta requires 200 even on rejection, or it will disable the webhook.
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(supa.from).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid HMAC signature'));
  });

  it('rejects a request with a missing signature header but still returns HTTP 200 without processing', async () => {
    const supa = makeHandlerSupabaseMock();
    mockSupabase(supa);
    const webhook = freshRequire('../server/routes/webhook.js');

    const { raw, obj } = makeTextMessagePayload('ABC123');
    const req = { headers: {}, rawBody: raw, body: obj };
    const res = makeRes();

    await webhook.handleWhatsApp(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(supa.from).not.toHaveBeenCalled();
  });

  it('rejects every payload when WHATSAPP_APP_SECRET is unset, even with a well-formed signature header', async () => {
    const supa = makeHandlerSupabaseMock();
    mockSupabase(supa);
    delete process.env.WHATSAPP_APP_SECRET;
    const webhook = freshRequire('../server/routes/webhook.js');

    const { raw, obj } = makeTextMessagePayload('ABC123');
    const req = {
      // Signed with some secret the server no longer knows about — irrelevant,
      // since the missing-env-var check runs before signature verification.
      headers: { 'x-hub-signature-256': sign(raw, 'some-secret') },
      rawBody: raw,
      body: obj,
    };
    const res = makeRes();

    await webhook.handleWhatsApp(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(supa.from).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('WHATSAPP_APP_SECRET not set'));
  });
});

describe('registerPhone', () => {
  it('moves a phone from one integration\'s whitelisted_phones to another\'s', async () => {
    const store = {
      integrations: [
        { id: 'int-A', type: 'whatsapp', status: 'connected', config: { whitelisted_phones: ['+111', '+222'] } },
        { id: 'int-B', type: 'whatsapp', status: 'connected', config: { whitelisted_phones: [] } },
      ],
    };

    const rpc = vi.fn((fnName, params) => {
      expect(fnName).toBe('register_whatsapp_phone');
      const { p_integration_id, p_phone } = params;
      let prevId = null;
      for (const integ of store.integrations) {
        if (integ.id === p_integration_id) continue;
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
    });

    mockSupabase({ rpc });
    const webhook = freshRequire('../server/routes/webhook.js');
    const [intA, intB] = store.integrations;

    await webhook.registerPhone('+111', intB);

    expect(rpc).toHaveBeenCalledWith('register_whatsapp_phone', { p_integration_id: 'int-B', p_phone: '+111' });
    expect(store.integrations.find(i => i.id === 'int-A').config.whitelisted_phones).toEqual(['+222']);
    expect(store.integrations.find(i => i.id === 'int-B').config.whitelisted_phones).toEqual(['+111']);
  });

  it('adds a new phone to an integration\'s whitelist without touching unrelated integrations', async () => {
    const store = {
      integrations: [
        { id: 'int-A', type: 'whatsapp', status: 'connected', config: { whitelisted_phones: ['+999'] } },
        { id: 'int-B', type: 'whatsapp', status: 'connected', config: {} },
        { id: 'int-C', type: 'whatsapp', status: 'connected', config: { whitelisted_phones: ['+555'] } },
      ],
    };

    const rpc = vi.fn((fnName, params) => {
      const { p_integration_id, p_phone } = params;
      let prevId = null;
      for (const integ of store.integrations) {
        if (integ.id === p_integration_id) continue;
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
    });

    mockSupabase({ rpc });
    const webhook = freshRequire('../server/routes/webhook.js');
    const [intA, intB, intC] = store.integrations;

    await webhook.registerPhone('+333', intB);

    expect(store.integrations.find(i => i.id === 'int-B').config.whitelisted_phones).toEqual(['+333']);
    // Unrelated integrations must be untouched.
    expect(store.integrations.find(i => i.id === 'int-A').config.whitelisted_phones).toEqual(['+999']);
    expect(store.integrations.find(i => i.id === 'int-C').config.whitelisted_phones).toEqual(['+555']);
  });
});
