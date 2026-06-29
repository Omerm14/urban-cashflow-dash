const crypto   = require('crypto');
const supabase  = require('../lib/supabase');
const sync      = require('../services/syncProcessor');

// Verify WhatsApp Cloud API webhook signature
const verifySignature = (rawBody, signature, secret) => {
  if (!signature || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

// GET /api/webhook/whatsapp  — webhook verification challenge (Meta requirement)
exports.verifyWhatsApp = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expected = process.env.WHATSAPP_VERIFY_TOKEN || '';
  const a = Buffer.from(`${token || ''}`);
  const b = Buffer.from(expected);
  const ok = expected && mode === 'subscribe' && a.length === b.length && crypto.timingSafeEqual(a, b);
  ok ? res.status(200).send(challenge) : res.status(403).json({ error: 'Forbidden' });
};

// POST /api/webhook/whatsapp  — incoming message handler
exports.handleWhatsApp = async (req, res) => {
  const body = req.body;
  console.log('[webhook:wa] received, entry len:', body?.entry?.length);

  if (!body?.entry?.length) {
    return res.status(200).json({ ok: true });
  }

  // Collect all media items that need processing (fast — just DB lookups)
  const jobs = [];

  for (const entry of body.entry) {
    for (const change of (entry.changes || [])) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};

      for (const msg of (value.messages || [])) {
        if (!msg.id) continue;

        const mediaType = ['image', 'document'].find(t => msg[t]);
        if (!mediaType) continue;

        const media    = msg[mediaType];
        const mimeType = media.mime_type;

        if (mimeType !== 'application/pdf' && !mimeType.startsWith('image/')) continue;

        const inboxCode = (media.caption || '').trim().toUpperCase();
        if (!inboxCode) {
          console.log(`[webhook:wa] msg ${msg.id} has no caption — skipping`);
          continue;
        }

        console.log(`[webhook:wa] looking up inbox code ${inboxCode}`);
        const { data: integration, error: dbErr } = await supabase
          .from('integrations')
          .select('*')
          .eq('type', 'whatsapp')
          .eq('status', 'connected')
          .filter('config->>inbox_code', 'eq', inboxCode)
          .maybeSingle();

        if (dbErr) { console.error('[webhook:wa] db error:', dbErr.message); continue; }
        if (!integration) { console.log(`[webhook:wa] unknown inbox code: ${inboxCode}`); continue; }

        console.log(`[webhook:wa] queuing job for ${msg.id} inbox ${inboxCode}`);
        jobs.push({ integration, media, mediaType, mimeType, msgId: msg.id });
      }
    }
  }

  // Respond 200 before heavy processing (media download + OCR)
  res.status(200).json({ ok: true });

  // Heavy processing after response — Vercel Fluid keeps function alive
  for (const { integration, media, mediaType, mimeType, msgId } of jobs) {
    const filename = media.filename || `${mediaType}_${media.id}`;
    try {
      await sync.processWhatsAppMedia(integration, integration.user_id, media.id, filename, mimeType, msgId);
      console.log(`[webhook:wa] processed ${msgId}`);
    } catch (err) {
      console.error(`[webhook:wa] failed ${msgId}:`, err.message);
    }
  }
};
