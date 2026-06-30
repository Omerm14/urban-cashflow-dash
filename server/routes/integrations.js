const { google } = require('googleapis');
const supabase   = require('../lib/supabase');
const storage    = require('../lib/storage');
const sync       = require('../services/syncProcessor');
const { assertInvoiceLimit } = require('../lib/plans');

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
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(s => s.trim());
  const returnUrl = stateData.returnUrl || '';
  const isAllowed = !returnUrl || allowedOrigins.some(origin => returnUrl.startsWith(origin));
  const frontend = isAllowed && returnUrl ? returnUrl : (allowedOrigins[0]);

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

    const parent = req.query.parent || 'root';

    const { data: { files: folders = [] } } = await drive.files.list({
      q:        `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields:   'files(id,name)',
      pageSize: 200,
      orderBy:  'name',
    });

    let currentName = 'My Drive';
    if (parent !== 'root') {
      const { data } = await drive.files.get({ fileId: parent, fields: 'name' });
      currentName = data.name;
    }

    res.json({ folders, currentName });
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

  const [eventsResult, countResult] = await Promise.all([
    supabase
      .from('sync_events')
      .select('id,event_type,source_file,invoice_id,error_message,created_at')
      .eq('integration_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('sync_events')
      .select('id', { count: 'exact', head: true })
      .eq('integration_id', req.params.id)
      .eq('event_type', 'saved'),
  ]);
  if (eventsResult.error) return res.status(500).json({ error: eventsResult.error.message });
  res.json({ events: eventsResult.data || [], totalSaved: countResult.count || 0 });
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

  if (integration.type === 'google_drive') {
    try {
      const result = await createDriveSyncJob(resetIntegration, req.user.id);
      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[resync] discover error:', err.message);
      await supabase.from('integrations').update({
        status: 'error', error_message: err.message,
        error_count: (integration.error_count || 0) + 1,
        last_error_at: new Date().toISOString(),
      }).eq('id', integration.id);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    let result = { added: 0, filesFound: 0, errors: 0 };
    if (integration.type === 'gmail')              result = await sync.syncGmail(resetIntegration, req.user.id);
    else if (integration.type === 'green_invoice') result = await sync.syncGreenInvoice(resetIntegration, req.user.id);

    await supabase.from('integrations').update({
      last_sync:     new Date().toISOString(),
      sync_count:    (integration.sync_count || 0) + result.added,
      status:        'connected',
      error_message: null,
      error_count:   0,
    }).eq('id', integration.id);

    res.json({ ok: true, ...result });
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

// POST /api/integrations/whatsapp  — no user input needed; server uses shared env-var credentials
exports.connectWhatsApp = async (req, res) => {
  const phone = (process.env.WHATSAPP_PHONE_NUMBER || '').replace(/\D/g, '');
  if (!phone || !process.env.WHATSAPP_API_TOKEN) {
    return res.status(500).json({ error: 'WhatsApp is not configured on this server. Set WHATSAPP_PHONE_NUMBER and WHATSAPP_API_TOKEN.' });
  }

  // Generate a short unique inbox code (avoids ambiguous chars like 0/O, 1/I)
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const inbox_code = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  const wa_link = `https://wa.me/${phone}?text=${inbox_code}`;

  const { error } = await supabase.from('integrations').upsert({
    user_id:       req.user.id,
    type:          'whatsapp',
    status:        'connected',
    credentials:   {},
    config:        { inbox_code, wa_link },
    error_message: null,
    error_count:   0,
  }, { onConflict: 'user_id,type' });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, inbox_code, wa_link });
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

// GET /api/notifications — last 20 sync_events across all integrations for this user
exports.listNotifications = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sync_events')
      .select('id,event_type,source_file,invoice_id,error_message,created_at,integration_id,integrations(type)')
      .eq('user_id', req.user.id)
      .neq('event_type', 'dedup_skipped')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    const notifications = (data || []).map(ev => ({
      id:               ev.id,
      event_type:       ev.event_type,
      source_file:      ev.source_file,
      invoice_id:       ev.invoice_id,
      error_message:    ev.error_message,
      created_at:       ev.created_at,
      integration_type: ev.integrations?.type || null,
    }));
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/invoices/:id/attachment-url — returns a short-lived signed URL for the original file
exports.getAttachmentUrl = async (req, res) => {
  try {
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('attachment_path, attachment_backend')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!invoice?.attachment_path) return res.status(404).json({ error: 'No attachment for this invoice' });

    const url = await storage.getSignedReadUrl(invoice.attachment_path, invoice.attachment_backend || 'supabase', 3600);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Shared: discover Drive files and create a sync_job. Returns { jobId, totalFiles, filesFound }.
const createDriveSyncJob = async (integration, userId) => {
  // Cancel any active job for this integration to prevent double-processing
  await supabase.from('sync_jobs')
    .update({ status: 'cancelled' })
    .eq('integration_id', integration.id)
    .in('status', ['pending', 'running']);

  const { files, filesFound } = await sync.discoverGoogleDriveFiles(integration, userId);
  if (!files.length) return { jobId: null, totalFiles: 0, filesFound };

  const { data: job, error: jobErr } = await supabase
    .from('sync_jobs')
    .insert({
      integration_id: integration.id,
      user_id:        userId,
      status:         'pending',
      file_list:      files,
      total_files:    files.length,
    })
    .select()
    .single();
  if (jobErr) throw jobErr;
  return { jobId: job.id, totalFiles: files.length, filesFound };
};

// POST /api/integrations/:id/sync  — returns immediately with a jobId for Drive
exports.triggerSync = async (req, res) => {
  try {
    await assertInvoiceLimit(req.user.id);
  } catch (limitErr) {
    if (limitErr.code === 'PLAN_LIMIT_REACHED') {
      return res.status(402).json({ error: limitErr.code, used: limitErr.used, limit: limitErr.limit, plan: limitErr.plan });
    }
    throw limitErr;
  }

  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (error || !integration) return res.status(404).json({ error: 'Integration not found' });

  if (integration.type === 'google_drive') {
    try {
      const result = await createDriveSyncJob(integration, req.user.id);
      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[integrations] sync discover error:', err.message);
      await supabase.from('integrations').update({
        status: 'error', error_message: err.message,
        error_count: (integration.error_count || 0) + 1,
        last_error_at: new Date().toISOString(),
      }).eq('id', integration.id);
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    let result = { added: 0, filesFound: 0, errors: 0 };
    if (integration.type === 'gmail')              result = await sync.syncGmail(integration, req.user.id);
    else if (integration.type === 'green_invoice') result = await sync.syncGreenInvoice(integration, req.user.id);

    await supabase.from('integrations').update({
      last_sync:     new Date().toISOString(),
      sync_count:    (integration.sync_count || 0) + result.added,
      status:        'connected',
      error_message: null,
      error_count:   0,
    }).eq('id', integration.id);

    res.json({ ok: true, jobId: null, ...result });
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

// POST /api/sync-jobs/:jobId/cancel — hard-stop a running or pending job
exports.cancelSyncJob = async (req, res) => {
  const { error } = await supabase
    .from('sync_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', req.params.jobId)
    .eq('user_id', req.user.id)
    .in('status', ['pending', 'running']);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
};

// POST /api/sync-jobs/:jobId/process — process next batch; called by frontend polling
exports.processSyncJob = async (req, res) => {
  const { data: job, error } = await supabase
    .from('sync_jobs')
    .select('*')
    .eq('id', req.params.jobId)
    .eq('user_id', req.user.id)
    .single();
  if (error || !job) return res.status(404).json({ error: 'Sync job not found' });

  if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
    return res.json({ done: true, cancelled: job.status === 'cancelled', cursor: job.cursor, totalFiles: job.total_files, added: job.added, errors: job.errors, filesAdded: [] });
  }

  // Prevent double-processing: skip if another call is actively running this job
  if (job.status === 'running' && (Date.now() - new Date(job.updated_at).getTime()) < 30000) {
    return res.json({ done: false, cursor: job.cursor, totalFiles: job.total_files, added: job.added, errors: job.errors, filesAdded: [] });
  }

  await supabase.from('sync_jobs').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', job.id);

  const BATCH_SIZE = 3;
  const batch = (job.file_list || []).slice(job.cursor, job.cursor + BATCH_SIZE);

  const { data: integration } = await supabase.from('integrations').select('*').eq('id', job.integration_id).single();
  if (!integration) {
    await supabase.from('sync_jobs').update({ status: 'error', error_message: 'Integration not found' }).eq('id', job.id);
    return res.status(404).json({ error: 'Integration not found' });
  }

  let batchRes = { results: [], errors: 0 };
  try {
    batchRes = await sync.processGoogleDriveFileBatch(integration, job.user_id, batch);
  } catch (err) {
    console.error('[sync-jobs] batch error:', err.message);
    batchRes.errors = batch.length;
  }

  const newCursor = job.cursor + batch.length;
  const newAdded  = job.added  + batchRes.results.length;
  const newErrors = job.errors + batchRes.errors;
  const done      = newCursor >= job.total_files;

  await supabase.from('sync_jobs').update({
    cursor: newCursor, added: newAdded, errors: newErrors,
    status: done ? 'done' : 'running',
    updated_at: new Date().toISOString(),
  }).eq('id', job.id);

  if (done) {
    await supabase.from('integrations').update({
      last_sync:     new Date().toISOString(),
      sync_count:    (integration.sync_count || 0) + newAdded,
      status:        'connected',
      error_message: null,
      error_count:   0,
    }).eq('id', integration.id);
  }

  res.json({ done, cursor: newCursor, totalFiles: job.total_files, added: newAdded, errors: newErrors, filesAdded: batchRes.results });
};
