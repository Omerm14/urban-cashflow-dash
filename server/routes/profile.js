const storage = require('../lib/storage');
const supabaseAdmin = require('../lib/supabase');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

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

    bb.on('finish', async () => {
      if (sizeExceeded) return res.status(413).json({ error: 'Logo must be under 2MB' });
      if (!fileBuffer || !contentType) return res.status(400).json({ error: 'No valid image provided' });

      const key = `logos/${userId}/${Date.now()}.${ext}`;
      await storage.putAttachment({ key, body: fileBuffer, contentType });
      const logo_url = await storage.getSignedReadUrl(key, storage.activeBackend ? storage.activeBackend() : 'supabase', 60 * 60 * 24 * 365);

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { logo_url },
      });

      return res.json({ logo_url });
    });

    req.pipe(bb);
  } catch (err) {
    console.error('[profile/uploadLogo]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
