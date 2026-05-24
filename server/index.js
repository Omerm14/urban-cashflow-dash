require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cron    = require('node-cron');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set in .env.local');
  process.exit(1);
}

const app  = express();
const auth = require('./middleware/auth');
app.use(express.json({ limit: '20mb' }));

app.post('/api/extract',    auth, require('./routes/extract'));
app.get('/api/admin/usage',      require('./routes/admin'));

// Integrations
const integrations = require('./routes/integrations');
app.get('/api/integrations',                               auth, integrations.list);
app.delete('/api/integrations/:id',                        auth, integrations.remove);
app.get('/api/integrations/google/auth-url',               auth, integrations.googleAuthUrl);
app.get('/api/integrations/google/callback',                    integrations.googleCallback);
app.get('/api/integrations/google/access-token',           auth, integrations.googleAccessToken);
app.get('/api/integrations/google/drive/folders',          auth, integrations.driveFolders);
app.get('/api/integrations/google/drive/folder-info',      auth, integrations.driveFolderInfo);
app.get('/api/integrations/gmail/labels',                  auth, integrations.gmailLabels);
app.get('/api/integrations/gmail/recent-senders',          auth, integrations.gmailRecentSenders);
app.get('/api/integrations/green-invoice/preview',         auth, integrations.greenInvoicePreview);
app.post('/api/integrations/green-invoice',                auth, integrations.connectGreenInvoice);
app.post('/api/integrations/whatsapp/connect',             auth, integrations.connectWhatsapp);
app.patch('/api/integrations/:id/config',                  auth, integrations.updateConfig);
app.post('/api/integrations/:id/sync',                     auth, integrations.triggerSync);

// WhatsApp webhook (no auth — verified by Meta signature token)
const waWebhook = require('./routes/whatsappWebhook');
app.get('/api/webhooks/whatsapp',  waWebhook.verify);
app.post('/api/webhooks/whatsapp', waWebhook.receive);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server → http://localhost:${PORT}`));

// ─── Auto-sync cron (every 15 min) ───────────────────────────────────────────

const supabaseServer     = require('./lib/supabase');
const { syncGoogleDrive, syncGmail, syncGreenInvoice } = require('./services/syncProcessor');

const CADENCE_MS = {
  hourly:    3_600_000,
  every_4h: 14_400_000,
  daily:    86_400_000,
  weekly:  604_800_000,
};

const SYNC_FN = { google_drive: syncGoogleDrive, gmail: syncGmail, green_invoice: syncGreenInvoice };

cron.schedule('*/15 * * * *', async () => {
  try {
    const { data: rows, error } = await supabaseServer
      .from('integrations')
      .select('id, type, user_id, config, last_sync')
      .eq('status', 'connected');

    if (error) { console.error('[cron] fetch error:', error.message); return; }

    const now = Date.now();
    for (const row of rows || []) {
      if (!row.config?.setup_complete || !row.config?.auto_sync) continue;
      const fn = SYNC_FN[row.type];
      if (!fn) continue;
      const cadenceMs = CADENCE_MS[row.config.cadence];
      if (!cadenceMs) continue;
      const lastMs = row.last_sync ? new Date(row.last_sync).getTime() : 0;
      if (now - lastMs < cadenceMs) continue;
      fn(row, row.user_id).catch(err =>
        console.error(`[cron] sync ${row.type}/${row.id} failed:`, err.message)
      );
    }
  } catch (err) {
    console.error('[cron] unexpected error:', err.message);
  }
});
