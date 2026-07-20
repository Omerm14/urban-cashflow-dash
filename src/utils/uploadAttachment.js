// Upload a manually-uploaded invoice file to its storage backend, proxied
// through our own server (POST /api/attachments/upload) rather than a
// presigned direct-to-R2 PUT from the browser. The old presigned-PUT flow
// required the R2 bucket's CORS policy to explicitly allow PUT from our
// origin — external config that silently broke uploads whenever it drifted,
// while attachment preview (a presigned GET loaded via <img>/<iframe>) kept
// working the whole time, since that kind of load isn't CORS-gated the way a
// JS fetch() PUT is. Proxying removes that dependency for the write path
// entirely, matching how profile.js's logo upload already works.
export async function resolveAttachment({ file, session, fetchImpl = fetch }) {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const res = await fetchImpl('/api/attachments/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}` },
    body: fd,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) || {};
    throw new Error(body.error || `Upload failed with status ${res.status}`);
  }
  return res.json();
}

// Same as resolveAttachment, but never throws: logs the real error and
// reports the attachment as missing instead of leaving callers to swallow
// it silently (CASH-59).
export async function resolveAttachmentSafe(params) {
  try {
    return await resolveAttachment(params);
  } catch (err) {
    console.error("[useUpload] attachment save failed", err);
    return { attachment_status: "missing" };
  }
}
