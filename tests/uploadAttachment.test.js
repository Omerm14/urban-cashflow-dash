import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveAttachment, resolveAttachmentSafe } from '../src/utils/uploadAttachment.js';

function makeFile(name = 'invoice.pdf', type = 'application/pdf') {
  return new File(['%PDF-1.4 fake content'], name, { type });
}

function makeFetchImpl({ ok = true, status = 200, body } = {}) {
  return vi.fn(async () => ({ ok, status, json: async () => body }));
}

// R2-vs-Supabase branching and CORS-preflight-dependent presigned PUT status
// checks used to live in this module — the upload now always goes through
// our own server (POST /api/attachments/upload), which picks the backend
// internally, so the frontend only has one code path to test.
describe('resolveAttachment (proxied upload, no client-side backend branching)', () => {
  it('posts the file as multipart form data and returns the server response', async () => {
    const fetchImpl = makeFetchImpl({
      ok: true,
      body: { attachment_path: 'u1/123.pdf', attachment_backend: 'r2', attachment_status: 'present' },
    });

    const result = await resolveAttachment({ file: makeFile(), session: { access_token: 't' }, fetchImpl });

    expect(result).toEqual({ attachment_path: 'u1/123.pdf', attachment_backend: 'r2', attachment_status: 'present' });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/attachments/upload');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer t');
    expect(opts.body).toBeInstanceOf(FormData);
  });

  it('works the same regardless of which backend the server picks (supabase)', async () => {
    const fetchImpl = makeFetchImpl({
      ok: true,
      body: { attachment_path: 'u1/456.pdf', attachment_backend: 'supabase', attachment_status: 'present' },
    });

    const result = await resolveAttachment({ file: makeFile(), session: { access_token: 't' }, fetchImpl });

    expect(result.attachment_backend).toBe('supabase');
    expect(result.attachment_status).toBe('present');
  });

  it('throws with the server-provided error message on a non-ok response', async () => {
    const fetchImpl = makeFetchImpl({ ok: false, status: 413, body: { error: 'File must be under 20MB' } });

    await expect(
      resolveAttachment({ file: makeFile(), session: { access_token: 't' }, fetchImpl })
    ).rejects.toThrow(/File must be under 20MB/);
  });

  it('falls back to a generic status-based message when the error response has no body', async () => {
    const fetchImpl = makeFetchImpl({ ok: false, status: 500, body: undefined });

    await expect(
      resolveAttachment({ file: makeFile(), session: { access_token: 't' }, fetchImpl })
    ).rejects.toThrow(/500/);
  });
});

describe('resolveAttachmentSafe (CASH-59: log the real error instead of swallowing it)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the underlying error and reports the attachment as missing when resolveAttachment throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = makeFetchImpl({ ok: false, status: 500, body: { error: 'boom' } });

    const result = await resolveAttachmentSafe({ file: makeFile(), session: { access_token: 't' }, fetchImpl });

    expect(result).toEqual({ attachment_status: 'missing' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(/attachment save failed/);
    expect(errorSpy.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('returns the resolved attachment untouched when resolveAttachment succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = makeFetchImpl({
      ok: true,
      body: { attachment_path: 'u1/123.pdf', attachment_backend: 'r2', attachment_status: 'present' },
    });

    const result = await resolveAttachmentSafe({ file: makeFile(), session: { access_token: 't' }, fetchImpl });

    expect(result).toEqual({ attachment_path: 'u1/123.pdf', attachment_backend: 'r2', attachment_status: 'present' });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
