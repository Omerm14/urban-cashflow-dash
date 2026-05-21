require('dotenv').config({ path: '.env.local' });
const express = require('express');

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
