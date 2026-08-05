const supabase = require('../lib/supabase');
const sync     = require('../services/syncProcessor');
const { assertInvoiceLimit } = require('../lib/plans');
const BATCH_SIZE = 5;  // larger batch for cron (no timeout pressure)

// Caps how many integrations sync concurrently per tick, so a large due-backlog
// can't fan out unbounded API/OCR calls in one invocation and risk the 60s
// serverless limit (suspected cause of the 2026-07-19 incident that paused
// this cron's schedule). Overflow just waits for the next tick.
const CRON_CONCURRENCY = 5;

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

  const syncIntegration = async integration => {
    try {
      // Skip (not error) an integration whose owner is at/over their plan's
      // monthly invoice quota — auto_sync_enabled is never reset on plan
      // downgrade, so this is the only thing stopping a downgraded-but-still-
      // auto-syncing user from importing unmetered forever. Left as a silent
      // per-run skip rather than disabling auto_sync_enabled or erroring the
      // integration: it's an expected, recoverable state (resolves next month
      // or on upgrade), not a broken integration.
      await assertInvoiceLimit(integration.user_id);

      // All sync fns return { added, filesFound, errors }; Drive and Gmail
      // additionally return `blocked` when a prior sync_jobs run for this
      // integration is still active — resumed separately by the stale-job
      // pickup below.
      let added = 0, blocked = null;
      if (integration.type === 'google_drive')      ({ added, blocked } = await sync.syncGoogleDrive(integration, integration.user_id));
      else if (integration.type === 'gmail')         ({ added, blocked } = await sync.syncGmail(integration, integration.user_id));
      else if (integration.type === 'green_invoice') ({ added } = await sync.syncGreenInvoice(integration, integration.user_id));

      if (blocked) {
        // Nothing ran this tick — leave last_sync/status untouched so the next
        // tick's cutoff window doesn't silently skip past whatever the stuck
        // job hasn't gotten to yet.
        console.log(`[cron] ${integration.id} blocked: ${blocked}`);
        return { id: integration.id, type: integration.type, added: 0, skipped: `blocked:${blocked}` };
      }

      await supabase.from('integrations').update({
        last_sync:     new Date().toISOString(),
        sync_count:    (integration.sync_count || 0) + added,
        status:        'connected',
        error_message: null,
        error_count:   0,
      }).eq('id', integration.id);

      return { id: integration.id, type: integration.type, added };
    } catch (err) {
      if (err.code === 'PLAN_LIMIT_REACHED') {
        console.log(`[cron] skipping ${integration.id} — user ${integration.user_id} at plan limit (${err.used}/${err.limit})`);
        return { id: integration.id, type: integration.type, added: 0, skipped: 'plan_limit_reached' };
      }
      // A transient plan-lookup failure (Supabase blip) isn't the integration's
      // fault — skip this tick without marking it 'error' so a real, healthy
      // integration doesn't get falsely flagged from an infra hiccup; it's
      // simply retried on the next cron tick.
      if (err.code === 'PLAN_LOOKUP_FAILED') {
        console.error(`[cron] plan lookup failed for ${integration.id}, will retry next tick:`, err.message);
        return { id: integration.id, type: integration.type, added: 0, skipped: 'plan_lookup_failed' };
      }
      console.error(`[cron] sync failed for ${integration.id}:`, err.message);
      await supabase.from('integrations').update({
        status:        'error',
        error_message: err.message,
        error_count:   (integration.error_count || 0) + 1,
        last_error_at: new Date().toISOString(),
      }).eq('id', integration.id);
      throw err;
    }
  };

  const results = [];
  for (let i = 0; i < due.length; i += CRON_CONCURRENCY) {
    const chunk = due.slice(i, i + CRON_CONCURRENCY);
    results.push(...await Promise.allSettled(chunk.map(syncIntegration)));
  }

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
      const { results: invs, errors: batchErrors } = claimed.type === 'gmail'
        ? await sync.processGmailMessageBatch(integration, claimed.user_id, batch)
        : await sync.processGoogleDriveFileBatch(integration, claimed.user_id, batch);

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
