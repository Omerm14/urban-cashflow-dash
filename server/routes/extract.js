// POST /api/extract — manual single-page OCR for the browser upload flow.
// All prompts / JSON parsing live in lib/extraction.js so this path stays in
// lockstep with the integration sync path (same supplier/date/credit rules).
const extraction = require('../lib/extraction');
const { assertInvoiceLimit } = require('../lib/plans');

module.exports = async (req, res) => {
  const { b64, mediaType = 'image/jpeg', text, mode } = req.body;
  if (!b64 && !text) return res.status(400).json({ error: 'Missing image or text data' });

  // Hard-blocks Claude API spend once a user is at/over their plan's monthly
  // invoice quota. Translate mode doesn't create an invoice row itself, but it
  // still costs a real Claude call, so it's gated by the same quota rather than
  // left to only the generic per-IP rate limit.
  try {
    await assertInvoiceLimit(req.user.id);
  } catch (limitErr) {
    if (limitErr.code === 'PLAN_LIMIT_REACHED') {
      return res.status(402).json({ error: limitErr.code, used: limitErr.used, limit: limitErr.limit, plan: limitErr.plan });
    }
    throw limitErr;
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
