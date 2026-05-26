const { google } = require('googleapis');
const supabase   = require('../lib/supabase');
const sync       = require('../services/syncProcessor');

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

const makeOAuth2WithCreds = credentials => {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );
  c.setCredentials(credentials);
  return c;
};

// GET /api/integrations
exports.list = async (req, res) => {
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
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
      error_count:   0,
    }, { onConflict: 'user_id,type' });

    res.redirect(`${frontend}?view=integrations&oauth_connected=${type}`);
  } catch (err) {
    console.error('Google callback error:', err.message);
    res.redirect(`${frontend}?view=integrations&oauth_error=${encodeURIComponent(err.message)}`);
  }
};

// GET /api/integrations/google/folders  — list Drive folders for connected user
exports.googleFolders = async (req, res) => {
  const { data: integration, error: intErr } = await supabase
    .from('integrations')
    .select('credentials')
    .eq('user_id', req.user.id)
    .eq('type', 'google_drive')
    .eq('status', 'connected')
    .maybeSingle();
  if (intErr || !integration) return res.status(404).json({ error: 'Google Drive not connected' });

  try {
    const auth  = makeOAuth2WithCreds(integration.credentials);
    const drive = google.drive({ version: 'v3', auth });
    const { data: { files = [] } } = await drive.files.list({
      q:        "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields:   'files(id,name)',
      pageSize: 100,
      orderBy:  'name',
    });
    res.json({ folders: files });
  } catch (err) {
    console.error('[folders]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/integrations/google/labels  — list Gmail labels for connected user
exports.googleLabels = async (req, res) => {
  const { data: integration, error: intErr } = await supabase
    .from('integrations')
    .select('credentials')
    .eq('user_id', req.user.id)
    .eq('type', 'gmail')
    .eq('status', 'connected')
    .maybeSingle();
  if (intErr || !integration) return res.status(404).json({ error: 'Gmail not connected' });

  try {
    const auth  = makeOAuth2WithCreds(integration.credentials);
    const gmail = google.gmail({ version: 'v1', auth });
    const { data: { labels = [] } } = await gmail.users.labels.list({ userId: 'me' });
    const filtered = labels.filter(l => !l.id.startsWith('CATEGORY_') && l.type !== 'system');
    res.json({ labels: filtered });
  } catch (err) {
    console.error('[labels]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/integrations/:id/events  — last 50 sync events for this integration
exports.listEvents = async (req, res) => {
  const { data: integration } = await supabase
    .from('integrations')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (!integration) return res.status(404).json({ error: 'Integration not found' });

  const { data, error } = await supabase
    .from('sync_events')
    .select('id,event_type,source_file,invoice_id,error_message,created_at')
    .eq('integration_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ events: data || [] });
};

// POST /api/integrations/:id/resync  — clear last_sync and trigger full resync
exports.resync = async (req, res) => {
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (error || !integration) return res.status(404).json({ error: 'Integration not found' });

  // Clear last_sync so the adapter pulls all historical files
  await supabase.from('integrations').update({ last_sync: null }).eq('id', integration.id);
  const resetIntegration = { ...integration, last_sync: null };

  try {
    let added = 0;
    if (integration.type === 'google_drive')     added = await sync.syncGoogleDrive(resetIntegration, req.user.id);
    else if (integration.type === 'gmail')        added = await sync.syncGmail(resetIntegration, req.user.id);
    else if (integration.type === 'green_invoice') added = await sync.syncGreenInvoice(resetIntegration, req.user.id);

    await supabase.from('integrations').update({
      last_sync:     new Date().toISOString(),
      sync_count:    (integration.sync_count || 0) + added,
      status:        'connected',
      error_message: null,
      error_count:   0,
    }).eq('id', integration.id);

    res.json({ ok: true, added });
  } catch (err) {
    console.error('[resync] error:', err.message);
    await supabase.from('integrations').update({
      status:        'error',
      error_message: err.message,
      error_count:   (integration.error_count || 0) + 1,
      last_error_at: new Date().toISOString(),
    }).eq('id', integration.id);
    res.status(500).json({ error: err.message });
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
    error_count:   0,
  }, { onConflict: 'user_id,type' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};

// POST /api/integrations/whatsapp  { api_token, phone_number_id, webhook_secret }
exports.connectWhatsApp = async (req, res) => {
  const { api_token, phone_number_id, webhook_secret } = req.body;
  if (!api_token || !phone_number_id || !webhook_secret) {
    return res.status(400).json({ error: 'api_token, phone_number_id, and webhook_secret are required' });
  }

  const { error } = await supabase.from('integrations').upsert({
    user_id:       req.user.id,
    type:          'whatsapp',
    status:        'connected',
    credentials:   { api_token, phone_number_id, webhook_secret },
    config:        { phone_number_id },
    error_message: null,
    error_count:   0,
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

// PATCH /api/integrations/:id/auto-sync  { auto_sync_enabled, sync_frequency_min }
exports.updateAutoSync = async (req, res) => {
  const { auto_sync_enabled, sync_frequency_min } = req.body;
  const { error } = await supabase
    .from('integrations')
    .update({ auto_sync_enabled, sync_frequency_min })
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
    if (integration.type === 'google_drive')      added = await sync.syncGoogleDrive(integration, req.user.id);
    else if (integration.type === 'gmail')         added = await sync.syncGmail(integration, req.user.id);
    else if (integration.type === 'green_invoice') added = await sync.syncGreenInvoice(integration, req.user.id);

    await supabase.from('integrations').update({
      last_sync:     new Date().toISOString(),
      sync_count:    (integration.sync_count || 0) + added,
      status:        'connected',
      error_message: null,
      error_count:   0,
    }).eq('id', integration.id);

    res.json({ ok: true, added });
  } catch (err) {
    console.error('[integrations] sync error:', err.message);
    await supabase.from('integrations').update({
      status:        'error',
      error_message: err.message,
      error_count:   (integration.error_count || 0) + 1,
      last_error_at: new Date().toISOString(),
    }).eq('id', integration.id);
    res.status(500).json({ error: err.message });
  }
};
