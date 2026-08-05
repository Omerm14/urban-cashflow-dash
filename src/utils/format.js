// Shared display formatting (extracted from App.jsx during the design overhaul).

export const fmt = (n) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-07" + delta → shifted "YYYY-MM" (delta may be negative)
export const shiftMonthYM = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// "2026-07" → "2026-08"
export const nextMonthYM = (ym) => shiftMonthYM(ym, 1);

// "2026-07" → "July 2026"
export const fmtMonth = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

// "2026-07-15" → "Jul 15, 2026"
export const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
