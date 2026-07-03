require('dotenv').config({ path: '.env.local' });
const express = require('express');

const app  = express();
const auth = require('../server/middleware/auth');

// Trust exactly one hop (Vercel's edge proxy) so req.ip resolves to the real
// client IP instead of the proxy address. `true`/trust-all would let clients
// spoof X-Forwarded-For and bypass per-client rate limiting.
app.set('trust proxy', 1);

// WhatsApp webhook must be registered BEFORE global json parser.
// We capture rawBody here for HMAC signature verification.
const webhook = require('../server/routes/webhook');
app.get('/api/webhook/whatsapp', webhook.verifyWhatsApp);
app.post('/api/webhook/whatsapp',
  express.raw({ type: '*/*', limit: '20mb' }),
  (req, res, next) => {
    req.rawBody = req.body;          // Buffer from express.raw
    try { req.body = JSON.parse(req.rawBody.toString()); } catch { req.body = {}; }
    next();
  },
  webhook.handleWhatsApp,
);

// Stripe webhook also needs the raw body (Stripe-Signature verification) and
// must be registered before the global json parser — mirrors server/index.js.
const stripeRoutes = require('../server/routes/stripe');
app.post('/api/stripe/webhook',
  express.raw({ type: '*/*', limit: '2mb' }),
  (req, res, next) => {
    req.rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : '';
    try { req.body = req.rawBody ? JSON.parse(req.rawBody) : {}; } catch { req.body = {}; }
    next();
  },
  stripeRoutes.webhook,
);

app.use(express.json({ limit: '20mb' }));

// Per-IP rate limits on expensive endpoints — same values as server/index.js
// (tests/routeParity.test.js keeps the two route tables from drifting again).
const rateLimit = require('express-rate-limit');
const extractLimiter   = rateLimit({ windowMs: 60_000,    max: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please slow down' } });
const syncLimiter      = rateLimit({ windowMs: 60_000,    max: 10,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sync requests, please wait' } });
const googleApiLimiter = rateLimit({ windowMs: 60_000,    max: 20,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
const accountLimiter   = rateLimit({ windowMs: 3_600_000, max: 3,   standardHeaders: true, legacyHeaders: false, message: { error: 'Too many account operations, please wait' } });

app.post('/api/extract',    extractLimiter, auth, require('../server/routes/extract'));
app.get('/api/admin/usage',      require('../server/routes/admin'));

// Integrations
const integrations = require('../server/routes/integrations');
app.get('/api/integrations',                        auth, integrations.list);
app.delete('/api/integrations/:id',                 auth, integrations.remove);
app.get('/api/integrations/google/auth-url',        auth, integrations.googleAuthUrl);
app.get('/api/integrations/google/callback',             integrations.googleCallback);
app.get('/api/integrations/google/folders',         googleApiLimiter, auth, integrations.googleFolders);
app.get('/api/integrations/google/labels',          googleApiLimiter, auth, integrations.googleLabels);
app.get('/api/integrations/:id/events',             auth, integrations.listEvents);
app.post('/api/integrations/:id/resync',            auth, integrations.resync);
app.post('/api/integrations/green-invoice',         auth, integrations.connectGreenInvoice);
app.post('/api/integrations/whatsapp',              auth, integrations.connectWhatsApp);
app.patch('/api/integrations/:id/config',           auth, integrations.updateConfig);
app.patch('/api/integrations/:id/auto-sync',        auth, integrations.updateAutoSync);
app.post('/api/integrations/:id/sync',              syncLimiter, auth, integrations.triggerSync);
app.post('/api/sync-jobs/:jobId/process',           auth, integrations.processSyncJob);
app.post('/api/sync-jobs/:jobId/cancel',            auth, integrations.cancelSyncJob);
app.get('/api/notifications',                       auth, integrations.listNotifications);
app.get('/api/invoices/:id/attachment-url',          auth, integrations.getAttachmentUrl);

// Invoice mutations that also touch object storage
const invoices = require('../server/routes/invoices');
app.delete('/api/invoices/:id',           auth, invoices.remove);
app.post('/api/invoices/bulk-delete',     auth, invoices.bulkRemove);
app.post('/api/attachments/presign',      auth, invoices.presignUpload);


// Profile (logo upload)
app.post('/api/profile/logo', auth, require('../server/routes/profile').uploadLogo);

// Billing (Meshulam)
const billing = require('../server/routes/billing');
app.post('/api/billing/ipn', billing.ipn);
app.use('/api/billing', auth, billing.router);

// Billing (Stripe — global market; both systems write the subscriptions table)
app.use('/api/stripe', auth, stripeRoutes.router);

// Account management (strict rate limit — permanent destructive operation)
app.delete('/api/account', accountLimiter, auth, require('../server/routes/account').deleteAccount);

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
