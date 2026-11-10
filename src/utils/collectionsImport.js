// Pure helpers for the Collections history import (paste SMS / notes → review → import).
// The server returns normalized items (server/lib/collectionsImport.js); everything
// here prepares them for the review table and the final insert.

// Unify the many ways Hebrew text writes quotes/geresh (בע"מ, בע״מ, בע''מ) and spacing,
// so "כרמל בע״מ" from an SMS matches an existing "כרמל בע"מ" customer.
export const normalizeName = s =>
  String(s ?? "")
    .replace(/[״″“”„]/g, '"')
    .replace(/''/g, '"')
    .replace(/[׳’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const matchCustomer = (name, customers) => {
  const key = normalizeName(name);
  if (!key) return null;
  return customers.find(c => normalizeName(c.name) === key) || null;
};

// Splits pasted text into pieces of at most `max` characters, breaking on blank
// lines first, then single newlines — never mid-line unless one line alone is too long.
export const chunkText = (text, max = 6000) => {
  const src = String(text ?? "").trim();
  if (!src) return [];
  if (src.length <= max) return [src];
  const chunks = [];
  let cur = "";
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
  for (const line of src.split("\n")) {
    if (line.length > max) {
      push();
      for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max));
      continue;
    }
    if (cur.length + line.length + 1 > max) push();
    cur += (cur ? "\n" : "") + line;
  }
  push();
  return chunks;
};

const dupKey = (customerKey, amount, expected) => `${customerKey}|${Number(amount).toFixed(2)}|${expected || ""}`;

// items → review rows. Each row: { key, include, customer, customerId, isNew, amount,
// expected_date, collected_date, reference, description, source, duplicate }.
// Possible duplicates (already saved, or repeated within this paste) start unchecked.
export const buildReviewRows = (items, customers, receivables) => {
  const existing = new Set(
    receivables.map(r => {
      const c = customers.find(x => x.id === r.customer_id);
      return dupKey(normalizeName(c?.name), r.amount, r.expected_date);
    })
  );
  const seen = new Set();
  return items.map((it, i) => {
    const match = matchCustomer(it.customer, customers);
    const k = dupKey(normalizeName(it.customer), it.amount, it.expected_date);
    const duplicate = existing.has(k) ? "existing" : seen.has(k) ? "batch" : null;
    seen.add(k);
    return {
      key: `r${i}`,
      include: !duplicate,
      customer: match ? match.name : it.customer,
      customerId: match ? match.id : null,
      isNew: !match,
      amount: it.amount,
      expected_date: it.expected_date || "",
      collected_date: it.collected_date || "",
      reference: it.reference || "",
      description: it.description || "",
      source: it.source || "",
      duplicate,
    };
  });
};

// Returns an i18n error key, or null when the row can be imported.
export const validateRow = row => {
  if (!normalizeName(row.customer)) return "coll_err_customer";
  if (!(Number(row.amount) > 0)) return "coll_err_amount";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.expected_date || "")) return "coll_err_date";
  return null;
};

// Re-derives customer matching after the user edits a name in the review table.
export const rematchRow = (row, customers) => {
  const match = matchCustomer(row.customer, customers);
  return { ...row, customerId: match ? match.id : null, isNew: !match };
};

// Distinct new-customer names among the rows that will be imported (normalized dedupe,
// first spelling wins).
export const newCustomerNames = rows => {
  const byKey = new Map();
  rows.forEach(r => { if (r.include && r.isNew) { const k = normalizeName(r.customer); if (k && !byKey.has(k)) byKey.set(k, r.customer.trim()); } });
  return [...byKey.values()];
};
