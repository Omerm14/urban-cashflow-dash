// One-time (resumable) migration: copy invoice originals from Supabase Storage
// to Cloudflare R2, verify each, then flip the row's attachment_backend to 'r2'.
//
//   node server/scripts/migrateToR2.js            # copy + verify + flip + delete source
//   node server/scripts/migrateToR2.js --keep     # keep the Supabase copy
//   node server/scripts/migrateToR2.js --dry-run  # report what would migrate
//
// Safe to run repeatedly: only rows still on the 'supabase' backend are touched,
// and each row is flipped only after the R2 copy is byte-size verified. The app
// keeps serving throughout — getAttachmentUrl resolves per-row backend.
require('dotenv').config({ path: '.env.local' });
const supabase = require('../lib/supabase');
const {
  S3Client, PutObjectCommand, HeadObjectCommand,
} = require('@aws-sdk/client-s3');

const BUCKET   = 'invoice-attachments';
const KEEP     = process.argv.includes('--keep');
const DRY_RUN  = process.argv.includes('--dry-run');
const PAGE     = 100;

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const R2_BUCKET = process.env.R2_BUCKET;

const guessContentType = key => {
  const ext = key.split('.').pop().toLowerCase();
  return ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' })[ext] || 'application/octet-stream';
};

const migrateOne = async (row) => {
  const key = row.attachment_path;

  // Download original from Supabase Storage.
  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(key);
  if (dlErr) throw new Error(`download: ${dlErr.message}`);
  const buffer = Buffer.from(await blob.arrayBuffer());

  // Upload to R2 (verbatim).
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: guessContentType(key),
  }));

  // Verify size before trusting the copy.
  const head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  if (Number(head.ContentLength) !== buffer.length) {
    throw new Error(`size mismatch: r2=${head.ContentLength} src=${buffer.length}`);
  }

  // Flip the row to R2.
  const { error: upErr } = await supabase.from('invoices')
    .update({ attachment_backend: 'r2', attachment_status: 'present' })
    .eq('id', row.id);
  if (upErr) throw new Error(`db update: ${upErr.message}`);

  // Remove the Supabase copy unless asked to keep it.
  if (!KEEP) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([key]);
    if (rmErr) console.warn(`[migrate] ${row.id}: source delete failed: ${rmErr.message}`);
  }
};

(async () => {
  if (!R2_BUCKET || !process.env.R2_ACCESS_KEY_ID) {
    console.error('R2_* env vars are not configured — aborting.');
    process.exit(1);
  }

  let migrated = 0, failed = 0, scanned = 0;
  for (;;) {
    const { data: rows, error } = await supabase
      .from('invoices')
      .select('id, attachment_path, attachment_backend')
      .eq('attachment_backend', 'supabase')
      .not('attachment_path', 'is', null)
      .order('id')
      .limit(PAGE);
    if (error) { console.error('query error:', error.message); process.exit(1); }
    if (!rows.length) break;

    for (const row of rows) {
      scanned++;
      if (DRY_RUN) { console.log(`[dry-run] would migrate ${row.id} (${row.attachment_path})`); continue; }
      try {
        await migrateOne(row);
        migrated++;
        if (migrated % 25 === 0) console.log(`[migrate] ${migrated} migrated…`);
      } catch (err) {
        failed++;
        console.error(`[migrate] ${row.id} failed: ${err.message}`);
      }
    }

    // In dry-run nothing flips, so the same page repeats — stop after one pass.
    if (DRY_RUN) break;
  }

  console.log(`[migrate] done. scanned=${scanned} migrated=${migrated} failed=${failed} keptSource=${KEEP} dryRun=${DRY_RUN}`);
  process.exit(failed ? 1 : 0);
})();
