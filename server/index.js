require('dotenv').config({ path: '.env.local' });
const express = require('express');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set in .env.local');
  process.exit(1);
}

const app  = express();
const auth = require('./middleware/auth');

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

// WhatsApp webhook (no auth — verified by HMAC signature)
const webhook = require('./routes/webhook');
app.get('/api/webhook/whatsapp',  webhook.verifyWhatsApp);
app.post('/api/webhook/whatsapp', webhook.handleWhatsApp);

// Cron (secured by CRON_SECRET header)
app.get('/api/cron/sync', require('./routes/cron').runSync);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[express]', err.message);
  if (!res.headersSent) res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server → http://localhost:${PORT}`));
