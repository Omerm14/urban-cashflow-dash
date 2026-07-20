const supabase = require('../lib/supabase');
const sync     = require('../services/syncProcessor');
const BATCH_SIZE = 5;  // larger batch for cron (no timeout pressure)

// GET /api/cron/sync
// Not scheduled via vercel.json's `crons` (Vercel's Hobby plan caps cron
// frequency at once/day, too infrequent for auto-sync) — triggered hourly by
// .github/workflows/cron-sync.yml instead. Requires: Authorization: Bearer <CRON_SECRET>
exports.runSync = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.authorization || '';

  const expected = `Bearer ${secret || ''}`;
  const credOk = secret &&
    auth.length === expected.length &&
    require('crypto').timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!credOk) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Find integrations due for auto-sync
  const { data: integrations, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('auto_sync_enabled', true)
    .eq('status', 'connected');

  if (error) {
    console.error('[cron] error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }

  const now = Date.now();
  const due = (integrations || []).filter(i => {
    if (!i.last_sync) return true;
    const freqMs = (i.sync_frequency_min || 60) * 60 * 1000;
    return now - new Date(i.last_sync).getTime() >= freqMs;
  });

  console.log(`[cron] ${due.length} integration(s) due for sync`);

  const results = await Promise.allSettled(due.map(async integration => {
    try {
      // All sync fns return { added, filesFound, errors }; destructure `added`.
      let added = 0;
      if (integration.type === 'google_drive')      ({ added } = await sync.syncGoogleDrive(integration, integration.user_id));
      else if (integration.type === 'gmail')         ({ added } = await sync.syncGmail(integration, integration.user_id));
      else if (integration.type === 'green_invoice') ({ added } = await sync.syncGreenInvoice(integration, integration.user_id));

      await supabase.from('integrations').update({
        last_sync:     new Date().toISOString(),
        sync_count:    (integration.sync_count || 0) + added,
        status:        'connected',
        error_message: null,
        error_count:   0,
      }).eq('id', integration.id);

      return { id: integration.id, type: integration.type, added };
    } catch (err) {
      console.error(`[cron] sync failed for ${integration.id}:`, err.message);
      await supabase.from('integrations').update({
        status:        'error',
        error_message: err.message,
        error_count:   (integration.error_count || 0) + 1,
        last_error_at: new Date().toISOString(),
      }).eq('id', integration.id);
      throw err;
    }
  }));

  const succeeded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  const failed    = results.filter(r => r.status === 'rejected').length;

  // Pick up stale Drive sync jobs (browser closed before completion)
  const staleThreshold = new Date(Date.now() - 45_000).toISOString();
  const { data: staleJobs = [] } = await supabase
    .from('sync_jobs')
    .select('*')
    .in('status', ['pending', 'running'])
    .lt('updated_at', staleThreshold)
    .limit(5);

  let jobsResumed = 0;
  await Promise.allSettled((staleJobs || []).map(async job => {
    try {
      const { data: integration } = await supabase.from('integrations').select('*')
        .eq('id', job.integration_id).eq('user_id', job.user_id).single();
      if (!integration) return;

      // Atomically claim: the UPDATE only matches if the row is still in the same
      // pending/running-and-stale state it was in when selected above — otherwise
      // another caller (e.g. a browser poll via processSyncJob) claimed it first
      // in the meantime. Closes a TOCTOU race that could double-process a batch
      // (duplicate paid Claude OCR spend, racing cursor writes).
      const { data: claimed, error: claimErr } = await supabase
        .from('sync_jobs')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', job.id)
        .in('status', ['pending', 'running'])
        .lt('updated_at', staleThreshold)
        .select()
        .maybeSingle();
      if (claimErr) throw claimErr;
      if (!claimed) return; // lost the race — another caller already has it

      const batch = (claimed.file_list || []).slice(claimed.cursor, claimed.cursor + BATCH_SIZE);
      const { results: invs, errors: batchErrors } = await sync.processGoogleDriveFileBatch(integration, claimed.user_id, batch);

      const newCursor = claimed.cursor + batch.length;
      const newAdded  = claimed.added  + invs.length;
      const newErrors = claimed.errors + batchErrors;
      const done      = newCursor >= claimed.total_files;

      await supabase.from('sync_jobs').update({
        cursor: newCursor, added: newAdded, errors: newErrors,
        status: done ? 'done' : 'pending',  // pending so next cron tick picks up remainder
        updated_at: new Date().toISOString(),
      }).eq('id', claimed.id);

      if (done) {
        await supabase.from('integrations').update({
          last_sync: new Date().toISOString(),
          sync_count: (integration.sync_count || 0) + newAdded,
          status: 'connected', error_message: null, error_count: 0,
        }).eq('id', integration.id);
      }
      jobsResumed++;
    } catch (err) {
      console.error(`[cron] stale job ${job.id}:`, err.message);
      await supabase.from('sync_jobs').update({ status: 'error', error_message: err.message }).eq('id', job.id);
    }
  }));

  console.log(`[cron] ${jobsResumed} stale job(s) resumed`);
  res.json({ ok: true, synced: succeeded.length, failed, results: succeeded, jobsResumed });
};
