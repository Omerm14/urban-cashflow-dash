import { useState, useCallback, useEffect, useRef } from "react";
import { toYM, currency, fmtMonth } from "../utils/dates";
import InvoicesTable from "./InvoicesTable";
import InvoicesGroupedView from "./InvoicesGroupedView";

function nxtMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function InvoicesView({ computed, dupeIds, updateInvoice, deleteInvoice, bulkMarkPaid, bulkMarkUnpaid, bulkDelete, setEditInvoice, color, onViewAttachment, preSelMonth, onClearPreSel }) {
  const [selectedIds,   setSelectedIds]   = useState(new Set());
  const [viewMode,      setViewMode]      = useState("grouped");
  const [selectedMonth, setSelectedMonth] = useState(() => toYM(new Date()));
  const [sortField,     setSortField]     = useState("invoiceDate");
  const [sortDir,       setSortDir]       = useState("desc");
  const [showPayModal,  setShowPayModal]  = useState(false);
  const [showSuccess,   setShowSuccess]   = useState(false);
  const [successMsg,    setSuccessMsg]    = useState("");
  const [nextMoHint,    setNextMoHint]    = useState(null);
  const [deleteTarget,  setDeleteTarget]  = useState(null);

  // Refs so effects always see the latest values without re-registering
  const computedRef      = useRef(computed);
  const selectedMonthRef = useRef(selectedMonth);
  const selectedIdsRef   = useRef(selectedIds);
  useEffect(() => { computedRef.current      = computed;      }, [computed]);
  useEffect(() => { selectedMonthRef.current = selectedMonth; }, [selectedMonth]);
  useEffect(() => { selectedIdsRef.current   = selectedIds;   }, [selectedIds]);

  // Pre-select invoices when navigating from dashboard CTA
  useEffect(() => {
    if (!preSelMonth) return;
    const monthInvs = computedRef.current.filter(inv => inv.dueDate && inv.dueDate.startsWith(preSelMonth) && inv.status !== "paid");
    setSelectedMonth(preSelMonth);
    setViewMode("grouped");
    setSelectedIds(new Set(monthInvs.map(i => i.id)));
    onClearPreSel?.();
  }, [preSelMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts: A = select all visible, P = pay, Esc = clear
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "a" || e.key === "A") {
        const visibleIds = computedRef.current
          .filter(inv => inv.dueDate && inv.dueDate.startsWith(selectedMonthRef.current) && inv.status !== "paid")
          .map(i => i.id);
        setSelectedIds(new Set(visibleIds));
      } else if (e.key === "p" || e.key === "P") {
        if (selectedIdsRef.current.size > 0) setShowPayModal(true);
      } else if (e.key === "Escape") {
        setSelectedIds(new Set());
        setShowPayModal(false);
        setShowSuccess(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // registered once; reads latest values via refs

  const toggleSelect = useCallback(id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(ids => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkPaid = useCallback(async () => {
    const ids = [...selectedIds];
    await bulkMarkPaid(ids);
    clearSelection();
  }, [selectedIds, bulkMarkPaid, clearSelection]);

  const handleBulkUnpaid = useCallback(async () => {
    const ids = [...selectedIds];
    await bulkMarkUnpaid(ids);
    clearSelection();
  }, [selectedIds, bulkMarkUnpaid, clearSelection]);

  const handleDeleteInvoice = useCallback(id => {
    const inv = computed.find(i => i.id === id);
    setDeleteTarget(inv ?? { id });
  }, [computed]);

  const confirmDelete = useCallback(async () => {
    await deleteInvoice(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, deleteInvoice]);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (!confirm(`Delete ${ids.length} invoice${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
    await bulkDelete(ids);
    clearSelection();
  }, [selectedIds, bulkDelete, clearSelection]);

  const handlePayNow = useCallback(async () => {
    const selInvs = computed.filter(i => selectedIds.has(i.id));
    const total = selInvs.reduce((s, i) => s + Number(i.amount), 0);
    const cnt = selInvs.length;
    const paidIds = new Set([...selectedIds]);
    await bulkMarkPaid([...selectedIds]);
    clearSelection();
    setShowPayModal(false);
    const nm = nxtMonth(selectedMonth);
    const hasNext = computed.some(inv => inv.dueDate && inv.dueDate.startsWith(nm) && !paidIds.has(inv.id) && inv.status !== "paid");
    setNextMoHint(hasNext ? nm : null);
    setSuccessMsg(`${cnt} invoice${cnt !== 1 ? "s" : ""} marked paid · ${currency(total)}`);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3200);
  }, [selectedIds, computed, bulkMarkPaid, clearSelection, selectedMonth]);

  const count = selectedIds.size;
  const selInvs = computed.filter(i => selectedIds.has(i.id));
  const selTotal = selInvs.reduce((s, i) => s + Number(i.amount), 0);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortedComputed = [...computed].sort((a, b) => {
    const av = a[sortField] ?? '';
    const bv = b[sortField] ?? '';
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const selSuppliers = [...new Set(selInvs.map(i => i.supplier))].slice(0, 5);

  return (
    <div>
      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <div className="view-toggle">
          <button className={`vbtn${viewMode === "table" ? " active" : ""}`} onClick={() => setViewMode("table")}>Table</button>
          <button className={`vbtn${viewMode === "grouped" ? " active" : ""}`} onClick={() => setViewMode("grouped")}>Grouped</button>
        </div>

        {viewMode === "grouped" && (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:"1px" }}>Sort by</span>
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value)}
              className="input"
              style={{ width:"auto", padding:"5px 10px", fontSize:12, cursor:"pointer" }}>
              <option value="invoiceDate">Invoice Date</option>
              <option value="amount">Amount</option>
              <option value="dueDate">Due Date</option>
            </select>
          </div>
        )}

        {count > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
            <button className="btn btn-ghost btn-sm" onClick={handleBulkUnpaid}>Mark Unpaid</button>
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>Delete</button>
          </div>
        )}
      </div>

      {viewMode === "table"
        ? <InvoicesTable
            computed={sortedComputed} dupeIds={dupeIds}
            updateInvoice={updateInvoice} deleteInvoice={handleDeleteInvoice}
            setEditInvoice={setEditInvoice} color={color}
            selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
            onViewAttachment={onViewAttachment}
            sortField={sortField} sortDir={sortDir} onSort={handleSort}
          />
        : <InvoicesGroupedView
            computed={computed} dupeIds={dupeIds}
            updateInvoice={updateInvoice} deleteInvoice={handleDeleteInvoice}
            setEditInvoice={setEditInvoice} color={color}
            selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
            selectedMonth={selectedMonth} onMonthChange={setSelectedMonth}
            sortField={sortField}
            onViewAttachment={onViewAttachment}
            onSelectAll={ids => setSelectedIds(new Set(ids))}
          />
      }

      {/* Floating batch bar */}
      {count > 0 && (
        <div className="batch-bar">
          {/* Supplier avatars */}
          <div style={{ display:'flex', alignItems:'center' }}>
            {selSuppliers.map((sup, i) => (
              <div key={sup} style={{ width:28, height:28, borderRadius:'50%', background:color(sup), border:'2px solid var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0, marginLeft: i > 0 ? -8 : 0, zIndex: selSuppliers.length - i }}>
                {sup.charAt(0).toUpperCase()}
              </div>
            ))}
            {selInvs.length > selSuppliers.length && (
              <div style={{ marginLeft:-8, width:28, height:28, borderRadius:'50%', background:'var(--surf2)', border:'2px solid var(--navy)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'var(--t2)', fontWeight:700 }}>
                +{selInvs.length - selSuppliers.length}
              </div>
            )}
          </div>
          <span style={{ fontWeight:600, color:"var(--t2)" }}>{count} selected</span>
          <span style={{ width:1, height:20, background:"rgba(255,255,255,.1)" }}/>
          <span style={{ fontWeight:800, fontSize:16, color:"#fff", fontFamily:"'DM Mono',monospace" }}>
            {currency(selTotal)}
          </span>
          <button className="btn btn-primary" style={{ borderRadius:50 }} onClick={() => setShowPayModal(true)}>
            Pay Now →
          </button>
          <button onClick={clearSelection} style={{ background:"none", border:"none", color:"var(--t3)", cursor:"pointer", fontSize:20, lineHeight:1 }}>×</button>
        </div>
      )}

      {/* Pay Now confirmation modal */}
      {showPayModal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowPayModal(false)}>
          <div className="modal">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:20 }}>Confirm Payment</div>
                <div style={{ fontSize:13, color:"var(--t2)", marginTop:3 }}>
                  Marking {selInvs.length} invoice{selInvs.length !== 1 ? "s" : ""} as paid
                </div>
              </div>
              <button onClick={() => setShowPayModal(false)} style={{ background:"none", border:"none", color:"var(--t3)", cursor:"pointer", fontSize:24 }}>×</button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:7, maxHeight:280, overflowY:"auto", marginBottom:18 }}>
              {selInvs.map(inv => (
                <div key={inv.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", background:"var(--surf2)", borderRadius:8 }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:color(inv.supplier), display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0 }}>
                    {inv.supplier.charAt(0)}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{inv.supplier}</div>
                    <div style={{ fontSize:11, color:"var(--t3)" }}>{inv.invoiceNo || "—"} · Due {inv.dueDate || "—"}</div>
                  </div>
                  <span style={{ fontWeight:800, whiteSpace:"nowrap" }}>{currency(inv.amount)}</span>
                </div>
              ))}
            </div>

            <div style={{ padding:"14px 16px", background:"var(--indigo-tint)", border:"1px solid var(--indigo-border)", borderRadius:10, marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"var(--t2)", fontSize:13 }}>Total payment</span>
              <span style={{ fontWeight:800, fontSize:22, color:"var(--indigo)", fontFamily:"'DM Mono',monospace" }}>
                {currency(selTotal)}
              </span>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setShowPayModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2, padding:14, fontSize:15 }} onClick={handlePayNow}>
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success overlay with confetti */}
      {showSuccess && (
        <div className="success-overlay" onClick={() => setShowSuccess(false)}>
          {[...Array(22)].map((_, i) => (
            <div key={i} style={{
              position:"fixed",
              left:`${5 + i * 4.2}%`,
              top:`${30 + (i % 5) * 8}%`,
              width: i % 3 === 0 ? 10 : i % 3 === 1 ? 7 : 5,
              height: i % 3 === 0 ? 10 : i % 3 === 1 ? 7 : 5,
              borderRadius: i % 2 === 0 ? 2 : "50%",
              background:["#6366F1","#818CF8","#10b981","#f59e0b","#A5B4FC","#34D399"][i % 6],
              animation:`confettiFall ${.5 + (i % 8) * .07}s ease-out ${i * .05}s both`,
              pointerEvents:"none",
            }}/>
          ))}
          <div className="check-ring">
            <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
              <path d="M10 21L18 29L32 13" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="50" style={{ animation:"draw .55s .1s ease forwards" }}/>
            </svg>
          </div>
          <div style={{ fontWeight:800, fontSize:28, marginBottom:8 }}>All Clear!</div>
          <div style={{ color:"var(--t2)", fontSize:15, marginBottom:24 }}>{successMsg}</div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn btn-ghost" onClick={() => setShowSuccess(false)}>Back</button>
            {nextMoHint && (
              <button className="btn btn-primary" onClick={() => {
                setShowSuccess(false);
                setSelectedMonth(nextMoHint);
              }}>
                Next: {fmtMonth(nextMoHint)} →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="modal">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:20 }}>Delete Invoice?</div>
                <div style={{ fontSize:13, color:"var(--t2)", marginTop:3 }}>This action cannot be undone.</div>
              </div>
              <button onClick={() => setDeleteTarget(null)} style={{ background:"none", border:"none", color:"var(--t3)", cursor:"pointer", fontSize:24 }}>×</button>
            </div>

            <div style={{ padding:"14px 16px", background:"var(--surf2)", borderRadius:10, marginBottom:22, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:color(deleteTarget.supplier || ""), display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff", flexShrink:0 }}>
                {(deleteTarget.supplier || "?").charAt(0)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{deleteTarget.supplier || "—"}</div>
                <div style={{ fontSize:12, color:"var(--t3)" }}>{deleteTarget.invoiceNo || deleteTarget.invoice_no || "—"}</div>
              </div>
              {deleteTarget.amount != null && (
                <span style={{ fontWeight:800, whiteSpace:"nowrap" }}>{currency(Number(deleteTarget.amount))}</span>
              )}
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" style={{ flex:2, padding:14, fontSize:15 }} onClick={confirmDelete}>
                Delete Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
