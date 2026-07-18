const crypto   = require('crypto');
const https    = require('https');
const supabase  = require('../lib/supabase');
const sync      = require('../services/syncProcessor');
const { assertInvoiceLimit } = require('../lib/plans');

// Send a text reply to a WhatsApp phone number via the Cloud API
async function sendWhatsAppReply(to, text) {
  const token   = process.env.WHATSAPP_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!to) return;
  if (!token)   { console.error('[webhook:wa] sendWhatsAppReply: WHATSAPP_API_TOKEN not set'); return; }
  if (!phoneId) { console.error('[webhook:wa] sendWhatsAppReply: WHATSAPP_PHONE_NUMBER_ID not set — cannot send reply. Add this env var (numeric Phone Number ID from Meta Business dashboard).'); return; }

  const payload = JSON.stringify({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path:     `/v20.0/${phoneId}/messages`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', (e) => console.error('[webhook:wa] reply send error:', e.message));
    req.end(payload);
  });
}

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
// Delegates to the register_whatsapp_phone() Postgres function (CASH-49) so the
// read-then-write of the whitelist happens atomically in the DB — the Supabase JS
// client has no way to express a conditional/atomic JSON merge itself.
async function registerPhone(phone, integration) {
  if (!phone) return;

  const { data: prevIntegrationId, error } = await supabase.rpc('register_whatsapp_phone', {
    p_integration_id: integration.id,
    p_phone: phone,
  });

  if (error) {
    console.error(`[webhook:wa] registerPhone rpc failed for ${phone}:`, error.message);
    return;
  }

  if (prevIntegrationId) {
    console.log(`[webhook:wa] re-assigned ${phone} from integration ${prevIntegrationId} to ${integration.id}`);
  } else {
    console.log(`[webhook:wa] whitelisted ${phone} on integration ${integration.id}`);
  }
}

exports.registerPhone = registerPhone;

// POST /api/webhook/whatsapp  — incoming message handler
exports.handleWhatsApp = async (req, res) => {
  if (!process.env.WHATSAPP_APP_SECRET) {
    console.error('[webhook:wa] WHATSAPP_APP_SECRET not set — rejecting all webhook payloads');
    return res.status(200).json({ ok: true }); // 200 so Meta doesn't disable the webhook
  }
  const signature = req.headers['x-hub-signature-256'] || '';
  if (!verifySignature(req.rawBody || '', signature, process.env.WHATSAPP_APP_SECRET)) {
    console.warn('[webhook:wa] invalid HMAC signature — ignoring payload');
    return res.status(200).json({ ok: true });
  }

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

        // Handle plain text messages: if body matches an inbox_code, register the sender's phone
        if (msg.type === 'text' && msg.text?.body) {
          const textCode = msg.text.body.trim().toUpperCase();
          const { data: textInt } = await supabase
            .from('integrations')
            .select('*')
            .eq('type', 'whatsapp')
            .eq('status', 'connected')
            .filter('config->>inbox_code', 'eq', textCode)
            .maybeSingle();
          if (textInt) {
            await registerPhone(msg.from, textInt);
            await sendWhatsAppReply(msg.from, '✅ הטלפון שלך נרשם בהצלחה! כעת שלח את החשבונית כקובץ מצורף.');
            console.log(`[webhook:wa] registered phone ${msg.from} via text code ${textCode}`);
          }
          continue;
        }

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
        jobs.push({ integration, media, mediaType, mimeType, msgId: msg.id, msgFrom: msg.from });
      }
    }
  }

  // Process all jobs before responding — Vercel kills async work after response is sent
  for (const { integration, media, mediaType, mimeType, msgId, msgFrom } of jobs) {
    const filename = media.filename || `${mediaType}_${media.id}`;
    try {
      // Hard-blocks ingestion once the user is at/over their plan's monthly
      // invoice quota — this is an unattended path, so the only way to notify
      // the user is the WhatsApp reply itself, not an HTTP response.
      await assertInvoiceLimit(integration.user_id);
      await sync.processWhatsAppMedia(integration, integration.user_id, media.id, filename, mimeType, msgId);
      console.log(`[webhook:wa] processed ${msgId}`);
      await sendWhatsAppReply(msgFrom, '✅ החשבונית התקבלה בהצלחה!');
    } catch (err) {
      console.error(`[webhook:wa] failed ${msgId}:`, err.message);
      const reply = err.code === 'PLAN_LIMIT_REACHED'
        ? '⚠️ הגעת למכסת החשבוניות החודשית שלך. שדרג את התוכנית כדי להמשיך לקבל חשבוניות.'
        : '❌ שגיאה בעיבוד החשבונית. אנא נסה שוב או פנה לתמיכה.';
      await sendWhatsAppReply(msgFrom, reply);
    }
  }

  res.status(200).json({ ok: true });
};
