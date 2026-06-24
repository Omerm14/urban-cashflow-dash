// Server-mediated invoice mutations that must also touch object storage.
// Deletes are centralised here (not done client-side) so the original file is
// removed alongside the row — works for both Supabase Storage and R2, where the
// browser has no delete credentials.
const supabase = require('../lib/supabase');
const storage  = require('../lib/storage');
const { assertInvoiceLimit } = require('../lib/plans');

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
  if (error) return res.status(500).json({ error: error.message });
  if (!row)  return res.status(404).json({ error: 'Invoice not found' });

  await removeAttachment(row);

  const { error: delErr } = await supabase
    .from('invoices').delete().eq('id', row.id).eq('user_id', req.user.id);
  if (delErr) return res.status(500).json({ error: delErr.message });
  res.json({ ok: true });
};

// POST /api/invoices/bulk-delete  { ids: [...] }
exports.bulkRemove = async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids array is required' });

  const { data: rows, error } = await supabase
    .from('invoices')
    .select('id, attachment_path, attachment_backend')
    .in('id', ids)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });

  await Promise.allSettled((rows || []).map(removeAttachment));

  const ownedIds = (rows || []).map(r => r.id);
  if (ownedIds.length) {
    const { error: delErr } = await supabase
      .from('invoices').delete().in('id', ownedIds).eq('user_id', req.user.id);
    if (delErr) return res.status(500).json({ error: delErr.message });
  }
  res.json({ ok: true, deleted: ownedIds.length });
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
    const ext = (filename.split('.').pop() || 'bin').toLowerCase();
    // Hash-named key dedups repeat uploads (incl. each page of one PDF) to one object.
    const base = fileHash || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const key  = `${req.user.id}/${base}.${ext}`;
    const uploadUrl = await storage.presignPutUrl({ key, contentType: contentType || 'application/octet-stream' });
    res.json({ backend, key, uploadUrl });
  } catch (err) {
    console.error('[invoices] presign error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
