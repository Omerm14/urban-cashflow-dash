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
import { processPdf, fileToBase64, extractInvoice, translateSupplierName } from "./utils/image";
import { findDuplicates, parseCSV, isLatinOnly }                           from "./utils/invoice";
import { calcDueDate, toYM, correctSwappedDate }                           from "./utils/dates";
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

    // Pre-filter by filename to avoid wasting API tokens on already-uploaded files
    const existingFileNames = new Set(invoices.map(i => i.source_file).filter(Boolean).map(n => n.toLowerCase()));
    const [toExtract, fileSkipped] = files.reduce(([ok, skip], f) =>
      existingFileNames.has(f.name.toLowerCase()) ? [ok, [...skip, f]] : [[...ok, f], skip],
      [[], []]
    );

    const imageResults = await Promise.allSettled(
      toExtract.map(f => f.type === "application/pdf" ? processPdf(f) : fileToBase64(f).then(img => [img]))
    );

    // Flatten: each PDF page becomes its own extraction unit
    const pageUnits = [];
    imageResults.forEach((r, i) => {
      if (r.status === "rejected") {
        pageUnits.push({ file: toExtract[i], error: r.reason });
      } else {
        r.value.forEach(pageImage => pageUnits.push({ file: toExtract[i], pageImage }));
      }
    });

    const extractResults = await Promise.allSettled(
      pageUnits.map(unit => {
        if (unit.error) return Promise.reject(new Error(`${unit.file.name}: ${unit.error.message}`));
        return extractInvoice(unit.pageImage).then(ex => ({ file: unit.file, ex }));
      })
    );

    const candidateResults = await Promise.allSettled(
      extractResults.map(async (r, i) => {
        if (r.status === "rejected") throw new Error(r.reason?.message || `${pageUnits[i].file.name}: failed`);
        const { file, ex } = r.value;
        const invoiceDate = correctSwappedDate(ex.invoiceDate) || ex.invoiceDate || "";
        let sup = getSupplier(ex.supplier);
        if (!sup && isLatinOnly(ex.supplier)) {
          const hebrew = await translateSupplierName(ex.supplier);
          if (hebrew) sup = getSupplier(hebrew) || null;
        }
        const due = calcDueDate(invoiceDate, sup);
        return {
          file,
          candidate: {
            supplier:     sup?.name || ex.supplier || "",
            invoice_no:   ex.invoiceNo   || "",
            invoice_date: invoiceDate,
            amount:       Number(ex.amount) || 0,
            due_date:     due ? due.toISOString().split("T")[0] : "",
            status:       STATUS.UNPAID,
            notes:        "",
            source_file:  file.name,
          },
        };
      })
    );

    const candidates = [], errors = [];
    candidateResults.forEach((r, i) => {
      if (r.status === "rejected") { errors.push(r.reason?.message || `${pageUnits[i].file.name}: failed`); return; }
      candidates.push(r.value);
    });

    // Deduplicate against existing invoices
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
    const contentDupeCount = candidates.length - toAdd.length;

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
    const parts = [];
    if (added) parts.push(`${added} added`);
    if (fileSkipped.length) parts.push(`${fileSkipped.length} already uploaded`);
    if (contentDupeCount) parts.push(`${contentDupeCount} already exist`);
    if (errors.length) parts.push(`${errors.length} failed: ${errors[0]}`);
    const hasIssue = fileSkipped.length || contentDupeCount || errors.length;
    setExtractMsg({ text: (added && !hasIssue ? "✓ " : "") + (parts.join(" · ") || "nothing to add"), ok: !hasIssue && added > 0 });
    setTimeout(() => setExtractMsg(null), 5000);
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
              onClick={() => fileRef.current.click()} disabled={extracting || loading}>
              <span style={{ fontSize:16 }}>+</span>{extracting ? "Extracting…" : loading ? "Loading…" : "Upload Invoices"}
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
