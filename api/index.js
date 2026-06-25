require('dotenv').config({ path: '.env.local' });
const express = require('express');

const app  = express();
const auth = require('../server/middleware/auth');

// Capture raw body for webhook signature verification before JSON parsing
app.use((req, res, next) => {
  if (req.path === '/api/webhook/whatsapp' && req.method === 'POST') {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { req.rawBody = data; next(); });
  } else {
    next();
  }
});

app.use(express.json({ limit: '20mb' }));

app.post('/api/extract',    auth, require('../server/routes/extract'));
app.get('/api/admin/usage',      require('../server/routes/admin'));

// Integrations
const integrations = require('../server/routes/integrations');
app.get('/api/integrations',                        auth, integrations.list);
app.delete('/api/integrations/:id',                 auth, integrations.remove);
app.get('/api/integrations/google/auth-url',        auth, integrations.googleAuthUrl);
app.get('/api/integrations/google/callback',             integrations.googleCallback);
app.get('/api/integrations/google/folders',         auth, integrations.googleFolders);
app.get('/api/integrations/google/labels',          auth, integrations.googleLabels);
app.get('/api/integrations/:id/events',             auth, integrations.listEvents);
app.post('/api/integrations/:id/resync',            auth, integrations.resync);
app.post('/api/integrations/green-invoice',         auth, integrations.connectGreenInvoice);
app.post('/api/integrations/whatsapp',              auth, integrations.connectWhatsApp);
app.patch('/api/integrations/:id/config',           auth, integrations.updateConfig);
app.patch('/api/integrations/:id/auto-sync',        auth, integrations.updateAutoSync);
app.post('/api/integrations/:id/sync',              auth, integrations.triggerSync);
app.post('/api/sync-jobs/:jobId/process',           auth, integrations.processSyncJob);
app.post('/api/sync-jobs/:jobId/cancel',            auth, integrations.cancelSyncJob);
app.get('/api/notifications',                       auth, integrations.listNotifications);
app.get('/api/invoices/:id/attachment-url',          auth, integrations.getAttachmentUrl);

// Invoice mutations that also touch object storage
const invoices = require('../server/routes/invoices');
app.delete('/api/invoices/:id',           auth, invoices.remove);
app.post('/api/invoices/bulk-delete',     auth, invoices.bulkRemove);
app.post('/api/attachments/presign',      auth, invoices.presignUpload);

// WhatsApp webhook (no auth — verified by HMAC signature)
const webhook = require('../server/routes/webhook');
app.get('/api/webhook/whatsapp',  webhook.verifyWhatsApp);
app.post('/api/webhook/whatsapp', webhook.handleWhatsApp);

// Billing (Meshulam)
const billing = require('../server/routes/billing');
app.post('/api/billing/ipn', billing.ipn);
app.use('/api/billing', auth, billing.router);

// Account management
app.delete('/api/account', auth, require('../server/routes/account').deleteAccount);

// Cron (secured by CRON_SECRET header)
app.get('/api/cron/sync', require('../server/routes/cron').runSync);
app.get('/api/cron/gc',   require('../server/routes/gc').runGc);
app.get('/api/cron/migrate', require('../server/routes/migrate').runMigrate);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[express]', err.message);
  if (!res.headersSent) res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
