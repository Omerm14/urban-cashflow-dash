export const endOfMonth           = d => new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 0);
export const endOfFollowingMonth  = d => new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 2, 0);
export const firstOfFollowingMonth= d => new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 1);
export const addDays              = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const calcDueDate = (invoiceDate, supplier) => {
  if (!supplier || !invoiceDate) return null;
  const t = supplier.terms?.toLowerCase() || "";
  // shotef: end of the same month as the invoice date
  if (t === "shotef") return endOfMonth(invoiceDate);
  // shotef_plus(N): end of same month + N days
  const m = t.match(/shotef_plus\((\d+)\)/);
  if (m) return addDays(endOfMonth(invoiceDate), parseInt(m[1]));
  if (t === "immediate") return new Date(invoiceDate);
  // net30/45/75: N calendar days after invoice date
  const netM = t.match(/^net(\d+)$/);
  if (netM) return addDays(invoiceDate, parseInt(netM[1]));
  return null;
};

// Detect the YY/MM/DD mis-parse of Israeli DD/MM/YY invoices and swap year ↔ day back.
// E.g. "2014-04-26" (Claude read 14/04/26 as YY/MM/DD) → "2026-04-14".
export const correctSwappedDate = dateStr => {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  if (y >= 2015) return dateStr;
  // Year looks like a 2-digit day (00–31) mapped to 20xx, and day looks like a 2-digit year (15–31 → 2015–2031)
  if (y >= 2000 && d >= 15 && d <= 31) {
    const correctedYear = 2000 + d;
    const correctedDay  = y - 2000;
    const check = new Date(correctedYear, m - 1, correctedDay);
    if (check.getFullYear() === correctedYear && check.getMonth() === m - 1 && check.getDate() === correctedDay) {
      return `${correctedYear}-${String(m).padStart(2, '0')}-${String(correctedDay).padStart(2, '0')}`;
    }
  }
  return dateStr;
};

export const fmt          = d  => d ? new Date(d).toLocaleDateString("en-GB") : "—";
export const toYM         = d  => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`; };
export const fmtMonth     = ym => { const [y,m] = ym.split("-"); return new Date(y,m-1).toLocaleString("en-GB",{month:"long",year:"numeric"}); };
export const fmtMonthShort= ym => { const [y,m] = ym.split("-"); return new Date(y,m-1).toLocaleString("en-GB",{month:"short",year:"2-digit"}); };
export const currency     = n  => `₪${Number(n).toLocaleString("en-IL",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
