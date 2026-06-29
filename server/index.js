require('dotenv').config({ path: '.env.local' });
const express = require('express');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set in .env.local');
  process.exit(1);
}

const app  = express();
const auth = require('./middleware/auth');

// WhatsApp webhook — registered BEFORE global json parser so it gets its own
// body handling. express.raw() reads the body as a Buffer, preserving it for
// HMAC verification, then we manually parse to req.body.
const webhook = require('./routes/webhook');
app.get('/api/webhook/whatsapp', webhook.verifyWhatsApp);
app.post('/api/webhook/whatsapp',
  express.raw({ type: '*/*', limit: '20mb' }),
  (req, res, next) => {
    req.rawBody = req.body; // Buffer
    try { req.body = req.body.length ? JSON.parse(req.body.toString()) : {}; } catch { req.body = {}; }
    next();
  },
  webhook.handleWhatsApp,
);

app.use(express.json({ limit: '20mb' }));

app.post('/api/extract',    auth, require('./routes/extract'));
app.get('/api/admin/usage',      require('./routes/admin'));

// Integrations
const integrations = require('./routes/integrations');
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
const invoices = require('./routes/invoices');
app.delete('/api/invoices/:id',           auth, invoices.remove);
app.post('/api/invoices/bulk-delete',     auth, invoices.bulkRemove);
app.post('/api/attachments/presign',      auth, invoices.presignUpload);

// Billing — Meshulam IPN has no auth; rest uses auth middleware
const billingRoutes = require('./routes/billing');
app.post('/api/billing/ipn', billingRoutes.ipn);
app.use('/api/billing', auth, billingRoutes.router);

// Cron (secured by CRON_SECRET header)
app.get('/api/cron/sync', require('./routes/cron').runSync);
app.get('/api/cron/gc',   require('./routes/gc').runGc);
app.get('/api/cron/migrate', require('./routes/migrate').runMigrate);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[express]', err.message);
  if (!res.headersSent) res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server → http://localhost:${PORT}`));
