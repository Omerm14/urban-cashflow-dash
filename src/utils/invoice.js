// True when the string has Latin letters and no Hebrew characters — used to trigger
// the translation fallback before supplier matching.
export const isLatinOnly = s =>
  Boolean(s) && /[A-Za-z]/.test(s) && !/[א-ת]/.test(s);

// Canonical form: NFC, lowercase, all quote variants → ASCII "
const normSup = s => s?.toLowerCase().replace(/[.,\s]+$/, '').trim() || '';
const norm    = s => s?.normalize('NFC').toLowerCase().trim().replace(/[״"""]/g, '"') ?? '';

export const findDuplicates = invoices => {
  const dupeIds = new Set();
  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      const a = invoices[i], b = invoices[j];
      const sameSup    = normSup(a.supplier) === normSup(b.supplier);
      const exactMatch = sameSup && a.invoiceNo && b.invoiceNo && a.invoiceNo.trim() === b.invoiceNo.trim();
      const fuzzyMatch = sameSup && Number(a.amount) === Number(b.amount) && a.invoiceDate === b.invoiceDate;
      if (exactMatch || fuzzyMatch) { dupeIds.add(a.id); dupeIds.add(b.id); }
    }
  }
  return dupeIds;
};

export const matchSupplier = (name, suppliers) => {
  if (!name || !suppliers?.length) return null;
  const n = norm(name);

  // 1. Exact match (quote-normalised)
  let hit = suppliers.find(s => norm(s.name) === n);
  if (hit) { console.log('[match]', name, '→', hit.name, '(exact)'); return hit; }

  // 2. Substring match — one name contains the other (no ratio gate so that short
  //    stored names like "ארגל" match longer extracted names like "ארגל אקספרס").
  //    When multiple suppliers match, pick the one with the longest name (most specific).
  const STOP = new Set(['בע"מ', 'בעמ', 'ובע"מ']);
  const subMatches = suppliers.filter(s => {
    const sn = norm(s.name);
    return n.includes(sn) || sn.includes(n);
  });
  if (subMatches.length === 1) {
    console.log('[match]', name, '→', subMatches[0].name, '(substring)');
    return subMatches[0];
  }
  if (subMatches.length > 1) {
    const best = subMatches.reduce((b, s) => norm(s.name).length > norm(b.name).length ? s : b);
    console.log('[match]', name, '→', best.name, '(substring-longest)');
    return best;
  }

  // 3. Word-overlap — exclude generic business-entity suffix so that בע"מ
  //    (in any quote encoding) never drives a match on its own
  const words = n.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  if (!words.length) { console.log('[match]', name, '→ null (no meaningful words)'); return null; }

  let best = null, bestScore = 0, secondBest = 0;
  suppliers.forEach(s => {
    const sw = norm(s.name).split(/\s+/).filter(w => !STOP.has(w));
    const score = words.filter(w => sw.some(x => x.includes(w) || w.includes(x))).length;
    if (score > bestScore)       { secondBest = bestScore; bestScore = score; best = s; }
    else if (score > secondBest) { secondBest = score; }
  });

  const result = bestScore >= Math.ceil(words.length / 2) && bestScore > secondBest ? best : null;
  console.log('[match]', name, '→', result?.name ?? null, `(score ${bestScore} vs ${secondBest})`);
  return result;
};

export const parseCSV = text => {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const o = {}; headers.forEach((h, idx) => o[h] = cols[idx] || "");
    return { id: Date.now()+i, name: o.name||o["supplier name"]||o.supplier||"", terms: o.terms||o["payment terms"]||"", notes: o.notes||"" };
  }).filter(s => s.name);
};

export const statusStyle = s =>
  s === "Paid"    ? { bg:"#052e16", color:"#4ade80", dot:"#22c55e" } :
  s === "Overdue" ? { bg:"#2d0a0a", color:"#f87171", dot:"#ef4444" } :
  s === "Credit"  ? { bg:"#0e3a3a", color:"#2dd4bf", dot:"#14b8a6" } :
                    { bg:"#1e1b40", color:"#a78bfa", dot:"#818cf8" };
