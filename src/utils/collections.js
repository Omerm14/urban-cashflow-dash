// Pure helpers for the Collections (גבייה) tab. Rows are the raw `receivables`
// table shape (snake_case): { id, customer_id, amount, expected_date, collected_date, ... }.
// Status is derived here, never stored — see supabase/migrations/020_collections.sql.

import { shiftMonthYM } from "./format";

export const COLLECTION_STATUS = { COLLECTED: "collected", OPEN: "open", OVERDUE: "overdue" };

// Local calendar date as "YYYY-MM-DD" (not UTC — an Israeli user at 01:00 is already "tomorrow").
export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Collected once a collection date exists; overdue only strictly after the expected date.
export const receivableStatus = (r, today = todayISO()) => {
  if (r.collected_date) return COLLECTION_STATUS.COLLECTED;
  if (r.expected_date && r.expected_date < today) return COLLECTION_STATUS.OVERDUE;
  return COLLECTION_STATUS.OPEN;
};

export const receivablesInMonth = (list, ym) =>
  list.filter(r => typeof r.expected_date === "string" && r.expected_date.startsWith(ym));

const sumAmounts = list => list.reduce((s, r) => s + Number(r.amount || 0), 0);

export const monthSummary = (list, today = todayISO()) => {
  const by = { collected: [], open: [], overdue: [] };
  list.forEach(r => by[receivableStatus(r, today)].push(r));
  return {
    count: list.length,
    total: sumAmounts(list),
    collectedCount: by.collected.length,
    collected: sumAmounts(by.collected),
    open: sumAmounts(by.open),
    overdue: sumAmounts(by.overdue),
    overdueCount: by.overdue.length,
  };
};

// Same rule as the Invoices tab: a default window of −3…+2 months around today,
// but only months that actually have data, plus the selected month always.
export const monthPills = (list, selectedYM, today = todayISO()) => {
  const thisYM = today.slice(0, 7);
  const defaults = [-3, -2, -1, 0, 1, 2].map(d => shiftMonthYM(thisYM, d));
  const withData = new Set(list.map(r => r.expected_date?.slice(0, 7)).filter(Boolean));
  return [...new Set([...defaults, ...withData, selectedYM])]
    .filter(ym => ym === selectedYM || withData.has(ym))
    .sort();
};

// [{ customer, receivables }] sorted by customer name (locale-aware), receivables by expected date.
// Receivables whose customer isn't loaded are grouped under a null customer at the end.
export const groupByCustomer = (list, customers, locale = "he") => {
  const byId = new Map(customers.map(c => [c.id, c]));
  const groups = new Map();
  list.forEach(r => {
    const key = byId.has(r.customer_id) ? r.customer_id : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  return [...groups.entries()]
    .map(([id, rs]) => ({
      customer: id === null ? null : byId.get(id),
      receivables: [...rs].sort((a, b) => a.expected_date.localeCompare(b.expected_date)),
    }))
    .sort((a, b) => {
      if (!a.customer) return 1;
      if (!b.customer) return -1;
      return a.customer.name.localeCompare(b.customer.name, locale);
    });
};

// Total still owed per customer (not yet collected), across all months.
export const openBalanceByCustomer = list => {
  const map = new Map();
  list.forEach(r => {
    if (r.collected_date) return;
    map.set(r.customer_id, (map.get(r.customer_id) || 0) + Number(r.amount || 0));
  });
  return map;
};

// ─── Collections v2 ───────────────────────────────────────────────────────────

// Order is the display order in the Collect dialog. Must match the CHECK constraint in
// supabase/migrations/021_receivable_payment_method.sql and server/lib/collectionsImport.js.
export const PAYMENT_METHODS = ["bank_transfer", "credit_card", "cash", "cheque", "bit_paybox", "other"];
export const DEFAULT_PAYMENT_METHOD = "bank_transfer";

// Reliability thresholds (days / shares). Named so product can tune them in one place.
export const LATE_GRACE_DAYS = 3;          // paid within 3 days of the expected date counts as on time
export const RELIABILITY_MIN_PAYMENTS = 3; // fewer collected receivables → not enough data for a badge
export const ON_TIME_MAX_LATE_SHARE = 0.2; // ≥80% on time → "on_time"
export const USUALLY_LATE_SHARE = 0.5;     // >50% late → "usually_late"
export const USUALLY_LATE_AVG_DAYS = 14;   // or an average delay over two weeks

const dayNum = iso => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export const daysBetween = (fromISO, toISO) => Math.round(dayNum(toISO) - dayNum(fromISO));

export const reliabilityOf = (lateDays) => {
  if (lateDays.length < RELIABILITY_MIN_PAYMENTS) return null;
  const lateShare = lateDays.filter(d => d > LATE_GRACE_DAYS).length / lateDays.length;
  const avg = lateDays.reduce((a, b) => a + b, 0) / lateDays.length;
  if (lateShare <= ON_TIME_MAX_LATE_SHARE) return "on_time";
  if (lateShare > USUALLY_LATE_SHARE || avg > USUALLY_LATE_AVG_DAYS) return "usually_late";
  return "sometimes_late";
};

const emptyStats = () => ({
  collectedTotal: 0, collectedCount: 0, lastPaymentDate: null, open: 0, overdue: 0, openCount: 0,
  oldestOverdueDays: 0, avgDaysLate: null, usualMethod: null, reliability: null, firstExpected: null,
});

// Map(customerId → stats) derived from receivables. Nothing here is stored in the DB.
export const customerStats = (receivables, today = todayISO()) => {
  const acc = new Map();
  const late = new Map();
  const methods = new Map(); // customerId → Map(method → { n, last })
  for (const r of receivables) {
    if (!acc.has(r.customer_id)) acc.set(r.customer_id, emptyStats());
    const s = acc.get(r.customer_id);
    const amt = Number(r.amount || 0);
    if (!s.firstExpected || r.expected_date < s.firstExpected) s.firstExpected = r.expected_date;
    if (r.collected_date) {
      s.collectedTotal += amt;
      s.collectedCount += 1;
      if (!s.lastPaymentDate || r.collected_date > s.lastPaymentDate) s.lastPaymentDate = r.collected_date;
      if (r.expected_date) {
        if (!late.has(r.customer_id)) late.set(r.customer_id, []);
        late.get(r.customer_id).push(Math.max(0, daysBetween(r.expected_date, r.collected_date)));
      }
      if (r.payment_method) {
        if (!methods.has(r.customer_id)) methods.set(r.customer_id, new Map());
        const m = methods.get(r.customer_id);
        const cur = m.get(r.payment_method) || { n: 0, last: "" };
        m.set(r.payment_method, { n: cur.n + 1, last: r.collected_date > cur.last ? r.collected_date : cur.last });
      }
    } else {
      s.open += amt;
      s.openCount += 1;
      if (r.expected_date && r.expected_date < today) {
        s.overdue += amt;
        s.oldestOverdueDays = Math.max(s.oldestOverdueDays, daysBetween(r.expected_date, today));
      }
    }
  }
  for (const [id, s] of acc) {
    const l = late.get(id) || [];
    s.avgDaysLate = l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null;
    s.reliability = reliabilityOf(l);
    const m = methods.get(id);
    if (m) s.usualMethod = [...m.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last.localeCompare(a[1].last))[0][0];
  }
  return acc;
};

export const statsFor = (statsMap, id) => statsMap.get(id) || emptyStats();

export const CUSTOMER_SORTS = ["owed", "overdue", "collected", "name"];
export const sortCustomers = (customers, statsMap, key, locale = "he") => {
  const s = id => statsFor(statsMap, id);
  const byName = (a, b) => a.name.localeCompare(b.name, locale);
  const cmp = {
    owed: (a, b) => s(b.id).open - s(a.id).open || byName(a, b),
    overdue: (a, b) => s(b.id).overdue - s(a.id).overdue || s(b.id).oldestOverdueDays - s(a.id).oldestOverdueDays || byName(a, b),
    collected: (a, b) => s(b.id).collectedTotal - s(a.id).collectedTotal || byName(a, b),
    name: byName,
  }[key] || byName;
  return [...customers].sort(cmp);
};

// Case/quote-insensitive search over name, phone and email.
export const filterCustomers = (customers, query, normalize = s => String(s ?? "").toLowerCase()) => {
  const q = normalize(query).trim();
  if (!q) return customers;
  return customers.filter(c => [c.name, c.phone, c.email].some(v => v && normalize(v).includes(q)));
};

// statuses: Set of COLLECTION_STATUS values (empty = all); customerIds: Set (empty = all).
export const filterReceivables = (list, { statuses = new Set(), customerIds = new Set() } = {}, today = todayISO()) =>
  list.filter(r =>
    (!statuses.size || statuses.has(receivableStatus(r, today))) &&
    (!customerIds.size || customerIds.has(r.customer_id)));

// Per-row Collect choices → the fewest DB updates: one per distinct (date, method) pair.
// rows: [{ id, date, method }] → [{ date, method, ids: [...] }] in first-seen order.
export const groupCollectUpdates = rows => {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.date}|${r.method ?? ""}`;
    if (!groups.has(key)) groups.set(key, { date: r.date, method: r.method ?? null, ids: [] });
    groups.get(key).ids.push(r.id);
  }
  return [...groups.values()];
};

export const CSV_COLUMNS = ["customer", "reference", "description", "amount", "expected_date", "collected_date", "payment_method", "status"];
// Flat rows for CSV export (sorted by expected date, then customer name).
export const toCsvRows = (list, customers, today = todayISO()) => {
  const names = new Map(customers.map(c => [c.id, c.name]));
  return [...list]
    .sort((a, b) => a.expected_date.localeCompare(b.expected_date) || (names.get(a.customer_id) || "").localeCompare(names.get(b.customer_id) || ""))
    .map(r => ({
      customer: names.get(r.customer_id) || "",
      reference: r.reference || "",
      description: r.description || "",
      amount: Number(r.amount).toFixed(2),
      expected_date: r.expected_date,
      collected_date: r.collected_date || "",
      payment_method: r.payment_method || "",
      status: receivableStatus(r, today),
    }));
};
