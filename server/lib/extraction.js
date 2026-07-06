// Single source of truth for invoice OCR. Both the manual upload path
// (routes/extract.js) and the integration sync path (services/syncProcessor.js)
// call into here so the prompt, JSON parsing, and field rules never drift.

const Anthropic      = require('@anthropic-ai/sdk');
const supabase       = require('./supabase');
const { jsonrepair } = require('jsonrepair');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = 'claude-sonnet-4-6';

// ─── Prompt fragments ────────────────────────────────────────────────────────

const SUPPLIER_RULE = `SUPPLIER — the company that ISSUED this invoice (they are owed money):
• The most reliable identifier: find the ח.פ. (company registration number) or ע.מ. (VAT number) on the document — the company name printed beside that number IS the supplier. This works regardless of page orientation.
• PRODUCT BRANDS ARE NOT SUPPLIERS: invoices list purchased products with brand names (e.g. גליל, תנובה, שטראוס, עלית). These are products being sold, NOT the invoice issuer. Never use a food/product brand or line-item description as the supplier.
• The fields "לכבוד", "שם לקוח", "נמען", "עבור" contain the BUYER — do NOT use any name from these fields as the supplier.
• Use the LEGAL registered company name as it appears next to ח.פ./ע.מ. — not a trade name or product line.`;

const DATE_RULE = `INVOICE DATE — Israeli format is DD/MM/YYYY or DD/MM/YY (day first, then month, then year):
• "14/04/26" → 2026-04-14   "04/01/2025" → 2025-01-04   "31/12/24" → 2024-12-31
• Convert to ISO format YYYY-MM-DD in your output.`;

const CREDIT_RULE = `TYPE — use "credit" ONLY if the document title/header explicitly says חשבונית זיכוי, מסמך זיכוי, or Credit Note. Regular invoices that mention a refund in a line item are still "invoice". Default: "invoice".`;

const COMMON_FIELDS = `INVOICE NUMBER: the number next to חשבונית מס׳ / מספר חשבונית / Invoice No.
AMOUNT: the final total (סה"כ לתשלום / Total) as a positive number.`;

// Single image (JPG, PNG, rendered PDF page, WhatsApp attachment)
const EXTRACT_PROMPT = `Extract invoice data from this document.

${SUPPLIER_RULE}

${DATE_RULE}

${COMMON_FIELDS}

${CREDIT_RULE}

Return ONLY valid JSON — no markdown, no explanation:
{"supplier":"<legal company name from letterhead>","invoiceNo":"<invoice number>","invoiceDate":"<YYYY-MM-DD>","amount":<positive number>,"type":"invoice"}`;

// Multi-page PDF sent as a document
const EXTRACT_MULTI_PROMPT = `Extract ALL invoice data from this PDF. Each page is a SEPARATE, INDEPENDENT invoice from a DIFFERENT supplier.

IMPORTANT — PAGE INDEPENDENCE: Each page was scanned from a different physical document. Do NOT carry over the supplier name, invoice number, or any other field from one page to another. Identify each page completely on its own.

IMPORTANT — ROTATED SCANS: Some pages may be upside down or rotated (scanned in the wrong orientation). Read the text regardless of orientation. The company letterhead and ח.פ./ע.מ. number may appear at the bottom of the rendered page if the scan is upside down — still use them to identify the supplier.

${SUPPLIER_RULE}

${DATE_RULE}

${COMMON_FIELDS}

${CREDIT_RULE}

Return ONLY a valid JSON array — one object per invoice page, skip non-invoice pages, no markdown, no explanation:
[{"supplier":"<legal company name from letterhead>","invoiceNo":"<invoice number>","invoiceDate":"<YYYY-MM-DD>","amount":<positive number>,"type":"invoice"}]`;

const translatePrompt = name =>
  `You are a transliteration assistant. The following is an Israeli company name written in English. Transliterate/translate it to Hebrew as it appears on Israeli business documents. Return ONLY valid JSON: {"hebrew":"<Hebrew company name>"}. No markdown, no explanation.\n\nCompany name: ${name}`;

// ─── Robust JSON extraction ──────────────────────────────────────────────────
// Strip markdown fences, then repair malformed JSON (e.g. unescaped Hebrew
// quotes like בע"מ, trailing commas) via jsonrepair before parsing.
const extractJson = (text, wantArray) => {
  const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  if (wantArray) {
    const arr = clean.match(/\[[\s\S]*\]/);
    if (arr) { try { return JSON.parse(jsonrepair(arr[0])); } catch { /* fall through */ } }
  }
  const obj = clean.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      const parsed = JSON.parse(jsonrepair(obj[0]));
      return wantArray ? [parsed] : parsed;
    } catch { /* fall through */ }
  }
  throw new Error(`No valid JSON in Claude response: ${clean.slice(0, 120)}`);
};

// ─── Anthropic call with bounded retry/backoff ───────────────────────────────
// Retries transient 429/5xx/network errors; surfaces 4xx (bad request) at once.
// 429s get a much longer backoff than 5xx/network errors — sustained rate-limiting
// needs tens of seconds to clear, not the sub-second gap that's enough for a blip.
const DEFAULT_BACKOFF_MS    = [500, 1000];
const RATE_LIMIT_BACKOFF_MS = [30000, 60000];

const getRetryDelayMs = (attempt, isRateLimited) => {
  const table = isRateLimited ? RATE_LIMIT_BACKOFF_MS : DEFAULT_BACKOFF_MS;
  return table[Math.min(attempt - 1, table.length - 1)];
};

const callClaude = async ({ messages, maxTokens }) => {
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.messages.create({ model: MODEL, max_tokens: maxTokens, messages });
    } catch (err) {
      const status = err.status || err.statusCode;
      const isRateLimited = status === 429;
      const retryable = isRateLimited || status >= 500 || status === undefined;
      lastErr = err;
      if (!retryable || attempt === MAX_ATTEMPTS) break;
      await new Promise(r => setTimeout(r, getRetryDelayMs(attempt, isRateLimited)));
    }
  }
  throw lastErr;
};

// fire-and-forget usage logging
const logUsage = (userId, msg) => {
  if (!userId) return;
  supabase.from('api_calls').insert({
    user_id:       userId,
    model:         msg.model,
    input_tokens:  msg.usage.input_tokens,
    output_tokens: msg.usage.output_tokens,
  }).then(({ error }) => { if (error) console.error('usage log:', error.message); });
};

const collectText = msg => msg.content.map(b => b.text || '').join('').trim();

// ─── Public extraction API ───────────────────────────────────────────────────

// Buffer → array of extracted invoice objects (one for images, one+ for PDFs).
const extractFromBuffer = async (buffer, mediaType, userId) => {
  const isPdf = mediaType === 'application/pdf';
  const b64   = buffer.toString('base64');

  const content = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: EXTRACT_MULTI_PROMPT },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: EXTRACT_PROMPT },
      ];

  const msg = await callClaude({ messages: [{ role: 'user', content }], maxTokens: isPdf ? 4096 : 1000 });
  logUsage(userId, msg);

  const parsed = extractJson(collectText(msg), true); // always wantArray
  return Array.isArray(parsed) ? parsed : [parsed];
};

// Single base64 image (manual upload path) → one extracted invoice object.
const extractFromImageB64 = async (b64, mediaType, userId) => {
  const msg = await callClaude({
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
      { type: 'text', text: EXTRACT_PROMPT },
    ] }],
    maxTokens: 1000,
  });
  logUsage(userId, msg);
  return extractJson(collectText(msg), false);
};

// Plain-text invoice (e.g. email body) → one extracted invoice object.
const extractFromText = async (text, userId) => {
  const msg = await callClaude({
    messages: [{ role: 'user', content: [{ type: 'text', text: `${EXTRACT_PROMPT}\n\n${text}` }] }],
    maxTokens: 1000,
  });
  logUsage(userId, msg);
  return extractJson(collectText(msg), false);
};

// Transliterate an English company name to Hebrew. Returns { hebrew } or throws.
const translate = async (name, userId) => {
  const msg = await callClaude({
    messages: [{ role: 'user', content: [{ type: 'text', text: translatePrompt(name) }] }],
    maxTokens: 1000,
  });
  logUsage(userId, msg);
  return extractJson(collectText(msg), false);
};

module.exports = {
  MODEL,
  EXTRACT_PROMPT,
  EXTRACT_MULTI_PROMPT,
  extractJson,
  extractFromBuffer,
  extractFromImageB64,
  extractFromText,
  translate,
};
