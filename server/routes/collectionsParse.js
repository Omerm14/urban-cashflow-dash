// POST /api/collections/parse — one-time history import for the Collections tab.
// Sends pasted SMS / phone-note text to Claude and returns normalized receivable
// rows for the user to review. Parse only: this route never reads or writes the
// database (the browser saves the reviewed rows itself, under RLS).
const extraction = require('../lib/extraction');
const { normalizeParsedCollections } = require('../lib/collectionsImport');

// Kept small so one Claude call (and its JSON output) fits well inside Vercel's 60s
// function limit; the browser splits longer pastes into several requests.
const MAX_CHARS = 8000;

const todayISO = () => {
  // Israel local date — the user's "today" for relative words like "אתמול".
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
};

module.exports = async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'Missing text' });
  if (text.length > MAX_CHARS) return res.status(400).json({ error: 'TEXT_TOO_LONG', max: MAX_CHARS });

  try {
    const raw = await extraction.extractCollectionsFromText(text, req.user.id, todayISO());
    res.json({ items: normalizeParsedCollections(raw) });
  } catch (err) {
    console.error('Collections parse error:', err.error?.error?.message || err.message);
    res.status(err.status || 500).json({ error: 'Internal server error' });
  }
};

module.exports.MAX_CHARS = MAX_CHARS;
