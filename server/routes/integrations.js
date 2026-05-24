const { google } = require('googleapis');
const crypto     = require('crypto');
const supabase   = require('../lib/supabase');
const sync       = require('../services/syncProcessor');

// In-memory OTP store — keyed by userId, expires in 10 min
const otpStore = new Map();

const SCOPES = {
  google_drive: ['https://www.googleapis.com/auth/drive.readonly'],
  gmail:        ['https://www.googleapis.com/auth/gmail.readonly'],
};

// GOOGLE_REDIRECT_URI must be registered in Google Cloud Console.
// Register two URIs: one for production (https://your-domain.vercel.app/api/integrations/google/callback)
// and one for local dev (http://localhost:3001/api/integrations/google/callback).
// Branch/preview URLs don't need separate registration — returnUrl in OAuth state handles the final redirect.
const getRedirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI ||
  'http://localhost:3001/api/integrations/google/callback';

const makeOAuth2 = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  getRedirectUri(),
);

// GET /api/integrations
exports.list = async (req, res) => {
  const { data, error } = await supabase
    .from('integrations')
    .select('id,type,status,config,last_sync,sync_count,error_message,created_at')
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ integrations: data || [] });
};

// DELETE /api/integrations/:id
exports.remove = async (req, res) => {
  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};

// GET /api/integrations/google/auth-url?type=google_drive&returnUrl=https://...
// returnUrl is the frontend origin — carried through OAuth state so the callback can
// redirect back to the correct URL regardless of which environment (branch, preview, local) initiated the flow.
exports.googleAuthUrl = async (req, res) => {
  const { type, returnUrl } = req.query;
  if (!SCOPES[type]) return res.status(400).json({ error: 'Invalid integration type' });
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({
      error: 'Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local — use the same values from your Supabase project → Authentication → Providers → Google.',
    });
  }

  const url = makeOAuth2().generateAuthUrl({
    access_type: 'offline',
    scope:       SCOPES[type],
    state:       JSON.stringify({ userId: req.user.id, type, returnUrl: returnUrl || null }),
    prompt:      'consent',
  });
  res.json({ url });
};

// GET /api/integrations/google/callback  (no auth middleware — redirects browser)
exports.googleCallback = async (req, res) => {
  const { code, state, error } = req.query;

  // Parse state first so we can redirect back to the correct frontend URL (branch/preview/local)
  let stateData = {};
  try { stateData = JSON.parse(state || '{}'); } catch { /* fall through */ }
  const frontend = stateData.returnUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) return res.redirect(`${frontend}?view=integrations&oauth_error=${encodeURIComponent(error)}`);
  if (!stateData.userId) return res.redirect(`${frontend}?view=integrations&oauth_error=invalid_state`);

  const { userId, type } = stateData;
  try {
    const { tokens } = await makeOAuth2().getToken(code);
    await supabase.from('integrations').upsert({
      user_id:       userId,
      type,
      status:        'connected',
      credentials:   tokens,
      config:        {},
      error_message: null,
    }, { onConflict: 'user_id,type' });

    res.redirect(`${frontend}?view=integrations&oauth_connected=${type}`);
  } catch (err) {
    console.error('Google callback error:', err.message);
    res.redirect(`${frontend}?view=integrations&oauth_error=${encodeURIComponent(err.message)}`);
  }
};

// POST /api/integrations/green-invoice  { apiKey, apiSecret }
exports.connectGreenInvoice = async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret) return res.status(400).json({ error: 'apiKey and apiSecret are required' });

  const { error } = await supabase.from('integrations').upsert({
    user_id:       req.user.id,
    type:          'green_invoice',
    status:        'connected',
    credentials:   { apiKey, apiSecret },
    config:        {},
    error_message: null,
  }, { onConflict: 'user_id,type' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};

// PATCH /api/integrations/:id/config  { config: {...} }
exports.updateConfig = async (req, res) => {
  const { config } = req.body;
  const { error } = await supabase
    .from('integrations')
    .update({ config })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};

// POST /api/integrations/whatsapp/request-otp  { phone }
exports.whatsappRequestOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const otp  = Math.floor(100000 + Math.random() * 900000).toString();
  const hash = crypto.createHash('sha256').update(otp).digest('hex');
  otpStore.set(req.user.id, { phone, hash, expiry: Date.now() + 10 * 60 * 1000 });

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilio.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
        to:   `whatsapp:${phone}`,
        body: `Your Cashflow verification code: ${otp}. Valid for 10 minutes.`,
      });
    } catch (err) {
      return res.status(500).json({ error: `Failed to send WhatsApp message: ${err.message}` });
    }
  } else {
    console.log(`[WhatsApp OTP] To ${phone}: ${otp}`);
  }

  res.json({ ok: true });
};

// POST /api/integrations/whatsapp/verify-otp  { phone, otp }
exports.whatsappVerifyOtp = async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp are required' });

  const stored = otpStore.get(req.user.id);
  if (!stored || stored.phone !== phone || Date.now() > stored.expiry) {
    return res.status(400).json({ error: 'Code expired or not found. Request a new code.' });
  }

  const hash = crypto.createHash('sha256').update(String(otp)).digest('hex');
  if (hash !== stored.hash) return res.status(400).json({ error: 'Invalid verification code.' });

  otpStore.delete(req.user.id);

  const { error } = await supabase.from('integrations').upsert({
    user_id:       req.user.id,
    type:          'whatsapp',
    status:        'connected',
    credentials:   {},
    config:        { phone_number: phone, auto_sync: true },
    error_message: null,
  }, { onConflict: 'user_id,type' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};

// POST /api/integrations/whatsapp/webhook  (no auth — Twilio inbound)
exports.whatsappWebhook = async (req, res) => {
  const from     = (req.body.From || '').replace('whatsapp:', '');
  const numMedia = parseInt(req.body.NumMedia || '0', 10);
  if (!from || numMedia === 0) return res.sendStatus(200);

  const { data: rows } = await supabase
    .from('integrations')
    .select('id, user_id, config, sync_count')
    .eq('type', 'whatsapp')
    .eq('status', 'connected');

  const integration = rows?.find(r => r.config?.phone_number === from);
  if (!integration) {
    console.log(`[whatsapp] no linked account for ${from}`);
    return res.sendStatus(200);
  }

  let added = 0;
  for (let i = 0; i < numMedia; i++) {
    const mediaUrl  = req.body[`MediaUrl${i}`];
    const mediaType = req.body[`MediaContentType${i}`];
    if (!mediaUrl) continue;
    if (!mediaType?.includes('image') && !mediaType?.includes('pdf')) continue;
    try {
      const result = await sync.processWhatsAppMessage(integration.user_id, mediaUrl, mediaType);
      if (result) added++;
    } catch (err) {
      console.error('[whatsapp] process error:', err.message);
    }
  }

  if (added > 0) {
    await supabase.from('integrations').update({
      last_sync:  new Date().toISOString(),
      sync_count: (integration.sync_count || 0) + added,
    }).eq('id', integration.id);
  }

  res.sendStatus(200);
};

// POST /api/integrations/:id/sync
exports.triggerSync = async (req, res) => {
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (error || !integration) return res.status(404).json({ error: 'Integration not found' });

  try {
    let added = 0;
    if (integration.type === 'google_drive')  added = await sync.syncGoogleDrive(integration, req.user.id);
    else if (integration.type === 'gmail')    added = await sync.syncGmail(integration, req.user.id);
    else if (integration.type === 'green_invoice') added = await sync.syncGreenInvoice(integration, req.user.id);

    await supabase.from('integrations').update({
      last_sync:     new Date().toISOString(),
      sync_count:    (integration.sync_count || 0) + added,
      status:        'connected',
      error_message: null,
    }).eq('id', integration.id);

    res.json({ ok: true, added });
  } catch (err) {
    console.error('[integrations] sync error:', err.message);
    await supabase.from('integrations').update({
      status:        'error',
      error_message: err.message,
    }).eq('id', integration.id);
    res.status(500).json({ error: err.message });
  }
};
