export const endOfMonth          = d => new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 0);
export const endOfFollowingMonth = d => new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 2, 0);
export const addDays             = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const calcDueDate = (invoiceDate, supplier) => {
  if (!supplier || !invoiceDate) return null;
  const t = supplier.terms?.toLowerCase() || "";
  if (t === "immediate") return new Date(invoiceDate);
  if (t === "shotef")    return endOfFollowingMonth(invoiceDate);
  const m = t.match(/shotef_plus\((\d+)\)/);
  if (m) return addDays(endOfFollowingMonth(invoiceDate), parseInt(m[1]));
  return null;
};

export const fmt          = d  => d ? new Date(d).toLocaleDateString("en-GB") : "—";
export const toYM         = d  => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`; };
export const fmtMonth     = ym => { const [y,m] = ym.split("-"); return new Date(y,m-1).toLocaleString("en-GB",{month:"long",year:"numeric"}); };
export const fmtMonthShort= ym => { const [y,m] = ym.split("-"); return new Date(y,m-1).toLocaleString("en-GB",{month:"short",year:"2-digit"}); };
export const currency     = n  => `₪${Number(n).toLocaleString("en-IL",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
