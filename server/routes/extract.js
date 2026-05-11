const Anthropic = require('@anthropic-ai/sdk');
const supabase  = require('../lib/supabase');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  const { b64, mediaType = 'image/jpeg', supplierNames = '' } = req.body;
  if (!b64) return res.status(400).json({ error: 'Missing image data' });

  try {
    const userText = supplierNames
      ? `Extract the invoice fields from this image. For "supplier", read the vendor/supplier name from the invoice. If it matches one of these known suppliers, return that exact name: ${supplierNames}. Otherwise return the name as shown on the invoice.`
      : 'Extract the invoice fields from this image.';

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:     'You are an invoice data extractor. Analyze invoice images and return ONLY valid JSON: { "supplier": string, "invoiceNo": string, "invoiceDate": "YYYY-MM-DD", "amount": number }. No markdown, no explanation.',
      messages: [{
        role:    'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text',  text: userText },
        ],
      }],
    });

    // fire-and-forget: log usage to Supabase without blocking response
    supabase.from('api_calls').insert({
      user_id:       req.user.id,
      model:         msg.model,
      input_tokens:  msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
    }).then(({ error }) => { if (error) console.error('Usage insert error:', error.message) });

    const text = msg.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    res.json({ result: JSON.parse(text) });
  } catch (err) {
    console.error('Extract error:', err.message);
    // Anthropic SDK errors carry a parsed body in err.error; surface just the message
    const friendly = err.error?.error?.message || err.message;
    res.status(err.status || 500).json({ error: friendly });
  }
};
