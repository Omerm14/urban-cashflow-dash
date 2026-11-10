import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  normalizeName, matchCustomer, chunkText, buildReviewRows, validateRow, rematchRow, newCustomerNames,
} from "../src/utils/collectionsImport.js";

const require = createRequire(import.meta.url);
const { normalizeParsedCollections, isIsoDate, MAX_ROWS } = require("../server/lib/collectionsImport.js");

describe("normalizeParsedCollections (server)", () => {
  it("keeps valid rows and cleans values", () => {
    const out = normalizeParsedCollections([
      { customer: "  יוסי   כהן ", amount: "3,500", expected_date: "2026-09-12", collected_date: null, reference: null, description: "עבודה", source: "יוסי כהן 3500 12/9" },
    ]);
    expect(out).toEqual([{ customer: "יוסי כהן", amount: 3500, expected_date: "2026-09-12", collected_date: null, payment_method: null, reference: null, description: "עבודה", source: "יוסי כהן 3500 12/9" }]);
  });
  it("drops rows without a customer or a positive amount", () => {
    const out = normalizeParsedCollections([
      { customer: "", amount: 100 }, { customer: "A", amount: 0 }, { customer: "B", amount: -5 }, { customer: "C", amount: "abc" }, null, "x",
    ]);
    expect(out).toEqual([]);
  });
  it("nulls invalid dates and lets a paid row borrow its collected date as expected date", () => {
    const [a, b] = normalizeParsedCollections([
      { customer: "A", amount: 1, expected_date: "2026-02-30", collected_date: "12/9" },
      { customer: "B", amount: 1, expected_date: null, collected_date: "2026-11-02" },
    ]);
    expect(a.expected_date).toBeNull();
    expect(a.collected_date).toBeNull();
    expect(b.expected_date).toBe("2026-11-02");
  });
  it("rounds to agorot, strips the shekel sign, caps the row count", () => {
    expect(normalizeParsedCollections([{ customer: "A", amount: "₪1,234.567" }])[0].amount).toBe(1234.57);
    const many = Array.from({ length: MAX_ROWS + 20 }, (_, i) => ({ customer: `c${i}`, amount: 1 }));
    expect(normalizeParsedCollections(many)).toHaveLength(MAX_ROWS);
  });
  it("keeps a known payment method only on collected rows", () => {
    const [a, b, c] = normalizeParsedCollections([
      { customer: "A", amount: 1, expected_date: "2026-01-01", collected_date: "2026-01-02", payment_method: "bit_paybox" },
      { customer: "B", amount: 1, expected_date: "2026-01-01", collected_date: null, payment_method: "cash" },
      { customer: "C", amount: 1, expected_date: "2026-01-01", collected_date: "2026-01-02", payment_method: "paypal" },
    ]);
    expect([a.payment_method, b.payment_method, c.payment_method]).toEqual(["bit_paybox", null, null]);
  });
  it("returns [] for non-array input", () => {
    expect(normalizeParsedCollections({ customer: "A", amount: 1 })).toEqual([]);
  });
  it("isIsoDate rejects impossible dates", () => {
    expect(isIsoDate("2026-11-10")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-11-10T00:00")).toBe(false);
  });
});

describe("normalizeName / matchCustomer", () => {
  it("treats Hebrew quote variants and spacing as the same name", () => {
    expect(normalizeName('כרמל  בע״מ')).toBe(normalizeName('כרמל בע"מ'));
    expect(normalizeName("כרמל בע''מ")).toBe(normalizeName('כרמל בע"מ'));
    expect(normalizeName(" Carmel LTD ")).toBe("carmel ltd");
  });
  it("matches an existing customer, otherwise null", () => {
    const cs = [{ id: "1", name: 'כרמל בע"מ' }];
    expect(matchCustomer("כרמל בע״מ", cs)?.id).toBe("1");
    expect(matchCustomer("כרמל", cs)).toBeNull();
    expect(matchCustomer("  ", cs)).toBeNull();
  });
});

describe("chunkText", () => {
  it("returns one chunk for short text and [] for empty", () => {
    expect(chunkText("a\nb", 100)).toEqual(["a\nb"]);
    expect(chunkText("   ", 100)).toEqual([]);
  });
  it("never splits a line and keeps every chunk within the limit", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i} יוסי 100`);
    const chunks = chunkText(lines.join("\n"), 60);
    expect(chunks.every(c => c.length <= 60)).toBe(true);
    expect(chunks.join("\n").split("\n")).toEqual(lines);
  });
  it("hard-splits a single line longer than the limit", () => {
    const chunks = chunkText("x".repeat(25), 10);
    expect(chunks).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
});

describe("buildReviewRows", () => {
  const customers = [{ id: "c1", name: 'כרמל בע"מ' }];
  const receivables = [{ id: 9, customer_id: "c1", amount: "12000.00", expected_date: "2026-11-05" }];
  const items = [
    { customer: "כרמל בע״מ", amount: 12000, expected_date: "2026-11-05", collected_date: null },
    { customer: "יוסי", amount: 3500, expected_date: "2026-09-12", collected_date: "2026-09-14" },
    { customer: "יוסי", amount: 3500, expected_date: "2026-09-12", collected_date: null },
  ];
  const rows = buildReviewRows(items, customers, receivables);
  it("links existing customers and marks new ones", () => {
    expect(rows[0]).toMatchObject({ customerId: "c1", isNew: false, customer: 'כרמל בע"מ' });
    expect(rows[1]).toMatchObject({ customerId: null, isNew: true, collected_date: "2026-09-14" });
  });
  it("flags duplicates of saved rows and repeats within the paste, unticked", () => {
    expect(rows[0]).toMatchObject({ duplicate: "existing", include: false });
    expect(rows[1]).toMatchObject({ duplicate: null, include: true });
    expect(rows[2]).toMatchObject({ duplicate: "batch", include: false });
  });
  it("rematchRow updates the link after the user edits the name", () => {
    expect(rematchRow({ ...rows[1], customer: "כרמל בע\"מ" }, customers)).toMatchObject({ customerId: "c1", isNew: false });
  });
});

describe("validateRow / newCustomerNames", () => {
  it("requires customer, positive amount and expected date", () => {
    const ok = { customer: "A", amount: 5, expected_date: "2026-01-01" };
    expect(validateRow(ok)).toBeNull();
    expect(validateRow({ ...ok, customer: " " })).toBe("coll_err_customer");
    expect(validateRow({ ...ok, amount: "0" })).toBe("coll_err_amount");
    expect(validateRow({ ...ok, expected_date: "" })).toBe("coll_err_date");
  });
  it("lists each new customer once, only from included rows", () => {
    const rows = [
      { include: true, isNew: true, customer: "יוסי" }, { include: true, isNew: true, customer: " יוסי " },
      { include: false, isNew: true, customer: "דנה" }, { include: true, isNew: false, customer: "כרמל" },
    ];
    expect(newCustomerNames(rows)).toEqual(["יוסי"]);
  });
});
