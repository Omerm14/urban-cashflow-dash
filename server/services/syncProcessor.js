const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const supabase   = require('../lib/supabase');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Extraction ──────────────────────────────────────────────────────────────

const EXTRACT_PROMPT = `Extract data from this invoice or statement. The "supplier" is the company that ISSUED this document and is owed payment — the seller/creditor whose name appears in the document header or letterhead. Do NOT return the recipient or buyer name. All dates on this document follow Israeli format: DD/MM/YYYY or DD/MM/YY (day first, then month, then year). A two-digit year means 20YY — for example "14/04/26" means 14 April 2026, not 2014. Return ONLY valid JSON: {"supplier":"<issuer company name>","invoiceNo":"<invoice number>","invoiceDate":"<YYYY-MM-DD>","amount":<total amount as number>}. No markdown, no explanation.`;

const extractFromBuffer = async (buffer, mediaType, userId) => {
  const b64 = buffer.toString('base64');
  const msg = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text',  text: EXTRACT_PROMPT },
      ],
    }],
  });

  supabase.from('api_calls').insert({
    user_id:       userId,
    model:         msg.model,
    input_tokens:  msg.usage.input_tokens,
    output_tokens: msg.usage.output_tokens,
  }).then(({ error }) => { if (error) console.error('usage log:', error.message); });

  const text = msg.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
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
  let hit = suppliers.find(s => norm(s.name) === n);
  if (hit) return hit;
  hit = suppliers.find(s => {
    const sn = norm(s.name);
    const ratio = Math.min(n.length, sn.length) / Math.max(n.length, sn.length);
    return ratio >= 0.6 && (n.includes(sn) || sn.includes(n));
  });
  if (hit) return hit;
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

const isDuplicate = (candidate, existing) => existing.some(inv => {
  const sameSup    = normSup(inv.supplier)  === normSup(candidate.supplier);
  const exactMatch = sameSup && inv.invoice_no && candidate.invoice_no &&
                     inv.invoice_no.trim() === candidate.invoice_no.trim();
  const fuzzyMatch = sameSup &&
                     Number(inv.amount) === Number(candidate.amount) &&
                     inv.invoice_date   === candidate.invoice_date;
  return exactMatch || fuzzyMatch;
});

// ─── Core pipeline: buffer → extract → save ─────────────────────────────────

const processFile = async (buffer, filename, mediaType, userId, suppliers, existingInvoices) => {
  let extracted;
  try {
    extracted = await extractFromBuffer(buffer, mediaType, userId);
  } catch (err) {
    console.error(`[sync] extract failed for ${filename}:`, err.message);
    return null;
  }

  const invoiceDate = correctSwappedDate(extracted.invoiceDate) || extracted.invoiceDate || '';
  const sup         = matchSupplier(extracted.supplier, suppliers);
  const dueDate     = sup ? calcDueDate(invoiceDate, sup.terms) : null;

  const candidate = {
    user_id:      userId,
    supplier:     sup?.name || extracted.supplier || '',
    invoice_no:   extracted.invoiceNo  || '',
    invoice_date: invoiceDate,
    amount:       Number(extracted.amount) || 0,
    due_date:     dueDate || '',
    status:       'Unpaid',
    notes:        '',
    source_file:  filename,
  };

  if (isDuplicate(candidate, existingInvoices)) {
    console.log(`[sync] duplicate skipped: ${filename}`);
    return null;
  }

  const { data, error } = await supabase.from('invoices').insert(candidate).select().single();
  if (error) { console.error(`[sync] save failed for ${filename}:`, error.message); return null; }
  return data;
};

// ─── Shared DB helpers ───────────────────────────────────────────────────────

const getSuppliers = async userId => {
  const { data } = await supabase.from('suppliers').select('*').eq('user_id', userId);
  return data || [];
};

const getExistingInvoices = async userId => {
  const { data } = await supabase
    .from('invoices')
    .select('supplier,invoice_no,amount,invoice_date')
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

// ─── Google Drive sync ───────────────────────────────────────────────────────

exports.syncGoogleDrive = async (integration, userId) => {
  const auth  = makeOAuth2({ ...integration.credentials, _userId: userId, _type: 'google_drive' });
  const drive = google.drive({ version: 'v3', auth });

  const folderId  = integration.config?.folder_id;
  const lastSync  = integration.last_sync ? new Date(integration.last_sync).toISOString() : null;

  const conditions = [
    folderId ? `'${folderId}' in parents` : null,
    "(mimeType='application/pdf' or mimeType contains 'image/')",
    lastSync ? `modifiedTime > '${lastSync}'` : null,
    'trashed = false',
  ].filter(Boolean).join(' and ');

  const { data: { files = [] } } = await drive.files.list({
    q:       conditions,
    fields:  'files(id,name,mimeType)',
    pageSize: 50,
  });

  console.log(`[sync:drive] ${files.length} new file(s) for user ${userId}`);

  const suppliers       = await getSuppliers(userId);
  const existingInvoices = await getExistingInvoices(userId);
  let added = 0;

  for (const file of files) {
    try {
      const resp   = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(resp.data);
      const result = await processFile(buffer, file.name, file.mimeType, userId, suppliers, existingInvoices);
      if (result) { added++; existingInvoices.push(result); }
    } catch (err) {
      console.error(`[sync:drive] ${file.name}:`, err.message);
    }
  }

  return added;
};

// ─── Gmail sync ──────────────────────────────────────────────────────────────

exports.syncGmail = async (integration, userId) => {
  const auth  = makeOAuth2({ ...integration.credentials, _userId: userId, _type: 'gmail' });
  const gmail = google.gmail({ version: 'v1', auth });

  const lastSync = integration.last_sync
    ? Math.floor(new Date(integration.last_sync).getTime() / 1000)
    : null;

  const q = ['has:attachment', lastSync ? `after:${lastSync}` : null].filter(Boolean).join(' ');

  const { data: { messages = [] } } = await gmail.users.messages.list({
    userId: 'me', q, maxResults: 50,
  });

  console.log(`[sync:gmail] ${messages.length} message(s) for user ${userId}`);

  const suppliers        = await getSuppliers(userId);
  const existingInvoices = await getExistingInvoices(userId);
  let added = 0;

  for (const msg of messages) {
    try {
      const { data: message } = await gmail.users.messages.get({
        userId: 'me', id: msg.id, format: 'full',
      });

      const parts = (message.payload?.parts || []).filter(p =>
        p.filename && (p.mimeType === 'application/pdf' || p.mimeType.startsWith('image/'))
      );

      for (const part of parts) {
        if (!part.body?.attachmentId) continue;
        const { data: att } = await gmail.users.messages.attachments.get({
          userId: 'me', messageId: msg.id, id: part.body.attachmentId,
        });
        const buffer = Buffer.from(att.data, 'base64url');
        const result = await processFile(buffer, part.filename, part.mimeType, userId, suppliers, existingInvoices);
        if (result) { added++; existingInvoices.push(result); }
      }
    } catch (err) {
      console.error(`[sync:gmail] msg ${msg.id}:`, err.message);
    }
  }

  return added;
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
      user_id:      userId,
      supplier:     sup?.name || supplierName,
      invoice_no:   doc.number?.toString() || '',
      invoice_date: invoiceDate,
      amount:       doc.amount || doc.total || 0,
      due_date:     dueDate || '',
      status:       'Unpaid',
      notes:        'Imported from Green Invoice',
      source_file:  `green_invoice_${doc.id}`,
    };

    if (isDuplicate(candidate, existingInvoices)) continue;
    const { data, error } = await supabase.from('invoices').insert(candidate).select().single();
    if (!error && data) { added++; existingInvoices.push(data); }
  }

  return added;
};
