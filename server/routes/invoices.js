// Server-mediated invoice mutations that must also touch object storage.
// Deletes are centralised here (not done client-side) so the original file is
// removed alongside the row — works for both Supabase Storage and R2, where the
// browser has no delete credentials.
const supabase = require('../lib/supabase');
const storage  = require('../lib/storage');
const { checkInvoiceLimit } = require('../lib/plans');

// Best-effort removal of an invoice's stored original. Never throws — a missing
// or already-deleted object must not block the row delete.
const removeAttachment = async (row) => {
  if (!row?.attachment_path) return;
  try {
    await storage.deleteAttachment(row.attachment_path, row.attachment_backend || 'supabase');
  } catch (err) {
    console.error(`[invoices] failed to delete attachment ${row.attachment_path}:`, err.message);
  }
};

// DELETE /api/invoices/:id
exports.remove = async (req, res) => {
  const { data: row, error } = await supabase
    .from('invoices')
    .select('id, attachment_path, attachment_backend')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (error) { console.error('[invoices] remove lookup error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
  if (!row)  return res.status(404).json({ error: 'Invoice not found' });

  await removeAttachment(row);

  const { error: delErr } = await supabase
    .from('invoices').delete().eq('id', row.id).eq('user_id', req.user.id);
  if (delErr) { console.error('[invoices] remove delete error:', delErr.message); return res.status(500).json({ error: 'Internal server error' }); }
  res.json({ ok: true });
};

// POST /api/invoices/bulk-delete  { ids: [...] }
exports.bulkRemove = async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids array is required' });
  if (ids.length > 500) return res.status(400).json({ error: 'Cannot delete more than 500 invoices at once' });

  const { data: rows, error } = await supabase
    .from('invoices')
    .select('id, attachment_path, attachment_backend')
    .in('id', ids)
    .eq('user_id', req.user.id);
  if (error) { console.error('[invoices] bulkRemove lookup error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }

  await Promise.allSettled((rows || []).map(removeAttachment));

  const ownedIds = (rows || []).map(r => r.id);
  if (ownedIds.length) {
    const { error: delErr } = await supabase
      .from('invoices').delete().in('id', ownedIds).eq('user_id', req.user.id);
    if (delErr) { console.error('[invoices] bulkRemove delete error:', delErr.message); return res.status(500).json({ error: 'Internal server error' }); }
  }
  res.json({ ok: true, deleted: ownedIds.length });
};

// POST /api/attachments/upload  — multipart form, file field name 'file'
// Uploads the original through our own server instead of a presigned direct-
// to-R2 PUT from the browser. The presigned-PUT flow required the R2 bucket's
// CORS policy to explicitly allow PUT from our origin — a config that lives
// entirely outside this repo (Cloudflare dashboard), silently broke uploads
// whenever it drifted or was never set, and was easy to miss because
// presigned GET (attachment preview) kept working the whole time: <img>/
// <iframe> loads aren't CORS-gated the way a JS fetch() PUT is, so a CORS gap
// only ever showed up on the write path. Proxying through the server removes
// that external dependency for the upload path entirely (mirrors
// profile.js's uploadLogo, which already does this for logo uploads).
const ATTACHMENT_ALLOWED_EXTS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic']);
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // matches express.json()'s existing 20mb limit (extract.js's base64 path)

exports.uploadAttachment = async (req, res) => {
  try {
    // Invoice caps are soft — never refuse an upload, just track usage.
    await checkInvoiceLimit(req.user.id);

    const busboy = require('busboy');
    const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_ATTACHMENT_BYTES + 1 } });

    let fileBuffer = null, contentType = null, filename = null, sizeExceeded = false;

    bb.on('file', (fieldname, file, info) => {
      if (fieldname !== 'file') { file.resume(); return; }
      filename = info.filename;
      contentType = info.mimeType;
      const chunks = [];
      file.on('data', chunk => {
        chunks.push(chunk);
        if (Buffer.concat(chunks).length > MAX_ATTACHMENT_BYTES) { sizeExceeded = true; file.resume(); }
      });
      file.on('end', () => { if (!sizeExceeded) fileBuffer = Buffer.concat(chunks); });
    });

    bb.on('finish', async () => {
      try {
        if (sizeExceeded) return res.status(413).json({ error: 'File must be under 20MB' });
        if (!fileBuffer || !filename) return res.status(400).json({ error: 'No valid file provided' });

        const ext = (filename.split('.').pop() || 'bin').toLowerCase();
        if (!ATTACHMENT_ALLOWED_EXTS.has(ext)) return res.status(400).json({ error: `File type .${ext} is not supported` });

        const key = `${req.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { backend } = await storage.putAttachment({ key, body: fileBuffer, contentType: contentType || 'application/octet-stream' });

        res.json({ attachment_path: key, attachment_backend: backend, attachment_status: 'present' });
      } catch (err) {
        // A `throw` inside an async busboy event-listener callback isn't caught by
        // the outer try/catch below (control already returned to the event loop by
        // the time 'finish' fires) — without this, it becomes an unhandled promise
        // rejection and the client hangs until timeout instead of getting an error.
        console.error('[invoices] uploadAttachment error:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    req.pipe(bb);
  } catch (err) {
    console.error('[invoices] uploadAttachment error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
