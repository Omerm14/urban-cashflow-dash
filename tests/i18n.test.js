import { describe, it, expect } from "vitest";
import en from "../src/i18n/en.js";
import he from "../src/i18n/he.js";

// Every UI string must exist in both languages — a missing key in either file
// means the language toggle silently falls back to English (or shows raw keys).
describe("i18n parity", () => {
  it("Hebrew has every English key", () => {
    const missing = Object.keys(en).filter((k) => !(k in he));
    expect(missing).toEqual([]);
  });

  it("English has every Hebrew key", () => {
    const missing = Object.keys(he).filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it("placeholder variables match between languages", () => {
    const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
    const mismatched = Object.keys(en).filter(
      (k) => k in he && vars(en[k]).join(",") !== vars(he[k]).join(",")
    );
    expect(mismatched).toEqual([]);
  });

  it("no empty strings", () => {
    const emptyEn = Object.entries(en).filter(([, v]) => !String(v).trim());
    const emptyHe = Object.entries(he).filter(([, v]) => !String(v).trim());
    expect(emptyEn).toEqual([]);
    expect(emptyHe).toEqual([]);
  });
});
