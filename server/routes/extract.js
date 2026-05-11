const Anthropic = require('@anthropic-ai/sdk');
const supabase  = require('../lib/supabase');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  const { b64, mediaType = 'image/jpeg', text, supplierNames = '' } = req.body;
  if (!b64 && !text) return res.status(400).json({ error: 'Missing image or text data' });

  try {
    const supplierHint = supplierNames
      ? ` If the supplier matches one of these known suppliers, use that exact name: ${supplierNames}.`
      : '';

    const messageContent = text
      ? [{ type: 'text', text: `Extract invoice fields from the following invoice text.${supplierHint} Return ONLY valid JSON.\n\n${text}` }]
      : [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text',  text: `Extract the invoice fields from this image. For "supplier", read the vendor/supplier name from the invoice.${supplierHint}` },
        ];

    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:     'You are an invoice data extractor. Analyze the input and return ONLY valid JSON: { "supplier": string, "invoiceNo": string, "invoiceDate": "YYYY-MM-DD", "amount": number }. No markdown, no explanation.',
      messages: [{ role: 'user', content: messageContent }],
    });

    // fire-and-forget: log usage to Supabase without blocking response
    supabase.from('api_calls').insert({
      user_id:       req.user.id,
      model:         msg.model,
      input_tokens:  msg.usage.input_tokens,
      output_tokens: msg.usage.output_tokens,
    }).then(({ error }) => { if (error) console.error('Usage insert error:', error.message) });

    const responseText = msg.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    res.json({ result: JSON.parse(responseText) });
  } catch (err) {
    console.error('Extract error:', err.message);
    const friendly = err.error?.error?.message || err.message;
    res.status(err.status || 500).json({ error: friendly });
  }
};
