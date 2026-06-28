import { useState, useRef, useEffect, useCallback } from "react";
import { currency, fmt, fmtMonth, toYM } from "../utils/dates";
import { STATUS } from "../constants";

function prevMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return toYM(new Date(y, m - 2, 1));
}

function nextMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return toYM(new Date(y, m, 1));
}

function statusBadge(status) {
  const map = {
    [STATUS.UNPAID]:  { cls:"badge-unpaid",  label:"Unpaid" },
    [STATUS.PAID]:    { cls:"badge-paid",    label:"Paid" },
    [STATUS.OVERDUE]: { cls:"badge-overdue", label:"Overdue" },
    [STATUS.CREDIT]:  { cls:"badge-credit",  label:"Credit" },
  };
  return map[status] || map[STATUS.UNPAID];
}

function urgencyStyle(dueDate) {
  if (!dueDate) return {};
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return { color:"var(--red)", fontWeight:700 };
  if (days <= 7) return { color:"var(--amber)", fontWeight:600 };
  return {};
}


function SupplierCard({ supplier, invoices, dupeIds, updateInvoice, deleteInvoice, setEditInvoice, color, selectedIds, onToggleSelect, onToggleAll, sortField, onViewAttachment, onPayGroup }) {
  const [hov, setHov] = useState(false);

  const sorted = [...invoices].sort((a, b) => {
    if (sortField === "amount") return Number(b.amount) - Number(a.amount);
    const af = a[sortField] ?? "", bf = b[sortField] ?? "";
    return af.localeCompare(bf);
  });

  const cardIds = invoices.map(i => i.id);
  const allSelected = cardIds.length > 0 && cardIds.every(id => selectedIds.has(id));
  const someSelected = !allSelected && cardIds.some(id => selectedIds.has(id));
  const total = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const c = color(supplier);

  const selectAllRef = useRef();
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div className="sup-group" onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <div className="sup-hdr">
        <input
          type="checkbox"
          checked={allSelected}
          ref={selectAllRef}
          onChange={() => onToggleAll(cardIds)}
          style={{ accentColor:"var(--cyan)", cursor:"pointer", width:15, height:15, flexShrink:0 }}
        />
        <div style={{ width:34, height:34, borderRadius:"50%", background:c, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff", flexShrink:0 }}>
          {supplier.charAt(0)}
        </div>
        <span style={{ fontWeight:700, flex:1, fontSize:14 }}>{supplier}</span>
        {hov && (
          <button className="btn btn-primary btn-sm" style={{ borderRadius:50, fontSize:12 }}
            onClick={e => { e.stopPropagation(); onPayGroup(cardIds); }}>
            Pay group
          </button>
        )}
        <span style={{ fontSize:12, color:"var(--t3)", background:"var(--surf2)", padding:"2px 8px", borderRadius:10, fontWeight:600 }}>
          {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
        </span>
        <span style={{ fontWeight:800, marginLeft:12, whiteSpace:"nowrap" }}>{currency(total)}</span>
      </div>

      {sorted.map(inv => {
        const isSelected = selectedIds.has(inv.id);
        const { cls, label } = statusBadge(inv.status);
        const isPaid = inv.status === STATUS.PAID;
        const urgStyle = isPaid ? {} : urgencyStyle(inv.dueDate);
        return (
          <div key={inv.id} className={`sup-row${isSelected ? " sel" : ""}`}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(inv.id)}
              style={{ accentColor:"var(--cyan)", cursor:"pointer", width:15, height:15 }}
            />
            <span style={{ color:"var(--t3)", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"monospace" }}>
              {inv.invoiceNo || "—"}
              {dupeIds.has(inv.id) && <span style={{ color:"var(--amber)", marginLeft:4, fontSize:10 }}> ⚠ DUP</span>}
            </span>
            <span style={{ color:"var(--t2)", fontSize:12 }}>{fmt(inv.invoiceDate)}</span>
            <span style={{ fontWeight:700 }}>{currency(inv.amount)}</span>
            <span className={`badge ${cls}`}>{label}</span>
            <span style={{ fontSize:12, ...urgStyle }}>
              {inv.dueDate
                ? fmt(inv.dueDate)
                : <span style={{ color:"var(--amber)", fontSize:11, cursor:"pointer" }} onClick={() => setEditInvoice({...inv})}>⚠ Fix</span>
              }
            </span>
            <div style={{ display:"flex", gap:5, justifyContent:"flex-end" }}>
              {inv.attachment_path && (
                <button className="btn btn-ghost btn-sm" title="View file" onClick={() => onViewAttachment?.(inv)}>📎</button>
              )}
              {!isPaid && (
                <button className="btn btn-success btn-sm" onClick={() => updateInvoice(inv.id, { status: STATUS.PAID })}>✓ Paid</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setEditInvoice({...inv})}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => deleteInvoice(inv.id)}>×</button>
            </div>
          </div>
        );
      })}

      <div style={{ padding:"7px 20px", borderTop:"1px solid rgba(255,255,255,.04)", display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--t3)" }}>
        <label style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer" }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onToggleAll(cardIds)}
            style={{ accentColor:"var(--cyan)", cursor:"pointer", width:13, height:13 }}
          />
          Select all in card
        </label>
        <span>Total: <strong style={{ color:"var(--t2)" }}>{currency(total)}</strong></span>
      </div>
    </div>
  );
}

export default function InvoicesGroupedView({ computed, dupeIds, updateInvoice, deleteInvoice, setEditInvoice, color, selectedIds, onToggleSelect, onToggleAll, selectedMonth, onMonthChange, sortField, onViewAttachment, onSelectAll }) {
  const [showCelebration, setShowCelebration] = useState(false);

  const availableMonths = [...new Set(computed.map(i => i.dueDate?.slice(0,7)).filter(Boolean))].sort();

  const monthInvoices = computed.filter(inv => inv.dueDate && inv.dueDate.startsWith(selectedMonth));
  const monthTotal = monthInvoices.reduce((s, i) => s + Number(i.amount), 0);
  const unpaidInMonth = monthInvoices.filter(i => i.status !== STATUS.PAID);
  const paidCount = monthInvoices.length - unpaidInMonth.length;
  const totalCount = monthInvoices.length;
  const allPaid = totalCount > 0 && paidCount === totalCount;
  const progress = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

  const prevMonthRef = useRef(selectedMonth);
  useEffect(() => {
    if (prevMonthRef.current !== selectedMonth) {
      setShowCelebration(false);
      prevMonthRef.current = selectedMonth;
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (allPaid && totalCount > 0) setShowCelebration(true);
  }, [allPaid, totalCount]);

  const groups = Object.entries(
    monthInvoices.reduce((acc, inv) => {
      (acc[inv.supplier] = acc[inv.supplier] || []).push(inv);
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

  const kbdStyle = { background:"var(--surf2)", border:"1px solid var(--bdr2)", borderRadius:4, padding:"1px 6px", fontFamily:"inherit", fontSize:10 };

  return (
    <div>
      {/* Month tab rail */}
      {availableMonths.length > 0 && (
        <div className="month-rail">
          {availableMonths.map(ym => (
            <button
              key={ym}
              className={`month-tab${ym === selectedMonth ? " active" : ""}`}
              onClick={() => onMonthChange(ym)}
            >
              {fmtMonth(ym)}
            </button>
          ))}
        </div>
      )}

      {/* Month navigation fallback (when no invoices) */}
      {availableMonths.length === 0 && (
        <div className="month-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => onMonthChange(prevMonth(selectedMonth))}>‹</button>
          <span style={{ fontWeight:700, fontSize:16 }}>{fmtMonth(selectedMonth)}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => onMonthChange(nextMonth(selectedMonth))}>›</button>
        </div>
      )}

      {/* Progress bar */}
      {totalCount > 0 && (
        <div style={{ marginBottom:10 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
            <span style={{ fontSize:11, color:"var(--t3)" }}>{paidCount} of {totalCount} invoices paid</span>
            <span style={{ fontSize:12, fontWeight:700, background:"var(--grad)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{progress}%</span>
          </div>
          <div className="prog-track"><div className="prog-fill" style={{ width:`${progress}%` }}/></div>
        </div>
      )}

      {/* Month total banner + select-all shortcut */}
      <div className="total-bar">
        <span style={{ fontSize:12, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".04em" }}>
          Total due in {fmtMonth(selectedMonth).toUpperCase()}
        </span>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {unpaidInMonth.length > 0 && onSelectAll && (
            <button className="btn btn-ghost btn-sm" onClick={() => onSelectAll(unpaidInMonth.map(i => i.id))}>
              Select all ({unpaidInMonth.length}) →
            </button>
          )}
          <span style={{ fontWeight:800, fontSize:20 }}>{currency(monthTotal)}</span>
        </div>
      </div>

      {/* Keyboard shortcut hint */}
      {unpaidInMonth.length > 0 && (
        <div style={{ display:"flex", gap:16, marginBottom:14, fontSize:11, color:"var(--t3)" }}>
          <span><kbd style={kbdStyle}>A</kbd> select all</span>
          <span><kbd style={kbdStyle}>P</kbd> pay</span>
          <span><kbd style={kbdStyle}>Esc</kbd> clear</span>
        </div>
      )}

      {/* All-done celebration overlay */}
      {showCelebration && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowCelebration(false)}>
          <div className="modal" style={{ textAlign:"center", padding:"40px 32px", position:"relative" }}>
            <button onClick={() => setShowCelebration(false)} style={{ position:"absolute", top:14, right:16, background:"none", border:"none", color:"var(--t3)", cursor:"pointer", fontSize:24 }}>×</button>
            <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.25)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div style={{ fontWeight:800, fontSize:22, marginBottom:6 }}>All done for {fmtMonth(selectedMonth)}!</div>
            <div style={{ color:"var(--t3)", fontSize:14, marginBottom:22 }}>
              All {totalCount} invoice{totalCount !== 1 ? "s" : ""} have been paid.
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button className="btn btn-ghost" onClick={() => setShowCelebration(false)}>← Back</button>
              <button className="btn btn-primary" onClick={() => { setShowCelebration(false); onMonthChange(nextMonth(selectedMonth)); }}>
                Next month →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {groups.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--t3)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom:10, opacity:.4 }}>
            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <div style={{ fontSize:14 }}>No invoices due in {fmtMonth(selectedMonth)}</div>
        </div>
      )}

      {/* Supplier cards */}
      {groups.map(([supplier, invoices]) => (
        <SupplierCard
          key={supplier}
          supplier={supplier}
          invoices={invoices}
          dupeIds={dupeIds}
          updateInvoice={updateInvoice}
          deleteInvoice={deleteInvoice}
          setEditInvoice={setEditInvoice}
          color={color}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onToggleAll={onToggleAll}
          sortField={sortField}
          onViewAttachment={onViewAttachment}
          onPayGroup={ids => onSelectAll && onSelectAll(ids)}
        />
      ))}
    </div>
  );
}
