// POST /api/extract — manual single-page OCR for the browser upload flow.
// All prompts / JSON parsing live in lib/extraction.js so this path stays in
// lockstep with the integration sync path (same supplier/date/credit rules).
const extraction = require('../lib/extraction');
const { checkInvoiceLimit } = require('../lib/plans');

module.exports = async (req, res) => {
  const { b64, mediaType = 'image/jpeg', text, mode } = req.body;
  if (!b64 && !text) return res.status(400).json({ error: 'Missing image or text data' });

  // Invoice caps are soft — never refuse extraction, just track usage.
  // Translations don't create invoices — skip the check for that mode.
  if (mode !== 'translate') {
    await checkInvoiceLimit(req.user.id);
  }

  try {
    let result;
    if (mode === 'translate') {
      result = await extraction.translate(text, req.user.id);
    } else if (b64) {
      result = await extraction.extractFromImageB64(b64, mediaType, req.user.id);
    } else {
      result = await extraction.extractFromText(text, req.user.id);
    }
    res.json({ result });
  } catch (err) {
    console.error('Extract error:', err.error?.error?.message || err.message);
    res.status(err.status || 500).json({ error: 'Internal server error' });
  }
};
