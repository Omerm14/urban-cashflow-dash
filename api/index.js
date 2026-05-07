require('dotenv').config({ path: '.env.local' });
const express = require('express');

const app  = express();
const auth = require('../server/middleware/auth');
app.use(express.json({ limit: '20mb' }));

app.post('/api/extract',    auth, require('../server/routes/extract'));
app.get('/api/admin/usage',      require('../server/routes/admin'));

module.exports = app;
