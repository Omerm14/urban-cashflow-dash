const { google } = require('googleapis');
const supabase   = require('../lib/supabase');
const sync       = require('../services/syncProcessor');

// OAuth2 client with stored credentials (for Drive/Gmail info endpoints)
const makeOAuth2WithCreds = credentials => {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );
  c.setCredentials(credentials);
  return c;
};

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
      config:        { setup_complete: false },  // user must complete setup before first sync
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

  // Test credentials before saving
  let token, accountName;
  try {
    const authRes = await fetch('https://api.greeninvoice.co.il/api/v1/account/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: apiKey, secret: apiSecret }),
    });
    if (!authRes.ok) {
      const msg = authRes.status === 401 ? 'Invalid API key or secret' : `Green Invoice returned ${authRes.status}`;
      return res.status(400).json({ error: msg });
    }
    const tokenData = await authRes.json();
    token = tokenData.token;

    // Fetch account info to get business name
    const acctRes = await fetch('https://api.greeninvoice.co.il/api/v1/account', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (acctRes.ok) {
      const acct = await acctRes.json();
      accountName = acct.name || acct.businessName || acct.companyName || null;
    }
  } catch (err) {
    return res.status(400).json({ error: `Could not reach Green Invoice: ${err.message}` });
  }

  const { error } = await supabase.from('integrations').upsert({
    user_id:       req.user.id,
    type:          'green_invoice',
    status:        'connected',
    credentials:   { apiKey, apiSecret },
    config:        { setup_complete: false, account_name: accountName || null },
    error_message: null,
  }, { onConflict: 'user_id,type' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, accountName: accountName || null });
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

// GET /api/integrations/google/drive/folder-info?folderId=X
exports.driveFolderInfo = async (req, res) => {
  const { folderId } = req.query;
  if (!folderId) return res.status(400).json({ error: 'folderId required' });

  const { data: integration } = await supabase
    .from('integrations')
    .select('credentials')
    .eq('user_id', req.user.id)
    .eq('type', 'google_drive')
    .single();

  if (!integration) return res.status(404).json({ error: 'Google Drive not connected' });

  try {
    const auth  = makeOAuth2WithCreds(integration.credentials);
    const drive = google.drive({ version: 'v3', auth });

    const { data: folder } = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType',
    });
    if (folder.mimeType !== 'application/vnd.google-apps.folder') {
      return res.status(400).json({ error: 'That link is not a folder' });
    }

    const { data: { files = [] } } = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType='application/pdf' or mimeType contains 'image/') and trashed = false`,
      fields: 'files(id)',
      pageSize: 100,
    });

    res.json({ name: folder.name, fileCount: files.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/integrations/gmail/labels
exports.gmailLabels = async (req, res) => {
  const { data: integration } = await supabase
    .from('integrations')
    .select('credentials')
    .eq('user_id', req.user.id)
    .eq('type', 'gmail')
    .single();

  if (!integration) return res.status(404).json({ error: 'Gmail not connected' });

  try {
    const auth  = makeOAuth2WithCreds(integration.credentials);
    const gmail = google.gmail({ version: 'v1', auth });
    const { data } = await gmail.users.labels.list({ userId: 'me' });
    const labels = (data.labels || [])
      .filter(l => l.type === 'user') // only user-created labels
      .map(l => ({ id: l.id, name: l.name }));
    res.json({ labels });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/integrations/whatsapp/connect
exports.connectWhatsapp = async (req, res) => {
  const { error } = await supabase.from('integrations').upsert({
    user_id:       req.user.id,
    type:          'whatsapp',
    status:        'connected',
    credentials:   {},
    config:        { setup_complete: false },
    error_message: null,
  }, { onConflict: 'user_id,type' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, systemPhone: process.env.WHATSAPP_SYSTEM_PHONE || null });
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
  if (!integration.config?.setup_complete) return res.status(400).json({ error: 'Complete integration setup before syncing' });

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
