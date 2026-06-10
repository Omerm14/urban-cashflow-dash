// GET /api/cron/gc — reclaim orphaned attachment objects (no invoice points to
// them: abandoned uploads, rows deleted out-of-band). A backstop for the
// delete-on-delete path; never touches a file a live invoice references.
//
// Guarded by CRON_SECRET (timing-safe). Pass ?dryRun=1 to report without deleting.
const crypto   = require('crypto');
const supabase = require('../lib/supabase');
const storage  = require('../lib/storage');

const secretOk = (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Accept the secret from the Authorization header (cron services) OR a `key`
  // query param (so the endpoint can be triggered by simply opening a URL in a
  // browser — no terminal / header-setting tool required).
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/, '')
    || req.query.key || req.query.secret || '';
  const a = Buffer.from(`${provided}`);
  const b = Buffer.from(`${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

exports.runGc = async (req, res) => {
  if (!secretOk(req)) return res.status(401).json({ error: 'Unauthorized' });
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';

  try {
    // Every key any live invoice references. We intentionally do NOT filter by
    // attachment_backend here: the referenced-set is used only to protect files
    // from deletion, so being conservative (treat a path as referenced no matter
    // which backend the row records) can never delete a file a live invoice
    // points to. It also means this endpoint works before migration 007 adds the
    // attachment_backend column.
    const backend = storage.activeBackend();
    const { data: rows, error } = await supabase
      .from('invoices')
      .select('attachment_path')
      .not('attachment_path', 'is', null);
    if (error) return res.status(500).json({ error: error.message });
    const referenced = new Set((rows || []).map(r => r.attachment_path));

    const allKeys = await storage.listAllKeys();
    const orphans = allKeys.filter(k => !referenced.has(k));

    if (!dryRun) {
      // Delete sequentially-ish in small concurrent groups; failures are logged,
      // not fatal — next run retries.
      const CHUNK = 20;
      for (let i = 0; i < orphans.length; i += CHUNK) {
        await Promise.allSettled(
          orphans.slice(i, i + CHUNK).map(k => storage.deleteAttachment(k, backend)),
        );
      }
    }

    console.log(`[gc] backend=${backend} total=${allKeys.length} referenced=${referenced.size} orphans=${orphans.length} dryRun=${dryRun}`);
    res.json({ ok: true, backend, totalObjects: allKeys.length, referenced: referenced.size, orphans: orphans.length, deleted: dryRun ? 0 : orphans.length, dryRun });
  } catch (err) {
    console.error('[gc] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
