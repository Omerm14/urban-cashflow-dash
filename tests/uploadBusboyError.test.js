import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// CASH-116: busboy is an EventEmitter. On a malformed multipart request body
// it emits an 'error' event, and a Node EventEmitter 'error' with zero
// listeners throws synchronously — crashing the whole process, uncatchable
// by the surrounding try/catch since that only wraps synchronous setup, not
// async event emission. Both uploadAttachment (invoices.js) and uploadLogo
// (profile.js) must now handle busboy's 'error' event with a clean 400
// instead of letting it escape.
const require = createRequire(import.meta.url);
const busboyPath   = require.resolve('busboy');
const storagePath  = require.resolve('../server/lib/storage.js');
const supabasePath = require.resolve('../server/lib/supabase.js');
const plansPath    = require.resolve('../server/lib/plans.js');
const planErrorsPath = require.resolve('../server/lib/planErrors.js');
const invoicesPath = require.resolve('../server/routes/invoices.js');
const profilePath  = require.resolve('../server/routes/profile.js');

class FakeBusboy {
  constructor() { this.listeners = {}; }
  on(event, handler) { this.listeners[event] = handler; return this; }
  emit(event, ...args) { this.listeners[event]?.(...args); }
  async triggerFinish() { await this.listeners.finish?.(); }
}

let capturedBb;
const mockBusboyFactory = () => { capturedBb = new FakeBusboy(); return capturedBb; };

const setCache = (path, exports) => {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
};

const makeRes = () => ({
  statusCode: 200,
  headersSent: false,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; this.headersSent = true; return this; },
});

describe('uploadAttachment busboy error handling (CASH-116)', () => {
  let consoleErrorSpy;
  beforeEach(() => { consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { consoleErrorSpy.mockRestore(); });

  const freshInvoices = () => {
    setCache(busboyPath, mockBusboyFactory);
    setCache(storagePath, { putAttachment: async () => ({ key: 'k', backend: 'supabase' }), deleteAttachment: async () => {} });
    setCache(supabasePath, {});
    setCache(plansPath, { assertInvoiceLimit: async () => {}, assertEntitlement: async () => {} });
    setCache(planErrorsPath, { handlePlanCheckError: () => false });
    delete require.cache[invoicesPath];
    return require('../server/routes/invoices.js');
  };

  it('returns a 400 instead of throwing when busboy emits a malformed-upload error', async () => {
    const invoices = freshInvoices();
    const req = { headers: {}, user: { id: 'user-1' }, pipe: () => {} };
    const res = makeRes();

    await invoices.uploadAttachment(req, res);

    expect(() => capturedBb.emit('error', new Error('Unexpected end of multipart data'))).not.toThrow();

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed upload' });
    expect(consoleErrorSpy).toHaveBeenCalled();
    // Per codebase logging convention: log err.message, not the raw Error object.
    expect(consoleErrorSpy.mock.calls[0].some(arg => typeof arg === 'string' && arg.includes('Unexpected end of multipart data'))).toBe(true);
  });

  it('does not double-respond if error fires after finish already responded', async () => {
    const invoices = freshInvoices();
    const req = { headers: {}, user: { id: 'user-1' }, pipe: () => {} };
    const res = makeRes();

    await invoices.uploadAttachment(req, res);
    await capturedBb.triggerFinish(); // no file was ever attached -> "No valid file provided", 400
    const statusAfterFinish = res.statusCode;
    const bodyAfterFinish = res.body;

    capturedBb.emit('error', new Error('late error'));

    expect(res.statusCode).toBe(statusAfterFinish);
    expect(res.body).toEqual(bodyAfterFinish);
  });
});

describe('uploadLogo busboy error handling (CASH-116)', () => {
  let consoleErrorSpy;
  beforeEach(() => { consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { consoleErrorSpy.mockRestore(); });

  const freshProfile = () => {
    setCache(busboyPath, mockBusboyFactory);
    setCache(storagePath, {
      activeBackend: () => 'supabase',
      putAttachment: async () => ({ key: 'logos/u1/1.png', backend: 'supabase' }),
      getSignedReadUrl: async () => 'https://signed.example/logo.png',
    });
    setCache(supabasePath, { auth: { admin: { updateUserById: async () => ({ data: {}, error: null }) } } });
    delete require.cache[profilePath];
    return require('../server/routes/profile.js');
  };

  it('returns a 400 instead of throwing when busboy emits a malformed-upload error', async () => {
    const profile = freshProfile();
    const req = { headers: {}, user: { id: 'user-1' }, pipe: () => {} };
    const res = makeRes();

    await profile.uploadLogo(req, res);

    expect(() => capturedBb.emit('error', new Error('Malformed part header'))).not.toThrow();

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed upload' });
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls[0].some(arg => typeof arg === 'string' && arg.includes('Malformed part header'))).toBe(true);
  });

  it('does not double-respond if error fires after finish already responded', async () => {
    const profile = freshProfile();
    const req = { headers: {}, user: { id: 'user-1' }, pipe: () => {} };
    const res = makeRes();

    await profile.uploadLogo(req, res);
    await capturedBb.triggerFinish(); // no file was ever attached -> "No valid image provided", 400
    const statusAfterFinish = res.statusCode;
    const bodyAfterFinish = res.body;

    capturedBb.emit('error', new Error('late error'));

    expect(res.statusCode).toBe(statusAfterFinish);
    expect(res.body).toEqual(bodyAfterFinish);
  });
});
