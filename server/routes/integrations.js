const { google } = require('googleapis');
const supabase   = require('../lib/supabase');
const sync       = require('../services/syncProcessor');

const SCOPES = {
  google_drive: ['https://www.googleapis.com/auth/drive.readonly'],
  gmail:        ['https://www.googleapis.com/auth/gmail.readonly'],
};

const makeOAuth2 = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
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

// GET /api/integrations/google/auth-url?type=google_drive
exports.googleAuthUrl = async (req, res) => {
  const { type } = req.query;
  if (!SCOPES[type]) return res.status(400).json({ error: 'Invalid integration type' });
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google OAuth not configured — set GOOGLE_CLIENT_ID in .env.local' });

  const url = makeOAuth2().generateAuthUrl({
    access_type: 'offline',
    scope:       SCOPES[type],
    state:       JSON.stringify({ userId: req.user.id, type }),
    prompt:      'consent',
  });
  res.json({ url });
};

// GET /api/integrations/google/callback  (no auth middleware — redirects browser)
exports.googleCallback = async (req, res) => {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
  const { code, state, error } = req.query;

  if (error) return res.redirect(`${frontend}?view=integrations&oauth_error=${encodeURIComponent(error)}`);

  let stateData;
  try { stateData = JSON.parse(state); }
  catch { return res.redirect(`${frontend}?view=integrations&oauth_error=invalid_state`); }

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
