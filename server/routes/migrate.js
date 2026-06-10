// GET /api/cron/migrate — move invoice originals from Supabase Storage to R2,
// one resumable batch at a time. Only rows still on the 'supabase' backend with a
// file are touched, and each row is flipped to 'r2' only after the R2 copy is
// byte-size verified; the Supabase copy is deleted last. Safe to call repeatedly
// — keep calling until `remaining` reaches 0.
//
// Guarded by CRON_SECRET (header `Authorization: Bearer <secret>` or `?key=`).
//   ?dryRun=1        report how many remain, change nothing
//   ?limit=N         max rows to fetch as candidates (default 100, max 200)
//
// Each call is time-bounded: it processes files until ~45s elapse, then returns
// progress and stops, so it never exceeds the serverless timeout. Just re-invoke
// until `remaining` is 0.
const crypto   = require('crypto');
const supabase = require('../lib/supabase');
const storage  = require('../lib/storage');

const secretOk = (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/, '')
    || req.query.key || req.query.secret || '';
  const a = Buffer.from(`${provided}`);
  const b = Buffer.from(`${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const guessContentType = (key) => {
  const ext = (key.split('.').pop() || '').toLowerCase();
  return ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })[ext]
    || 'application/octet-stream';
};

exports.runMigrate = async (req, res) => {
  if (!secretOk(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (storage.activeBackend() !== 'r2') {
    return res.status(400).json({ error: 'STORAGE_BACKEND is not r2 — nothing to migrate to' });
  }
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const limit  = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  // Time budget per invocation — stays under the 60s function cap with headroom.
  const BUDGET_MS = 45000;

  try {
    // How many still live on Supabase (the work remaining).
    const { count: remaining, error: cErr } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('attachment_backend', 'supabase')
      .not('attachment_path', 'is', null);
    if (cErr) return res.status(500).json({ error: cErr.message });

    if (dryRun) return res.json({ dryRun: true, remaining: remaining || 0 });

    const { data: rows, error } = await supabase
      .from('invoices')
      .select('id, attachment_path')
      .eq('attachment_backend', 'supabase')
      .not('attachment_path', 'is', null)
      .order('id')
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });

    // Stop processing well before the serverless timeout and return progress, so
    // the endpoint never 504s regardless of file sizes / network speed. The
    // caller just re-invokes until `remaining` is 0 (the job is resumable).
    const deadline = Date.now() + BUDGET_MS;

    let migrated = 0, failed = 0, processed = 0;
    const errors = [];
    for (const row of rows) {
      if (Date.now() >= deadline) break;
      processed++;
      const key = row.attachment_path;
      try {
        // Download the original from Supabase.
        const { data: blob, error: dlErr } = await supabase.storage.from(storage.BUCKET).download(key);
        if (dlErr) throw new Error(`download: ${dlErr.message}`);
        const buffer = Buffer.from(await blob.arrayBuffer());

        // Upload verbatim to R2 (active backend is r2).
        await storage.putAttachment({ key, body: buffer, contentType: blob.type || guessContentType(key) });

        // Verify the copy before trusting it.
        const size = await storage.objectSize(key, 'r2');
        if (size !== buffer.length) throw new Error(`size mismatch r2=${size} src=${buffer.length}`);

        // Flip the row to R2, then remove the Supabase copy.
        const { error: upErr } = await supabase.from('invoices')
          .update({ attachment_backend: 'r2', attachment_status: 'present' })
          .eq('id', row.id);
        if (upErr) throw new Error(`db update: ${upErr.message}`);

        await supabase.storage.from(storage.BUCKET).remove([key]);
        migrated++;
      } catch (err) {
        failed++;
        if (errors.length < 5) errors.push(`${row.id}: ${err.message}`);
      }
    }

    const remainingAfter = Math.max((remaining || 0) - migrated, 0);
    console.log(`[migrate] processed=${processed} migrated=${migrated} failed=${failed} remaining=${remainingAfter}`);
    res.json({ ok: true, processed, migrated, failed, remaining: remainingAfter, errors });
  } catch (err) {
    console.error('[migrate] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
