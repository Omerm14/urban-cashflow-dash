// Normalizes Claude's raw Collections-import output into rows safe to show in the
// review table. Pure — no DB, no network. The browser is still the one that saves
// (under RLS) after the user reviews; this just guarantees well-formed values.

// Mirrors PAYMENT_METHODS in src/utils/collections.js and the CHECK in migration 021.
const PAYMENT_METHODS = ['bank_transfer', 'credit_card', 'cash', 'cheque', 'bit_paybox', 'other'];
const MAX_ROWS = 500;
const MAX_NAME = 120;
const MAX_TEXT = 300;

const isIsoDate = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100;
};

const cleanText = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

const toAmount = v => {
  if (typeof v === 'string') v = v.replace(/[₪,\s]/g, '').replace(/ש"?ח/g, '');
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
};

// Returns [{ customer, amount, expected_date, collected_date, reference, description, source }].
// A collected entry with no expected date borrows its collected date (the only date we have).
const normalizeParsedCollections = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const customer = cleanText(item.customer, MAX_NAME);
    const amount = toAmount(item.amount);
    if (!customer || amount === null) continue;
    const collected = isIsoDate(item.collected_date) ? item.collected_date : null;
    let expected = isIsoDate(item.expected_date) ? item.expected_date : null;
    if (!expected && collected) expected = collected;
    out.push({
      customer,
      amount,
      expected_date: expected,
      collected_date: collected,
      payment_method: collected && PAYMENT_METHODS.includes(item.payment_method) ? item.payment_method : null,
      reference: cleanText(item.reference, MAX_NAME),
      description: cleanText(item.description, MAX_TEXT),
      source: cleanText(item.source, MAX_TEXT),
    });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
};

module.exports = { normalizeParsedCollections, isIsoDate, MAX_ROWS, PAYMENT_METHODS };
