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
exports.verifyWhatsApp = async (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe' || !token) return res.status(403).json({ error: 'Forbidden' });

  // Find a connected WhatsApp integration whose verify_token matches
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id, credentials')
    .eq('type', 'whatsapp')
    .eq('status', 'connected');

  const matched = (integrations || []).find(i => {
    const stored = i.credentials?.verify_token || '';
    if (!stored) return false;
    const a = Buffer.from(`${token}`);
    const b = Buffer.from(stored);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });

  if (matched) return res.status(200).send(challenge);
  res.status(403).json({ error: 'Forbidden' });
};

// POST /api/webhook/whatsapp  — incoming message handler
exports.handleWhatsApp = async (req, res) => {
  // Respond 200 immediately — WhatsApp retries if we don't
  res.status(200).json({ ok: true });

  const rawBody = req.rawBody;
  const signature = req.headers['x-hub-signature-256'];

  const body = req.body;
  if (!body?.entry?.length) return;

  // Process each entry asynchronously after responding
  (async () => {
    for (const entry of body.entry) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};
        const phone_number_id = value.metadata?.phone_number_id;

        // Find matching integration by phone_number_id
        const { data: integration } = await supabase
          .from('integrations')
          .select('*')
          .eq('type', 'whatsapp')
          .eq('status', 'connected')
          .filter('config->phone_number_id', 'eq', phone_number_id)
          .maybeSingle();

        if (!integration) continue;

        // Verify HMAC signature now that we have the integration's app secret
        if (rawBody && integration.credentials?.app_secret) {
          if (!verifySignature(rawBody, signature, integration.credentials.app_secret)) {
            console.warn('[webhook:wa] invalid signature for integration', integration.id);
            continue;
          }
        }

        for (const msg of (value.messages || [])) {
          if (!msg.id) continue;
          const mediaTypes = ['image', 'document', 'video'];
          const mediaType = mediaTypes.find(t => msg[t]);
          if (!mediaType) continue;

          const media     = msg[mediaType];
          const mediaId   = media.id;
          const mimeType  = media.mime_type;
          const filename  = media.filename || `${mediaType}_${mediaId}`;

          // Only process PDF and image types
          if (mimeType !== 'application/pdf' && !mimeType.startsWith('image/')) continue;

          try {
            await sync.processWhatsAppMedia(integration, integration.user_id, mediaId, filename, mimeType, msg.id);
            console.log(`[webhook:wa] processed message ${msg.id}`);
          } catch (err) {
            console.error(`[webhook:wa] failed to process ${msg.id}:`, err.message);
          }
        }
      }
    }
  })();
};
