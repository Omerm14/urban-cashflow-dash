// POST /api/extract — manual single-page OCR for the browser upload flow.
// All prompts / JSON parsing live in lib/extraction.js so this path stays in
// lockstep with the integration sync path (same supplier/date/credit rules).
const extraction = require('../lib/extraction');

module.exports = async (req, res) => {
  const { b64, mediaType = 'image/jpeg', text, mode } = req.body;
  if (!b64 && !text) return res.status(400).json({ error: 'Missing image or text data' });

  try {
    let result;
    if (mode === 'translate') {
      result = await extraction.translate(text, req.user.id);
    } else if (b64) {
      result = await extraction.extractFromImageB64(b64, mediaType, req.user.id);
    } else {
      result = await extraction.extractFromText(text, req.user.id);
    }
    console.log('[extract] raw result:', JSON.stringify(result));
    res.json({ result });
  } catch (err) {
    console.error('Extract error:', err.message);
    const friendly = err.error?.error?.message || err.message;
    res.status(err.status || 500).json({ error: friendly });
  }
};
