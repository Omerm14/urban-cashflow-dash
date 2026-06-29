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

// Register/re-assign msg.from to the matched integration's whitelisted_phones.
// If the phone was previously on a different integration, remove it from there first.
async function registerPhone(phone, integration) {
  if (!phone) return;

  const { data: prevInt } = await supabase
    .from('integrations')
    .select('id, config')
    .eq('type', 'whatsapp')
    .eq('status', 'connected')
    .contains('config', { whitelisted_phones: [phone] })
    .neq('id', integration.id)
    .maybeSingle();

  if (prevInt) {
    const filtered = (prevInt.config.whitelisted_phones || []).filter(p => p !== phone);
    await supabase.from('integrations')
      .update({ config: { ...prevInt.config, whitelisted_phones: filtered } })
      .eq('id', prevInt.id);
    console.log(`[webhook:wa] re-assigned ${phone} from integration ${prevInt.id} to ${integration.id}`);
  }

  const phones = integration.config.whitelisted_phones || [];
  if (!phones.includes(phone)) {
    await supabase.from('integrations')
      .update({ config: { ...integration.config, whitelisted_phones: [...phones, phone] } })
      .eq('id', integration.id);
    console.log(`[webhook:wa] whitelisted ${phone} on integration ${integration.id}`);
  }
}

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
        let integration = null;

        if (inboxCode) {
          // Primary routing: match by inbox code in caption
          console.log(`[webhook:wa] looking up inbox code ${inboxCode}`);
          const { data, error: dbErr } = await supabase
            .from('integrations')
            .select('*')
            .eq('type', 'whatsapp')
            .eq('status', 'connected')
            .filter('config->>inbox_code', 'eq', inboxCode)
            .maybeSingle();

          if (dbErr) { console.error('[webhook:wa] db error:', dbErr.message); continue; }

          if (data) {
            integration = data;
            // Register/re-assign this phone so future sends without caption are auto-routed
            await registerPhone(msg.from, integration);
          } else {
            console.log(`[webhook:wa] unknown inbox code: ${inboxCode}`);
          }
        }

        if (!integration && msg.from) {
          // Fallback routing: match by whitelisted phone number
          console.log(`[webhook:wa] no inbox code match, trying phone ${msg.from}`);
          const { data, error: dbErr } = await supabase
            .from('integrations')
            .select('*')
            .eq('type', 'whatsapp')
            .eq('status', 'connected')
            .contains('config', { whitelisted_phones: [msg.from] })
            .maybeSingle();

          if (dbErr) { console.error('[webhook:wa] db error (phone lookup):', dbErr.message); continue; }

          if (data) {
            integration = data;
            console.log(`[webhook:wa] routed by phone ${msg.from} to integration ${integration.id}`);
          } else {
            console.log(`[webhook:wa] no match by code or phone for ${msg.from} — skipping`);
            continue;
          }
        }

        if (!integration) continue;

        console.log(`[webhook:wa] queuing job for ${msg.id}`);
        jobs.push({ integration, media, mediaType, mimeType, msgId: msg.id });
      }
    }
  }

  // Process all jobs before responding — Vercel kills async work after response is sent
  for (const { integration, media, mediaType, mimeType, msgId } of jobs) {
    const filename = media.filename || `${mediaType}_${media.id}`;
    try {
      await sync.processWhatsAppMedia(integration, integration.user_id, media.id, filename, mimeType, msgId);
      console.log(`[webhook:wa] processed ${msgId}`);
    } catch (err) {
      console.error(`[webhook:wa] failed ${msgId}:`, err.message);
    }
  }

  res.status(200).json({ ok: true });
};
