import { describe, it, expect } from "vitest";
import { analysisYears, yearSeries, topCustomerIds, paymentSpikes, chartRows, seriesTotal } from "../src/utils/collectionsAnalysis.js";

const r = (customer_id, amount, expected_date, collected_date = null) => ({ customer_id, amount, expected_date, collected_date });
const list = [
  r("a", 100, "2025-12-31", "2026-01-03"),   // billed 2025, collected 2026
  r("a", 200, "2026-03-31", "2026-03-31"),
  r("b", "50.50", "2026-03-15"),               // open: billed only
  r("c", 999, "2026-11-30", null),
];

describe("analysisYears", () => {
  it("lists years by the chosen basis", () => {
    expect(analysisYears(list, "collected")).toEqual([2026]);
    expect(analysisYears(list, "billed")).toEqual([2025, 2026]);
  });
});

describe("yearSeries", () => {
  it("buckets by collection month and nulls future months", () => {
    const s = yearSeries(list, 2026, "collected", "2026-10");
    expect(s.get("a").slice(0, 3)).toEqual([100, 0, 200]);
    expect(s.get("a")[9]).toBe(0);
    expect(s.get("a")[10]).toBeNull();
    expect(s.has("b")).toBe(false);
  });
  it("buckets by expected month for billed, coercing numeric strings", () => {
    const s = yearSeries(list, 2026, "billed");
    expect(s.get("b")[2]).toBe(50.5);
    expect(s.get("c")[10]).toBe(999);
    expect(s.get("a")[0]).toBe(0);
  });
});

describe("topCustomerIds", () => {
  it("orders by yearly total and drops customers with nothing", () => {
    const s = new Map([["x", [1, 0]], ["y", [5, 5]], ["z", [0, 0]]]);
    expect(topCustomerIds(s, 7)).toEqual(["y", "x"]);
    expect(topCustomerIds(s, 1)).toEqual(["y"]);
  });
});

describe("paymentSpikes", () => {
  const steady = [10000, 10000, 10000, 10000, 10000, 10000];
  it("flags a jump and a drop against the trailing average", () => {
    const out = paymentSpikes([...steady, 17000, 4000]);
    expect(out).toEqual([{ i: 6, pct: 70, kind: "up" }, { i: 7, pct: -64, kind: "down" }]);
  });
  it("uses last year's months so January can be compared", () => {
    expect(paymentSpikes([20000], steady)).toEqual([{ i: 0, pct: 100, kind: "up" }]);
  });
  it("ignores irregular payers and tiny averages", () => {
    expect(paymentSpikes([0, 5000, 0, 0, 5000, 0, 20000])).toEqual([]);
    expect(paymentSpikes([200, 200, 200, 200, 200, 200, 900])).toEqual([]);
  });
  it("a zero month is a drop only for steady payers; null (future) is never flagged", () => {
    expect(paymentSpikes([...steady, 0])[0]).toMatchObject({ kind: "down", pct: -100 });
    expect(paymentSpikes([10000, 0, 10000, 10000, 10000, 0, 0])).toEqual([]);
    expect(paymentSpikes([...steady, null])).toEqual([]);
  });
});

describe("chartRows", () => {
  it("splits named lines from Others and totals each month", () => {
    const s = new Map([["a", [5, 1, null]], ["b", [2, 0, null]], ["c", [3, 4, null]]]);
    const rows = chartRows(s, ["a", "c"]);
    expect(rows[0]).toEqual({ i: 0, c_a: 5, c_c: 3, other: 2, total: 10 });
    expect(rows[2]).toEqual({ i: 2, c_a: null, c_c: null, other: null, total: null });
    expect(seriesTotal([1, null, 2])).toBe(3);
  });
});
