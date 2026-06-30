const supabase = require('../lib/supabase');
const sync     = require('../services/syncProcessor');
const BATCH_SIZE = 5;  // larger batch for cron (no timeout pressure)

// GET /api/cron/sync
// Called by Vercel Cron (vercel.json) or an external cron service (cron-job.org etc.)
// Requires: Authorization: Bearer <CRON_SECRET>
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

  if (error) return res.status(500).json({ error: error.message });

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
      const { data: integration } = await supabase.from('integrations').select('*').eq('id', job.integration_id).single();
      if (!integration) return;

      // Mark running
      await supabase.from('sync_jobs').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', job.id);

      const batch = (job.file_list || []).slice(job.cursor, job.cursor + BATCH_SIZE);
      const { results: invs, errors: batchErrors } = await sync.processGoogleDriveFileBatch(integration, job.user_id, batch);

      const newCursor = job.cursor + batch.length;
      const newAdded  = job.added  + invs.length;
      const newErrors = job.errors + batchErrors;
      const done      = newCursor >= job.total_files;

      await supabase.from('sync_jobs').update({
        cursor: newCursor, added: newAdded, errors: newErrors,
        status: done ? 'done' : 'pending',  // pending so next cron tick picks up remainder
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);

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
