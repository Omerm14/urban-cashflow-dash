import { describe, it, expect } from "vitest";
import {
  receivableStatus, receivablesInMonth, monthSummary, monthPills, groupByCustomer,
  openBalanceByCustomer, todayISO,
} from "../src/utils/collections.js";

const TODAY = "2026-11-10";
const r = (id, customer_id, amount, expected_date, collected_date = null) =>
  ({ id, customer_id, amount, expected_date, collected_date });

describe("receivableStatus", () => {
  it("is collected when a collection date exists, even if late", () => {
    expect(receivableStatus(r(1, "c", 100, "2026-10-01", "2026-11-02"), TODAY)).toBe("collected");
  });
  it("is overdue strictly after the expected date", () => {
    expect(receivableStatus(r(1, "c", 100, "2026-11-09"), TODAY)).toBe("overdue");
  });
  it("is open on the expected date itself and after it", () => {
    expect(receivableStatus(r(1, "c", 100, "2026-11-10"), TODAY)).toBe("open");
    expect(receivableStatus(r(1, "c", 100, "2026-12-01"), TODAY)).toBe("open");
  });
});

describe("todayISO", () => {
  it("uses the local calendar date, zero-padded", () => {
    expect(todayISO(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  });
});

describe("monthSummary", () => {
  const list = [
    r(1, "a", "12000.00", "2026-11-05", "2026-11-04"),
    r(2, "a", 10000, "2026-11-15"),
    r(3, "b", 5000, "2026-11-01"),
  ];
  it("totals by derived status and coerces numeric strings", () => {
    expect(monthSummary(list, TODAY)).toEqual({
      count: 3, total: 27000, collectedCount: 1, collected: 12000, open: 10000, overdue: 5000, overdueCount: 1,
    });
  });
  it("is all zeros for an empty month", () => {
    expect(monthSummary([], TODAY).total).toBe(0);
  });
});

describe("receivablesInMonth", () => {
  it("filters by the expected (not collected) month", () => {
    const list = [r(1, "a", 1, "2026-10-30", "2026-11-02"), r(2, "a", 1, "2026-11-30")];
    expect(receivablesInMonth(list, "2026-11").map(x => x.id)).toEqual([2]);
    expect(receivablesInMonth(list, "2026-10").map(x => x.id)).toEqual([1]);
  });
});

describe("monthPills", () => {
  it("keeps only months with data plus the selected month, sorted", () => {
    const list = [r(1, "a", 1, "2026-09-05"), r(2, "a", 1, "2027-03-01")];
    expect(monthPills(list, "2026-11", TODAY)).toEqual(["2026-09", "2026-11", "2027-03"]);
  });
  it("returns just the selected month when there is no data", () => {
    expect(monthPills([], "2026-11", TODAY)).toEqual(["2026-11"]);
  });
});

describe("groupByCustomer", () => {
  const customers = [{ id: "b", name: "בננה" }, { id: "a", name: "אלון" }];
  it("sorts customers by name and receivables by expected date; orphans last", () => {
    const list = [r(1, "b", 1, "2026-11-20"), r(2, "a", 1, "2026-11-15"), r(3, "a", 1, "2026-11-02"), r(4, "zz", 1, "2026-11-01")];
    const groups = groupByCustomer(list, customers, "he");
    expect(groups.map(g => g.customer?.id ?? null)).toEqual(["a", "b", null]);
    expect(groups[0].receivables.map(x => x.id)).toEqual([3, 2]);
  });
});

describe("openBalanceByCustomer", () => {
  it("sums only uncollected receivables across all months", () => {
    const list = [r(1, "a", 100, "2026-10-01"), r(2, "a", 50, "2026-12-01"), r(3, "a", 999, "2026-11-01", "2026-11-01"), r(4, "b", 7, "2026-11-01")];
    const m = openBalanceByCustomer(list);
    expect(m.get("a")).toBe(150);
    expect(m.get("b")).toBe(7);
  });
});
