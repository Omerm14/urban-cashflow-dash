import { useState, useRef, useCallback } from "react";
import { useAuth }         from "./contexts/AuthContext";
import { useInvoiceData }  from "./hooks/useInvoiceData";
import LoginPage           from "./pages/LoginPage";
import AdminPage           from "./pages/AdminPage";
import NavBar              from "./components/NavBar";
import Dashboard           from "./components/Dashboard";
import InvoicesTable       from "./components/InvoicesTable";
import CalendarView        from "./components/CalendarView";
import EditInvoiceModal    from "./components/EditInvoiceModal";
import SuppliersModal      from "./components/SuppliersModal";
import { pdfToBase64, fileToBase64, extractInvoice } from "./utils/image";
import { findDuplicates, parseCSV }                  from "./utils/invoice";
import { calcDueDate, toYM }                         from "./utils/dates";
import { STATUS }                                    from "./constants";

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  const [view,          setView]          = useState("dashboard");
  const [extracting,    setExtracting]    = useState(false);
  const [extractMsg,    setExtractMsg]    = useState(null);
  const [editInvoice,   setEditInvoice]   = useState(null);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [editSupplier,  setEditSupplier]  = useState(null);
  const [calMonth,      setCalMonth]      = useState(() => toYM(new Date()));
  const fileRef = useRef();
  const csvRef  = useRef();

  const {
    suppliers, invoices, computed, dupeIds, monthlyData, allNames, color, maxTotal, kpis, loading,
    addInvoice, updateInvoice, deleteInvoice,
    addSupplier, updateSupplier, deleteSupplier,
    getSupplier,
  } = useInvoiceData();

  const handleUpload = useCallback(async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setExtracting(true);
    setExtractMsg({ text: `Processing ${files.length} file${files.length > 1 ? "s" : ""}…`, ok: null });

    const imageResults = await Promise.allSettled(
      files.map(f => f.type === "application/pdf" ? pdfToBase64(f) : fileToBase64(f))
    );

    const extractResults = await Promise.allSettled(
      imageResults.map((r, i) => {
        if (r.status === "rejected") return Promise.reject(new Error(`${files[i].name}: ${r.reason.message}`));
        return extractInvoice(r.value.b64, r.value.mediaType, suppliers).then(ex => ({ file: files[i], ex }));
      })
    );

    const candidates = [], errors = [];
    extractResults.forEach((r, i) => {
      if (r.status === "rejected") { errors.push(r.reason?.message || `${files[i].name}: failed`); return; }
      const { file, ex } = r.value;
      const sup = getSupplier(ex.supplier);
      const due = calcDueDate(ex.invoiceDate, sup);
      candidates.push({
        file,
        candidate: {
          supplier:     sup?.name || ex.supplier || "",
          invoice_no:   ex.invoiceNo   || "",
          invoice_date: ex.invoiceDate || "",
          amount:       Number(ex.amount) || 0,
          due_date:     due ? due.toISOString().split("T")[0] : "",
          status:       STATUS.UNPAID,
          notes:        "",
        },
      });
    });

    // Deduplicate against existing invoices
    // Normalize stored supplier names to canonical DB names so fuzzy-extracted
    // names don't cause missed matches on subsequent uploads.
    const computedForDedup = computed.map(inv => ({
      ...inv,
      supplier: getSupplier(inv.supplier)?.name || inv.supplier,
    }));
    const withTempIds = candidates.map((c, i) => ({
      ...c.candidate,
      id: `__new_${i}`,
      invoiceNo:   c.candidate.invoice_no,
      invoiceDate: c.candidate.invoice_date,
    }));
    const dupeSet = findDuplicates([...computedForDedup, ...withTempIds]);
    const toAdd = candidates.filter((_, i) => !dupeSet.has(`__new_${i}`));

    // Add non-duplicate candidates
    let added = 0;
    await Promise.allSettled(
      toAdd.map(async ({ file, candidate }) => {
        try {
          await addInvoice(candidate);
          added++;
        } catch (err) {
          errors.push(`${file.name}: ${err.message}`);
        }
      })
    );

    setExtracting(false);
    setExtractMsg(errors.length
      ? { text: `${added} added · ${errors.length} failed: ${errors[0]}`, ok: false }
      : { text: `✓ ${added} invoice${added !== 1 ? "s" : ""} extracted`, ok: true }
    );
    setTimeout(() => setExtractMsg(null), 4000);
    e.target.value = "";
  }, [invoices, suppliers, addInvoice, getSupplier, computed]);

  const handleCSV = useCallback(async e => {
    const file = e.target.files[0]; if (!file) return;
    const parsed = parseCSV(await file.text());
    if (parsed.length) {
      const results = await Promise.allSettled(parsed.map(s => addSupplier({ name: s.name, terms: s.terms || "shotef", notes: s.notes || "" })));
      const failed = results.filter(r => r.status === "rejected");
      if (failed.length) {
        setExtractMsg({ text: `${parsed.length - failed.length} added · ${failed.length} failed: ${failed[0].reason?.message || "unknown error"}`, ok: false });
      } else {
        setExtractMsg({ text: `✓ ${parsed.length} suppliers loaded`, ok: true });
      }
    } else {
      setExtractMsg({ text: "Could not parse CSV — expected columns: name, terms, notes", ok: false });
    }
    setTimeout(() => setExtractMsg(null), 5000);
    e.target.value = "";
  }, [addSupplier]);

  if (authLoading) return (
    <div style={{ background:"#080e1a", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#64748b", fontSize:14 }}>Loading…</div>
    </div>
  );

  if (!user) return <LoginPage />;

  if (loading) return (
    <div style={{ background:"#080e1a", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#64748b", fontSize:14 }}>Loading…</div>
    </div>
  );

  return (
    <div style={{ background:"#080e1a", minHeight:"100vh", color:"#e2e8f0", fontFamily:"Inter,system-ui,sans-serif" }}>
      <NavBar view={view} setView={setView} suppliersCount={suppliers.length}
        onSuppliersClick={() => setShowSuppliers(true)} user={user} onSignOut={signOut} />

      <div style={{ maxWidth:1140, margin:"0 auto", padding:"28px 28px 60px" }}>
        {view !== "admin" && (
          <div style={{ display:"flex", gap:10, marginBottom:32, alignItems:"center", flexWrap:"wrap" }}>
            <button className="upload-btn" style={{ background:"linear-gradient(135deg,#6366f1,#a78bfa)", color:"#fff", boxShadow:"0 4px 20px #6366f133" }}
              onClick={() => fileRef.current.click()} disabled={extracting}>
              <span style={{ fontSize:16 }}>+</span>{extracting ? "Extracting…" : "Upload Invoices"}
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleUpload} style={{ display:"none" }} />

            <button className="upload-btn" style={{ background:"#131c2e", color:"#94a3b8", border:"1px solid #1e2d45" }} onClick={() => csvRef.current.click()}>
              <span>📋</span> Load Supplier Sheet
            </button>
            <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleCSV} style={{ display:"none" }} />

            {extractMsg && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:8,
                background: extractMsg.ok===false?"#2d0a0a":extractMsg.ok?"#052e16":"#131c2e",
                border:`1px solid ${extractMsg.ok===false?"#7f1d1d":extractMsg.ok?"#166534":"#1e2d45"}`,
                color: extractMsg.ok===false?"#f87171":extractMsg.ok?"#4ade80":"#94a3b8", fontSize:13, animation:"fadeIn .3s" }}>
                {extractMsg.text}
              </div>
            )}
            <div style={{ marginLeft:"auto", fontSize:12, color:"#334155", fontWeight:500 }}>{invoices.length} invoices</div>
          </div>
        )}

        {view === "dashboard" && <Dashboard  kpis={kpis} monthlyData={monthlyData} allNames={allNames} color={color} maxTotal={maxTotal} />}
        {view === "invoices"  && <InvoicesTable computed={computed} dupeIds={dupeIds} updateInvoice={updateInvoice} deleteInvoice={deleteInvoice} setEditInvoice={setEditInvoice} color={color} />}
        {view === "calendar"  && <CalendarView computed={computed} calMonth={calMonth} setCalMonth={setCalMonth} color={color} />}
        {view === "admin"     && <AdminPage />}
      </div>

      {editInvoice   && <EditInvoiceModal editInvoice={editInvoice} setEditInvoice={setEditInvoice} suppliers={suppliers} addInvoice={addInvoice} updateInvoice={updateInvoice} getSupplier={getSupplier} />}
      {showSuppliers && <SuppliersModal suppliers={suppliers} addSupplier={addSupplier} updateSupplier={updateSupplier} deleteSupplier={deleteSupplier} editSupplier={editSupplier} setEditSupplier={setEditSupplier} onClose={() => setShowSuppliers(false)} />}
    </div>
  );
}
