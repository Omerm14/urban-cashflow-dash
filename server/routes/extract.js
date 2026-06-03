const Anthropic = require('@anthropic-ai/sdk');
const supabase  = require('../lib/supabase');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async (req, res) => {
  const { b64, mediaType = 'image/jpeg', text } = req.body;
  if (!b64 && !text) return res.status(400).json({ error: 'Missing image or text data' });

  try {
    const { mode } = req.body;

    // The system prompt is identical across calls, so cache_control lets the model reuse it
    // as a cached prefix during bulk runs. Per-document content (image/text) stays in the
    // user message where it varies per request.
    let system, messageContent;
    if (mode === 'translate') {
      system = `You are a transliteration assistant. The user provides an Israeli company name written in English. Transliterate/translate it to Hebrew as it appears on Israeli business documents. Return ONLY valid JSON: {"hebrew":"<Hebrew company name>"}. No markdown, no explanation.`;
      messageContent = [{ type: 'text', text: `Company name: ${text}` }];
    } else {
      system = `Extract invoice data from this document.

SUPPLIER — the company that ISSUED this invoice (they are owed money):
• The most reliable identifier: find the ח.פ. (company registration number) or ע.מ. (VAT number) on the document — the company name printed beside that number IS the supplier. This works regardless of page orientation.
• PRODUCT BRANDS ARE NOT SUPPLIERS: invoices list purchased products with brand names (e.g. גליל, תנובה, שטראוס, עלית). These are products being sold, NOT the invoice issuer. Never use a food/product brand or line-item description as the supplier.
• The fields "לכבוד", "שם לקוח", "נמען", "עבור" contain the BUYER — do NOT use any name from these fields as the supplier.
• Use the LEGAL registered company name as it appears next to ח.פ./ע.מ. — not a trade name or product line.

INVOICE DATE — Israeli format is DD/MM/YYYY or DD/MM/YY (day first, then month, then year):
• "14/04/26" → 2026-04-14   "04/01/2025" → 2025-01-04   "31/12/24" → 2024-12-31
• Convert to ISO format YYYY-MM-DD in your output.

INVOICE NUMBER: the number next to חשבונית מס׳ / מספר חשבונית / Invoice No.
AMOUNT: the final total (סה"כ לתשלום / Total) as a positive number.

Return ONLY valid JSON — no markdown, no explanation:
{"supplier":"<legal company name from letterhead>","invoiceNo":"<invoice number>","invoiceDate":"<YYYY-MM-DD>","amount":<positive number>}`;
      messageContent = text
        ? [{ type: 'text', text }]
        : [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }];
    }

    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
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
