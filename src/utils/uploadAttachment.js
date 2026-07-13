// Presign + upload a manually-uploaded invoice file to its storage backend
// (R2 via presigned PUT, or Supabase Storage). Extracted from useUpload.js
// so the R2 branch's response-status handling can be unit-tested with a
// mocked fetch, without pulling in React Testing Library.
export async function resolveAttachment({ file, session, userId, fetchImpl = fetch, supabaseStorage }) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const presignRes = await fetchImpl("/api/attachments/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  if (!presignRes.ok) return {};
  const presign = await presignRes.json();

  if (presign.backend === "r2" && presign.uploadUrl) {
    const putRes = await fetchImpl(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) throw new Error(`R2 upload failed with status ${putRes.status}`);
    return { attachment_path: presign.key, attachment_backend: "r2", attachment_status: "present" };
  }

  const key = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await supabaseStorage.from("invoice-attachments").upload(key, file, { contentType: file.type, upsert: true });
  return { attachment_path: key, attachment_backend: "supabase", attachment_status: "present" };
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
