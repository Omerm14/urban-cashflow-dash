import { useState, useCallback } from "react";
import { toYM, currency } from "../utils/dates";
import InvoicesTable from "./InvoicesTable";
import InvoicesGroupedView from "./InvoicesGroupedView";

export default function InvoicesView({ computed, dupeIds, updateInvoice, deleteInvoice, bulkMarkPaid, bulkMarkUnpaid, bulkDelete, setEditInvoice, color, onViewAttachment }) {
  const [selectedIds,   setSelectedIds]   = useState(new Set());
  const [viewMode,      setViewMode]      = useState("grouped");
  const [selectedMonth, setSelectedMonth] = useState(() => toYM(new Date()));
  const [sortField,     setSortField]     = useState("invoiceDate");
  const [showPayModal,  setShowPayModal]  = useState(false);
  const [showSuccess,   setShowSuccess]   = useState(false);
  const [successMsg,    setSuccessMsg]    = useState("");

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
    await bulkMarkPaid([...selectedIds]);
    clearSelection();
    setShowPayModal(false);
    setSuccessMsg(`${cnt} invoice${cnt !== 1 ? "s" : ""} marked paid · ${currency(total)}`);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3200);
  }, [selectedIds, computed, bulkMarkPaid, clearSelection]);

  const count = selectedIds.size;
  const selInvs = computed.filter(i => selectedIds.has(i.id));
  const selTotal = selInvs.reduce((s, i) => s + Number(i.amount), 0);

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

        {/* Secondary bulk actions (when items selected) */}
        {count > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:"auto" }}>
            <button className="btn btn-ghost btn-sm" onClick={handleBulkUnpaid}>↻ Mark Unpaid</button>
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>✕ Delete</button>
          </div>
        )}
      </div>

      {viewMode === "table"
        ? <InvoicesTable
            computed={computed} dupeIds={dupeIds}
            updateInvoice={updateInvoice} deleteInvoice={deleteInvoice}
            setEditInvoice={setEditInvoice} color={color}
            selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
            onViewAttachment={onViewAttachment}
          />
        : <InvoicesGroupedView
            computed={computed} dupeIds={dupeIds}
            updateInvoice={updateInvoice} deleteInvoice={deleteInvoice}
            setEditInvoice={setEditInvoice} color={color}
            selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
            selectedMonth={selectedMonth} onMonthChange={setSelectedMonth}
            sortField={sortField}
            onViewAttachment={onViewAttachment}
          />
      }

      {/* Floating batch bar */}
      {count > 0 && (
        <div className="batch-bar">
          <div className="batch-count">{count}</div>
          <span style={{ fontWeight:600, color:"var(--t2)" }}>{count} selected</span>
          <span style={{ width:1, height:20, background:"rgba(255,255,255,.1)" }}/>
          <span style={{ fontWeight:800, fontSize:16, background:"var(--grad)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
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

            <div style={{ padding:"14px 16px", background:"rgba(139,92,246,.08)", border:"1px solid rgba(139,92,246,.2)", borderRadius:10, marginBottom:18, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"var(--t2)", fontSize:13 }}>Total payment</span>
              <span style={{ fontWeight:800, fontSize:22, background:"var(--grad)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
                {currency(selTotal)}
              </span>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setShowPayModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2, padding:14, fontSize:15 }} onClick={handlePayNow}>
                ✓ Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success overlay with confetti */}
      {showSuccess && (
        <div className="success-overlay" onClick={() => setShowSuccess(false)}>
          {[...Array(14)].map((_, i) => (
            <div key={i} style={{
              position:"fixed",
              left:`${10 + i * 6}%`,
              top:`${35 + (i % 4) * 8}%`,
              width:9, height:9, borderRadius:2,
              background:["#8b5cf6","#3b82f6","#10b981","#f59e0b","#ec4899"][i % 5],
              animation:`confettiFall ${.6 + i * .05}s ease-out ${i * .06}s both`,
              pointerEvents:"none",
            }}/>
          ))}
          <div className="check-ring">
            <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
              <path d="M10 21L18 29L32 13" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="50" style={{ animation:"draw .55s .1s ease forwards" }}/>
            </svg>
          </div>
          <div style={{ fontWeight:800, fontSize:28, marginBottom:8 }}>Payment Confirmed! 🎉</div>
          <div style={{ color:"var(--t2)", fontSize:15, marginBottom:24 }}>{successMsg}</div>
          <button className="btn btn-ghost" onClick={() => setShowSuccess(false)}>← Back to invoices</button>
        </div>
      )}
    </div>
  );
}
