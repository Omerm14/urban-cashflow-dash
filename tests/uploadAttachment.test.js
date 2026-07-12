import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveAttachment, resolveAttachmentSafe } from '../src/utils/uploadAttachment.js';

function makeFile(name = 'invoice.pdf', type = 'application/pdf') {
  return { name, type };
}

function makeFetchImpl({ presignOk = true, presign, putOk = true, putStatus = 403 } = {}) {
  return vi.fn(async (url) => {
    if (url === '/api/attachments/presign') {
      return { ok: presignOk, json: async () => presign };
    }
    return { ok: putOk, status: putStatus };
  });
}

describe('resolveAttachment (CASH-38: R2 presigned PUT status check)', () => {
  it('marks the attachment missing (throws) when the R2 presigned PUT resolves non-ok', async () => {
    const fetchImpl = makeFetchImpl({
      presign: { backend: 'r2', uploadUrl: 'https://r2.example.com/upload', key: 'k1' },
      putOk: false,
      putStatus: 403,
    });

    await expect(
      resolveAttachment({ file: makeFile(), session: { access_token: 't' }, userId: 'u1', fetchImpl })
    ).rejects.toThrow(/403/);
  });

  it('marks the attachment missing (throws) on a 5xx R2 response', async () => {
    const fetchImpl = makeFetchImpl({
      presign: { backend: 'r2', uploadUrl: 'https://r2.example.com/upload', key: 'k1' },
      putOk: false,
      putStatus: 500,
    });

    await expect(
      resolveAttachment({ file: makeFile(), session: { access_token: 't' }, userId: 'u1', fetchImpl })
    ).rejects.toThrow(/500/);
  });

  it('returns attachment_status "present" when the R2 PUT resolves ok', async () => {
    const fetchImpl = makeFetchImpl({
      presign: { backend: 'r2', uploadUrl: 'https://r2.example.com/upload', key: 'k1' },
      putOk: true,
    });

    const result = await resolveAttachment({ file: makeFile(), session: { access_token: 't' }, userId: 'u1', fetchImpl });

    expect(result).toEqual({ attachment_path: 'k1', attachment_backend: 'r2', attachment_status: 'present' });
  });

  it('falls back to Supabase Storage when presign does not indicate R2', async () => {
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const supabaseStorage = { from: vi.fn(() => ({ upload })) };
    const fetchImpl = makeFetchImpl({ presign: { backend: 'supabase' } });

    const result = await resolveAttachment({
      file: makeFile(), session: { access_token: 't' }, userId: 'u1', fetchImpl, supabaseStorage,
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.attachment_backend).toBe('supabase');
    expect(result.attachment_status).toBe('present');
  });

  it('returns an empty object when the presign request itself fails', async () => {
    const fetchImpl = makeFetchImpl({ presignOk: false });

    const result = await resolveAttachment({ file: makeFile(), session: { access_token: 't' }, userId: 'u1', fetchImpl });

    expect(result).toEqual({});
  });
});

describe('resolveAttachmentSafe (CASH-59: log the real error instead of swallowing it)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the underlying error and reports the attachment as missing when resolveAttachment throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = makeFetchImpl({
      presign: { backend: 'r2', uploadUrl: 'https://r2.example.com/upload', key: 'k1' },
      putOk: false,
      putStatus: 500,
    });

    const result = await resolveAttachmentSafe({ file: makeFile(), session: { access_token: 't' }, userId: 'u1', fetchImpl });

    expect(result).toEqual({ attachment_status: 'missing' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(/attachment save failed/);
    expect(errorSpy.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('returns the resolved attachment untouched when resolveAttachment succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = makeFetchImpl({
      presign: { backend: 'r2', uploadUrl: 'https://r2.example.com/upload', key: 'k1' },
      putOk: true,
    });

    const result = await resolveAttachmentSafe({ file: makeFile(), session: { access_token: 't' }, userId: 'u1', fetchImpl });

    expect(result).toEqual({ attachment_path: 'k1', attachment_backend: 'r2', attachment_status: 'present' });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
