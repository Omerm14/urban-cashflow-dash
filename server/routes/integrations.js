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
const getRedirectUri = () => {
  if (!process.env.GOOGLE_REDIRECT_URI) {
    console.warn('[integrations] GOOGLE_REDIRECT_URI is not set — defaulting to localhost. Set this in production or OAuth will fail.');
  }
  return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/integrations/google/callback';
};

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
// Use select('*') to avoid PostgREST 500s when new columns haven't been migrated yet.
// Strip credentials in JS before returning — OAuth tokens must never reach the browser.
exports.list = async (req, res) => {
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', req.user.id);
  if (error) { console.error('[integrations] list error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
  const safe = (data || []).map(({ credentials, ...rest }) => rest);
  res.json({ integrations: safe });
};

// DELETE /api/integrations/:id
exports.remove = async (req, res) => {
  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) { console.error('[integrations] remove error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
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
  const allowedOrigins = (process.env.FRONTEND_URL || 'https://gocashflow.co')
    .split(',').map(s => s.trim()).filter(Boolean);
  const returnUrl = stateData.returnUrl || '';
  // Compare by exact hostname to prevent subdomain open-redirect attacks
  const isAllowed = !returnUrl || (() => {
    try {
      const retHost = new URL(returnUrl).hostname;
      return allowedOrigins.some(origin => new URL(origin).hostname === retHost);
    } catch { return false; }
  })();
  const frontend = isAllowed && returnUrl ? returnUrl : allowedOrigins[0];

  if (!isAllowed && returnUrl) return res.status(400).json({ error: 'Invalid returnUrl' });
  if (error) return res.redirect(`${frontend}?view=integrations&oauth_error=${encodeURIComponent(error)}`);
  if (!stateData.userId) return res.redirect(`${frontend}?view=integrations&oauth_error=invalid_state`);

  const { userId, type } = stateData;
  try {
    const { tokens } = await makeOAuth2().getToken(code);
    // Fetch existing row to preserve config (labels, folder, etc.) and sync_count
    const { data: existing } = await supabase.from('integrations')
      .select('config, sync_count')
      .eq('user_id', userId)
      .eq('type', type)
      .maybeSingle();
    await supabase.from('integrations').upsert({
      user_id:       userId,
      type,
      status:        'connected',
      credentials:   tokens,
      config:        existing?.config || {},
      sync_count:    existing?.sync_count || 0,
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
    const { isDriveId } = require('../lib/validate');
    if (parent !== 'root' && !isDriveId(parent)) return res.status(400).json({ error: 'Invalid folder ID' });

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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
  if (eventsResult.error) { console.error('[integrations] listEvents error:', eventsResult.error.message); return res.status(500).json({ error: 'Internal server error' }); }
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
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  try {
    let result = { added: 0, filesFound: 0, errors: 0 };
    if (integration.type === 'gmail')              result = await sync.syncGmail(resetIntegration, req.user.id);
    else if (integration.type === 'green_invoice') result = await sync.syncGreenInvoice(resetIntegration, req.user.id);

    // Cancelled partway through a from-scratch resync — leave last_sync null (already
    // cleared above) so the next attempt still pulls the full history, not just from here.
    await supabase.from('integrations').update({
      ...(result.cancelled ? {} : { last_sync: new Date().toISOString() }),
      sync_count:       (integration.sync_count || 0) + result.added,
      status:           'connected',
      error_message:    null,
      error_count:      0,
      cancel_requested: false,
    }).eq('id', integration.id);

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[resync] error:', err.message);
    await supabase.from('integrations').update({
      status:           'error',
      error_message:    err.message,
      error_count:      (integration.error_count || 0) + 1,
      last_error_at:    new Date().toISOString(),
      cancel_requested: false,
    }).eq('id', integration.id);
    res.status(500).json({ error: 'Internal server error' });
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

  if (error) { console.error('[integrations] connectGreenInvoice error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
  res.json({ ok: true });
};

// POST /api/integrations/whatsapp  — no user input needed; server uses shared env-var credentials
exports.connectWhatsApp = async (req, res) => {
  const phone = (process.env.WHATSAPP_PHONE_NUMBER || '').replace(/\D/g, '');
  if (!phone || !process.env.WHATSAPP_API_TOKEN) {
    return res.status(500).json({ error: 'WhatsApp is not configured on this server. Set WHATSAPP_PHONE_NUMBER and WHATSAPP_API_TOKEN.' });
  }
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('[integrations] WHATSAPP_PHONE_NUMBER_ID not set — WhatsApp reply messages will not be sent. Add this env var (the numeric Phone Number ID from Meta Business dashboard).');
  }

  // Fetch existing config to preserve whitelisted_phones and reuse existing inbox_code
  const { data: existing } = await supabase.from('integrations')
    .select('config')
    .eq('user_id', req.user.id)
    .eq('type', 'whatsapp')
    .maybeSingle();

  const preservedPhones = existing?.config?.whitelisted_phones || [];
  const existingCode    = existing?.config?.inbox_code;

  // Keep existing inbox_code so vendors who saved the old code continue to work
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const inbox_code = existingCode || Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  const wa_link = `https://wa.me/${phone}?text=${encodeURIComponent(inbox_code)}`;

  const { error } = await supabase.from('integrations').upsert({
    user_id:       req.user.id,
    type:          'whatsapp',
    status:        'connected',
    credentials:   {},
    config:        { inbox_code, wa_link, whitelisted_phones: preservedPhones },
    error_message: null,
    error_count:   0,
  }, { onConflict: 'user_id,type' });

  if (error) { console.error('[integrations] connectWhatsApp error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
  res.json({ ok: true, inbox_code, wa_link });
};

// PATCH /api/integrations/:id/config  { config: {...} }
exports.updateConfig = async (req, res) => {
  const { config } = req.body;
  if (config === undefined || config === null || typeof config !== 'object' || Array.isArray(config)) {
    return res.status(400).json({ error: 'config must be a JSON object' });
  }
  if (JSON.stringify(config).length > 8192) {
    return res.status(400).json({ error: 'config exceeds maximum allowed size' });
  }
  const { error } = await supabase
    .from('integrations')
    .update({ config })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) { console.error('[integrations] updateConfig error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
  res.json({ ok: true });
};

// PATCH /api/integrations/:id/auto-sync  { auto_sync_enabled, sync_frequency_min }
exports.updateAutoSync = async (req, res) => {
  const { auto_sync_enabled, sync_frequency_min } = req.body;
  if (sync_frequency_min !== undefined) {
    const freq = Number(sync_frequency_min);
    if (!Number.isInteger(freq) || freq < 5 || freq > 10080) {
      return res.status(400).json({ error: 'sync_frequency_min must be an integer between 5 and 10080' });
    }
  }
  const { error } = await supabase
    .from('integrations')
    .update({ auto_sync_enabled, sync_frequency_min })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) { console.error('[integrations] updateAutoSync error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
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
    if (error) { console.error('[integrations] listNotifications error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
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
    console.error('[integrations] listNotifications catch:', err.message);
    res.status(500).json({ error: 'Internal server error' });
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
    if (error) { console.error('[integrations] getAttachmentUrl error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
    if (!invoice?.attachment_path) return res.status(404).json({ error: 'No attachment for this invoice' });

    const url = await storage.getSignedReadUrl(invoice.attachment_path, invoice.attachment_backend || 'supabase', 3600);
    res.json({ url });
  } catch (err) {
    console.error('[integrations] getAttachmentUrl catch:', err.message);
    res.status(500).json({ error: 'Internal server error' });
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
      const isInvalidGrant = err.message?.includes('invalid_grant');
      await supabase.from('integrations').update({
        status:        isInvalidGrant ? 'disconnected' : 'error',
        error_message: isInvalidGrant ? 'Google authorization expired. Please reconnect.' : err.message,
        error_count:   isInvalidGrant ? 0 : (integration.error_count || 0) + 1,
        last_error_at: new Date().toISOString(),
      }).eq('id', integration.id);
      return res.status(isInvalidGrant ? 401 : 500).json({ error: isInvalidGrant ? 'invalid_grant' : 'Internal server error' });
    }
  }

  try {
    let result = { added: 0, filesFound: 0, errors: 0 };
    if (integration.type === 'gmail')              result = await sync.syncGmail(integration, req.user.id);
    else if (integration.type === 'green_invoice') result = await sync.syncGreenInvoice(integration, req.user.id);

    // On cancellation, don't advance last_sync — the loop stopped partway through, so the
    // next sync should re-scan from the same starting point rather than skip whatever it
    // never reached (already-saved items are deduped on re-scan, so this is safe).
    await supabase.from('integrations').update({
      ...(result.cancelled ? {} : { last_sync: new Date().toISOString() }),
      sync_count:       (integration.sync_count || 0) + result.added,
      status:           'connected',
      error_message:    null,
      error_count:      0,
      cancel_requested: false,
    }).eq('id', integration.id);

    res.json({ ok: true, jobId: null, ...result });
  } catch (err) {
    console.error('[integrations] sync error:', err.message);
    const isInvalidGrant = err.message?.includes('invalid_grant');
    await supabase.from('integrations').update({
      status:           isInvalidGrant ? 'disconnected' : 'error',
      error_message:    isInvalidGrant ? 'Google authorization expired. Please reconnect.' : err.message,
      error_count:      isInvalidGrant ? 0 : (integration.error_count || 0) + 1,
      last_error_at:    new Date().toISOString(),
      cancel_requested: false,
    }).eq('id', integration.id);
    res.status(isInvalidGrant ? 401 : 500).json({ error: isInvalidGrant ? 'invalid_grant' : 'Internal server error' });
  }
};

// POST /api/integrations/:id/cancel-sync — request cancellation of a blocking sync
// (Gmail/Green Invoice) already in flight. Sets a flag the running sync loop polls
// between items; the original sync request resolves shortly after with cancelled:true.
exports.cancelBlockingSync = async (req, res) => {
  const { error } = await supabase
    .from('integrations')
    .update({ cancel_requested: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) { console.error('[integrations] cancelBlockingSync error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
  res.json({ ok: true });
};

// POST /api/sync-jobs/:jobId/cancel — hard-stop a running or pending job
exports.cancelSyncJob = async (req, res) => {
  const { error } = await supabase
    .from('sync_jobs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', req.params.jobId)
    .eq('user_id', req.user.id)
    .in('status', ['pending', 'running']);
  if (error) { console.error('[integrations] cancelSyncJob error:', error.message); return res.status(500).json({ error: 'Internal server error' }); }
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
    return res.json({ done: true, cancelled: job.status === 'cancelled', cursor: job.cursor, totalFiles: job.total_files, added: job.added, dupes: job.dupes || 0, errors: job.errors, filesAdded: [] });
  }

  // Prevent double-processing: skip if another call is actively running this job
  if (job.status === 'running' && (Date.now() - new Date(job.updated_at).getTime()) < 30000) {
    return res.json({ done: false, cursor: job.cursor, totalFiles: job.total_files, added: job.added, dupes: job.dupes || 0, errors: job.errors, filesAdded: [] });
  }

  await supabase.from('sync_jobs').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', job.id);

  const BATCH_SIZE = 3;
  const batch = (job.file_list || []).slice(job.cursor, job.cursor + BATCH_SIZE);

  const { data: integration } = await supabase.from('integrations').select('*').eq('id', job.integration_id).single();
  if (!integration) {
    await supabase.from('sync_jobs').update({ status: 'error', error_message: 'Integration not found' }).eq('id', job.id);
    return res.status(404).json({ error: 'Integration not found' });
  }

  let batchRes = { results: [], skipped: 0, errors: 0 };
  try {
    batchRes = await sync.processGoogleDriveFileBatch(integration, job.user_id, batch);
  } catch (err) {
    console.error('[sync-jobs] batch error:', err.message);
    batchRes.errors = batch.length;
  }

  const newCursor = job.cursor + batch.length;
  const newAdded  = job.added  + batchRes.results.length;
  const newDupes  = (job.dupes || 0) + (batchRes.skipped || 0);
  const newErrors = job.errors + batchRes.errors;
  const done      = newCursor >= job.total_files;

  await supabase.from('sync_jobs').update({
    cursor: newCursor, added: newAdded, dupes: newDupes, errors: newErrors,
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

  res.json({ done, cursor: newCursor, totalFiles: job.total_files, added: newAdded, dupes: newDupes, errors: newErrors, filesAdded: batchRes.results });
};
