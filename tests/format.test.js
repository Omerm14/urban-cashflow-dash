import { describe, it, expect } from "vitest";
import { shiftMonthYM, nextMonthYM } from "../src/utils/format";

describe("shiftMonthYM", () => {
  it("shifts forward within a year", () => {
    expect(shiftMonthYM("2026-08", 2)).toBe("2026-10");
  });

  it("shifts backward within a year", () => {
    expect(shiftMonthYM("2026-08", -3)).toBe("2026-05");
  });

  it("rolls over into the next year", () => {
    expect(shiftMonthYM("2026-11", 2)).toBe("2027-01");
  });

  it("rolls back into the previous year", () => {
    expect(shiftMonthYM("2026-01", -1)).toBe("2025-12");
  });

  it("returns the same month for delta 0", () => {
    expect(shiftMonthYM("2026-08", 0)).toBe("2026-08");
  });

  it("nextMonthYM stays consistent with shiftMonthYM(+1)", () => {
    expect(nextMonthYM("2026-07")).toBe(shiftMonthYM("2026-07", 1));
  });
});
