// True when the string has Latin letters and no Hebrew characters — used to trigger
// the translation fallback before supplier matching.
export const isLatinOnly = s =>
  Boolean(s) && /[A-Za-z]/.test(s) && !/[א-ת]/.test(s);

const normName = s => s?.normalize('NFC').toLowerCase().trim() || '';

// Returns display names of suppliers that are considered recurring but have no
// invoice in the given YM string (e.g. "2026-06").
// A supplier is auto-recurring if it appeared in ≥ 2 of the past 3 months.
// Manual recurring suppliers (suppliers.recurring = true) are always included.
export const getMissingSuppliers = (invoices, suppliers, ym) => {
  if (!ym || !invoices?.length) return [];

  const [year, month] = ym.split('-').map(Number);
  const pastMonths = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(year, month - 1 - i, 1);
    pastMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const nonCredit = invoices.filter(inv => inv.status !== 'Credit' && Number(inv.amount) >= 0);

  // Suppliers with an invoice in current month
  const thisMonthSet = new Set(
    nonCredit
      .filter(inv => (inv.invoice_date || inv.invoiceDate || '').startsWith(ym))
      .map(inv => normName(inv.supplier))
  );

  // Auto-detect: count distinct past months per supplier
  const monthsPerSupplier = {};
  nonCredit.forEach(inv => {
    const d = inv.invoice_date || inv.invoiceDate || '';
    const pm = pastMonths.find(p => d.startsWith(p));
    if (!pm) return;
    const key = normName(inv.supplier);
    if (!key) return;
    if (!monthsPerSupplier[key]) monthsPerSupplier[key] = new Set();
    monthsPerSupplier[key].add(pm);
  });

  const autoRecurring = new Set(
    Object.entries(monthsPerSupplier)
      .filter(([, s]) => s.size >= 2)
      .map(([key]) => key)
  );

  const manualRecurring = new Set(
    (suppliers || []).filter(s => s.recurring).map(s => normName(s.name))
  );

  const missing = [...new Set([...autoRecurring, ...manualRecurring])]
    .filter(key => !thisMonthSet.has(key));

  return missing.map(key => {
    const sup = (suppliers || []).find(s => normName(s.name) === key);
    if (sup) return sup.name;
    const inv = [...invoices].reverse().find(i => normName(i.supplier) === key);
    return inv?.supplier || key;
  }).sort();
};

// Returns a Map<supplierName, { deviationPct, direction, baseline, currentTotal }>
// for suppliers whose current-month total deviates >30% from their 6-month baseline avg.
// Requires ≥3 months of history to flag.
export const getSupplierMonthlyAnomalies = (invoices) => {
  const result = new Map();
  if (!invoices?.length) return result;

  // Group non-credit invoices by (supplier, YYYY-MM) → monthly total
  const monthlyTotals = {};
  invoices.forEach(inv => {
    if (inv.status === 'Credit' || Number(inv.amount) < 0) return;
    const date = inv.invoice_date || inv.invoiceDate || '';
    const ym = date.slice(0, 7);
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return;
    const key = normName(inv.supplier);
    if (!key) return;
    if (!monthlyTotals[key]) monthlyTotals[key] = {};
    monthlyTotals[key][ym] = (monthlyTotals[key][ym] || 0) + Number(inv.amount);
  });

  // Use the most recent month with actual data instead of today's calendar month.
  // This handles the common case where invoice_date lags behind due_date by 60–90 days.
  const allMonths = [...new Set(Object.values(monthlyTotals).flatMap(m => Object.keys(m)))].sort();
  if (allMonths.length < 2) return result;
  const currentYM = allMonths[allMonths.length - 1];

  // For each supplier, compute baseline from past months and compare to current month
  Object.entries(monthlyTotals).forEach(([key, months]) => {
    const currentTotal = months[currentYM];
    if (!currentTotal) return;

    const pastAmounts = Object.entries(months)
      .filter(([ym]) => ym !== currentYM)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 6)
      .map(([, v]) => v);

    if (pastAmounts.length < 2) return; // not enough history

    const baseline = pastAmounts.reduce((s, v) => s + v, 0) / pastAmounts.length;
    const deviation = (currentTotal - baseline) / baseline;
    if (Math.abs(deviation) < 0.3) return;

    // Recover display name from original invoices
    const displayName = invoices.find(inv => normName(inv.supplier) === key)?.supplier || key;

    result.set(displayName, {
      deviationPct: Math.round(Math.abs(deviation) * 100),
      direction: deviation > 0 ? 'higher' : 'lower',
      baseline,
      currentTotal,
    });
  });

  return result;
};

// Returns anomaly data if the invoice amount deviates >30% from the supplier's
// 3-month average. Returns null if not enough history or no anomaly.
export const getAmountAnomaly = (invoice, allInvoices) => {
  const supKey = normName(invoice.supplier);
  if (!supKey) return null;
  const invDate = invoice.invoice_date || invoice.invoiceDate || '';
  if (!invDate) return null;

  const [year, month] = invDate.split('-').map(Number);
  const pastMonths = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(year, month - 1 - i, 1);
    pastMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const amounts = allInvoices
    .filter(inv => {
      if (inv.id === invoice.id) return false;
      if (normName(inv.supplier) !== supKey) return false;
      if (inv.status === 'Credit' || inv.invoice_type === 'credit' || Number(inv.amount) < 0) return false;
      const d = inv.invoice_date || inv.invoiceDate || '';
      return pastMonths.some(pm => d.startsWith(pm));
    })
    .map(inv => Number(inv.amount))
    .filter(a => a > 0);

  if (amounts.length < 2) return null;

  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  const current = Number(invoice.amount);
  if (!current || current < 0) return null;

  const deviation = (current - avg) / avg;
  if (Math.abs(deviation) < 0.3) return null;

  return {
    isAnomaly: true,
    deviationPct: Math.round(Math.abs(deviation) * 100),
    average: avg,
    direction: deviation > 0 ? 'higher' : 'lower',
  };
};

// Canonical form: NFC, lowercase, all quote variants → ASCII "
const normSup = s => s?.toLowerCase().replace(/[.,\s]+$/, '').trim() || '';
const norm    = s => s?.normalize('NFC').toLowerCase().trim().replace(/[״"""]/g, '"') ?? '';

// Groups by normalized supplier first so only invoices that could possibly
// match each other are ever compared — a duplicate always requires the same
// supplier, so this is the same result as comparing every pair, just without
// the O(n²) cost of cross-supplier comparisons that can never match.
export const findDuplicates = invoices => {
  const dupeIds = new Set();
  const bySupplier = new Map();
  for (const inv of invoices) {
    const key = normSup(inv.supplier);
    if (!bySupplier.has(key)) bySupplier.set(key, []);
    bySupplier.get(key).push(inv);
  }

  for (const group of bySupplier.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        const exactMatch = a.invoiceNo && b.invoiceNo && a.invoiceNo.trim() === b.invoiceNo.trim();
        const fuzzyMatch = Number(a.amount) === Number(b.amount) && a.invoiceDate === b.invoiceDate;
        if (exactMatch || fuzzyMatch) { dupeIds.add(a.id); dupeIds.add(b.id); }
      }
    }
  }
  return dupeIds;
};

export const matchSupplier = (name, suppliers) => {
  if (!name || !suppliers?.length) return null;
  const n = norm(name);

  // 1. Exact match (quote-normalised)
  let hit = suppliers.find(s => norm(s.name) === n);
  if (hit) return hit;

  // 2. Substring match — one name contains the other (no ratio gate so that short
  //    stored names like "ארגל" match longer extracted names like "ארגל אקספרס").
  //    When multiple suppliers match, pick the one with the longest name (most specific).
  const STOP = new Set(['בע"מ', 'בעמ', 'ובע"מ']);
  const subMatches = suppliers.filter(s => {
    const sn = norm(s.name);
    return n.includes(sn) || sn.includes(n);
  });
  if (subMatches.length === 1) return subMatches[0];
  if (subMatches.length > 1) {
    return subMatches.reduce((b, s) => norm(s.name).length > norm(b.name).length ? s : b);
  }

  // 3. Word-overlap — exclude generic business-entity suffix so that בע"מ
  //    (in any quote encoding) never drives a match on its own
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
                    { bg:"#0b1628", color:"#06b6d4", dot:"#818cf8" };
