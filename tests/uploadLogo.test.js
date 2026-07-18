import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// CASH-58: profile.js requested a 1-year signed URL for a user's logo. AWS
// SigV4 presigned URLs (STORAGE_BACKEND=r2) hard-cap at 7 days — the SDK
// throws past that. Because the throw happens inside an async busboy
// 'finish' event-listener callback (which runs after the enclosing
// try/catch has already returned control to the event loop), it became an
// unhandled promise rejection: the client never got a response and hung
// until timeout. This test stubs storage.getSignedReadUrl to reject
// (simulating the AWS SDK's over-cap throw) and asserts the route responds
// with a clean JSON error instead.
const require = createRequire(import.meta.url);
const storagePath  = require.resolve('../server/lib/storage.js');
const supabasePath = require.resolve('../server/lib/supabase.js');
const busboyPath   = require.resolve('busboy');
const profilePath  = require.resolve('../server/routes/profile.js');

class FakeFileStream {
  constructor() { this.listeners = {}; }
  on(event, handler) { this.listeners[event] = handler; return this; }
  resume() {}
  emitData(chunk) { this.listeners.data?.(chunk); }
  emitEnd() { this.listeners.end?.(); }
}

class FakeBusboy {
  constructor() { this.listeners = {}; }
  on(event, handler) { this.listeners[event] = handler; return this; }
  triggerFile(fieldname, fileStream, info) { this.listeners.file?.(fieldname, fileStream, info); }
  async triggerFinish() { await this.listeners.finish?.(); }
}

let capturedBb;
const mockBusboyFactory = () => { capturedBb = new FakeBusboy(); return capturedBb; };

const freshProfile = (storageExports, supabaseExports) => {
  require.cache[storagePath]  = { id: storagePath, filename: storagePath, loaded: true, exports: storageExports };
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: supabaseExports };
  require.cache[busboyPath]   = { id: busboyPath, filename: busboyPath, loaded: true, exports: mockBusboyFactory };
  delete require.cache[profilePath];
  return require('../server/routes/profile.js');
};

const makeRes = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const uploadOnePngLogo = async (profile, req, res) => {
  await profile.uploadLogo(req, res);
  const fileStream = new FakeFileStream();
  capturedBb.triggerFile('logo', fileStream, { mimeType: 'image/png' });
  fileStream.emitData(Buffer.from('fake-png-bytes'));
  fileStream.emitEnd();
  await capturedBb.triggerFinish();
};

describe('uploadLogo (CASH-58)', () => {
  let consoleErrorSpy;
  beforeEach(() => { consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { consoleErrorSpy.mockRestore(); });

  it('returns a clean 500 JSON error instead of hanging when getSignedReadUrl rejects (R2 over-7-day-cap throw)', async () => {
    const storageMock = {
      activeBackend: () => 'r2',
      putAttachment: async () => ({ key: 'logos/u1/1.png', backend: 'r2' }),
      getSignedReadUrl: async () => { throw new Error('Requests that require signing with a body are not supported with getSignedUrl'); },
    };
    const supabaseMock = { auth: { admin: { updateUserById: async () => ({ data: {}, error: null }) } } };
    const profile = freshProfile(storageMock, supabaseMock);

    const req = { headers: {}, user: { id: 'user-1' }, pipe: () => {} };
    const res = makeRes();

    await uploadOnePngLogo(profile, req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('requests an expiry no longer than 7 days (604800s), regardless of active backend', async () => {
    let requestedExpiry = null;
    const storageMock = {
      activeBackend: () => 'r2',
      putAttachment: async () => ({ key: 'logos/u1/1.png', backend: 'r2' }),
      getSignedReadUrl: async (key, backend, expires) => { requestedExpiry = expires; return 'https://signed.example/logo.png'; },
    };
    const supabaseMock = { auth: { admin: { updateUserById: async () => ({ data: {}, error: null }) } } };
    const profile = freshProfile(storageMock, supabaseMock);

    const req = { headers: {}, user: { id: 'user-1' }, pipe: () => {} };
    const res = makeRes();

    await uploadOnePngLogo(profile, req, res);

    expect(requestedExpiry).toBeLessThanOrEqual(60 * 60 * 24 * 7);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ logo_url: 'https://signed.example/logo.png' });
  });

  it('still returns a clean 500 when putAttachment itself rejects', async () => {
    const storageMock = {
      activeBackend: () => 'supabase',
      putAttachment: async () => { throw new Error('storage backend unavailable'); },
      getSignedReadUrl: async () => 'unused',
    };
    const supabaseMock = { auth: { admin: { updateUserById: async () => ({ data: {}, error: null }) } } };
    const profile = freshProfile(storageMock, supabaseMock);

    const req = { headers: {}, user: { id: 'user-1' }, pipe: () => {} };
    const res = makeRes();

    await uploadOnePngLogo(profile, req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
