// Client-side CSV export — shared by SettingsView's data exports and the
// invoices batch-bar Export button.
// `bom: true` prefixes a UTF-8 byte-order mark so Excel opens Hebrew text correctly.
export function downloadCSV(filename, rows, cols, { bom = false } = {}) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = (bom ? "\uFEFF" : "") + [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
