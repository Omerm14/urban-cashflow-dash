// Server-mediated invoice mutations that must also touch object storage.
// Deletes are centralised here (not done client-side) so the original file is
// removed alongside the row — works for both Supabase Storage and R2, where the
// browser has no delete credentials.
const supabase = require('../lib/supabase');
const storage  = require('../lib/storage');
const { assertInvoiceLimit, assertEntitlement } = require('../lib/plans');

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
    throw entErr;
  }
};

// POST /api/attachments/presign  { filename, contentType, fileHash }
// Returns an upload descriptor for the active storage backend.
//   r2:       { backend, key, uploadUrl }  → browser PUTs the file to uploadUrl
//   supabase: { backend }                  → browser uploads via the SDK as before
exports.presignUpload = async (req, res) => {
  const { filename, contentType, fileHash } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'filename is required' });

  try {
    await assertInvoiceLimit(req.user.id);
  } catch (limitErr) {
    if (limitErr.code === 'PLAN_LIMIT_REACHED') {
      return res.status(402).json({ error: limitErr.code, used: limitErr.used, limit: limitErr.limit, plan: limitErr.plan });
    }
    throw limitErr;
  }

  const backend = storage.activeBackend();
  if (backend !== 'r2') return res.json({ backend });

  try {
    const ALLOWED_EXTS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic']);
    const ext = (filename.split('.').pop() || 'bin').toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) return res.status(400).json({ error: `File type .${ext} is not supported` });
    // Hash-named key dedups repeat uploads (incl. each page of one PDF) to one object.
    const base = fileHash || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const key  = `${req.user.id}/${base}.${ext}`;
    const uploadUrl = await storage.presignPutUrl({ key, contentType: contentType || 'application/octet-stream' });
    res.json({ backend, key, uploadUrl });
  } catch (err) {
    console.error('[invoices] presign error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
