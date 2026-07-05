// ── Night Ledger design tokens ────────────────────────────────────────────────
// Single source of truth for JS-side theme values. The CSS custom properties in
// src/index.css mirror these — tests/theme.test.js asserts the two stay in sync.
//
// Key naming: new semantic names (accent, accentInk, brass…) plus the legacy
// aliases (indigo, indigoTint, indigoBdr) that pre-refactor inline styles still
// reference. Both point at the same values; prefer the semantic names in new code.

export const FONT_UI      = "'Hanken Grotesk', 'Assistant', system-ui, sans-serif";
export const FONT_DISPLAY = "'Schibsted Grotesk', 'Hanken Grotesk', 'Assistant', system-ui, sans-serif";
export const FONT_MONO    = "'Spline Sans Mono', ui-monospace, 'SF Mono', monospace";

const nightAccent = "#3DD6A3";
const dayAccent   = "#0E8E68";

export const NIGHT = {
  isDark: true,
  bg: "#0A0F0D", surf: "#111917", surf2: "#17211E", surf3: "#1E2A26",
  bdr: "rgba(242,241,234,0.08)", bdr2: "rgba(242,241,234,0.16)",
  t1: "#F2F1EA", t2: "#A8B5AE", t3: "#6E7B74",

  accent: nightAccent, accentTint: "rgba(61,214,163,0.10)", accentBdr: "rgba(61,214,163,0.32)",
  accentInk: "#07120E",                 // text on accent-filled buttons
  accentDeep: "#1FA97A",                // chart slot 1 / pressed states

  brass: "#D9A93F", brassTint: "rgba(217,169,63,0.14)", brassBdr: "rgba(217,169,63,0.38)",

  green: "#3BD68C", greenTint: "rgba(59,214,140,0.10)", greenBdr: "rgba(59,214,140,0.28)",
  red: "#E8604C",   redTint: "rgba(232,96,76,0.12)",    redBdr: "rgba(232,96,76,0.30)",
  amber: "#E0A93D", amberTint: "rgba(224,169,61,0.12)", amberBdr: "rgba(224,169,61,0.30)",
  blue: "#3987E5",  blueTint: "rgba(57,135,229,0.12)",  blueBdr: "rgba(57,135,229,0.30)",
};
// Legacy aliases (inline styles written pre-refactor)
NIGHT.indigo = NIGHT.accent; NIGHT.indigoTint = NIGHT.accentTint; NIGHT.indigoBdr = NIGHT.accentBdr;

export const DAY = {
  isDark: false,
  bg: "#F7F6F1", surf: "#FFFFFF", surf2: "#F1EFE8", surf3: "#E9E6DD",
  bdr: "rgba(20,32,27,0.10)", bdr2: "rgba(20,32,27,0.18)",
  t1: "#14201B", t2: "#4E5B55", t3: "#8A948E",

  accent: dayAccent, accentTint: "rgba(14,142,104,0.08)", accentBdr: "rgba(14,142,104,0.32)",
  accentInk: "#FFFFFF",
  accentDeep: "#0B6E51",

  brass: "#A87E1F", brassTint: "rgba(168,126,31,0.10)", brassBdr: "rgba(168,126,31,0.34)",

  green: "#0C8A47", greenTint: "rgba(12,138,71,0.09)",  greenBdr: "rgba(12,138,71,0.28)",
  red: "#C2482F",   redTint: "rgba(194,72,47,0.09)",    redBdr: "rgba(194,72,47,0.28)",
  amber: "#A36A00", amberTint: "rgba(163,106,0,0.09)",  amberBdr: "rgba(163,106,0,0.28)",
  blue: "#2A78D6",  blueTint: "rgba(42,120,214,0.09)",  blueBdr: "rgba(42,120,214,0.28)",
};
DAY.indigo = DAY.accent; DAY.indigoTint = DAY.accentTint; DAY.indigoBdr = DAY.accentBdr;

// ── Chart palettes ───────────────────────────────────────────────────────────
// 8 categorical slots, fixed order, CVD-validated per mode (Machado-2009 worst
// adjacent ΔE 41.8 on the night surface / 34.5 on the day surface — target ≥12).
// Suppliers are assigned by index; the order is the accessibility mechanism —
// never reorder or insert into the middle.
export const CHART_PALETTE_NIGHT = ["#1FA97A", "#C98500", "#D55181", "#D95926", "#3987E5", "#008300", "#9085E9", "#E66767"];
export const CHART_PALETTE_DAY   = ["#0E8A61", "#A36A00", "#C23A6B", "#C44712", "#2A78D6", "#1B7A1B", "#6A5BD0", "#D03B3B"];

export const chartPalette = (isDark) => (isDark ? CHART_PALETTE_NIGHT : CHART_PALETTE_DAY);
