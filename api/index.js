require('dotenv').config({ path: '.env.local' });
const express = require('express');

const app  = express();
const auth = require('../server/middleware/auth');
app.use(express.json({ limit: '20mb' }));

app.post('/api/extract',    auth, require('../server/routes/extract'));
app.get('/api/admin/usage',      require('../server/routes/admin'));

// Integrations
const integrations = require('../server/routes/integrations');
app.get('/api/integrations',                       auth, integrations.list);
app.delete('/api/integrations/:id',                auth, integrations.remove);
app.get('/api/integrations/google/auth-url',       auth, integrations.googleAuthUrl);
app.get('/api/integrations/google/callback',            integrations.googleCallback);
app.post('/api/integrations/green-invoice',        auth, integrations.connectGreenInvoice);
app.patch('/api/integrations/:id/config',          auth, integrations.updateConfig);
app.post('/api/integrations/:id/sync',             auth, integrations.triggerSync);

module.exports = app;
