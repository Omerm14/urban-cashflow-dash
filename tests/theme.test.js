import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NIGHT, DAY, CHART_PALETTE_NIGHT, CHART_PALETTE_DAY } from "../src/theme.js";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/index.css"),
  "utf8"
);

// src/theme.js (JS tokens for inline styles) and src/index.css (CSS custom
// properties) are two copies of the same design tokens. This test fails if
// someone edits one side and forgets the other.
describe("theme tokens stay in sync with index.css", () => {
  const core = (T) => ({
    "--bg": T.bg, "--surf": T.surf, "--surf2": T.surf2, "--surf3": T.surf3,
    "--t1": T.t1, "--t2": T.t2, "--t3": T.t3,
    "--accent": T.accent, "--accent-ink": T.accentInk,
    "--brass": T.brass, "--green": T.green, "--red": T.red, "--amber": T.amber,
  });

  it("night tokens appear in CSS", () => {
    for (const [prop, value] of Object.entries(core(NIGHT))) {
      expect(css, `${prop}: ${value}`).toContain(`${prop}: ${value}`);
    }
  });

  it("day tokens appear in CSS", () => {
    for (const [prop, value] of Object.entries(core(DAY))) {
      expect(css, `${prop}: ${value}`).toContain(`${prop}: ${value}`);
    }
  });

  it("legacy alias keys still resolve (pre-refactor inline styles)", () => {
    expect(NIGHT.indigo).toBe(NIGHT.accent);
    expect(DAY.indigo).toBe(DAY.accent);
    expect(css).toContain("--primary: var(--accent)");
  });

  it("chart palettes have 8 fixed slots per mode", () => {
    expect(CHART_PALETTE_NIGHT).toHaveLength(8);
    expect(CHART_PALETTE_DAY).toHaveLength(8);
    // Order is the CVD-safety mechanism — freeze it.
    expect(CHART_PALETTE_NIGHT[0]).toBe("#1FA97A");
    expect(CHART_PALETTE_DAY[0]).toBe("#0E8A61");
  });
});
