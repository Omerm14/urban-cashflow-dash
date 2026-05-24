require('dotenv').config({ path: '.env.local' });
const express = require('express');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set in .env.local');
  process.exit(1);
}

const app  = express();
const auth = require('./middleware/auth');
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));

app.post('/api/extract',    auth, require('./routes/extract'));
app.get('/api/admin/usage',      require('./routes/admin'));

// Integration routes — specific paths before :id wildcards
const integrations = require('./routes/integrations');
app.get('/api/integrations',                           auth, integrations.list);
app.get('/api/integrations/google/auth-url',           auth, integrations.googleAuthUrl);
app.get('/api/integrations/google/callback',                integrations.googleCallback);
app.post('/api/integrations/green-invoice',            auth, integrations.connectGreenInvoice);
app.post('/api/integrations/whatsapp/request-otp',     auth, integrations.whatsappRequestOtp);
app.post('/api/integrations/whatsapp/verify-otp',      auth, integrations.whatsappVerifyOtp);
app.post('/api/integrations/whatsapp/webhook',              integrations.whatsappWebhook);
app.patch('/api/integrations/:id/config',              auth, integrations.updateConfig);
app.post('/api/integrations/:id/sync',                 auth, integrations.triggerSync);
app.delete('/api/integrations/:id',                    auth, integrations.remove);

// Auto-sync cron: every minute, trigger integrations whose cadence interval has elapsed
const cron     = require('node-cron');
const supabase = require('./lib/supabase');
const sync     = require('./services/syncProcessor');

const CADENCE_MS = { hourly: 3600000, daily: 86400000, weekly: 604800000 };

cron.schedule('* * * * *', async () => {
  try {
    const { data: rows } = await supabase
      .from('integrations')
      .select('*')
      .eq('status', 'connected')
      .in('type', ['google_drive', 'gmail']);

    if (!rows?.length) return;
    const now = Date.now();

    for (const integration of rows) {
      if (!integration.config?.auto_sync) continue;
      const interval = CADENCE_MS[integration.config?.cadence] || CADENCE_MS.daily;
      const lastSync = integration.last_sync ? new Date(integration.last_sync).getTime() : 0;
      if (now - lastSync < interval) continue;

      // Fire-and-forget per integration
      (async () => {
        try {
          const fn = integration.type === 'google_drive' ? sync.syncGoogleDrive : sync.syncGmail;
          const added = await fn(integration, integration.user_id);
          await supabase.from('integrations').update({
            last_sync:     new Date().toISOString(),
            sync_count:    (integration.sync_count || 0) + added,
            status:        'connected',
            error_message: null,
          }).eq('id', integration.id);
          if (added > 0) console.log(`[cron] ${integration.type} user=${integration.user_id}: +${added}`);
        } catch (err) {
          console.error(`[cron] ${integration.id}:`, err.message);
          await supabase.from('integrations')
            .update({ status: 'error', error_message: err.message })
            .eq('id', integration.id);
        }
      })();
    }
  } catch (err) {
    console.error('[cron] scheduler:', err.message);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server → http://localhost:${PORT}`));
