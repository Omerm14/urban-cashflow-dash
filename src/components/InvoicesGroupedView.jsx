import { useRef, useEffect } from "react";
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
    [STATUS.UNPAID]:  "badge-unpaid",
    [STATUS.PAID]:    "badge-paid",
    [STATUS.OVERDUE]: "badge-overdue",
    [STATUS.CREDIT]:  "badge-credit",
  };
  const dots = {
    [STATUS.UNPAID]:  "● ",
    [STATUS.PAID]:    "✓ ",
    [STATUS.OVERDUE]: "! ",
    [STATUS.CREDIT]:  "↩ ",
  };
  return { cls: map[status] || "badge-unpaid", dot: dots[status] || "● " };
}

function SupplierCard({ supplier, invoices, dupeIds, updateInvoice, deleteInvoice, setEditInvoice, color, selectedIds, onToggleSelect, onToggleAll, sortField, onViewAttachment }) {
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
    <div className="sup-group">
      {/* Card header */}
      <div className="sup-hdr">
        <input
          type="checkbox"
          checked={allSelected}
          ref={selectAllRef}
          onChange={() => onToggleAll(cardIds)}
          style={{ accentColor:"var(--purple)", cursor:"pointer", width:15, height:15, flexShrink:0 }}
        />
        <div style={{ width:34, height:34, borderRadius:"50%", background:c, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#fff", flexShrink:0 }}>
          {supplier.charAt(0)}
        </div>
        <span style={{ fontWeight:700, flex:1, fontSize:14 }}>{supplier}</span>
        <span style={{ fontSize:12, color:"var(--t3)", background:"var(--surf2)", padding:"2px 8px", borderRadius:10, fontWeight:600 }}>
          {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
        </span>
        <span style={{ fontWeight:800, marginLeft:12, whiteSpace:"nowrap" }}>{currency(total)}</span>
      </div>

      {/* Invoice rows */}
      {sorted.map(inv => {
        const isSelected = selectedIds.has(inv.id);
        const { cls, dot } = statusBadge(inv.status);
        return (
          <div key={inv.id} className={`sup-row${isSelected ? " sel" : ""}`}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(inv.id)}
              style={{ accentColor:"var(--purple)", cursor:"pointer", width:15, height:15 }}
            />
            <span style={{ color:"var(--t3)", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontFamily:"monospace" }}>
              {inv.invoiceNo || "—"}
              {dupeIds.has(inv.id) && <span style={{ color:"var(--amber)", marginLeft:4, fontSize:10 }}> ⚠ DUP</span>}
            </span>
            <span style={{ color:"var(--t2)", fontSize:12 }}>{fmt(inv.invoiceDate)}</span>
            <span style={{ fontWeight:700 }}>{currency(inv.amount)}</span>
            <span className={`badge ${cls}`}>{dot}{inv.status}</span>
            <span style={{ color:"var(--t3)", fontSize:12 }}>{inv.dueDate ? fmt(inv.dueDate) : <span style={{ color:"var(--amber)", fontSize:11 }} onClick={() => setEditInvoice({...inv})}>⚠ Fix</span>}</span>
            <div style={{ display:"flex", gap:5, justifyContent:"flex-end" }}>
              {inv.attachment_path && (
                <button className="btn btn-ghost btn-sm" title="View file" onClick={() => onViewAttachment?.(inv)}>📎</button>
              )}
              {inv.status !== STATUS.PAID && (
                <button className="btn btn-success btn-sm" onClick={() => updateInvoice(inv.id, { status: STATUS.PAID })}>✓ Paid</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setEditInvoice({...inv})}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => { if (confirm("Delete this invoice?")) deleteInvoice(inv.id); }}>×</button>
            </div>
          </div>
        );
      })}

      {/* Card footer */}
      <div style={{ padding:"7px 20px", borderTop:"1px solid rgba(255,255,255,.04)", display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--t3)" }}>
        <label style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer" }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onToggleAll(cardIds)}
            style={{ accentColor:"var(--purple)", cursor:"pointer", width:13, height:13 }}
          />
          Select all in card
        </label>
        <span>Total: <strong style={{ color:"var(--t2)" }}>{currency(total)}</strong></span>
      </div>
    </div>
  );
}

export default function InvoicesGroupedView({ computed, dupeIds, updateInvoice, deleteInvoice, setEditInvoice, color, selectedIds, onToggleSelect, onToggleAll, selectedMonth, onMonthChange, sortField, onViewAttachment }) {
  const monthInvoices = computed.filter(inv => inv.dueDate && inv.dueDate.startsWith(selectedMonth));
  const monthTotal = monthInvoices.reduce((s, i) => s + Number(i.amount), 0);

  const groups = Object.entries(
    monthInvoices.reduce((acc, inv) => {
      (acc[inv.supplier] = acc[inv.supplier] || []).push(inv);
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      {/* Month navigation */}
      <div className="month-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => onMonthChange(prevMonth(selectedMonth))}>‹</button>
        <span style={{ fontWeight:700, fontSize:16 }}>{fmtMonth(selectedMonth)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => onMonthChange(nextMonth(selectedMonth))}>›</button>
      </div>

      {/* Month total banner */}
      <div className="total-bar">
        <span style={{ fontSize:12, fontWeight:600, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".04em" }}>
          Total due in {fmtMonth(selectedMonth).toUpperCase()}
        </span>
        <span style={{ fontWeight:800, fontSize:20 }}>{currency(monthTotal)}</span>
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"var(--t3)" }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📅</div>
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
        />
      ))}
    </div>
  );
}
