const Anthropic  = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const crypto     = require('crypto');
const supabase   = require('../lib/supabase');
const { jsonrepair } = require('jsonrepair');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';

// ─── Extraction prompts ───────────────────────────────────────────────────────

const SUPPLIER_RULE = `SUPPLIER — the company that ISSUED this invoice (they are owed money):
• The most reliable identifier: find the ח.פ. (company registration number) or ע.מ. (VAT number) on the document — the company name printed beside that number IS the supplier. This works regardless of page orientation.
• PRODUCT BRANDS ARE NOT SUPPLIERS: invoices list purchased products with brand names (e.g. גליל, תנובה, שטראוס, עלית). These are products being sold, NOT the invoice issuer. Never use a food/product brand or line-item description as the supplier.
• The fields "לכבוד", "שם לקוח", "נמען", "עבור" contain the BUYER — do NOT use any name from these fields as the supplier.
• Use the LEGAL registered company name as it appears next to ח.פ./ע.מ. — not a trade name or product line.`;

const DATE_RULE = `INVOICE DATE — Israeli format is DD/MM/YYYY or DD/MM/YY (day first, then month, then year):
• "14/04/26" → 2026-04-14   "04/01/2025" → 2025-01-04   "31/12/24" → 2024-12-31
• Convert to ISO format YYYY-MM-DD in your output.`;

const CREDIT_RULE = `TYPE — use "credit" ONLY if the document title/header explicitly says חשבונית זיכוי, מסמך זיכוי, or Credit Note. Regular invoices that mention a refund in a line item are still "invoice". Default: "invoice".`;

// Single image (JPG, PNG, WhatsApp attachment)
const EXTRACT_PROMPT = `Extract invoice data from this document.

${SUPPLIER_RULE}

${DATE_RULE}

INVOICE NUMBER: the number next to חשבונית מס׳ / מספר חשבונית / Invoice No.
AMOUNT: the final total (סה"כ לתשלום / Total) as a positive number.

${CREDIT_RULE}

If you cannot read a field clearly, use an empty string "" for text or 0 for amount — do NOT explain or apologise.
Return ONLY valid JSON — no markdown, no explanation:
{"supplier":"<legal company name from letterhead>","invoiceNo":"<invoice number>","invoiceDate":"<YYYY-MM-DD>","amount":<positive number>,"type":"invoice"}`;

// Multi-page PDF sent as document
const EXTRACT_MULTI_PROMPT = `Extract ALL invoice data from this PDF. Each page is a SEPARATE, INDEPENDENT invoice from a DIFFERENT supplier.

IMPORTANT — PAGE INDEPENDENCE: Each page was scanned from a different physical document. Do NOT carry over the supplier name, invoice number, or any other field from one page to another. Identify each page completely on its own.

IMPORTANT — ROTATED SCANS: Some pages may be upside down or rotated (scanned in the wrong orientation). Read the text regardless of orientation. The company letterhead and ח.פ./ע.מ. number may appear at the bottom of the rendered page if the scan is upside down — still use them to identify the supplier.

${SUPPLIER_RULE}

${DATE_RULE}

INVOICE NUMBER: the number next to חשבונית מס׳ / מספר חשבונית / Invoice No.
AMOUNT: the final total (סה"כ לתשלום / Total) as a positive number.

${CREDIT_RULE}

If you cannot read a field clearly, use an empty string "" for text or 0 for amount — do NOT explain or apologise.
Return ONLY a valid JSON array — one object per invoice page, skip non-invoice pages, no markdown, no explanation:
[{"supplier":"<legal company name from letterhead>","invoiceNo":"<invoice number>","invoiceDate":"<YYYY-MM-DD>","amount":<positive number>,"type":"invoice"}]`;

// Robust JSON extraction: strip markdown fences, repair malformed JSON (e.g. unescaped Hebrew
// quotes like בע"מ), find first JSON structure. jsonrepair handles unescaped quotes, trailing
// commas, and other common LLM JSON issues.
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

// Returns an array of extracted invoice objects (one element for images, one+ for multi-page PDFs).
const extractFromBuffer = async (buffer, mediaType, userId) => {
  const isPdf = mediaType === 'application/pdf';
  const b64   = buffer.toString('base64');

  const messages = [{
    role: 'user',
    content: isPdf
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: EXTRACT_MULTI_PROMPT },
        ]
      : [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: EXTRACT_PROMPT },
        ],
  }];

  const msg = await client.messages.create({ model: MODEL, max_tokens: isPdf ? 4096 : 1000, messages });

  supabase.from('api_calls').insert({
    user_id:       userId,
    model:         msg.model,
    input_tokens:  msg.usage.input_tokens,
    output_tokens: msg.usage.output_tokens,
  }).then(({ error }) => { if (error) console.error('usage log:', error.message); });

  const text   = msg.content.map(b => b.text || '').join('').trim();
  const parsed = extractJson(text, true); // always wantArray — processFile handles single-item arrays
  return Array.isArray(parsed) ? parsed : [parsed];
};

// ─── Date / due-date helpers (mirror of src/utils/dates.js) ─────────────────

const correctSwappedDate = str => {
  if (!str) return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (parseInt(y) <= 31 && parseInt(d) >= 2000) return `${d}-${mo}-${y}`;
  return str;
};

const calcDueDate = (invoiceDate, terms) => {
  if (!invoiceDate || !terms) return null;
  const date = new Date(invoiceDate);
  if (isNaN(date)) return null;
  if (terms === 'immediate') return invoiceDate;
  if (terms === 'shotef') {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
  }
  const m = terms.match(/^shotef_plus\((\d+)\)$/);
  if (m) {
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    end.setDate(end.getDate() + parseInt(m[1]));
    return end.toISOString().split('T')[0];
  }
  return null;
};

// ─── Supplier matching (mirror of src/utils/invoice.js) ─────────────────────

const norm     = s => s?.normalize('NFC').toLowerCase().trim().replace(/[״"""]/g, '"') ?? '';
const normSup  = s => s?.toLowerCase().replace(/[.,\s]+$/, '').trim() || '';
const STOP     = new Set(['בע"מ', 'בעמ', 'ובע"מ']);

const matchSupplier = (name, suppliers) => {
  if (!name || !suppliers?.length) return null;
  const n = norm(name);

  // 1. Exact match
  let hit = suppliers.find(s => norm(s.name) === n);
  if (hit) return hit;

  // 2. Substring match — one name contains the other (no ratio gate so that short
  //    stored names like "ארגל" match longer extracted names like "ארגל אקספרס").
  //    When multiple suppliers match, pick the one with the longest name (most specific).
  const subMatches = suppliers.filter(s => {
    const sn = norm(s.name);
    return n.includes(sn) || sn.includes(n);
  });
  if (subMatches.length === 1) return subMatches[0];
  if (subMatches.length > 1) {
    return subMatches.reduce((best, s) =>
      norm(s.name).length > norm(best.name).length ? s : best
    );
  }

  // 3. Word-overlap scoring
  const words = n.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  if (!words.length) return null;
  let best = null, bestScore = 0, secondBest = 0;
  suppliers.forEach(s => {
    const sw = norm(s.name).split(/\s+/).filter(w => !STOP.has(w));
    const score = words.filter(w => sw.some(x => x.includes(w) || w.includes(x))).length;
    if (score > bestScore)       { secondBest = bestScore; bestScore = score; best = s; }
    else if (score > secondBest) { secondBest = score; }
  });
  return bestScore >= Math.ceil(words.length / 2) && bestScore > secondBest ? best : null;
};

// strict=true disables fuzzyMatch — used for same-PDF batch dedup so multiple
// invoices with identical supplier/amount/date (e.g. recurring) aren't wrongly skipped
const isDuplicate = (candidate, existing, strict = false) => existing.some(inv => {
  const sameSup    = normSup(inv.supplier)  === normSup(candidate.supplier);
  const exactMatch = sameSup && inv.invoice_no && candidate.invoice_no &&
                     inv.invoice_no.trim() === candidate.invoice_no.trim();
  const fuzzyMatch = !strict && sameSup &&
                     Number(inv.amount) === Number(candidate.amount) &&
                     inv.invoice_date   === candidate.invoice_date;
  return exactMatch || fuzzyMatch;
});

// ─── Audit logging ───────────────────────────────────────────────────────────

const logSyncEvent = (integrationId, userId, eventType, fields = {}) => {
  supabase.from('sync_events').insert({
    integration_id: integrationId,
    user_id:        userId,
    event_type:     eventType,
    ...fields,
  }).then(({ error }) => { if (error) console.error('[sync_events]', error.message); });
};

// ─── Core pipeline: buffer → extract → save ─────────────────────────────────

const md5 = buf => crypto.createHash('md5').update(buf).digest('hex');

// Returns an array of saved invoice records (may be empty, may have multiple for multi-page PDFs)
const processFile = async (buffer, filename, mediaType, userId, suppliers, existingInvoices, integrationId, syncSource, syncMeta = {}) => {
  const fileHash = md5(buffer);
  let extractedList;
  try {
    extractedList = await extractFromBuffer(buffer, mediaType, userId);
  } catch (err) {
    console.error(`[sync] extract failed for ${filename}:`, err.message);
    logSyncEvent(integrationId, userId, 'ocr_failed', { source_file: filename, file_hash: fileHash, error_message: err.message });
    return [];
  }

  const results = [];

  for (const [i, extracted] of extractedList.entries()) {
    const pageLabel = extractedList.length > 1 ? `${filename} (page ${i + 1})` : filename;

    const invoiceDate = correctSwappedDate(extracted.invoiceDate) || extracted.invoiceDate || '';
    const sup         = matchSupplier(extracted.supplier, suppliers);
    const dueDate     = sup ? calcDueDate(invoiceDate, sup.terms) : null;

    const isCredit  = extracted.type === 'credit';
    const rawAmount = Math.abs(Number(extracted.amount)) || 0;

    const candidate = {
      user_id:          userId,
      supplier:         sup?.name || extracted.supplier || '',
      invoice_no:       extracted.invoiceNo  || '',
      invoice_date:     invoiceDate,
      amount:           isCredit ? -rawAmount : rawAmount,
      due_date:         isCredit ? '' : (dueDate || ''),
      status:           isCredit ? 'Credit' : 'Unpaid',
      invoice_type:     isCredit ? 'credit' : 'invoice',
      notes:            '',
      source_file:      pageLabel,
      sync_source:      syncSource,
      sync_source_meta: { ...syncMeta, filename: pageLabel },
      sync_timestamp:   new Date().toISOString(),
    };

    // Check DB with fuzzy matching; check same-PDF batch strictly (exact invoice_no) when
    // invoice_no is present so recurring invoices with same supplier/amount aren't skipped.
    // When invoice_no is absent, fall back to fuzzy for same-batch to catch duplicate pages.
    const inBatchStrict = Boolean(candidate.invoice_no);
    if (isDuplicate(candidate, existingInvoices) || isDuplicate(candidate, results, inBatchStrict)) {
      console.log(`[sync] duplicate skipped: ${pageLabel}`);
      logSyncEvent(integrationId, userId, 'dedup_skipped', { source_file: pageLabel, file_hash: fileHash });
      continue;
    }

    const { data, error } = await supabase.from('invoices').insert(candidate).select().single();
    if (error) {
      console.error(`[sync] save failed for ${pageLabel}:`, error.message);
      logSyncEvent(integrationId, userId, 'ocr_failed', { source_file: pageLabel, file_hash: fileHash, error_message: error.message });
      continue;
    }

    // Upload original file to Supabase Storage for later preview
    try {
      const ext = filename.split('.').pop().toLowerCase() || 'bin';
      const storagePath = `${userId}/${data.id}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from('invoice-attachments')
        .upload(storagePath, buffer, { contentType: mediaType, upsert: false });
      if (!storageErr) {
        await supabase.from('invoices').update({ attachment_path: storagePath }).eq('id', data.id);
        data.attachment_path = storagePath;
      } else {
        console.warn(`[sync] storage upload skipped for ${pageLabel}:`, storageErr.message);
      }
    } catch (storageUploadErr) {
      console.warn(`[sync] storage upload failed for ${pageLabel}:`, storageUploadErr.message);
    }

    logSyncEvent(integrationId, userId, 'saved', { source_file: pageLabel, file_hash: fileHash, invoice_id: data.id });
    results.push(data);
  }

  return results;
};

// ─── Shared DB helpers ───────────────────────────────────────────────────────

const getSuppliers = async userId => {
  const { data } = await supabase.from('suppliers').select('*').eq('user_id', userId);
  return data || [];
};

const getExistingInvoices = async userId => {
  const { data } = await supabase
    .from('invoices')
    .select('supplier,invoice_no,amount,invoice_date,source_file')
    .eq('user_id', userId);
  return data || [];
};

// ─── Google OAuth2 client ────────────────────────────────────────────────────

const makeOAuth2 = credentials => {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  c.setCredentials(credentials);
  // Persist refreshed tokens back to DB automatically
  c.on('tokens', async tokens => {
    if (tokens.refresh_token) {
      await supabase
        .from('integrations')
        .update({ credentials: { ...credentials, ...tokens } })
        .eq('user_id', credentials._userId)
        .eq('type', credentials._type);
    }
  });
  return c;
};

// ─── Drive recursive folder collection ───────────────────────────────────────

const collectFolderTree = async (drive, rootId) => {
  const ids   = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const parent = queue.shift();
    try {
      const { data: { files: subs = [] } } = await drive.files.list({
        q:        `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields:   'files(id)',
        pageSize: 100,
      });
      for (const f of subs) {
        if (ids.length >= 50) break;
        ids.push(f.id);
        queue.push(f.id);
      }
    } catch { break; }
  }
  return ids;
};

// ─── Lookback helper ─────────────────────────────────────────────────────────

const computeCutoff = (lastSync, lookbackDays) => {
  if (lookbackDays === -1) return null;                                    // all time
  if (lookbackDays > 0) {
    const cutoff = new Date(Date.now() - lookbackDays * 86_400_000);
    if (!lastSync || new Date(lastSync) < cutoff) return cutoff.toISOString();
    return new Date(lastSync).toISOString();
  }
  return lastSync ? new Date(lastSync).toISOString() : null;              // since last_sync
};

// ─── Google Drive sync ───────────────────────────────────────────────────────

exports.syncGoogleDrive = async (integration, userId) => {
  const auth  = makeOAuth2({ ...integration.credentials, _userId: userId, _type: 'google_drive' });
  const drive = google.drive({ version: 'v3', auth });

  const folderId   = integration.config?.folder_id;
  const lookback   = integration.config?.lookback_days ?? 0;
  const cutoffISO  = computeCutoff(integration.last_sync, lookback);

  console.log(`[sync:drive] cutoff=${cutoffISO || 'none'} lookback=${lookback} user=${userId}`);

  let folderCond = null;
  if (folderId) {
    const allFolderIds = await collectFolderTree(drive, folderId);
    console.log(`[sync:drive] searching ${allFolderIds.length} folder(s) recursively`);
    folderCond = `(${allFolderIds.map(id => `'${id}' in parents`).join(' or ')})`;
  }

  const conditions = [
    folderCond,
    "(mimeType='application/pdf' or mimeType contains 'image/')",
    cutoffISO ? `modifiedTime > '${cutoffISO}'` : null,
    'trashed = false',
  ].filter(Boolean).join(' and ');

  const { data: { files = [] } } = await drive.files.list({
    q:        conditions,
    fields:   'files(id,name,mimeType)',
    pageSize: 50,
  });

  console.log(`[sync:drive] ${files.length} file(s) found for user ${userId}`);

  const suppliers        = await getSuppliers(userId);
  const existingInvoices = await getExistingInvoices(userId);
  // Strip "(page N)" suffix so multi-page PDFs are recognised as already-imported
  // whether they were saved with old code ("file.pdf") or new ("file.pdf (page 1)")
  const baseFilename = s => s?.replace(/\s*\(page \d+\)$/i, '').trim().toLowerCase() || '';
  const seenFiles = new Set(existingInvoices.map(i => baseFilename(i.source_file)).filter(Boolean));
  let added = 0, errors = 0;

  // Process files in parallel batches to avoid sequential Claude API bottleneck
  const CONCURRENCY = 3;
  const filesToProcess = files.filter(file => {
    if (seenFiles.has(file.name.toLowerCase())) {
      console.log(`[sync:drive] skipping already-imported file: ${file.name}`);
      logSyncEvent(integration.id, userId, 'dedup_skipped', { source_file: file.name });
      return false;
    }
    return true;
  });

  for (let i = 0; i < filesToProcess.length; i += CONCURRENCY) {
    const batch = filesToProcess.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async file => {
      try {
        const resp   = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(resp.data);
        const results = await processFile(
          buffer, file.name, file.mimeType, userId, suppliers, existingInvoices,
          integration.id, 'google_drive', { folder_id: folderId, drive_file_id: file.id },
        );
        return { file, results };
      } catch (err) {
        errors++;
        console.error(`[sync:drive] ${file.name}:`, err.message);
        logSyncEvent(integration.id, userId, 'download_failed', { source_file: file.name, error_message: err.message });
        return { file, results: [] };
      }
    }));

    for (const { file, results } of batchResults) {
      for (const inv of results) { added++; existingInvoices.push(inv); }
      if (results.length) seenFiles.add(file.name.toLowerCase());
    }
  }

  return { added, filesFound: files.length, errors };
};

// ─── Gmail sync ──────────────────────────────────────────────────────────────

exports.syncGmail = async (integration, userId) => {
  const auth  = makeOAuth2({ ...integration.credentials, _userId: userId, _type: 'gmail' });
  const gmail = google.gmail({ version: 'v1', auth });

  const lookback   = integration.config?.lookback_days ?? 0;
  const cutoffISO  = computeCutoff(integration.last_sync, lookback);
  const lastSync   = cutoffISO ? Math.floor(new Date(cutoffISO).getTime() / 1000) : null;

  const labelNames = (integration.config?.label_names || [])
    .map(n => n.toLowerCase().replace(/\s+/g, '-'));
  const fromFilter = integration.config?.filters?.from    || '';
  const subjFilter = integration.config?.filters?.subject || '';

  const parts = ['has:attachment'];
  if (lastSync)              parts.push(`after:${lastSync}`);
  if (fromFilter)            parts.push(`from:${fromFilter}`);
  if (subjFilter)            parts.push(`subject:${subjFilter}`);
  if (labelNames.length === 1) {
    parts.push(`label:${labelNames[0]}`);
  } else if (labelNames.length > 1) {
    parts.push(`{${labelNames.map(n => `label:${n}`).join(' ')}}`);
  }
  const q = parts.join(' ');

  console.log(`[sync:gmail] query: ${q}`);
  const { data: { messages = [] } } = await gmail.users.messages.list({
    userId: 'me', q, maxResults: 100,
  });

  console.log(`[sync:gmail] ${messages.length} message(s) for user ${userId}`);

  const suppliers        = await getSuppliers(userId);
  const existingInvoices = await getExistingInvoices(userId);
  let added = 0, errors = 0;

  for (const msg of messages) {
    try {
      const { data: message } = await gmail.users.messages.get({
        userId: 'me', id: msg.id, format: 'full',
      });

      const collectParts = payload => {
        const result = [];
        const walk = p => {
          if (p.filename && (p.mimeType === 'application/pdf' || p.mimeType.startsWith('image/'))) result.push(p);
          (p.parts || []).forEach(walk);
        };
        walk(payload || {});
        return result;
      };
      const parts = collectParts(message.payload);

      for (const part of parts) {
        if (!part.body?.attachmentId) continue;
        const { data: att } = await gmail.users.messages.attachments.get({
          userId: 'me', messageId: msg.id, id: part.body.attachmentId,
        });
        const buffer = Buffer.from(att.data, 'base64url');
        const results = await processFile(
          buffer, part.filename, part.mimeType, userId, suppliers, existingInvoices,
          integration.id, 'gmail', { message_id: msg.id, thread_id: message.threadId },
        );
        for (const inv of results) { added++; existingInvoices.push(inv); }
      }
    } catch (err) {
      errors++;
      console.error(`[sync:gmail] msg ${msg.id}:`, err.message);
      logSyncEvent(integration.id, userId, 'download_failed', { source_file: `msg:${msg.id}`, error_message: err.message });
    }
  }

  return { added, filesFound: messages.length, errors };
};

// ─── Green Invoice (חשבונית ירוקה) sync ─────────────────────────────────────

exports.syncGreenInvoice = async (integration, userId) => {
  const { apiKey, apiSecret } = integration.credentials || {};
  if (!apiKey || !apiSecret) throw new Error('Green Invoice credentials not set');

  const authRes = await fetch('https://api.greeninvoice.co.il/api/v1/account/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id: apiKey, secret: apiSecret }),
  });
  if (!authRes.ok) throw new Error(`Green Invoice auth failed: ${authRes.status}`);
  const { token } = await authRes.json();

  const lastSync  = integration.last_sync ? integration.last_sync.split('T')[0] : null;
  const params    = new URLSearchParams({ type: 500, ...(lastSync ? { fromDate: lastSync } : {}) });
  const docsRes   = await fetch(`https://api.greeninvoice.co.il/api/v1/documents?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!docsRes.ok) throw new Error(`Green Invoice documents fetch failed: ${docsRes.status}`);
  const { items = [] } = await docsRes.json();

  const suppliers        = await getSuppliers(userId);
  const existingInvoices = await getExistingInvoices(userId);
  let added = 0;

  for (const doc of items) {
    const supplierName = doc.client?.name || doc.from?.name || '';
    const sup          = matchSupplier(supplierName, suppliers);
    const invoiceDate  = doc.date ? doc.date.split('T')[0] : '';
    const dueDate      = doc.dueDate ? doc.dueDate.split('T')[0]
                         : (sup ? calcDueDate(invoiceDate, sup.terms) : null);

    const candidate = {
      user_id:          userId,
      supplier:         sup?.name || supplierName,
      invoice_no:       doc.number?.toString() || '',
      invoice_date:     invoiceDate,
      amount:           doc.amount || doc.total || 0,
      due_date:         dueDate || '',
      status:           'Unpaid',
      notes:            'Imported from Green Invoice',
      source_file:      `green_invoice_${doc.id}`,
      sync_source:      'green_invoice',
      sync_source_meta: { green_invoice_id: doc.id },
      sync_timestamp:   new Date().toISOString(),
    };

    if (isDuplicate(candidate, existingInvoices)) {
      logSyncEvent(integration.id, userId, 'dedup_skipped', { source_file: candidate.source_file });
      continue;
    }
    const { data, error } = await supabase.from('invoices').insert(candidate).select().single();
    if (!error && data) {
      logSyncEvent(integration.id, userId, 'saved', { source_file: candidate.source_file, invoice_id: data.id });
      added++;
      existingInvoices.push(data);
    }
  }

  return added;
};

// ─── Chunked Drive sync helpers (used by job-based background sync) ──────────

// Step 1: discover which files need processing (fast — no downloads, no Claude calls)
exports.discoverGoogleDriveFiles = async (integration, userId) => {
  const auth  = makeOAuth2({ ...integration.credentials, _userId: userId, _type: 'google_drive' });
  const drive = google.drive({ version: 'v3', auth });

  const folderId  = integration.config?.folder_id;
  const lookback  = integration.config?.lookback_days ?? 0;
  const cutoffISO = computeCutoff(integration.last_sync, lookback);

  let folderCond = null;
  if (folderId) {
    const allFolderIds = await collectFolderTree(drive, folderId);
    folderCond = `(${allFolderIds.map(id => `'${id}' in parents`).join(' or ')})`;
  }

  const conditions = [
    folderCond,
    "(mimeType='application/pdf' or mimeType contains 'image/')",
    cutoffISO ? `modifiedTime > '${cutoffISO}'` : null,
    'trashed = false',
  ].filter(Boolean).join(' and ');

  const { data: { files = [] } } = await drive.files.list({
    q:        conditions,
    fields:   'files(id,name,mimeType)',
    pageSize: 50,
  });

  const existingInvoices = await getExistingInvoices(userId);
  const baseFilename = s => s?.replace(/\s*\(page \d+\)$/i, '').trim().toLowerCase() || '';
  const seenFiles = new Set(existingInvoices.map(i => baseFilename(i.source_file)).filter(Boolean));

  const filesToProcess = files.filter(file => {
    if (seenFiles.has(file.name.toLowerCase())) {
      logSyncEvent(integration.id, userId, 'dedup_skipped', { source_file: file.name });
      return false;
    }
    return true;
  });

  return { files: filesToProcess, filesFound: files.length };
};

// Step 2: download + extract a batch of already-discovered files
exports.processGoogleDriveFileBatch = async (integration, userId, files) => {
  const auth  = makeOAuth2({ ...integration.credentials, _userId: userId, _type: 'google_drive' });
  const drive = google.drive({ version: 'v3', auth });
  const suppliers        = await getSuppliers(userId);
  const existingInvoices = await getExistingInvoices(userId);
  const folderId         = integration.config?.folder_id;

  const results = [];
  let errors = 0;

  await Promise.all(files.map(async file => {
    try {
      const resp   = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(resp.data);
      const invs   = await processFile(
        buffer, file.name, file.mimeType, userId, suppliers, existingInvoices,
        integration.id, 'google_drive', { folder_id: folderId, drive_file_id: file.id },
      );
      for (const inv of invs) { results.push(inv); existingInvoices.push(inv); }
    } catch (err) {
      errors++;
      console.error(`[sync:drive:batch] ${file.name}:`, err.message);
      logSyncEvent(integration.id, userId, 'download_failed', { source_file: file.name, error_message: err.message });
    }
  }));

  return { results, errors };
};

// ─── WhatsApp Business sync ──────────────────────────────────────────────────

exports.processWhatsAppMedia = async (integration, userId, mediaId, filename, mimeType, waMessageId) => {
  const { api_token } = integration.credentials || {};
  if (!api_token) throw new Error('WhatsApp API token not set');

  // Check idempotency — skip if already processed
  const { data: existing } = await supabase
    .from('sync_events')
    .select('id')
    .eq('integration_id', integration.id)
    .contains('sync_source_meta', { wa_message_id: waMessageId })
    .maybeSingle();
  if (existing) {
    console.log(`[sync:whatsapp] already processed message ${waMessageId}`);
    return null;
  }

  // Retrieve media URL from WhatsApp Cloud API
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${api_token}` },
  });
  if (!metaRes.ok) throw new Error(`WhatsApp media metadata failed: ${metaRes.status}`);
  const { url: mediaUrl } = await metaRes.json();

  // Download media content
  const mediaRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${api_token}` },
  });
  if (!mediaRes.ok) throw new Error(`WhatsApp media download failed: ${mediaRes.status}`);
  const buffer = Buffer.from(await mediaRes.arrayBuffer());

  const suppliers        = await getSuppliers(userId);
  const existingInvoices = await getExistingInvoices(userId);

  return processFile(
    buffer, filename || `whatsapp_${mediaId}`, mimeType, userId, suppliers, existingInvoices,
    integration.id, 'whatsapp', { wa_message_id: waMessageId, media_id: mediaId },
  );
};
