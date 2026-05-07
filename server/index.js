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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server → http://localhost:${PORT}`));
