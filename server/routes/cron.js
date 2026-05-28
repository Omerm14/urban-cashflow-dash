const supabase = require('../lib/supabase');
const sync     = require('../services/syncProcessor');

// GET /api/cron/sync
// Called by Vercel Cron (vercel.json) or an external cron service (cron-job.org etc.)
// Requires: Authorization: Bearer <CRON_SECRET>
exports.runSync = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.authorization || '';

  if (!secret || auth !== `Bearer ${secret}`) {
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
      let added = 0;
      if (integration.type === 'google_drive')      added = await sync.syncGoogleDrive(integration, integration.user_id);
      else if (integration.type === 'gmail')         added = await sync.syncGmail(integration, integration.user_id);
      else if (integration.type === 'green_invoice') added = await sync.syncGreenInvoice(integration, integration.user_id);

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

  res.json({ ok: true, synced: succeeded.length, failed, results: succeeded });
};
