const Anthropic = require('@anthropic-ai/sdk');
const storage   = require('../storage');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  const { b64, mediaType = 'image/jpeg', supplierNames = '', userId = 'anonymous' } = req.body;
  if (!b64) return res.status(400).json({ error: 'Missing image data' });

  try {
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:     'Extract invoice data. Return ONLY valid JSON: { "supplier": string, "invoiceNo": string, "invoiceDate": "YYYY-MM-DD", "amount": number }. No markdown.',
      messages: [{
        role:    'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text',  text: supplierNames ? `Known suppliers: ${supplierNames}` : 'Extract the invoice fields.' },
        ],
      }],
    });

    // fire-and-forget usage recording — don't block the response
    storage.record(userId, msg.model, msg.usage.input_tokens, msg.usage.output_tokens).catch(console.error);

    const text = msg.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    res.json({ result: JSON.parse(text) });
  } catch (err) {
    console.error('Extract error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
