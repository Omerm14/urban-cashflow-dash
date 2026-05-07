require('dotenv').config({ path: '.env.local' });
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { readFileSync, writeFileSync, existsSync } = require('fs');

const app = express();
app.use(express.json({ limit: '20mb' }));

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set in .env.local');
  process.exit(1);
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── usage persistence ──────────────────────────────────────────────────────────
const USAGE_FILE = './usage.json';
const loadUsage = () =>
  existsSync(USAGE_FILE)
    ? JSON.parse(readFileSync(USAGE_FILE, 'utf8'))
    : { calls: [], byUser: {} };

const saveUsage = data => writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));

const recordUsage = (userId, model, inputTokens, outputTokens) => {
  const usage = loadUsage();
  usage.calls.push({
    ts: new Date().toISOString(),
    userId,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });
  const u = usage.byUser[userId] ??= { input_tokens: 0, output_tokens: 0, calls: 0 };
  u.input_tokens  += inputTokens;
  u.output_tokens += outputTokens;
  u.calls         += 1;
  saveUsage(usage);
};

// ── extraction endpoint ────────────────────────────────────────────────────────
app.post('/api/extract', async (req, res) => {
  const { b64, mediaType = 'image/jpeg', supplierNames = '', userId = 'anonymous' } = req.body;
  if (!b64) return res.status(400).json({ error: 'Missing image data' });

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: 'Extract invoice data. Return ONLY valid JSON: { "supplier": string, "invoiceNo": string, "invoiceDate": "YYYY-MM-DD", "amount": number }. No markdown.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: supplierNames ? `Known suppliers: ${supplierNames}` : 'Extract the invoice fields.' },
        ],
      }],
    });

    recordUsage(userId, msg.model, msg.usage.input_tokens, msg.usage.output_tokens);

    const text = msg.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    res.json({ result: JSON.parse(text) });
  } catch (err) {
    console.error('Extract error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── usage dashboard endpoint ───────────────────────────────────────────────────
app.get('/api/usage', (_req, res) => res.json(loadUsage()));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API server → http://localhost:${PORT}`));
