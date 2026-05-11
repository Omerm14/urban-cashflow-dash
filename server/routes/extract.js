const Anthropic = require('@anthropic-ai/sdk');
const supabase  = require('../lib/supabase');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  const { b64, mediaType = 'image/jpeg', text, supplierNames = '' } = req.body;
  if (!b64 && !text) return res.status(400).json({ error: 'Missing image or text data' });

  try {
    const supplierHint = supplierNames
      ? `\n- supplier: The company that ISSUED this invoice (the seller/vendor). It appears in the header or letterhead. NEVER use the buyer/customer/recipient name. You MUST use the exact name from this list that best matches the issuing company: ${supplierNames}.`
      : '\n- supplier: The company that ISSUED this invoice (the seller/vendor shown in the header/letterhead). Never the buyer or recipient.';

    const fields = `\n- invoiceNo: Invoice number as printed.\n- invoiceDate: Invoice date in YYYY-MM-DD format.\n- amount: Final total amount including VAT/tax, as a plain number.`;

    const instruction = `Extract the following fields from this invoice:${supplierHint}${fields}\n\nReturn ONLY valid JSON: {"supplier":"...","invoiceNo":"...","invoiceDate":"YYYY-MM-DD","amount":0}. No markdown.`;

    const messageContent = text
      ? [{ type: 'text', text: `${instruction}\n\n${text}` }]
      : [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text',  text: instruction },
        ];

    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 256,
      system:     'You are an invoice data extractor. Return ONLY valid JSON, no markdown, no explanation.',
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
