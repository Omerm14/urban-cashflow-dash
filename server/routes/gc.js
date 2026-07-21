// GET /api/cron/gc — reclaim orphaned attachment objects (no invoice points to
// them: abandoned uploads, rows deleted out-of-band). A backstop for the
// delete-on-delete path; never touches a file a live invoice references.
//
// Guarded by CRON_SECRET (header `Authorization: Bearer <secret>`, timing-safe).
// Pass ?dryRun=1 to report without deleting.
const crypto   = require('crypto');
const supabase = require('../lib/supabase');
const storage  = require('../lib/storage');

const secretOk = (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Header only — a ?key= query-param path was previously documented here but
  // never implemented (CASH-40). Deliberately not adding it: query-string
  // secrets leak into server access logs, browser history, and Referer
  // headers, which the header-only path avoids.
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const a = Buffer.from(`${provided}`);
  const b = Buffer.from(`${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Fetches every non-null attachment_path across all invoices, paginating past
// PostgREST's 1000-row default cap. Below that cap this is a single request,
// identical to the old behavior; above it, previous runs would have silently
// treated genuinely-referenced files past row 1000 as orphans and deleted them.
//
// The first page also requests an exact count, so any further pages are
// fetched concurrently instead of one round-trip at a time — this runs
// against the whole table, so it can span many pages on a large instance,
// and this cron has only Vercel's 60s serverless function budget to work with.
const GC_PAGE_SIZE = 1000;
const fetchAllReferencedPaths = async () => {
  // .order('id') makes page boundaries stable — without it, Postgres/PostgREST
  // gives no ordering guarantee across separate .range() requests, and a
  // concurrent insert/update on this table between pages could shift a row
  // across the boundary, causing a live invoice's attachment_path to be
  // skipped from this page and never appear in `paths` — exactly the
  // false-orphan data-loss class this pagination was added to prevent.
  const query = () => supabase
    .from('invoices')
    .select('attachment_path', { count: 'exact' })
    .not('attachment_path', 'is', null)
    .order('id');

  const first = await query().range(0, GC_PAGE_SIZE - 1);
  if (first.error) throw first.error;
  const paths = (first.data || []).map(r => r.attachment_path);

  const total = first.count ?? paths.length;
  const remainingPages = Math.max(0, Math.ceil(total / GC_PAGE_SIZE) - 1);
  if (remainingPages > 0) {
    const pages = await Promise.all(
      Array.from({ length: remainingPages }, (_, i) => {
        const from = (i + 1) * GC_PAGE_SIZE;
        return query().range(from, from + GC_PAGE_SIZE - 1);
      })
    );
    for (const page of pages) {
      if (page.error) throw page.error;
      paths.push(...(page.data || []).map(r => r.attachment_path));
    }
  }
  return paths;
};
exports.fetchAllReferencedPaths = fetchAllReferencedPaths;

// Company logos (server/routes/profile.js `uploadLogo`) live in the same bucket
// as invoice attachments but have no `invoices` row to reference — without this,
// every uploaded logo looks indistinguishable from an abandoned upload and gets
// deleted the next time GC runs without dryRun. Blanket-exempting the `logos/`
// prefix is the simplest safe fix (chosen over tracking each user's current logo
// key in the referenced set): it trades a small amount of storage for a
// superseded/re-uploaded logo — never re-referenced, never deleted — against
// zero risk of deleting a live one. Revisit only if that storage cost matters.
const LOGO_KEY_PREFIX = 'logos/';
const computeOrphans = (allKeys, referenced) =>
  allKeys.filter(k => !k.startsWith(LOGO_KEY_PREFIX) && !referenced.has(k));
exports.computeOrphans = computeOrphans;

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
    const referencedPaths = await fetchAllReferencedPaths();
    const referenced = new Set(referencedPaths);

    const allKeys = await storage.listAllKeys();
    const orphans = computeOrphans(allKeys, referenced);

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
    res.status(500).json({ error: 'Internal server error' });
  }
};
