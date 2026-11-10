import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  PAYMENT_METHODS, customerStats, statsFor, reliabilityOf, sortCustomers, filterCustomers, filterReceivables,
  groupCollectUpdates, daysBetween,
} from "../src/utils/collections.js";
import { normalizeName } from "../src/utils/collectionsImport.js";

const require = createRequire(import.meta.url);
const TODAY = "2026-11-10";
const r = (id, customer_id, amount, expected_date, collected_date = null, payment_method = null) =>
  ({ id, customer_id, amount, expected_date, collected_date, payment_method });

describe("payment methods stay in sync (client, server, migration 021)", () => {
  it("server whitelist and DB CHECK list the same values as the client", () => {
    const server = require("../server/lib/collectionsImport.js").PAYMENT_METHODS;
    expect(server).toEqual(PAYMENT_METHODS);
    const sql = readFileSync(new URL("../supabase/migrations/021_receivable_payment_method.sql", import.meta.url), "utf8");
    const inList = sql.match(/payment_method IN\s*\(([^)]*)\)/)[1].match(/'([a-z_]+)'/g).map(s => s.slice(1, -1));
    expect(inList).toEqual(PAYMENT_METHODS);
  });
});

describe("daysBetween", () => {
  it("counts calendar days across month and DST boundaries", () => {
    expect(daysBetween("2026-10-25", "2026-11-01")).toBe(7);
    expect(daysBetween("2026-03-01", "2026-02-28")).toBe(-1);
  });
});

describe("reliabilityOf", () => {
  it("needs at least 3 payments", () => expect(reliabilityOf([0, 0])).toBeNull());
  it("on_time when ≥80% within the 3-day grace", () => expect(reliabilityOf([0, 1, 3, 2, 10])).toBe("on_time"));
  it("usually_late when most are late", () => expect(reliabilityOf([5, 9, 0])).toBe("usually_late"));
  it("usually_late when the average is over two weeks", () => expect(reliabilityOf([0, 0, 0, 60])).toBe("usually_late"));
  it("sometimes_late in between", () => expect(reliabilityOf([0, 0, 7])).toBe("sometimes_late"));
});

describe("customerStats", () => {
  const list = [
    r(1, "a", "1000.00", "2026-09-01", "2026-09-01", "cash"),
    r(2, "a", 2000, "2026-10-01", "2026-10-11", "bit_paybox"),
    r(3, "a", 3000, "2026-10-15", "2026-10-15", "bit_paybox"),
    r(4, "a", 500, "2026-11-01"),          // overdue 9 days
    r(5, "a", 700, "2026-11-20"),          // open, not overdue
    r(6, "b", 100, "2026-11-30"),
  ];
  const m = customerStats(list, TODAY);
  it("totals collected / open / overdue and finds the last payment", () => {
    expect(statsFor(m, "a")).toMatchObject({
      collectedTotal: 6000, collectedCount: 3, lastPaymentDate: "2026-10-15",
      open: 1200, openCount: 2, overdue: 500, oldestOverdueDays: 9, firstExpected: "2026-09-01",
    });
  });
  it("averages days late (early counts as 0) and rates reliability", () => {
    expect(statsFor(m, "a").avgDaysLate).toBe(3);   // (0 + 10 + 0) / 3
    expect(statsFor(m, "a").reliability).toBe("sometimes_late");
  });
  it("picks the most frequent method; ties go to the most recent", () => {
    expect(statsFor(m, "a").usualMethod).toBe("bit_paybox");
    const tie = customerStats([r(1, "x", 1, "2026-01-01", "2026-01-01", "cash"), r(2, "x", 1, "2026-02-01", "2026-02-01", "cheque")], TODAY);
    expect(statsFor(tie, "x").usualMethod).toBe("cheque");
  });
  it("returns empty stats for a customer with no receivables", () => {
    expect(statsFor(m, "zz")).toMatchObject({ collectedTotal: 0, open: 0, reliability: null, usualMethod: null });
  });
});

describe("sortCustomers / filterCustomers", () => {
  const customers = [{ id: "a", name: "בננה", phone: "050-1" }, { id: "b", name: "אלון", email: "x@y.co" }, { id: "c", name: 'כרמל בע"מ' }];
  const m = customerStats([r(1, "a", 100, "2026-11-01"), r(2, "b", 900, "2026-12-01"), r(3, "c", 5000, "2026-01-01", "2026-01-01")], TODAY);
  it("sorts by owed, overdue, collected and name", () => {
    expect(sortCustomers(customers, m, "owed").map(c => c.id)).toEqual(["b", "a", "c"]);
    expect(sortCustomers(customers, m, "overdue")[0].id).toBe("a");
    expect(sortCustomers(customers, m, "collected")[0].id).toBe("c");
    expect(sortCustomers(customers, m, "name", "he").map(c => c.id)).toEqual(["b", "a", "c"]);
  });
  it("searches name, phone and email, ignoring Hebrew quote variants", () => {
    expect(filterCustomers(customers, "כרמל בע״מ", normalizeName).map(c => c.id)).toEqual(["c"]);
    expect(filterCustomers(customers, "050", normalizeName).map(c => c.id)).toEqual(["a"]);
    expect(filterCustomers(customers, "X@Y", normalizeName).map(c => c.id)).toEqual(["b"]);
    expect(filterCustomers(customers, "  ", normalizeName)).toHaveLength(3);
  });
});

describe("filterReceivables", () => {
  const list = [r(1, "a", 1, "2026-11-01"), r(2, "a", 1, "2026-11-20"), r(3, "b", 1, "2026-11-01", "2026-11-02")];
  it("filters by derived status and customer; empty sets mean all", () => {
    expect(filterReceivables(list, {}, TODAY)).toHaveLength(3);
    expect(filterReceivables(list, { statuses: new Set(["overdue"]) }, TODAY).map(x => x.id)).toEqual([1]);
    expect(filterReceivables(list, { statuses: new Set(["open", "collected"]), customerIds: new Set(["b"]) }, TODAY).map(x => x.id)).toEqual([3]);
  });
});

describe("groupCollectUpdates", () => {
  it("one update per distinct (date, method), keeping first-seen order", () => {
    expect(groupCollectUpdates([
      { id: 1, date: "2026-11-10", method: "bank_transfer" },
      { id: 2, date: "2026-11-10", method: "cheque" },
      { id: 3, date: "2026-11-10", method: "bank_transfer" },
      { id: 4, date: "2026-11-02", method: "cheque" },
    ])).toEqual([
      { date: "2026-11-10", method: "bank_transfer", ids: [1, 3] },
      { date: "2026-11-10", method: "cheque", ids: [2] },
      { date: "2026-11-02", method: "cheque", ids: [4] },
    ]);
  });
  it("empty input → no updates", () => expect(groupCollectUpdates([])).toEqual([]));
});
