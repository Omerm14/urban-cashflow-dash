const { google } = require('googleapis');
const crypto     = require('crypto');
const supabase   = require('../lib/supabase');
const storage    = require('../lib/storage');
const { extractFromBuffer } = require('../lib/extraction');
const { mergeTokenUpdate } = require('../lib/mergeTokenUpdate');
const { isDriveId } = require('../lib/validate');

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
  const netM = terms.match(/^net(\d+)$/);
  if (netM) {
    const end = new Date(date);
    end.setDate(end.getDate() + parseInt(netM[1]));
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
//
// Returns 'exact' (same supplier + invoice_no — unambiguous, always a true
// duplicate), 'fuzzy' (same supplier + amount + date, but no invoice_no to
// confirm — e.g. two legitimate same-day deliveries from one supplier can
// collide here), or null (no match). isDuplicate() below collapses this to a
// boolean for existing callers/tests; processFile uses the distinction so a
// fuzzy-only match is flagged for review instead of silently dropped (CASH-13).
const classifyDuplicateMatch = (candidate, existing, strict = false) => {
  const sameSupplier = inv => normSup(inv.supplier) === normSup(candidate.supplier);
  const hasExactMatch = existing.some(inv => sameSupplier(inv) &&
    inv.invoice_no && candidate.invoice_no && inv.invoice_no.trim() === candidate.invoice_no.trim());
  if (hasExactMatch) return 'exact';
  if (strict) return null;
  const hasFuzzyMatch = existing.some(inv => sameSupplier(inv) &&
    Number(inv.amount) === Number(candidate.amount) && inv.invoice_date === candidate.invoice_date);
  return hasFuzzyMatch ? 'fuzzy' : null;
};

const isDuplicate = (candidate, existing, strict = false) => classifyDuplicateMatch(candidate, existing, strict) !== null;
exports.isDuplicate = isDuplicate;
exports.classifyDuplicateMatch = classifyDuplicateMatch;
exports.calcDueDate = calcDueDate;

// ─── Audit logging ───────────────────────────────────────────────────────────

const logSyncEvent = (integrationId, userId, eventType, fields = {}) => {
  supabase.from('sync_events').insert({
    integration_id: integrationId,
    user_id:        userId,
    event_type:     eventType,
    ...fields,
  }).then(({ error }) => { if (error) console.error('[sync_events]', error.message); });
};

// ─── Mid-sync cancellation (blocking syncs only — Drive uses sync_jobs.status instead) ──────
// Gmail/Green Invoice run as a single request, so a second, concurrent request (which may
// land on a different server instance) is the only way to signal "stop" — checked via the DB,
// not in-memory state, since nothing else is shared between those two requests.
const isCancelRequested = async (integrationId, userId) => {
  const { data } = await supabase.from('integrations').select('cancel_requested')
    .eq('id', integrationId).eq('user_id', userId).single();
  return !!data?.cancel_requested;
};
exports.isCancelRequested = isCancelRequested;

// ─── Core pipeline: buffer → extract → save ─────────────────────────────────

const md5 = buf => crypto.createHash('md5').update(buf).digest('hex');

// Returns the absolute amount, or null when `raw` (Claude's extracted.amount)
// can't be parsed as a number — e.g. still containing a currency symbol,
// thousands separator, or OCR garbling — so the caller can flag/skip the
// candidate instead of silently coercing NaN into a real ₪0 amount.
const parseAmount = raw => {
  const n = Number(raw);
  return Number.isNaN(n) ? null : Math.abs(n);
};
exports.parseAmount = parseAmount;

// Returns an array of saved invoice records (may be empty, may have multiple for multi-page PDFs)
const processFile = async (buffer, filename, mediaType, userId, suppliers, integrationId, syncSource, syncMeta = {}) => {
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
  let skipped = 0;

  for (const [i, extracted] of extractedList.entries()) {
    const pageLabel = extractedList.length > 1 ? `${filename} (page ${i + 1})` : filename;

    const invoiceDate = correctSwappedDate(extracted.invoiceDate) || extracted.invoiceDate || '';
    const sup         = matchSupplier(extracted.supplier, suppliers);
    const dueDate     = sup ? calcDueDate(invoiceDate, sup.terms) : null;

    const isCredit  = extracted.type === 'credit';
    const rawAmount = parseAmount(extracted.amount);
    if (rawAmount === null) {
      console.log(`[sync] unparseable amount skipped: ${pageLabel} (raw: ${extracted.amount})`);
      logSyncEvent(integrationId, userId, 'amount_unparseable', { source_file: pageLabel, file_hash: fileHash, raw_value: String(extracted.amount) });
      skipped++;
      continue;
    }

    const candidate = {
      user_id:          userId,
      supplier:         sup?.name || extracted.supplier || '',
      invoice_no:       (extracted.invoiceNo  || '').trim(),
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
    const dbMatches = await findDuplicateCandidates(userId, candidate);
    const dbMatch    = classifyDuplicateMatch(candidate, dbMatches);
    const batchMatch = classifyDuplicateMatch(candidate, results, inBatchStrict);

    if (dbMatch === 'exact' || batchMatch === 'exact') {
      console.log(`[sync] duplicate skipped: ${pageLabel}`);
      logSyncEvent(integrationId, userId, 'dedup_skipped', { source_file: pageLabel, file_hash: fileHash });
      skipped++;
      continue;
    }

    // Fuzzy-only match (same supplier/amount/date, no invoice_no to confirm) — e.g. two
    // legitimate same-day deliveries from one supplier. Import rather than silently drop
    // it (CASH-13); flag for staff review instead.
    if (dbMatch === 'fuzzy' || batchMatch === 'fuzzy') {
      candidate.notes = 'Possible duplicate — same supplier, amount, and date as an existing invoice, but no invoice number to confirm. Please review.';
      console.log(`[sync] possible duplicate imported (flagged for review): ${pageLabel}`);
      logSyncEvent(integrationId, userId, 'possible_duplicate_imported', { source_file: pageLabel, file_hash: fileHash });
    }

    // Insert the row first (status 'pending' until the file is confirmed stored),
    // so a storage failure leaves a flagged, repairable row rather than an
    // orphaned blob or a silent loss.
    const { data, error } = await supabase
      .from('invoices')
      .insert({ ...candidate, file_hash: fileHash, attachment_status: 'pending' })
      .select().single();
    if (error) {
      console.error(`[sync] save failed for ${pageLabel}:`, error.message);
      logSyncEvent(integrationId, userId, 'ocr_failed', { source_file: pageLabel, file_hash: fileHash, error_message: error.message });
      continue;
    }

    // Store the original file (verbatim — no compression) in the active backend.
    try {
      const ext  = filename.split('.').pop().toLowerCase() || 'bin';
      const key  = `${userId}/${data.id}.${ext}`;
      const { key: storedKey, backend } = await storage.putAttachment({ key, body: buffer, contentType: mediaType });
      await supabase.from('invoices')
        .update({ attachment_path: storedKey, attachment_backend: backend, attachment_status: 'present' })
        .eq('id', data.id);
      data.attachment_path    = storedKey;
      data.attachment_backend = backend;
      data.attachment_status  = 'present';
    } catch (storageErr) {
      // Surface the failure instead of swallowing it — the row is openable-less
      // and flagged 'missing' so it can be retried by the repair tooling.
      console.error(`[sync] storage upload failed for ${pageLabel}:`, storageErr.message);
      await supabase.from('invoices').update({ attachment_status: 'missing' }).eq('id', data.id);
      data.attachment_status = 'missing';
      logSyncEvent(integrationId, userId, 'attachment_failed', { source_file: pageLabel, file_hash: fileHash, invoice_id: data.id, error_message: storageErr.message });
    }

    logSyncEvent(integrationId, userId, 'saved', { source_file: pageLabel, file_hash: fileHash, invoice_id: data.id });
    results.push(data);
  }

  return { saved: results, skipped };
};

// ─── Shared DB helpers ───────────────────────────────────────────────────────

const getSuppliers = async userId => {
  const { data } = await supabase.from('suppliers').select('*').eq('user_id', userId);
  return data || [];
};

// Queries Postgres directly for the small set of rows that could match `candidate`
// under isDuplicate()'s rules (exact invoice_no, or fuzzy amount+invoice_date)
// instead of loading a user's entire invoice history into memory — the previous
// getExistingInvoices() approach silently missed rows past PostgREST's 1000-row
// cap and OOM'd at scale. isDuplicate() itself is unchanged; this only narrows
// what it's run against.
//
// Pre-merge review fix: two gaps found in the initial version of this
// function —
//  1. invoice_no was queried untrimmed while classifyDuplicateMatch() (which
//     runs against the result) compares trimmed — OCR whitespace variance on
//     an otherwise-identical invoice_no meant the DB query returned zero
//     candidates, so the trim-tolerant match never got a chance to fire and
//     a real duplicate was silently re-imported. Trimmed here to match.
//  2. the amount+date lookup only ran `if (... && candidate.invoice_date)`,
//     so invoices with a blank invoice_date (extraction.js/syncProcessor
//     both default to '' — see candidate construction above/below — never
//     null) got ZERO cross-run dedup checking at all, unlike the old
//     in-memory approach which still matched on '' === ''. Now always runs
//     when amount is present, comparing invoice_date as-is (including '').
const findDuplicateCandidates = async (userId, candidate) => {
  const invoiceNo = (candidate.invoice_no || '').trim();
  const lookups = [];
  if (invoiceNo) {
    lookups.push(
      supabase.from('invoices').select('supplier,invoice_no,amount,invoice_date,source_file')
        .eq('user_id', userId).eq('invoice_no', invoiceNo)
    );
  }
  if (candidate.amount != null) {
    lookups.push(
      supabase.from('invoices').select('supplier,invoice_no,amount,invoice_date,source_file')
        .eq('user_id', userId).eq('amount', candidate.amount).eq('invoice_date', candidate.invoice_date ?? '')
    );
  }
  if (!lookups.length) return [];
  const results = await Promise.all(lookups);
  return results.flatMap(r => r.data || []);
};
exports.findDuplicateCandidates = findDuplicateCandidates;

// Fetches every already-imported base filename for a user, paginating past
// PostgREST's 1000-row default cap so large accounts are still fully covered.
// Used only as a cheap pre-filter to skip re-downloading/re-OCRing files that
// were already imported — findDuplicateCandidates() above is the real dedup
// gate and is unaffected by anything this pre-filter misses.
//
// The first page also requests an exact count, so any further pages are
// fetched concurrently instead of one round-trip at a time — this runs on
// every Drive/Gmail sync, so serial pagination was real added latency on a
// hot path for any user with more than 1000 invoices.
const SEEN_FILES_PAGE_SIZE = 1000;
const getSeenFilenames = async userId => {
  const baseFilename = s => s?.replace(/\s*\(page \d+\)$/i, '').trim().toLowerCase() || '';
  const seen = new Set();

  // .order('id') keeps page boundaries stable across separate .range() calls —
  // without it Postgres/PostgREST gives no ordering guarantee, and a
  // concurrent insert for this user (e.g. a WhatsApp webhook landing while
  // this Drive/Gmail sync runs) could shift a row across a page boundary.
  const query = () => supabase
    .from('invoices')
    .select('source_file', { count: 'exact' })
    .eq('user_id', userId)
    .order('id');

  const first = await query().range(0, SEEN_FILES_PAGE_SIZE - 1);
  if (first.error) { console.error('[sync] seen-filenames fetch failed:', first.error.message); return seen; }
  (first.data || []).forEach(row => { const b = baseFilename(row.source_file); if (b) seen.add(b); });

  const total = first.count ?? (first.data || []).length;
  const remainingPages = Math.max(0, Math.ceil(total / SEEN_FILES_PAGE_SIZE) - 1);
  if (remainingPages > 0) {
    const pages = await Promise.all(
      Array.from({ length: remainingPages }, (_, i) => {
        const from = (i + 1) * SEEN_FILES_PAGE_SIZE;
        return query().range(from, from + SEEN_FILES_PAGE_SIZE - 1);
      })
    );
    for (const page of pages) {
      if (page.error) { console.error('[sync] seen-filenames fetch failed:', page.error.message); continue; }
      (page.data || []).forEach(row => { const b = baseFilename(row.source_file); if (b) seen.add(b); });
    }
  }
  return seen;
};
exports.getSeenFilenames = getSeenFilenames;

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
    await supabase
      .from('integrations')
      .update({ credentials: mergeTokenUpdate(credentials, tokens) })
      .eq('user_id', credentials._userId)
      .eq('type', credentials._type);
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
    // Fixed rolling window: always search the last N days, independent of lastSync.
    // This ensures "Last 30 days" always scans 30 days back even if we just synced.
    return new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  }
  return lastSync ? new Date(lastSync).toISOString() : null;              // since last_sync
};

// ─── Listing pagination ──────────────────────────────────────────────────────
// Safety ceilings so a listing loop can't run away on a pathological account;
// comfortably above realistic folder/inbox sizes while still bounded.

const DRIVE_LIST_PAGE_SIZE  = 200;
const DRIVE_LIST_MAX_PAGES  = 10;   // up to 2000 files listed per run
const DRIVE_PROCESS_PER_RUN = 50;   // matches the previous default cap; overflow hands off to sync_jobs

const GMAIL_LIST_PAGE_SIZE = 200;
const GMAIL_LIST_MAX_PAGES = 10;    // up to 2000 messages listed per run

// `truncated: true` means MAX_PAGES was exhausted while the API still had a
// nextPageToken — a genuine ceiling hit (real backlog beyond what one run
// lists), not just "ran out of results". `false` covers both a normal
// early-break and a last page that happens to end exactly at the cap.
const listAllDriveFiles = async (drive, conditions) => {
  const files = [];
  let pageToken;
  for (let page = 0; page < DRIVE_LIST_MAX_PAGES; page++) {
    const { data } = await drive.files.list({
      q:        conditions,
      fields:   'nextPageToken, files(id,name,mimeType)',
      pageSize: DRIVE_LIST_PAGE_SIZE,
      pageToken,
    });
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { files, truncated: Boolean(pageToken) };
};

const listAllGmailMessages = async (gmail, q) => {
  const messages = [];
  let pageToken;
  for (let page = 0; page < GMAIL_LIST_MAX_PAGES; page++) {
    const { data } = await gmail.users.messages.list({
      userId: 'me', q, maxResults: GMAIL_LIST_PAGE_SIZE, pageToken,
    });
    messages.push(...(data.messages || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { messages, truncated: Boolean(pageToken) };
};

// Splits Gmail messages into ones still needing download/OCR vs. ones already
// represented by an invoice from a prior sync (matched by Gmail message id,
// stored in invoices.sync_source_meta.message_id — see processFile's syncMeta).
const partitionSeenGmailMessages = (messages, importedRows) => {
  const seenMessageIds = new Set(
    (importedRows || []).map(r => r.sync_source_meta?.message_id).filter(Boolean)
  );
  const toProcess   = [];
  const skippedIds  = [];
  for (const msg of messages) {
    if (seenMessageIds.has(msg.id)) skippedIds.push(msg.id);
    else toProcess.push(msg);
  }
  return { toProcess, skippedIds };
};
exports.partitionSeenGmailMessages = partitionSeenGmailMessages;

// ─── Google Drive sync ───────────────────────────────────────────────────────

exports.syncGoogleDrive = async (integration, userId) => {
  // A previous run may have handed off overflow files to sync_jobs (see below);
  // let that finish (picked up by cron's stale-job resume) before starting a new discovery.
  const { data: activeJob } = await supabase
    .from('sync_jobs')
    .select('id')
    .eq('integration_id', integration.id)
    .in('status', ['pending', 'running'])
    .maybeSingle();
  if (activeJob) {
    console.log(`[sync:drive] sync_jobs ${activeJob.id} still in progress for integration ${integration.id}; skipping this run`);
    return { added: 0, skipped: 0, filesFound: 0, errors: 0 };
  }

  const auth  = makeOAuth2({ ...integration.credentials, _userId: userId, _type: 'google_drive' });
  const drive = google.drive({ version: 'v3', auth });

  const folderId   = integration.config?.folder_id;
  if (folderId && !isDriveId(folderId)) throw new Error('Invalid folder_id in integration config');
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

  const { files, truncated } = await listAllDriveFiles(drive, conditions);
  if (truncated) {
    console.error(`[sync:drive] listing truncated at ${DRIVE_LIST_MAX_PAGES * DRIVE_LIST_PAGE_SIZE} files for user ${userId} — more files remain unlisted this run`);
    logSyncEvent(integration.id, userId, 'listing_truncated', { source_file: `cap:${DRIVE_LIST_MAX_PAGES * DRIVE_LIST_PAGE_SIZE}` });
  }

  console.log(`[sync:drive] ${files.length} file(s) found for user ${userId}`);

  const suppliers = await getSuppliers(userId);
  const seenFiles = await getSeenFilenames(userId);
  let added = 0, skipped = 0, errors = 0;

  // Process files in parallel batches to avoid sequential Claude API bottleneck
  const CONCURRENCY = 3;
  const filesToProcess = files.filter(file => {
    if (seenFiles.has(file.name.toLowerCase())) {
      console.log(`[sync:drive] skipping already-imported file: ${file.name}`);
      logSyncEvent(integration.id, userId, 'dedup_skipped', { source_file: file.name });
      skipped++;
      return false;
    }
    return true;
  });

  // Bound synchronous downloads+OCR per run to stay well under the 60s function
  // limit; anything beyond that hands off to sync_jobs (same contract the manual
  // Drive-sync job path already uses), resumed by cron's stale-job pickup.
  const toProcessNow = filesToProcess.slice(0, DRIVE_PROCESS_PER_RUN);
  const leftover      = filesToProcess.slice(DRIVE_PROCESS_PER_RUN);

  for (let i = 0; i < toProcessNow.length; i += CONCURRENCY) {
    const batch = toProcessNow.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async file => {
      try {
        const resp   = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(resp.data);
        const { saved, skipped: contentSkipped } = await processFile(
          buffer, file.name, file.mimeType, userId, suppliers,
          integration.id, 'google_drive', { folder_id: folderId, drive_file_id: file.id },
        );
        return { file, saved, contentSkipped };
      } catch (err) {
        errors++;
        console.error(`[sync:drive] ${file.name}:`, err.message);
        logSyncEvent(integration.id, userId, 'download_failed', { source_file: file.name, error_message: err.message });
        return { file, saved: [], contentSkipped: 0 };
      }
    }));

    for (const { file, saved, contentSkipped } of batchResults) {
      added += saved.length;
      skipped += contentSkipped;
      if (saved.length) seenFiles.add(file.name.toLowerCase());
    }
  }

  if (leftover.length) {
    const { error: jobErr } = await supabase.from('sync_jobs').insert({
      integration_id: integration.id,
      user_id:        userId,
      status:         'pending',
      file_list:      leftover,
      total_files:    leftover.length,
    });
    if (jobErr) console.error('[sync:drive] failed to hand off leftover files to sync_jobs:', jobErr.message);
    else console.log(`[sync:drive] ${leftover.length} file(s) handed off to sync_jobs for continuation`);
  }

  return { added, skipped, filesFound: files.length, errors };
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
  const { messages, truncated } = await listAllGmailMessages(gmail, q);
  if (truncated) {
    console.error(`[sync:gmail] listing truncated at ${GMAIL_LIST_MAX_PAGES * GMAIL_LIST_PAGE_SIZE} messages for user ${userId} — more messages remain unlisted this run`);
    logSyncEvent(integration.id, userId, 'listing_truncated', { source_file: `cap:${GMAIL_LIST_MAX_PAGES * GMAIL_LIST_PAGE_SIZE}` });
  }

  console.log(`[sync:gmail] ${messages.length} message(s) for user ${userId}`);

  const suppliers = await getSuppliers(userId);

  // Pre-filter: skip messages already represented by an invoice from a prior sync
  // (e.g. a "resync" that clears last_sync) — mirrors syncGoogleDrive's seenFiles
  // filter so re-running a sync with no new mail doesn't re-pay for OCR.
  const { data: importedRows } = await supabase
    .from('invoices')
    .select('sync_source_meta')
    .eq('user_id', userId)
    .eq('sync_source', 'gmail');
  const { toProcess, skippedIds } = partitionSeenGmailMessages(messages, importedRows);
  skippedIds.forEach(id => {
    console.log(`[sync:gmail] skipping already-imported message: ${id}`);
    logSyncEvent(integration.id, userId, 'dedup_skipped', { source_file: `msg:${id}` });
  });

  let added = 0, skipped = skippedIds.length, errors = 0;

  for (const msg of toProcess) {
    if (await isCancelRequested(integration.id, userId)) {
      return { added, skipped, filesFound: messages.length, errors, cancelled: true };
    }
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
        const { saved, skipped: contentSkipped } = await processFile(
          buffer, part.filename, part.mimeType, userId, suppliers,
          integration.id, 'gmail', { message_id: msg.id, thread_id: message.threadId },
        );
        added += saved.length;
        skipped += contentSkipped;
      }
    } catch (err) {
      errors++;
      console.error(`[sync:gmail] msg ${msg.id}:`, err.message);
      logSyncEvent(integration.id, userId, 'download_failed', { source_file: `msg:${msg.id}`, error_message: err.message });
    }
  }

  return { added, skipped, filesFound: messages.length, errors };
};

// ─── Green Invoice (חשבונית ירוקה) sync ─────────────────────────────────────

// Green Invoice returns a JSON error body on 4xx/5xx (e.g. {"errorCode":..., "message":"..."})
// — surface that instead of just the bare status code so a failure is actually diagnosable
// from the error_message the UI shows, not just "failed: 405".
const greenInvoiceErrorDetail = async res => {
  try {
    const body = await res.json();
    return body?.message || body?.errorMessage || JSON.stringify(body);
  } catch { return res.status; }
};

exports.syncGreenInvoice = async (integration, userId) => {
  const { apiKey, apiSecret } = integration.credentials || {};
  if (!apiKey || !apiSecret) throw new Error('Green Invoice credentials not set');

  const authRes = await fetch('https://api.greeninvoice.co.il/api/v1/account/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ id: apiKey, secret: apiSecret }),
  });
  if (!authRes.ok) throw new Error(`Green Invoice auth failed: ${await greenInvoiceErrorDetail(authRes)}`);
  const { token } = await authRes.json();

  // Green Invoice's Documents API only returns documents this account ISSUES (invoices/receipts
  // sent to ITS OWN clients) — there's no "incoming supplier invoice" document type there.
  // Expenses is the resource for money owed to suppliers, so that's the correct source here.
  // minAmount/maxAmount are marked required by the API despite being a filter range — pass a
  // wide-open range rather than omit them.
  const lookback  = integration.config?.lookback_days ?? 0;
  const cutoffISO = computeCutoff(integration.last_sync, lookback);
  const fromDate  = cutoffISO ? cutoffISO.split('T')[0] : null;
  const docsRes   = await fetch('https://api.greeninvoice.co.il/api/v1/expenses/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({
      ...(fromDate ? { fromDate } : {}),
      minAmount: 0,
      maxAmount: Number.MAX_SAFE_INTEGER,
      page:      1,
      pageSize:  100,
    }),
  });
  if (!docsRes.ok) throw new Error(`Green Invoice expenses fetch failed: ${await greenInvoiceErrorDetail(docsRes)}`);
  const { items = [] } = await docsRes.json();

  const suppliers = await getSuppliers(userId);
  let added = 0, skipped = 0, errors = 0;

  for (const doc of items) {
    if (await isCancelRequested(integration.id, userId)) {
      return { added, skipped, filesFound: items.length, errors, cancelled: true };
    }
    const supplierName = doc.supplier?.name || '';
    const sup          = matchSupplier(supplierName, suppliers);
    const invoiceDate  = doc.date ? doc.date.split('T')[0] : '';
    const dueDate      = doc.dueDate ? doc.dueDate.split('T')[0]
                         : (sup ? calcDueDate(invoiceDate, sup.terms) : null);

    const candidate = {
      user_id:          userId,
      supplier:         sup?.name || supplierName || 'Unknown supplier',
      invoice_no:       (doc.number?.toString() || '').trim(),
      invoice_date:     invoiceDate,
      amount:           doc.amount ?? 0,
      due_date:         dueDate || '',
      status:           'Unpaid',
      notes:            'Imported from Green Invoice',
      source_file:      `green_invoice_${doc.id}`,
      sync_source:      'green_invoice',
      sync_source_meta: { green_invoice_id: doc.id },
      sync_timestamp:   new Date().toISOString(),
    };

    const dbMatches = await findDuplicateCandidates(userId, candidate);
    const dbMatch = classifyDuplicateMatch(candidate, dbMatches);
    if (dbMatch === 'exact') {
      logSyncEvent(integration.id, userId, 'dedup_skipped', { source_file: candidate.source_file });
      skipped++;
      continue;
    }
    // Fuzzy-only match — import rather than silently drop it (CASH-13); flag for review.
    if (dbMatch === 'fuzzy') {
      candidate.notes += ' — Possible duplicate: same supplier, amount, and date as an existing invoice, but no invoice number to confirm. Please review.';
      logSyncEvent(integration.id, userId, 'possible_duplicate_imported', { source_file: candidate.source_file });
    }
    const { data, error } = await supabase.from('invoices').insert(candidate).select().single();
    if (!error && data) {
      logSyncEvent(integration.id, userId, 'saved', { source_file: candidate.source_file, invoice_id: data.id });
      added++;
    } else if (error) {
      console.error(`[sync] green_invoice save failed for ${candidate.source_file}:`, error.message);
      logSyncEvent(integration.id, userId, 'ocr_failed', { source_file: candidate.source_file, error_message: error.message });
      errors++;
    }
  }

  return { added, skipped, filesFound: items.length, errors };
};

// ─── Chunked Drive sync helpers (used by job-based background sync) ──────────

// Step 1: discover which files need processing (fast — no downloads, no Claude calls)
exports.discoverGoogleDriveFiles = async (integration, userId) => {
  const auth  = makeOAuth2({ ...integration.credentials, _userId: userId, _type: 'google_drive' });
  const drive = google.drive({ version: 'v3', auth });

  const folderId  = integration.config?.folder_id;
  if (folderId && !isDriveId(folderId)) throw new Error('Invalid folder_id in integration config');
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

  const seenFiles = await getSeenFilenames(userId);

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
  const suppliers = await getSuppliers(userId);
  const folderId  = integration.config?.folder_id;

  const results = [];
  let errors = 0, skipped = 0;

  // Bounded concurrency — mirrors the CONCURRENCY=3 batcher in syncGoogleDrive,
  // so this job-based path can't fire unbounded simultaneous Claude calls and
  // trigger a 429 cascade on large batches.
  const CONCURRENCY = 3;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async file => {
      try {
        const resp   = await drive.files.get({ fileId: file.id, alt: 'media' }, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(resp.data);
        const { saved, skipped: contentSkipped } = await processFile(
          buffer, file.name, file.mimeType, userId, suppliers,
          integration.id, 'google_drive', { folder_id: folderId, drive_file_id: file.id },
        );
        results.push(...saved);
        skipped += contentSkipped;
      } catch (err) {
        errors++;
        console.error(`[sync:drive:batch] ${file.name}:`, err.message);
        logSyncEvent(integration.id, userId, 'download_failed', { source_file: file.name, error_message: err.message });
      }
    }));
  }

  return { results, skipped, errors };
};

// ─── WhatsApp Business sync ──────────────────────────────────────────────────

exports.processWhatsAppMedia = async (integration, userId, mediaId, filename, mimeType, waMessageId) => {
  const api_token = process.env.WHATSAPP_API_TOKEN;
  if (!api_token) throw new Error('WHATSAPP_API_TOKEN not configured on server');

  // Check idempotency — skip if already processed (sync_source_meta lives on invoices, not sync_events)
  const { data: existing } = await supabase
    .from('invoices')
    .select('id')
    .eq('user_id', userId)
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

  const suppliers = await getSuppliers(userId);

  const { saved: results } = await processFile(
    buffer, filename || `whatsapp_${mediaId}`, mimeType, userId, suppliers,
    integration.id, 'whatsapp', { wa_message_id: waMessageId, media_id: mediaId },
  );

  if (results.length > 0) {
    await supabase.from('integrations').update({
      last_sync:  new Date().toISOString(),
      sync_count: (integration.sync_count || 0) + results.length,
    }).eq('id', integration.id);
  }

  return results;
};
