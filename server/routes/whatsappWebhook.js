const supabase = require('../lib/supabase');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'cashflow-whatsapp-verify';
const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const PHONE_ID     = process.env.WHATSAPP_PHONE_NUMBER_ID;

// GET /api/webhooks/whatsapp — Meta challenge verification
exports.verify = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[whatsapp] webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// POST /api/webhooks/whatsapp — incoming message
exports.receive = async (req, res) => {
  // Always return 200 immediately so Meta doesn't retry
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        for (const message of change.value?.messages || []) {
          await handleMessage(message, change.value?.contacts?.[0]).catch(err =>
            console.error('[whatsapp] message handler error:', err.message)
          );
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp] webhook processing error:', err.message);
  }
};

const normalizePhone = raw => {
  if (!raw) return null;
  // Strip WhatsApp suffix and non-digits except leading +
  const digits = raw.replace(/@.*/, '').replace(/\D/g, '');
  if (digits.startsWith('972')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 10) return `+972${digits.slice(1)}`;
  return `+${digits}`;
};

const handleMessage = async (message, contact) => {
  const type = message.type;
  if (type !== 'image' && type !== 'document') return;

  const senderPhone = normalizePhone(message.from);
  if (!senderPhone) return;

  // Find user by registered phone
  const { data: integrations } = await supabase
    .from('integrations')
    .select('user_id, config, id')
    .eq('type', 'whatsapp')
    .eq('status', 'connected');

  let userId = null, integrationId = null;
  for (const intg of integrations || []) {
    const phones = intg.config?.registered_phones || [];
    if (phones.some(p => p.phone === senderPhone)) {
      userId = intg.user_id;
      integrationId = intg.id;
      break;
    }
  }

  if (!userId) {
    console.log(`[whatsapp] unregistered sender: ${senderPhone}`);
    return;
  }

  // Download media from Meta
  const mediaId   = message[type]?.id;
  const mediaType = message[type]?.mime_type || (type === 'image' ? 'image/jpeg' : 'application/pdf');
  const filename  = message.document?.filename || `whatsapp_${message.id}.${type === 'image' ? 'jpg' : 'pdf'}`;

  if (!mediaId || !WA_TOKEN) return;

  const urlRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  if (!urlRes.ok) { console.error('[whatsapp] media URL fetch failed:', urlRes.status); return; }
  const { url: mediaUrl } = await urlRes.json();

  const mediaRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  if (!mediaRes.ok) { console.error('[whatsapp] media download failed:', mediaRes.status); return; }

  const buffer = Buffer.from(await mediaRes.arrayBuffer());

  // Run extraction pipeline (same as Drive/Gmail)
  const syncProcessor = require('../services/syncProcessor');
  const { data: suppliers } = await supabase.from('suppliers').select('*').eq('user_id', userId);
  const { data: existingInvoices } = await supabase
    .from('invoices')
    .select('supplier,invoice_no,amount,invoice_date')
    .eq('user_id', userId);

  const result = await syncProcessor.processFilePublic(
    buffer, filename, mediaType, userId,
    suppliers || [], existingInvoices || []
  );

  // Update sync count
  if (result) {
    await supabase.from('integrations').update({
      last_sync:  new Date().toISOString(),
      sync_count: supabase.rpc ? undefined : undefined, // incremented below
    }).eq('id', integrationId);

    // Increment sync_count
    const { data: cur } = await supabase.from('integrations').select('sync_count').eq('id', integrationId).single();
    await supabase.from('integrations').update({ sync_count: (cur?.sync_count || 0) + 1 }).eq('id', integrationId);
  }

  // Send confirmation reply (if token configured)
  if (result && WA_TOKEN && PHONE_ID) {
    const text = `✓ Invoice received: ${result.supplier} ₪${result.amount} ${result.invoice_date}`;
    await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.from,
        type: 'text',
        text: { body: text },
      }),
    }).catch(err => console.error('[whatsapp] reply failed:', err.message));
  }
};
