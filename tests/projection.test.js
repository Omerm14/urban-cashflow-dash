import { describe, it, expect } from "vitest";
import { projectMonth } from "../src/utils/projection.js";

const inv = (supplier, dueDate, amount) => ({ supplier, dueDate, amount });

describe("projectMonth", () => {
  it("sums committed invoices for the target month", () => {
    const { committed, forecast } = projectMonth(
      [inv("A", "2026-08-05", 1000), inv("A", "2026-08-20", 500)],
      "2026-08"
    );
    expect(committed).toBe(1500);
    expect(forecast).toBe(0); // no history → nothing to forecast
  });

  it("forecasts recurring suppliers who haven't billed yet", () => {
    const invoices = [
      // Bezeq billed in all 3 lookback months (avg 400)
      inv("Bezeq", "2026-05-05", 300),
      inv("Bezeq", "2026-06-05", 400),
      inv("Bezeq", "2026-07-05", 500),
      // One-off supplier — only one month, below minMonths
      inv("OneOff", "2026-06-15", 9000),
    ];
    const p = projectMonth(invoices, "2026-08");
    expect(p.forecast).toBe(400);
    expect(p.forecastSuppliers).toEqual(["Bezeq"]);
    expect(p.total).toBe(400);
  });

  it("does not double-count suppliers already committed in the target month", () => {
    const invoices = [
      inv("Bezeq", "2026-06-05", 400),
      inv("Bezeq", "2026-07-05", 400),
      inv("Bezeq", "2026-08-05", 450), // already committed for August
    ];
    const p = projectMonth(invoices, "2026-08");
    expect(p.committed).toBe(450);
    expect(p.forecast).toBe(0);
  });

  it("handles year boundaries in the lookback window", () => {
    const invoices = [
      inv("Delta", "2025-11-10", 600),
      inv("Delta", "2025-12-10", 600),
    ];
    const p = projectMonth(invoices, "2026-01");
    expect(p.forecast).toBe(600);
  });

  it("ignores credit-dominated (negative) supplier history", () => {
    const invoices = [
      inv("Refunds Ltd", "2026-06-01", -500),
      inv("Refunds Ltd", "2026-07-01", -500),
    ];
    const p = projectMonth(invoices, "2026-08");
    expect(p.forecast).toBe(0);
  });
});
