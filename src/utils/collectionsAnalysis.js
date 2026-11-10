// Pure helpers for the Collections → Analysis tab (yearly chart per customer).
// basis "collected": money by the month it actually came in (collected_date);
// basis "billed":    money by the month it was expected (expected_date).

export const ANALYSIS_TOP_N = 7;        // lines with their own color; the rest fold into "Others" (palette slot 8)
export const SPIKE_UP_PCT = 60;         // ≥ +60% vs the customer's trailing average
export const SPIKE_DOWN_PCT = -50;      // ≤ −50%
export const SPIKE_WINDOW = 6;          // trailing months used for the average
export const SPIKE_MIN_PAID_MONTHS = 4; // fewer months with money → irregular payer, no flags
export const SPIKE_MIN_AVG = 1000;      // ignore tiny customers (₪)

const dateFor = (r, basis) => (basis === "collected" ? r.collected_date : r.expected_date);

export const analysisYears = (receivables, basis = "collected") =>
  [...new Set(receivables.map(r => dateFor(r, basis)?.slice(0, 4)).filter(Boolean).map(Number))].sort((a, b) => a - b);

// Map(customerId → number[12]). With basis "collected", months after `todayYM` are null
// (money can't have come in yet), so lines stop at the current month instead of dropping to 0.
export const yearSeries = (receivables, year, basis = "collected", todayYM = "9999-12") => {
  const out = new Map();
  const ensure = id => { if (!out.has(id)) out.set(id, Array(12).fill(0)); return out.get(id); };
  for (const r of receivables) {
    const d = dateFor(r, basis);
    if (!d || Number(d.slice(0, 4)) !== year) continue;
    ensure(r.customer_id)[Number(d.slice(5, 7)) - 1] += Number(r.amount || 0);
  }
  if (basis === "collected") {
    for (const vals of out.values()) {
      for (let i = 0; i < 12; i++) if (`${year}-${String(i + 1).padStart(2, "0")}` > todayYM) vals[i] = null;
    }
  }
  return out;
};

export const seriesTotal = vals => vals.reduce((a, v) => a + (v || 0), 0);

export const topCustomerIds = (series, n = ANALYSIS_TOP_N) =>
  [...series.entries()].map(([id, vals]) => [id, seriesTotal(vals)]).filter(([, t]) => t > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);

// Flags months that jump or drop sharply against the customer's own trailing average.
// `prev` = the previous year's 12 values, so January can compare against last autumn.
// A zero month only counts as a drop for steady payers (paid ≥ 5 of the last 6 months),
// so one late payment from an irregular customer isn't reported as "-100%".
export const paymentSpikes = (vals, prev = []) => {
  const all = [...prev, ...vals];
  const out = [];
  vals.forEach((v, i) => {
    if (v === null || v === undefined) return;
    const j = prev.length + i;
    const win = all.slice(Math.max(0, j - SPIKE_WINDOW), j).filter(x => x !== null && x !== undefined);
    const paidMonths = win.filter(x => x > 0).length;
    if (paidMonths < SPIKE_MIN_PAID_MONTHS) return;
    const avg = win.reduce((a, b) => a + b, 0) / win.length;
    if (avg < SPIKE_MIN_AVG) return;
    const pct = Math.round(((v - avg) / avg) * 100);
    if (pct >= SPIKE_UP_PCT) out.push({ i, pct, kind: "up" });
    else if (pct <= SPIKE_DOWN_PCT && (v > 0 || paidMonths >= 5)) out.push({ i, pct, kind: "down" });
  });
  return out;
};

// Rows for the chart: [{ i, c_<id>: value, other: value, total: value }] for 12 months.
export const chartRows = (series, lineIds) => {
  const others = [...series.keys()].filter(id => !lineIds.includes(id));
  return Array.from({ length: 12 }, (_, i) => {
    const row = { i };
    let total = 0, other = 0, any = false;
    for (const [id, vals] of series) {
      const v = vals[i];
      if (v === null) continue;
      any = true;
      total += v;
      if (lineIds.includes(id)) row[`c_${id}`] = v; else other += v;
    }
    for (const id of lineIds) if (!(`c_${id}` in row)) row[`c_${id}`] = any ? 0 : null;
    row.other = any && others.length ? other : null;
    row.total = any ? total : null;
    return row;
  });
};
