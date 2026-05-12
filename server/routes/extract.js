const Anthropic = require('@anthropic-ai/sdk');
const supabase  = require('../lib/supabase');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  const { b64, mediaType = 'image/jpeg', text } = req.body;
  if (!b64 && !text) return res.status(400).json({ error: 'Missing image or text data' });

  try {
    const { mode } = req.body;

    let messageContent;
    if (mode === 'translate') {
      const translatePrompt = `You are a transliteration assistant. The following is an Israeli company name written in English. Transliterate/translate it to Hebrew as it appears on Israeli business documents. Return ONLY valid JSON: {"hebrew":"<Hebrew company name>"}. No markdown, no explanation.\n\nCompany name: ${text}`;
      messageContent = [{ type: 'text', text: translatePrompt }];
    } else {
      const prompt = `Extract data from this invoice or statement. The "supplier" is the company that ISSUED this document and is owed payment — the seller/creditor whose name appears in the document header or letterhead. Do NOT return the recipient or buyer name. All dates on this document follow Israeli format: DD/MM/YYYY or DD/MM/YY (day first, then month, then year). A two-digit year means 20YY — for example "14/04/26" means 14 April 2026, not 2014. Return ONLY valid JSON: {"supplier":"<issuer company name>","invoiceNo":"<invoice number>","invoiceDate":"<YYYY-MM-DD>","amount":<total amount as number>}. No markdown, no explanation.`;
      messageContent = text
        ? [{ type: 'text', text: `${prompt}\n\n${text}` }]
        : [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
            { type: 'text',  text: prompt },
          ];
    }

    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
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
    const parsed = JSON.parse(responseText);
    console.log('[extract] raw result:', JSON.stringify(parsed));
    res.json({ result: parsed });
  } catch (err) {
    console.error('Extract error:', err.message);
    const friendly = err.error?.error?.message || err.message;
    res.status(err.status || 500).json({ error: friendly });
  }
};
