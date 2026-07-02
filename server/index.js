require('dotenv').config({ path: '.env.local' });
const express = require('express');

['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FRONTEND_URL'].forEach(k => {
  if (!process.env[k]) { console.error(`ERROR: ${k} not set in .env.local`); process.exit(1); }
});

const app       = express();
const auth      = require('./middleware/auth');
const rateLimit = require('express-rate-limit');

// Trust exactly one hop (Vercel's edge proxy) so req.ip resolves to the real
// client IP instead of the proxy address. `true`/trust-all would let clients
// spoof X-Forwarded-For and bypass per-client rate limiting.
app.set('trust proxy', 1);

// Protect expensive endpoints from abuse while allowing generous legitimate use.
// Limits are per-IP; well above any real single-user burst.
const extractLimiter   = rateLimit({ windowMs: 60_000,      max: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please slow down' } });
const syncLimiter      = rateLimit({ windowMs: 60_000,      max: 10,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sync requests, please wait' } });
const googleApiLimiter = rateLimit({ windowMs: 60_000,      max: 20,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
const accountLimiter   = rateLimit({ windowMs: 3_600_000,   max: 3,   standardHeaders: true, legacyHeaders: false, message: { error: 'Too many account operations, please wait' } });

// WhatsApp + Stripe webhooks registered BEFORE global json parser — both need
// rawBody preserved for signature verification (HMAC / Stripe-Signature).
const webhook = require('./routes/webhook');
app.get('/api/webhook/whatsapp', webhook.verifyWhatsApp);
app.post('/api/webhook/whatsapp',
  (req, res, next) => {
    // Vercel may pre-consume the stream; if body is already an object, skip raw capture.
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return next();
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      req.rawBody = buf;
      try { req.body = buf.length ? JSON.parse(buf.toString()) : {}; } catch { req.body = {}; }
      next();
    });
    req.on('error', () => next());
  },
  webhook.handleWhatsApp,
);

const stripeRoutes = require('./routes/stripe');
app.post('/api/stripe/webhook',
  (req, res, next) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      req.rawBody = buf.toString();
      try { req.body = buf.length ? JSON.parse(buf.toString()) : {}; } catch { req.body = {}; }
      next();
    });
    req.on('error', () => next());
  },
  stripeRoutes.webhook,
);

app.use(express.json({ limit: '20mb' }));

app.post('/api/extract',    extractLimiter, auth, require('./routes/extract'));
app.get('/api/admin/usage',      require('./routes/admin'));

// Integrations
const integrations = require('./routes/integrations');
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
const invoices = require('./routes/invoices');
app.delete('/api/invoices/:id',           auth, invoices.remove);
app.post('/api/invoices/bulk-delete',     auth, invoices.bulkRemove);
app.post('/api/attachments/presign',      auth, invoices.presignUpload);

// Profile (logo upload)
app.post('/api/profile/logo', auth, require('./routes/profile').uploadLogo);

// Billing — Meshulam IPN has no auth; rest uses auth middleware
const billingRoutes = require('./routes/billing');
app.post('/api/billing/ipn', billingRoutes.ipn);
app.use('/api/billing', auth, billingRoutes.router);

// Stripe — authenticated API routes (checkout, portal, usage)
// Webhook is registered above the JSON parser to preserve rawBody for signature verification.
app.use('/api/stripe', auth, stripeRoutes.router);

// Cron (secured by CRON_SECRET header)
app.get('/api/cron/sync', require('./routes/cron').runSync);
app.get('/api/cron/gc',   require('./routes/gc').runGc);
app.get('/api/cron/migrate', require('./routes/migrate').runMigrate);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[express]', err.message, err.stack);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server → http://localhost:${PORT}`));
