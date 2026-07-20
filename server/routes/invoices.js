// Server-mediated invoice mutations that must also touch object storage.
// Deletes are centralised here (not done client-side) so the original file is
// removed alongside the row — works for both Supabase Storage and R2, where the
// browser has no delete credentials.
const supabase = require('../lib/supabase');
const storage  = require('../lib/storage');
const { assertInvoiceLimit, assertEntitlement } = require('../lib/plans');
const { handlePlanCheckError } = require('../lib/planErrors');

const ALLOWED_BULK_STATUSES = new Set(['Paid', 'Unpaid']);

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
  try {
    await assertEntitlement(req.user.id, 'bulkActions');
  } catch (entErr) {
    if (entErr.code === 'ENTITLEMENT_REQUIRED') {
      return res.status(403).json({ error: entErr.code, entitlement: entErr.entitlement, plan: entErr.plan });
    }
    if (handlePlanCheckError(entErr, res, 'invoices:bulkRemove')) return;
    throw entErr;
  }

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

// POST /api/invoices/bulk-status  { ids: [...], status: 'Paid' | 'Unpaid' }
// CASH-95: bulkMarkPaid/bulkMarkUnpaid previously wrote straight from the
// frontend to Supabase with the user's own JWT — RLS scopes by user_id but
// not by plan tier, so a Free/Starter user could call it directly and bypass
// the UI-only bulkActions gate. The write now goes through here instead.
exports.bulkUpdateStatus = async (req, res) => {
  try {
    await assertEntitlement(req.user.id, 'bulkActions');
  } catch (entErr) {
    if (entErr.code === 'ENTITLEMENT_REQUIRED') {
      return res.status(403).json({ error: entErr.code, entitlement: entErr.entitlement, plan: entErr.plan });
    }
    if (handlePlanCheckError(entErr, res, 'invoices:bulkUpdateStatus')) return;
    throw entErr;
  }

  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const status = req.body?.status;
  if (!ids.length) return res.status(400).json({ error: 'ids array is required' });
  if (ids.length > 500) return res.status(400).json({ error: 'Cannot update more than 500 invoices at once' });
  if (!ALLOWED_BULK_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid status' });

  const { data, error } = await supabase
    .from('invoices')
    .update({ status })
    .in('id', ids)
    .eq('user_id', req.user.id)
    .select('id');
  if (error) { console.error('[invoices] bulkUpdateStatus error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
  res.json({ ok: true, updated: (data || []).length });
};

// GET /api/invoices/export-entitlement
// CASH-95: the CSV itself is still built client-side from data already
// fetched under RLS (no new data is exposed here) — this is a thin
// server-side gate so a disallowed-tier user triggering the export action
// via devtools/API directly (bypassing the UI-only canExportCsv gate) is
// rejected the same way a real mutation/read endpoint would reject them.
exports.checkExportEntitlement = async (req, res) => {
  try {
    const { plan } = await assertEntitlement(req.user.id, 'csvExport');
    res.json({ ok: true, plan });
  } catch (entErr) {
    if (entErr.code === 'ENTITLEMENT_REQUIRED') {
      return res.status(403).json({ error: entErr.code, entitlement: entErr.entitlement, plan: entErr.plan });
    }
    if (handlePlanCheckError(entErr, res, 'invoices:checkExportEntitlement')) return;
    throw entErr;
  }
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
    await assertInvoiceLimit(req.user.id);
  } catch (limitErr) {
    if (limitErr.code === 'PLAN_LIMIT_REACHED') {
      return res.status(402).json({ error: limitErr.code, used: limitErr.used, limit: limitErr.limit, plan: limitErr.plan });
    }
    if (handlePlanCheckError(limitErr, res, 'invoices:uploadAttachment')) return;
    throw limitErr;
  }

  try {
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
