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
  // Respond 200 immediately — WhatsApp retries if we don't
  res.status(200).json({ ok: true });

  const rawBody  = req.rawBody;
  const signature = req.headers['x-hub-signature-256'];

  const body = req.body;
  if (!body?.entry?.length) return;

  // Verify HMAC signature using the shared app secret
  if (rawBody && process.env.WHATSAPP_APP_SECRET) {
    if (!verifySignature(rawBody, signature, process.env.WHATSAPP_APP_SECRET)) {
      console.warn('[webhook:wa] invalid HMAC signature — ignoring payload');
      return;
    }
  }

  (async () => {
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

          // Only process PDF and images
          if (mimeType !== 'application/pdf' && !mimeType.startsWith('image/')) continue;

          // Route by inbox code in caption
          const inboxCode = (media.caption || '').trim().toUpperCase();
          if (!inboxCode) {
            console.log(`[webhook:wa] msg ${msg.id} has no caption/inbox code — skipping`);
            continue;
          }

          const { data: integration } = await supabase
            .from('integrations')
            .select('*')
            .eq('type', 'whatsapp')
            .eq('status', 'connected')
            .filter('config->>inbox_code', 'eq', inboxCode)
            .maybeSingle();

          if (!integration) {
            console.log(`[webhook:wa] unknown inbox code: ${inboxCode}`);
            continue;
          }

          const filename = media.filename || `${mediaType}_${media.id}`;
          try {
            await sync.processWhatsAppMedia(integration, integration.user_id, media.id, filename, mimeType, msg.id);
            console.log(`[webhook:wa] processed message ${msg.id} for inbox ${inboxCode}`);
          } catch (err) {
            console.error(`[webhook:wa] failed to process ${msg.id}:`, err.message);
          }
        }
      }
    }
  })();
};
