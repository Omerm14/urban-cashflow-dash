import { useState, useEffect, useRef } from "react";

// ── payment term logic ────────────────────────────────────────────────────────
const endOfMonth = d => new Date(new Date(d).getFullYear(), new Date(d).getMonth() + 1, 0);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const calcDueDate = (invoiceDate, supplier) => {
  if (!supplier || !invoiceDate) return null;
  const t = supplier.terms?.toLowerCase() || "";
  if (t === "immediate") return new Date(invoiceDate);
  if (t === "shotef") return endOfMonth(invoiceDate);
  const m = t.match(/shotef_plus\((\d+)\)/);
  if (m) return addDays(endOfMonth(invoiceDate), parseInt(m[1]));
  return null;
};
const fmt = d => d ? new Date(d).toLocaleDateString("en-GB") : "—";
const toYM = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`; };
const fmtMonth = ym => { const [y,m] = ym.split("-"); return new Date(y,m-1).toLocaleString("en-GB",{month:"long",year:"numeric"}); };
const fmtMonthShort = ym => { const [y,m] = ym.split("-"); return new Date(y,m-1).toLocaleString("en-GB",{month:"short",year:"2-digit"}); };
const currency = n => `₪${Number(n).toLocaleString("en-IL",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const STATUS = { UNPAID:"Unpaid", PAID:"Paid", OVERDUE:"Overdue" };
const PALETTE = ["#a78bfa","#34d399","#fb923c","#60a5fa","#f472b6","#facc15","#4ade80","#e879f9","#38bdf8","#f87171"];
const MOCK_NAMES = ["Acme Supplies","Beta Logistics","Gamma Tech","Delta Print","Epsilon Media"];

// ── duplicate detection ───────────────────────────────────────────────────────
const findDuplicates = (invoices) => {
  const dupeIds = new Set();
  for (let i = 0; i < invoices.length; i++) {
    for (let j = i + 1; j < invoices.length; j++) {
      const a = invoices[i], b = invoices[j];
      const sameSupplier = a.supplier?.toLowerCase().trim() === b.supplier?.toLowerCase().trim();
      // exact: same invoice number (non-empty)
      const exactMatch = sameSupplier && a.invoiceNo && b.invoiceNo && a.invoiceNo.trim() === b.invoiceNo.trim();
      // fuzzy: same supplier + amount + date (invoice# may differ or be missing)
      const fuzzyMatch = sameSupplier && Number(a.amount) === Number(b.amount) && a.invoiceDate === b.invoiceDate;
      if (exactMatch || fuzzyMatch) { dupeIds.add(a.id); dupeIds.add(b.id); }
    }
  }
  return dupeIds;
};

// ── fuzzy supplier match ──────────────────────────────────────────────────────
const matchSupplier = (name, suppliers) => {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  let hit = suppliers.find(s => s.name.toLowerCase() === n);
  if (hit) return hit;
  hit = suppliers.find(s => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n));
  if (hit) return hit;
  const words = n.split(/\s+/).filter(w => w.length > 2);
  let best = null, bestScore = 0;
  suppliers.forEach(s => {
    const sw = s.name.toLowerCase().split(/\s+/);
    const score = words.filter(w => sw.some(x => x.includes(w)||w.includes(x))).length;
    if (score > bestScore) { bestScore = score; best = s; }
  });
  return bestScore > 0 ? best : null;
};

// ── PDF → base64 ──────────────────────────────────────────────────────────────
const loadPdfJs = () => new Promise((res, rej) => {
  if (window.pdfjsLib) { res(window.pdfjsLib); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); };
  s.onerror = () => rej(new Error("Failed to load PDF.js"));
  document.head.appendChild(s);
});
const pdfToBase64 = async file => {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
};
const fileToBase64 = f => new Promise((res,rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });

// ── Claude extraction ─────────────────────────────────────────────────────────
const extractInvoice = async (b64, suppliers, apiKey) => {
  if (!apiKey) throw new Error("No API key set — click 🔑 in the nav bar");
  const names = suppliers.map(s => s.name).join(", ");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text: `Extract invoice data. Known suppliers: ${names}. Return ONLY valid JSON with keys: supplier, invoiceNo, invoiceDate (YYYY-MM-DD), amount (number). No markdown.` }
      ]}]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.content.map(b=>b.text||"").join("").replace(/```json|```/g,"").trim());
};

// ── CSV supplier parser ───────────────────────────────────────────────────────
const parseCSV = text => {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g,""));
  return lines.slice(1).map((line,i) => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g,""));
    const o = {}; headers.forEach((h,idx) => o[h] = cols[idx]||"");
    return { id: Date.now()+i, name: o.name||o["supplier name"]||o.supplier||"", terms: o.terms||o["payment terms"]||"", notes: o.notes||"" };
  }).filter(s => s.name);
};

// ── Styles ────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }
  .nav-btn { position:relative; padding: 20px 18px 18px; border:none; background:none; font-size:13px; font-weight:500; letter-spacing:.3px; cursor:pointer; transition:color .2s; }
  .nav-btn::after { content:''; position:absolute; bottom:0; left:18px; right:18px; height:2px; border-radius:2px; transform:scaleX(0); transition:transform .25s; }
  .nav-btn.active { color:#a78bfa; }
  .nav-btn.active::after { background:#a78bfa; transform:scaleX(1); }
  .nav-btn:not(.active) { color:#64748b; }
  .nav-btn:not(.active):hover { color:#94a3b8; }
  .upload-btn { display:flex; align-items:center; gap:8px; padding:10px 20px; border-radius:10px; border:none; font-size:13px; font-weight:600; cursor:pointer; transition:all .2s; letter-spacing:.2px; }
  .upload-btn:hover { transform:translateY(-1px); filter:brightness(1.1); }
  .upload-btn:active { transform:translateY(0); }
  .card { background:#131c2e; border:1px solid #1e2d45; border-radius:16px; }
  .kpi-card { background: linear-gradient(135deg, #131c2e 0%, #0f172a 100%); border:1px solid #1e2d45; border-radius:16px; padding:24px; transition:border-color .2s; }
  .kpi-card:hover { border-color:#334155; }
  .row-hover:hover { background:#131c2e !important; }
  .action-btn { padding:5px 12px; border:none; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; letter-spacing:.3px; transition:all .15s; }
  .action-btn:hover { filter:brightness(1.2); transform:translateY(-1px); }
  .tag { display:inline-flex; align-items:center; padding:4px 12px; border-radius:20px; font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; }
  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.75); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:100; animation:fadeIn .15s; }
  .modal { background:#0f172a; border:1px solid #1e2d45; border-radius:20px; padding:32px; width:460px; max-width:95vw; box-shadow:0 25px 60px rgba(0,0,0,.5); animation:slideUp .2s; }
  .input { width:100%; padding:10px 14px; background:#131c2e; border:1px solid #1e2d45; border-radius:10px; color:#e2e8f0; font-size:13px; outline:none; transition:border-color .2s; font-family:inherit; }
  .input:focus { border-color:#a78bfa; }
  .input option { background:#131c2e; }
  .cal-day { background:#0d1626; border:1px solid #1a2538; border-radius:10px; min-height:88px; padding:8px; transition:border-color .2s; }
  .cal-day:hover { border-color:#334155; }
  .cal-day.today { border-color:#a78bfa; box-shadow:0 0 0 1px #a78bfa22; }
  .chip { border-radius:4px; padding:3px 7px; font-size:10px; font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:2px; cursor:default; transition:filter .15s; }
  .chip:hover { filter:brightness(1.2); }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }
  @keyframes slideUp { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  .shimmer { background:linear-gradient(90deg,#1e2d45 25%,#253550 50%,#1e2d45 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; border-radius:8px; }
`;

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("dashboard");
  const [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState(null); // {text, ok}
  const [editInvoice, setEditInvoice] = useState(null);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [calMonth, setCalMonth] = useState(() => toYM(new Date()));
  const [hoveredBar, setHoveredBar] = useState(null);
  const [tooltip, setTooltip] = useState(null); // {ym, supplier, amount, total, x, y} — x/y are page coords
  const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY || "";
  const [apiKey, setApiKey] = useState(() => envKey || localStorage.getItem("apiKey") || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const fileRef = useRef();
  const csvRef = useRef();

  useEffect(() => {
    try {
      const s = localStorage.getItem("suppliers");
      if (s) { const p = JSON.parse(s); setSuppliers(p.filter(x=>!MOCK_NAMES.includes(x.name))); }
    } catch {}
    try {
      const inv = localStorage.getItem("invoices");
      if (inv) { const p = JSON.parse(inv); setInvoices(p.filter(x=>!(MOCK_NAMES.includes(x.supplier)&&Number(x.id)<10))); }
    } catch {}
    setLoading(false);
  }, []);

  const saveSuppliers = d => { setSuppliers(d); localStorage.setItem("suppliers", JSON.stringify(d)); };
  const saveInvoices  = d => { setInvoices(d);  localStorage.setItem("invoices",  JSON.stringify(d)); };
  const getSupplier = name => matchSupplier(name, suppliers);

  const computed = invoices.map(inv => {
    const sup = getSupplier(inv.supplier);
    const due = inv.dueDate ? inv.dueDate : (calcDueDate(inv.invoiceDate, sup) ? calcDueDate(inv.invoiceDate, sup).toISOString().split("T")[0] : null);
    const today = new Date(); today.setHours(0,0,0,0);
    let status = inv.status;
    if (status !== STATUS.PAID && due && new Date(due) < today) status = STATUS.OVERDUE;
    return { ...inv, dueDate: due, status };
  });

  const dupeIds = findDuplicates(computed);

  // ── monthly cashflow data ──
  const monthlyData = (() => {
    const map = {};
    computed.filter(i => i.status !== STATUS.PAID && i.dueDate).forEach(inv => {
      const ym = toYM(inv.dueDate);
      if (!map[ym]) map[ym] = {};
      map[ym][inv.supplier] = (map[ym][inv.supplier]||0) + Number(inv.amount);
    });
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([ym,sups])=>({ ym, sups, total: Object.values(sups).reduce((s,v)=>s+v,0) }));
  })();

  const allNames = [...new Set(computed.map(i=>i.supplier))];
  const color = name => PALETTE[allNames.indexOf(name) % PALETTE.length];
  const maxTotal = Math.max(...monthlyData.map(m=>m.total), 1);

  const kpis = {
    outstanding: computed.filter(i=>i.status!==STATUS.PAID).reduce((s,i)=>s+Number(i.amount),0),
    overdue:     computed.filter(i=>i.status===STATUS.OVERDUE).reduce((s,i)=>s+Number(i.amount),0),
    paid:        computed.filter(i=>i.status===STATUS.PAID).reduce((s,i)=>s+Number(i.amount),0),
    nextMonth:   (() => { const nm = toYM(new Date(new Date().getFullYear(), new Date().getMonth()+1, 1)); return monthlyData.find(m=>m.ym===nm)?.total||0; })(),
  };

  // ── calendar ──
  const calY = parseInt(calMonth.split("-")[0]);
  const calM = parseInt(calMonth.split("-")[1])-1;
  const daysInMonth = new Date(calY, calM+1, 0).getDate();
  const firstDay = new Date(calY, calM, 1).getDay();
  const calByDay = {};
  computed.filter(i=>i.dueDate&&toYM(i.dueDate)===calMonth).forEach(i=>{ const d=new Date(i.dueDate).getDate(); (calByDay[d]=calByDay[d]||[]).push(i); });

  // ── file upload ──
  const handleUpload = async e => {
    const files = Array.from(e.target.files); if (!files.length) return;
    setExtracting(true); let added=0; const errors=[];
    const cur = [...invoices];
    for (const file of files) {
      setExtractMsg({ text: `Processing ${file.name}…`, ok: null });
      try {
        const b64 = file.type==="application/pdf" ? await pdfToBase64(file) : await fileToBase64(file);
        setExtractMsg({ text: `Reading ${file.name}…`, ok: null });
        const ex = await extractInvoice(b64, suppliers, apiKey);
        const candidate = { id: Date.now()+Math.random(), supplier: ex.supplier||"", invoiceNo: ex.invoiceNo||"", invoiceDate: ex.invoiceDate||"", amount: Number(ex.amount)||0, dueDate:"", status: STATUS.UNPAID, notes:"" };
        const dupes = findDuplicates([...cur, candidate]);
        if (dupes.has(candidate.id)) { errors.push(`${file.name}: duplicate invoice detected (${candidate.supplier} · ${candidate.invoiceNo || candidate.invoiceDate} · ₪${candidate.amount})`); continue; }
        const sup = getSupplier(ex.supplier);
        const due = calcDueDate(ex.invoiceDate, sup);
        candidate.dueDate = due ? due.toISOString().split("T")[0] : "";
        cur.push(candidate);
        added++;
      } catch(err) { errors.push(`${file.name}: ${err.message}`); }
    }
    saveInvoices(cur); setExtracting(false);
    if (errors.length) setExtractMsg({ text: `${added} added · ${errors.length} failed: ${errors[0]}`, ok: false });
    else setExtractMsg({ text: `✓ ${added} invoice${added!==1?"s":""} extracted successfully`, ok: true });
    setTimeout(()=>setExtractMsg(null), 4000);
    e.target.value="";
  };

  const handleCSV = async e => {
    const file = e.target.files[0]; if (!file) return;
    const parsed = parseCSV(await file.text());
    if (parsed.length) { saveSuppliers(parsed); setExtractMsg({ text:`✓ ${parsed.length} suppliers loaded`, ok:true }); setTimeout(()=>setExtractMsg(null),3000); }
    else setExtractMsg({ text:"Could not parse CSV — expected columns: name, terms, notes", ok:false });
    e.target.value="";
  };

  const statusStyle = s => s===STATUS.PAID ? { bg:"#052e16", color:"#4ade80", dot:"#22c55e" } : s===STATUS.OVERDUE ? { bg:"#2d0a0a", color:"#f87171", dot:"#ef4444" } : { bg:"#1e1b40", color:"#a78bfa", dot:"#818cf8" };

  if (loading) return (
    <div style={{ background:"#080e1a", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#64748b", fontSize:14 }}>Loading…</div>
    </div>
  );

  return (
    <div style={{ background:"#080e1a", minHeight:"100vh", color:"#e2e8f0", fontFamily:"Inter,system-ui,sans-serif" }}>
      <style>{css}</style>

      {/* ── Top Nav ── */}
      <div style={{ background:"#0a1120", borderBottom:"1px solid #111d2e", position:"sticky", top:0, zIndex:40, backdropFilter:"blur(12px)" }}>
        <div style={{ maxWidth:1140, margin:"0 auto", padding:"0 28px", display:"flex", alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginRight:40 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,#6366f1,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>💸</div>
            <span style={{ fontWeight:700, fontSize:15, color:"#f1f5f9", letterSpacing:"-0.3px" }}>Cashflow</span>
          </div>
          {["dashboard","invoices","calendar"].map(v=>(
            <button key={v} className={`nav-btn${view===v?" active":""}`} onClick={()=>setView(v)} style={{ textTransform:"capitalize" }}>{v}</button>
          ))}
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={()=>{ if(!envKey) setShowApiKey(v=>!v); }} title={envKey ? "API key loaded from environment" : apiKey ? "API key set manually" : "Set API key"} style={{ padding:"8px 14px", background:"transparent", border:`1px solid ${apiKey?"#166534":"#7f1d1d"}`, borderRadius:8, color:apiKey?"#4ade80":"#f87171", cursor:envKey?"default":"pointer", fontSize:12, fontWeight:500, fontFamily:"inherit" }}>
              🔑 {envKey ? "Connected" : apiKey ? "Key set" : "No API key"}
            </button>
            <button onClick={()=>setShowSuppliers(true)} style={{ padding:"8px 14px", background:"transparent", border:"1px solid #1e2d45", borderRadius:8, color:"#64748b", cursor:"pointer", fontSize:12, fontWeight:500, transition:"all .2s", fontFamily:"inherit" }}
              onMouseEnter={e=>{ e.target.style.borderColor="#334155"; e.target.style.color="#94a3b8"; }}
              onMouseLeave={e=>{ e.target.style.borderColor="#1e2d45"; e.target.style.color="#64748b"; }}>
              ⚙ Suppliers ({suppliers.length})
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1140, margin:"0 auto", padding:"28px 28px 60px" }}>

        {/* ── Upload bar ── */}
        <div style={{ display:"flex", gap:10, marginBottom:32, alignItems:"center", flexWrap:"wrap" }}>
          <button className="upload-btn" style={{ background:"linear-gradient(135deg,#6366f1,#a78bfa)", color:"#fff", boxShadow:"0 4px 20px #6366f133" }}
            onClick={()=>fileRef.current.click()} disabled={extracting}>
            <span style={{ fontSize:16 }}>+</span>
            {extracting ? "Extracting…" : "Upload Invoices"}
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleUpload} style={{ display:"none" }} />

          <button className="upload-btn" style={{ background:"#131c2e", color:"#94a3b8", border:"1px solid #1e2d45" }}
            onClick={()=>csvRef.current.click()}>
            <span>📋</span> Load Supplier Sheet
          </button>
          <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleCSV} style={{ display:"none" }} />

          {extractMsg && (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:8, background: extractMsg.ok===false?"#2d0a0a":extractMsg.ok?"#052e16":"#131c2e", border:`1px solid ${extractMsg.ok===false?"#7f1d1d":extractMsg.ok?"#166534":"#1e2d45"}`, color: extractMsg.ok===false?"#f87171":extractMsg.ok?"#4ade80":"#94a3b8", fontSize:13, animation:"fadeIn .3s" }}>
              {extractMsg.text}
            </div>
          )}
          <div style={{ marginLeft:"auto", fontSize:12, color:"#334155", fontWeight:500 }}>
            {invoices.length} invoices
          </div>
        </div>

        {/* ── DASHBOARD ── */}
        {view==="dashboard" && (
          <div>
            {/* KPI row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
              {[
                ["Outstanding","outstanding","#a78bfa","💳"],
                ["Overdue","overdue","#f87171","🔴"],
                ["Next Month","nextMonth","#fb923c","📅"],
                ["Total Paid","paid","#34d399","✅"],
              ].map(([label,key,col,icon])=>(
                <div key={key} className="kpi-card">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:"#475569", textTransform:"uppercase", letterSpacing:".8px" }}>{label}</span>
                    <div style={{ width:32, height:32, borderRadius:8, background:`${col}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>{icon}</div>
                  </div>
                  <div style={{ fontSize:24, fontWeight:700, color:col, letterSpacing:"-0.5px" }}>{currency(kpis[key])}</div>
                  <div style={{ marginTop:12, height:2, background:"#1e2d45", borderRadius:2 }}>
                    <div style={{ height:"100%", width: kpis.outstanding ? `${Math.min(100,(kpis[key]/kpis.outstanding)*100)}%` : "0%", background:`linear-gradient(90deg,${col}88,${col})`, borderRadius:2, transition:"width 1s" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="card" style={{ padding:28, marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:16, color:"#f1f5f9", letterSpacing:"-0.3px" }}>Monthly Payment Schedule</div>
                  <div style={{ fontSize:12, color:"#475569", marginTop:3 }}>Unpaid invoices grouped by due month</div>
                </div>
              </div>
              {monthlyData.length===0
                ? <div data-chart style={{ textAlign:"center", padding:"60px 0", color:"#334155" }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
                    <div style={{ fontSize:14 }}>No upcoming payments</div>
                  </div>
                : <div data-chart style={{ position:"relative" }}>
                  <div style={{ display:"flex", gap:12, alignItems:"flex-end", height:240, overflowX:"auto", paddingBottom:8, paddingTop:24, position:"relative" }}>
                    {monthlyData.map(({ ym, sups, total }) => {
                      const barH = Math.max(12, (total/maxTotal)*180);
                      const isHovered = hoveredBar===ym;
                      return (
                        <div key={ym} style={{ flex:1, minWidth:90, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                          <div style={{ fontSize:11, fontWeight:700, color: isHovered?"#f1f5f9":"#94a3b8", transition:"color .15s", whiteSpace:"nowrap", marginBottom:2 }}>{currency(total)}</div>
                          <div style={{ width:"100%", height:barH, borderRadius:"6px 6px 0 0", overflow:"hidden", display:"flex", flexDirection:"column-reverse" }}>
                            {Object.entries(sups).map(([sup,amt])=>{
                              const isSegHovered = tooltip?.ym===ym && tooltip?.supplier===sup;
                              return (
                                <div key={sup}
                                  style={{ width:"100%", height:`${(amt/total)*100}%`, background:color(sup), minHeight:3, transition:"filter .15s, opacity .15s", filter: isSegHovered?"brightness(1.3)":"none", opacity: tooltip && tooltip.ym===ym && !isSegHovered ? 0.45 : 1, cursor:"crosshair" }}
                                  onMouseEnter={e=>{ setHoveredBar(ym); setTooltip({ ym, supplier:sup, amount:amt, total, x: e.clientX, y: e.clientY }); }}
                                  onMouseMove={e=>{ setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t); }}
                                  onMouseLeave={()=>{ setHoveredBar(null); setTooltip(null); }}
                                />
                              );
                            })}
                          </div>
                          <div style={{ fontSize:11, color: isHovered?"#94a3b8":"#475569", transition:"color .15s", whiteSpace:"nowrap" }}>{fmtMonthShort(ym)}</div>
                        </div>
                      );
                    })}
                    {/* Tooltip — rendered at end of chart div, positioned fixed */}
                    {tooltip && (
                      <div style={{ position:"fixed", left: tooltip.x + 14, top: tooltip.y - 14, transform: tooltip.x > window.innerWidth - 240 ? "translateX(-110%)" : "none", background:"#0a1120", border:`1px solid ${color(tooltip.supplier)}44`, borderRadius:12, padding:"12px 16px", minWidth:190, boxShadow:`0 8px 32px rgba(0,0,0,.6), 0 0 0 1px ${color(tooltip.supplier)}22`, pointerEvents:"none", zIndex:9999, animation:"fadeIn .1s" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                          <div style={{ width:10, height:10, borderRadius:"50%", background:color(tooltip.supplier), boxShadow:`0 0 6px ${color(tooltip.supplier)}` }} />
                          <span style={{ fontSize:12, fontWeight:600, color:"#e2e8f0" }}>{tooltip.supplier}</span>
                        </div>
                        <div style={{ fontSize:22, fontWeight:800, color:color(tooltip.supplier), letterSpacing:"-0.5px", marginBottom:8 }}>{currency(tooltip.amount)}</div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#475569" }}>
                          <span>{fmtMonth(tooltip.ym)}</span>
                          <span>{Math.round((tooltip.amount/tooltip.total)*100)}% of month</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* legend */}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 20px", marginTop:20, paddingTop:20, borderTop:"1px solid #111d2e" }}>
                    {allNames.map(n=>(
                      <div key={n} style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color:"#64748b" }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:color(n), boxShadow:`0 0 6px ${color(n)}88` }} />
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
              }
            </div>

            {/* Monthly breakdown */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16 }}>
              {monthlyData.map(({ ym, sups, total })=>(
                <div key={ym} className="card" style={{ padding:20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                    <span style={{ fontWeight:700, fontSize:14, color:"#e2e8f0" }}>{fmtMonth(ym)}</span>
                    <span style={{ fontWeight:800, fontSize:15, color:"#a78bfa" }}>{currency(total)}</span>
                  </div>
                  {Object.entries(sups).sort((a,b)=>b[1]-a[1]).map(([sup,amt])=>(
                    <div key={sup} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderTop:"1px solid #0d1626" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <div style={{ width:6, height:6, borderRadius:"50%", background:color(sup), flexShrink:0, boxShadow:`0 0 5px ${color(sup)}` }} />
                        <span style={{ fontSize:13, color:"#94a3b8" }}>{sup}</span>
                      </div>
                      <span style={{ fontSize:13, fontWeight:600, color:"#e2e8f0" }}>{currency(amt)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── INVOICES ── */}
        {view==="invoices" && (
          <div className="card" style={{ overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #111d2e" }}>
                  {["Invoice #","Supplier","Date","Amount","Due Date","Status",""].map(h=>(
                    <th key={h} style={{ padding:"14px 18px", textAlign:"left", fontSize:10, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"1px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {computed.length===0 && (
                  <tr><td colSpan={7} style={{ padding:"60px 0", textAlign:"center", color:"#334155" }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>🧾</div>
                    <div>No invoices yet — upload some above</div>
                  </td></tr>
                )}
                {computed.map(inv=>{
                  const ss = statusStyle(inv.status);
                  return (
                    <tr key={inv.id} className="row-hover" style={{ borderTop:"1px solid #0d1626", transition:"background .15s" }}>
                      <td style={{ padding:"13px 18px", color:"#475569", fontFamily:"monospace", fontSize:12 }}>{inv.invoiceNo}</td>
                      <td style={{ padding:"13px 18px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                          <div style={{ width:28, height:28, borderRadius:8, background:`${color(inv.supplier)}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:color(inv.supplier), flexShrink:0 }}>
                            {inv.supplier.charAt(0)}
                          </div>
                          <div>
                            <span style={{ fontWeight:500, fontSize:13 }}>{inv.supplier}</span>
                            {dupeIds.has(inv.id) && <div style={{ fontSize:10, fontWeight:700, color:"#fb923c", letterSpacing:".4px", marginTop:1 }}>⚠ POSSIBLE DUPLICATE</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:"13px 18px", color:"#475569" }}>{fmt(inv.invoiceDate)}</td>
                      <td style={{ padding:"13px 18px", fontWeight:700, fontSize:14, color:"#e2e8f0" }}>{currency(inv.amount)}</td>
                      <td style={{ padding:"13px 18px" }}>
                        {inv.dueDate
                          ? <span style={{ color:"#64748b" }}>{fmt(inv.dueDate)}</span>
                          : <span style={{ color:"#fb923c", fontSize:11, fontWeight:600, cursor:"pointer" }} onClick={()=>setEditInvoice({...inv})}>⚠ Fix supplier</span>}
                      </td>
                      <td style={{ padding:"13px 18px" }}>
                        <span className="tag" style={{ background:ss.bg, color:ss.color }}>
                          <span style={{ width:5, height:5, borderRadius:"50%", background:ss.dot, marginRight:6, display:"inline-block" }} />
                          {inv.status}
                        </span>
                      </td>
                      <td style={{ padding:"13px 18px" }}>
                        <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                          {inv.status!==STATUS.PAID && (
                            <button className="action-btn" style={{ background:"#052e16", color:"#4ade80" }}
                              onClick={()=>saveInvoices(invoices.map(i=>i.id===inv.id?{...i,status:STATUS.PAID}:i))}>✓ Paid</button>
                          )}
                          <button className="action-btn" style={{ background:"#131c2e", color:"#64748b" }} onClick={()=>setEditInvoice({...inv})}>Edit</button>
                          <button className="action-btn" style={{ background:"#2d0a0a", color:"#f87171" }}
                            onClick={()=>{ if(confirm("Delete this invoice?")) saveInvoices(invoices.filter(i=>i.id!==inv.id)); }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding:"14px 18px", borderTop:"1px solid #0d1626" }}>
              <button className="action-btn" style={{ background:"#131c2e", color:"#64748b", padding:"8px 16px" }}
                onClick={()=>setEditInvoice({ id:null, supplier:"", invoiceNo:"", invoiceDate:"", amount:"", dueDate:"", status:STATUS.UNPAID, notes:"" })}>
                + Add Manually
              </button>
            </div>
          </div>
        )}

        {/* ── CALENDAR ── */}
        {view==="calendar" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
              <button onClick={()=>{ const d=new Date(calY,calM-1); setCalMonth(toYM(d)); }}
                style={{ width:36, height:36, borderRadius:10, background:"#131c2e", border:"1px solid #1e2d45", color:"#94a3b8", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
              <div>
                <div style={{ fontWeight:700, fontSize:20, color:"#f1f5f9", letterSpacing:"-0.5px" }}>{new Date(calY,calM).toLocaleString("en-GB",{month:"long",year:"numeric"})}</div>
                <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>
                  {Object.values(calByDay).flat().length} invoices · {currency(Object.values(calByDay).flat().reduce((s,i)=>s+Number(i.amount),0))}
                </div>
              </div>
              <button onClick={()=>{ const d=new Date(calY,calM+1); setCalMonth(toYM(d)); }}
                style={{ width:36, height:36, borderRadius:10, background:"#131c2e", border:"1px solid #1e2d45", color:"#94a3b8", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
                <div key={d} style={{ padding:"8px 4px", textAlign:"center", fontSize:11, color:"#334155", fontWeight:700, letterSpacing:".5px", textTransform:"uppercase" }}>{d}</div>
              ))}
              {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`} style={{ minHeight:88 }} />)}
              {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
                const dayInvs = calByDay[day]||[];
                const isToday = new Date().getDate()===day && new Date().getMonth()===calM && new Date().getFullYear()===calY;
                return (
                  <div key={day} className={`cal-day${isToday?" today":""}`}>
                    <div style={{ fontSize:12, fontWeight:600, color:isToday?"#a78bfa":"#334155", marginBottom:5 }}>{day}</div>
                    {dayInvs.slice(0,3).map(inv=>(
                      <div key={inv.id} className="chip" style={{ background:color(inv.supplier) }} title={`${inv.supplier} · ${currency(inv.amount)}`}>
                        {inv.supplier.split(" ")[0]} · {currency(inv.amount)}
                      </div>
                    ))}
                    {dayInvs.length>3 && <div style={{ fontSize:9, color:"#475569", fontWeight:600 }}>+{dayInvs.length-3} more</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Edit Invoice Modal ── */}
      {editInvoice && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditInvoice(null)}>
          <div className="modal">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:17, color:"#f1f5f9" }}>{editInvoice.id?"Edit Invoice":"New Invoice"}</div>
                <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>Invoice details & payment info</div>
              </div>
              <button onClick={()=>setEditInvoice(null)} style={{ width:32, height:32, borderRadius:8, background:"#131c2e", border:"1px solid #1e2d45", color:"#64748b", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
              {[["Invoice #","invoiceNo","text"],["Invoice Date","invoiceDate","date"],["Amount","amount","number"],["Due Date (override)","dueDate","date"]].map(([label,key,type])=>(
                <div key={key}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>{label}</div>
                  <input type={type} value={editInvoice[key]} className="input"
                    onChange={e=>{ const u={...editInvoice,[key]:e.target.value};
                      if((key==="invoiceDate"||key==="supplier")&&u.invoiceDate&&u.supplier){
                        const sup=getSupplier(u.supplier); if(sup&&sup.terms!=="custom"){ const d=calcDueDate(u.invoiceDate,sup); if(d)u.dueDate=d.toISOString().split("T")[0]; }
                      } setEditInvoice(u); }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Supplier</div>
              <select value={editInvoice.supplier} className="input"
                onChange={e=>{ const sup=getSupplier(e.target.value); const due=editInvoice.invoiceDate&&sup?calcDueDate(editInvoice.invoiceDate,sup):null; setEditInvoice({...editInvoice,supplier:e.target.value,dueDate:due?due.toISOString().split("T")[0]:editInvoice.dueDate}); }}>
                <option value="">— select supplier —</option>
                {suppliers.map(s=><option key={s.id} value={s.name}>{s.name} · {s.terms}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Status</div>
              <select value={editInvoice.status} className="input" onChange={e=>setEditInvoice({...editInvoice,status:e.target.value})}>
                {Object.values(STATUS).map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={()=>setEditInvoice(null)} style={{ padding:"10px 20px", background:"#131c2e", border:"1px solid #1e2d45", borderRadius:10, color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontWeight:500, fontSize:13 }}>Cancel</button>
              <button onClick={()=>{ if(editInvoice.id) saveInvoices(invoices.map(i=>i.id===editInvoice.id?editInvoice:i)); else saveInvoices([...invoices,{...editInvoice,id:Date.now()}]); setEditInvoice(null); }}
                style={{ padding:"10px 24px", background:"linear-gradient(135deg,#6366f1,#a78bfa)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13, boxShadow:"0 4px 15px #6366f133" }}>
                Save Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── API Key Modal ── */}
      {showApiKey && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowApiKey(false)}>
          <div className="modal" style={{ width:440 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:17, color:"#f1f5f9" }}>Anthropic API Key</div>
                <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>Required to extract invoice data from images</div>
              </div>
              <button onClick={()=>setShowApiKey(false)} style={{ width:32, height:32, borderRadius:8, background:"#131c2e", border:"1px solid #1e2d45", color:"#64748b", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>
            {envKey ? (
              <div style={{ background:"#052e16", border:"1px solid #166534", borderRadius:10, padding:"14px 16px", marginBottom:16 }}>
                <div style={{ fontSize:13, color:"#4ade80", fontWeight:600, marginBottom:4 }}>✓ Key loaded from environment</div>
                <div style={{ fontSize:12, color:"#475569" }}>Set via <code style={{ color:"#a78bfa", fontSize:11 }}>VITE_ANTHROPIC_API_KEY</code> in <code style={{ color:"#a78bfa", fontSize:11 }}>.env.local</code></div>
              </div>
            ) : (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>API Key</div>
                <input type="password" value={apiKey} placeholder="sk-ant-..." className="input"
                  onChange={e=>setApiKey(e.target.value)} />
                <div style={{ fontSize:11, color:"#334155", marginTop:8 }}>Stored in your browser only — never sent anywhere except Anthropic.</div>
              </div>
            )}
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              {!envKey && apiKey && <button onClick={()=>{ setApiKey(""); localStorage.removeItem("apiKey"); setShowApiKey(false); }}
                style={{ padding:"10px 16px", background:"#2d0a0a", border:"none", borderRadius:10, color:"#f87171", cursor:"pointer", fontFamily:"inherit", fontWeight:500, fontSize:13 }}>Clear</button>}
              <button onClick={()=>setShowApiKey(false)} style={{ padding:"10px 20px", background:"#131c2e", border:"1px solid #1e2d45", borderRadius:10, color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontWeight:500, fontSize:13 }}>Close</button>
              {!envKey && <button onClick={()=>{ localStorage.setItem("apiKey", apiKey); setShowApiKey(false); }}
                style={{ padding:"10px 24px", background:"linear-gradient(135deg,#6366f1,#a78bfa)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
                Save Key
              </button>}
            </div>
          </div>
        </div>
      )}

      {/* ── Suppliers Modal ── */}
      {showSuppliers && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowSuppliers(false)}>
          <div className="modal" style={{ width:580, maxHeight:"85vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:17, color:"#f1f5f9" }}>Suppliers</div>
                <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>Manage payment terms</div>
              </div>
              <button onClick={()=>setShowSuppliers(false)} style={{ width:32, height:32, borderRadius:8, background:"#131c2e", border:"1px solid #1e2d45", color:"#64748b", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            </div>
            <div style={{ background:"#0d1626", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#475569", marginTop:14 }}>
              Terms: <code style={{color:"#a78bfa",fontSize:11}}>shotef</code> · <code style={{color:"#a78bfa",fontSize:11}}>shotef_plus(30)</code> · <code style={{color:"#a78bfa",fontSize:11}}>immediate</code> · <code style={{color:"#a78bfa",fontSize:11}}>custom</code>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #111d2e" }}>
                  {["Supplier","Terms","Notes",""].map(h=><th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:10, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"1px" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {suppliers.map(sup=>(
                  <tr key={sup.id} style={{ borderTop:"1px solid #0d1626" }}>
                    {editSupplier?.id===sup.id ? (
                      <>
                        {[["name","text"],["terms","text"],["notes","text"]].map(([k])=>(
                          <td key={k} style={{ padding:"6px 8px" }}><input value={editSupplier[k]} className="input" style={{ padding:"6px 10px", fontSize:12 }} onChange={e=>setEditSupplier({...editSupplier,[k]:e.target.value})} /></td>
                        ))}
                        <td style={{ padding:"6px 8px", whiteSpace:"nowrap" }}>
                          <button className="action-btn" style={{ background:"#052e16", color:"#4ade80", marginRight:4 }} onClick={()=>{ saveSuppliers(suppliers.map(s=>s.id===editSupplier.id?editSupplier:s)); setEditSupplier(null); }}>✓</button>
                          <button className="action-btn" style={{ background:"#131c2e", color:"#64748b" }} onClick={()=>setEditSupplier(null)}>✕</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding:"11px 10px", fontWeight:500 }}>{sup.name}</td>
                        <td style={{ padding:"11px 10px" }}><code style={{ fontSize:11, color:"#a78bfa", background:"#1e1b40", padding:"2px 8px", borderRadius:5 }}>{sup.terms}</code></td>
                        <td style={{ padding:"11px 10px", color:"#475569", fontSize:12 }}>{sup.notes||"—"}</td>
                        <td style={{ padding:"8px", whiteSpace:"nowrap" }}>
                          <button className="action-btn" style={{ background:"#131c2e", color:"#64748b", marginRight:4 }} onClick={()=>setEditSupplier({...sup})}>Edit</button>
                          <button className="action-btn" style={{ background:"#2d0a0a", color:"#f87171" }} onClick={()=>{ if(confirm("Delete?")) saveSuppliers(suppliers.filter(s=>s.id!==sup.id)); }}>✕</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="action-btn" style={{ background:"#131c2e", color:"#64748b", marginTop:16, padding:"9px 18px" }}
              onClick={()=>{ const n={id:Date.now(),name:"New Supplier",terms:"shotef",notes:""}; saveSuppliers([...suppliers,n]); setEditSupplier(n); }}>
              + Add Supplier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
