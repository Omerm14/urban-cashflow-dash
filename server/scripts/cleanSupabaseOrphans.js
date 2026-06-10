// Standalone orphan cleanup for Supabase Storage — deletes attachment objects
// that no invoice row points to (leftovers from the old non-atomic upload path).
// Runs locally against the service-role key. No deploy, no R2 required.
//
//   node server/scripts/cleanSupabaseOrphans.js            # DRY RUN — only reports
//   node server/scripts/cleanSupabaseOrphans.js --delete   # actually deletes
//
// Safe: an object is deleted only if NO invoice references it. Never touches a
// file a live invoice points to.
require('dotenv').config({ path: '.env.local' });
const supabase = require('../lib/supabase');

const BUCKET   = 'invoice-attachments';
const DELETE   = process.argv.includes('--delete');
const PAGE     = 1000;

// Recursively list every object key under the bucket (objects live in per-user
// folders → list folders, then each folder's files).
const listAllKeys = async () => {
  const keys = [];
  const listDir = async (prefix) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
      if (error) throw new Error(error.message);
      if (!data || !data.length) break;
      for (const entry of data) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id) keys.push(path);   // file (has id)
        else await listDir(path);        // folder (no id)
      }
      if (data.length < PAGE) break;
      offset += PAGE;
    }
  };
  await listDir('');
  return keys;
};

(async () => {
  // Every key a live invoice references.
  const { data: rows, error } = await supabase
    .from('invoices').select('attachment_path').not('attachment_path', 'is', null);
  if (error) { console.error('query error:', error.message); process.exit(1); }
  const referenced = new Set((rows || []).map(r => r.attachment_path));

  const allKeys = await listAllKeys();
  const orphans = allKeys.filter(k => !referenced.has(k));

  console.log(`total objects: ${allKeys.length}`);
  console.log(`referenced:    ${referenced.size}`);
  console.log(`orphans:       ${orphans.length}`);

  if (!DELETE) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --delete to remove the orphans.');
    process.exit(0);
  }

  let deleted = 0;
  const CHUNK = 100; // Supabase remove() accepts an array
  for (let i = 0; i < orphans.length; i += CHUNK) {
    const batch = orphans.slice(i, i + CHUNK);
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(batch);
    if (rmErr) console.error(`batch ${i} delete error:`, rmErr.message);
    else { deleted += batch.length; console.log(`deleted ${deleted}/${orphans.length}…`); }
  }
  console.log(`\ndone. deleted ${deleted} orphaned objects.`);
  process.exit(0);
})();
