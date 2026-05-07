export const findDuplicates = invoices => {
  const dupeIds = new Set();
  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      const a = invoices[i], b = invoices[j];
      const sameSup    = a.supplier?.toLowerCase().trim() === b.supplier?.toLowerCase().trim();
      const exactMatch = sameSup && a.invoiceNo && b.invoiceNo && a.invoiceNo.trim() === b.invoiceNo.trim();
      const fuzzyMatch = sameSup && Number(a.amount) === Number(b.amount) && a.invoiceDate === b.invoiceDate;
      if (exactMatch || fuzzyMatch) { dupeIds.add(a.id); dupeIds.add(b.id); }
    }
  }
  return dupeIds;
};

export const matchSupplier = (name, suppliers) => {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  let hit = suppliers.find(s => s.name.toLowerCase() === n);
  if (hit) return hit;
  hit = suppliers.find(s => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n));
  if (hit) return hit;
  const words = n.split(/\s+/).filter(w => w.length > 2);
  let best = null, bestScore = 0;
  suppliers.forEach(s => {
    const sw    = s.name.toLowerCase().split(/\s+/);
    const score = words.filter(w => sw.some(x => x.includes(w) || w.includes(x))).length;
    if (score > bestScore) { bestScore = score; best = s; }
  });
  return bestScore > 0 ? best : null;
};

export const parseCSV = text => {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
  return lines.slice(1).map((line, i) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const o = {}; headers.forEach((h, idx) => o[h] = cols[idx] || "");
    return { id: Date.now()+i, name: o.name||o["supplier name"]||o.supplier||"", terms: o.terms||o["payment terms"]||"", notes: o.notes||"" };
  }).filter(s => s.name);
};

export const getUserId = () => {
  let id = localStorage.getItem("userId");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("userId", id); }
  return id;
};

export const statusStyle = s =>
  s === "Paid"    ? { bg:"#052e16", color:"#4ade80", dot:"#22c55e" } :
  s === "Overdue" ? { bg:"#2d0a0a", color:"#f87171", dot:"#ef4444" } :
                    { bg:"#1e1b40", color:"#a78bfa", dot:"#818cf8" };
