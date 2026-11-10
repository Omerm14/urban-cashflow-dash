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
