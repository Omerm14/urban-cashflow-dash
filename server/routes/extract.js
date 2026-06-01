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
      const prompt = `Extract invoice data from this document.

SUPPLIER — the company that ISSUED this invoice (they are owed money):
• The most reliable way to identify them: find the ח.פ. (company registration number) or ע.מ. (VAT number) printed on the document — the company name printed beside or near that number IS the supplier.
• For upside-down scanned pages: the letterhead (company name + ח.פ./ע.מ.) will appear at the BOTTOM of the rendered image. Look there.
• PRODUCT BRANDS ARE NOT SUPPLIERS: Israeli invoices list purchased items (dairy, poultry, produce, beverages, etc.) with brand names like גליל, תנובה, שטראוס, עלית, and many others. These are the products being sold, NOT the issuer of the invoice. Never extract a food product brand, item description, or packaging text as the supplier.
• The fields "לכבוד", "שם לקוח", "נמען", "עבור" contain the BUYER/RECIPIENT — do NOT use any name from these fields as the supplier.
• Use the LEGAL registered company name as it appears next to ח.פ./ע.מ. — not a trade name or product line.

INVOICE DATE — Israeli format is DD/MM/YYYY or DD/MM/YY (day first, then month, then year):
• "14/04/26" → 2026-04-14   "04/01/2025" → 2025-01-04   "31/12/24" → 2024-12-31
• Convert to ISO format YYYY-MM-DD in your output.

INVOICE NUMBER: the number next to חשבונית מס׳ / מספר חשבונית / Invoice No.
AMOUNT: the final total (סה"כ לתשלום / Total) as a positive number.

Return ONLY valid JSON — no markdown, no explanation:
{"supplier":"<legal company name from letterhead>","invoiceNo":"<invoice number>","invoiceDate":"<YYYY-MM-DD>","amount":<positive number>}`;
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
