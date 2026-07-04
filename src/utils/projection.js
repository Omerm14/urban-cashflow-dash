// Next-month projection = committed + recurring forecast.
//
// committed  — invoices already in the system with a due date in the target month.
// forecast   — for each supplier who billed in at least `minMonths` of the last
//              `lookback` full months but has nothing committed in the target
//              month yet, assume their average monthly total shows up again.
//
// Pure function over the computed invoice list — no I/O, no schema changes.
export function projectMonth(invoices, targetYM, { lookback = 3, minMonths = 2 } = {}) {
  const [ty, tm] = targetYM.split("-").map(Number);
  const lookbackYMs = new Set(Array.from({ length: lookback }, (_, i) => {
    const d = new Date(ty, tm - 1 - (i + 1), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }));

  const committedInvs = invoices.filter(i => (i.dueDate || "").startsWith(targetYM));
  const committed = committedInvs.reduce((s, i) => s + Number(i.amount || 0), 0);
  const committedSuppliers = new Set(committedInvs.map(i => i.supplier));

  const bySupplier = {};
  invoices.forEach(i => {
    const ym = (i.dueDate || "").slice(0, 7);
    if (!lookbackYMs.has(ym) || !i.supplier) return;
    const months = (bySupplier[i.supplier] = bySupplier[i.supplier] || {});
    months[ym] = (months[ym] || 0) + Number(i.amount || 0);
  });

  let forecast = 0;
  const forecastSuppliers = [];
  Object.entries(bySupplier).forEach(([supplier, months]) => {
    const activeMonths = Object.keys(months).length;
    if (activeMonths < minMonths || committedSuppliers.has(supplier)) return;
    const avg = Object.values(months).reduce((s, v) => s + v, 0) / activeMonths;
    if (avg <= 0) return; // credit-dominated history — don't project negative spend
    forecast += avg;
    forecastSuppliers.push(supplier);
  });
  forecast = Math.round(forecast);

  return { committed, forecast, total: committed + forecast, forecastSuppliers };
}
