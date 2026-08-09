// Backend-agnostic attachment storage. The rest of the app talks to this module
// and never to a concrete object store, so swapping Supabase Storage ⇄
// Cloudflare R2 is a per-row decision, not a rewrite.
//
//   activeBackend()                         → the backend new uploads go to
//   putAttachment({ key, body, contentType })       → store bytes
//   getSignedReadUrl(key, backend, expires)          → short-lived GET url
//   deleteAttachment(key, backend)                   → remove bytes (idempotent)
//
// Backend selection is env-driven and defaults to 'supabase', so deploying this
// code with no R2 configuration is a no-op: everything keeps using Supabase
// Storage exactly as before.

const supabase = require('./supabase');

const BUCKET = 'invoice-attachments';

// 'supabase' (default) | 'r2'. Set STORAGE_BACKEND=r2 to send new uploads to R2.
const activeBackend = () => (process.env.STORAGE_BACKEND === 'r2' ? 'r2' : 'supabase');

// ─── Cloudflare R2 (S3-compatible) — lazily constructed so the AWS SDK is only
//     required when R2 is actually configured. ──────────────────────────────
let _r2 = null;
const r2Client = () => {
  if (_r2) return _r2;
  const {
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT,
  } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || (!R2_ENDPOINT && !R2_ACCOUNT_ID)) {
    throw new Error('R2 storage selected but R2_* env vars are not configured');
  }
  const { S3Client } = require('@aws-sdk/client-s3');
  _r2 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return _r2;
};
const r2Bucket = () => {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error('R2_BUCKET env var is not set');
  return b;
};

// ─── Public API ──────────────────────────────────────────────────────────────

// Store bytes under `key` in the active backend. Returns { key, backend }.
// Originals are stored verbatim — no compression, no transformation.
exports.putAttachment = async ({ key, body, contentType }) => {
  const backend = activeBackend();
  if (backend === 'r2') {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await r2Client().send(new PutObjectCommand({
      Bucket: r2Bucket(), Key: key, Body: body, ContentType: contentType,
    }));
    return { key, backend };
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, body, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return { key, backend };
};

// Short-lived signed GET url for `key`, honouring the row's stored backend so
// already-migrated and not-yet-migrated files both resolve during a migration.
exports.getSignedReadUrl = async (key, backend, expires = 3600) => {
  if (backend === 'r2') {
    const { GetObjectCommand }  = require('@aws-sdk/client-s3');
    const { getSignedUrl }      = require('@aws-sdk/s3-request-presigner');
    return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: r2Bucket(), Key: key }), { expiresIn: expires });
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(key, expires);
  if (error) throw new Error(error.message);
  return data.signedUrl;
};

// Remove bytes. Idempotent — a missing object is treated as success so callers
// can safely delete on invoice-delete without first checking existence.
exports.deleteAttachment = async (key, backend) => {
  if (!key) return;
  if (backend === 'r2') {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    await r2Client().send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: key }));
    return;
  }
  const { error } = await supabase.storage.from(BUCKET).remove([key]);
  if (error) throw new Error(error.message);
};

// Byte size of an object in a specific backend, or null if it doesn't exist.
// Used to verify a migrated copy matches the source before deleting the source.
exports.objectSize = async (key, backend) => {
  if (backend === 'r2') {
    const { HeadObjectCommand } = require('@aws-sdk/client-s3');
    try {
      const out = await r2Client().send(new HeadObjectCommand({ Bucket: r2Bucket(), Key: key }));
      return Number(out.ContentLength);
    } catch { return null; }
  }
  // Supabase has no cheap stat; the migrator already holds the source buffer, so
  // this path is unused there.
  return null;
};

// List every object in the active backend as { key, lastModified } — the
// timestamp comes from each backend's existing list/metadata response (R2's
// `LastModified`, Supabase Storage's `updated_at`/`created_at`), no extra
// round-trip. Used by the orphan GC job, including its grace-period check.
exports.listAllKeys = async () => {
  const backend = activeBackend();
  if (backend === 'r2') {
    const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
    const entries = [];
    let token;
    do {
      const out = await r2Client().send(new ListObjectsV2Command({
        Bucket: r2Bucket(), ContinuationToken: token,
      }));
      (out.Contents || []).forEach(o => entries.push({
        key: o.Key,
        lastModified: o.LastModified ? new Date(o.LastModified).getTime() : null,
      }));
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
    return entries;
  }

  // Supabase: objects are namespaced under per-user folders → list folders, then
  // each folder's objects (paginated).
  const entries = [];
  const pageSize = 1000;
  const listDir = async (prefix) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET)
        .list(prefix, { limit: pageSize, offset });
      if (error) throw new Error(error.message);
      if (!data || !data.length) break;
      for (const entry of data) {
        // A folder entry has no `id`; a file entry has one.
        if (entry.id) {
          const key = prefix ? `${prefix}/${entry.name}` : entry.name;
          const stamp = entry.updated_at || entry.created_at;
          entries.push({ key, lastModified: stamp ? new Date(stamp).getTime() : null });
        } else {
          await listDir(prefix ? `${prefix}/${entry.name}` : entry.name);
        }
      }
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  };
  await listDir('');
  return entries;
};

exports.activeBackend = activeBackend;
exports.BUCKET = BUCKET;
