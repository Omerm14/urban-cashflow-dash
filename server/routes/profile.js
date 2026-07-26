const storage = require('../lib/storage');
const supabaseAdmin = require('../lib/supabase');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
// AWS SigV4 presigned URLs (used when STORAGE_BACKEND=r2) hard-cap at 7 days —
// the SDK throws for anything longer. Supabase's createSignedUrl has no such
// cap, but capping here keeps the expiry backend-agnostic. A durable (>7 day)
// logo URL needs a re-sign-at-read-time flow, which is a separate, larger
// design question — out of scope here (see CASH-58).
const LOGO_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

exports.uploadLogo = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const busboy = require('busboy');
    const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES + 1 } });

    let fileBuffer = null;
    let contentType = null;
    let ext = null;
    let sizeExceeded = false;

    bb.on('file', (fieldname, file, info) => {
      if (fieldname !== 'logo') { file.resume(); return; }
      const { mimeType } = info;
      if (!ALLOWED_TYPES.includes(mimeType)) { file.resume(); return; }
      contentType = mimeType;
      ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
      const chunks = [];
      file.on('data', chunk => {
        chunks.push(chunk);
        if (Buffer.concat(chunks).length > MAX_BYTES) { sizeExceeded = true; file.resume(); }
      });
      file.on('end', () => { if (!sizeExceeded) fileBuffer = Buffer.concat(chunks); });
    });

    // busboy is an EventEmitter — a malformed multipart body emits 'error',
    // and a Node EventEmitter 'error' with zero listeners throws
    // synchronously and crashes the whole process (not caught by the outer
    // try/catch, since that only wraps synchronous setup, not async event
    // emission). Guard against double-responding in case 'error' fires after
    // 'finish' already sent a response.
    bb.on('error', (err) => {
      console.error('[profile/uploadLogo]', err.message);
      if (!res.headersSent) res.status(400).json({ error: 'Malformed upload' });
    });

    bb.on('finish', async () => {
      try {
        if (sizeExceeded) return res.status(413).json({ error: 'Logo must be under 2MB' });
        if (!fileBuffer || !contentType) return res.status(400).json({ error: 'No valid image provided' });

        const key = `logos/${userId}/${Date.now()}.${ext}`;
        await storage.putAttachment({ key, body: fileBuffer, contentType });
        const logo_url = await storage.getSignedReadUrl(
          key, storage.activeBackend ? storage.activeBackend() : 'supabase', LOGO_URL_EXPIRY_SECONDS,
        );

        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { logo_url },
        });

        return res.json({ logo_url });
      } catch (err) {
        // A `throw` inside an async busboy event-listener callback isn't caught by
        // the outer try/catch below (control already returned to the event loop by
        // the time 'finish' fires) — without this, it becomes an unhandled promise
        // rejection and the client hangs until timeout instead of getting an error.
        console.error('[profile/uploadLogo]', err.message);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    req.pipe(bb);
  } catch (err) {
    console.error('[profile/uploadLogo]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
