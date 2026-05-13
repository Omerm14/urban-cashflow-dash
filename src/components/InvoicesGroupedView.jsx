import { useRef, useEffect } from "react";
import { currency, fmt, fmtMonth, toYM } from "../utils/dates";
import { statusStyle } from "../utils/invoice";
import { STATUS } from "../constants";

function prevMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return toYM(d);
}

function nextMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return toYM(d);
}

function SupplierCard({ supplier, invoices, dupeIds, updateInvoice, deleteInvoice, setEditInvoice, color, selectedIds, onToggleSelect, onToggleAll, sortField }) {
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
    <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
      {/* Card header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid #111d2e" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:`${c}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:c, flexShrink:0 }}>
            {supplier.charAt(0)}
          </div>
          <span style={{ fontWeight:600, fontSize:14, color:"#e2e8f0" }}>{supplier}</span>
          <span style={{ fontSize:11, color:"#475569", background:"#0d1626", border:"1px solid #1e2d45", borderRadius:5, padding:"2px 7px" }}>
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ fontWeight:700, fontSize:15, color:"#e2e8f0" }}>{currency(total)}</div>
      </div>

      {/* Invoice rows */}
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <tbody>
          {sorted.map(inv => {
            const ss = statusStyle(inv.status);
            const isSelected = selectedIds.has(inv.id);
            return (
              <tr key={inv.id} className="row-hover" style={{ borderTop:"1px solid #0d1626", transition:"background .15s", background: isSelected ? "#0d1a2e" : undefined }}>
                <td style={{ padding:"10px 14px 10px 18px", width:36 }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(inv.id)}
                    style={{ accentColor:"#6366f1", cursor:"pointer", width:13, height:13 }}
                  />
                </td>
                <td style={{ padding:"10px 12px", color:"#475569", fontFamily:"monospace", fontSize:11, whiteSpace:"nowrap" }}>{inv.invoiceNo || "—"}</td>
                <td style={{ padding:"10px 12px", color:"#475569", whiteSpace:"nowrap" }}>{fmt(inv.invoiceDate)}</td>
                <td style={{ padding:"10px 12px", fontWeight:700, color:"#e2e8f0", whiteSpace:"nowrap" }}>{currency(inv.amount)}</td>
                <td style={{ padding:"10px 12px" }}>
                  <span className="tag" style={{ background:ss.bg, color:ss.color }}>
                    <span style={{ width:5, height:5, borderRadius:"50%", background:ss.dot, marginRight:5, display:"inline-block" }} />
                    {inv.status}
                  </span>
                </td>
                {dupeIds.has(inv.id) && (
                  <td style={{ padding:"10px 6px" }}>
                    <span style={{ fontSize:10, fontWeight:700, color:"#fb923c" }}>⚠ DUP</span>
                  </td>
                )}
                {!dupeIds.has(inv.id) && <td />}
                <td style={{ padding:"10px 18px 10px 6px" }}>
                  <div style={{ display:"flex", gap:5, justifyContent:"flex-end" }}>
                    {inv.status !== STATUS.PAID && (
                      <button className="action-btn" style={{ background:"#052e16", color:"#4ade80", fontSize:11 }}
                        onClick={() => updateInvoice(inv.id, { status: STATUS.PAID })}>✓ Paid</button>
                    )}
                    <button className="action-btn" style={{ background:"#131c2e", color:"#64748b", fontSize:11 }}
                      onClick={() => setEditInvoice({...inv})}>Edit</button>
                    <button className="action-btn" style={{ background:"#2d0a0a", color:"#f87171", fontSize:11 }}
                      onClick={() => { if (confirm("Delete this invoice?")) deleteInvoice(inv.id); }}>✕</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Card footer */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 18px", borderTop:"1px solid #0d1626", background:"#080e1a" }}>
        <label style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", fontSize:11, color:"#475569" }}>
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => onToggleAll(cardIds)}
            style={{ accentColor:"#6366f1", cursor:"pointer", width:13, height:13 }}
          />
          Select all in card
        </label>
        <span style={{ fontSize:12, color:"#475569" }}>Total: <strong style={{ color:"#94a3b8" }}>{currency(total)}</strong></span>
      </div>
    </div>
  );
}

export default function InvoicesGroupedView({ computed, dupeIds, updateInvoice, deleteInvoice, setEditInvoice, color, selectedIds, onToggleSelect, onToggleAll, selectedMonth, onMonthChange, sortField }) {
  const monthInvoices = computed.filter(inv => inv.dueDate && inv.dueDate.startsWith(selectedMonth));

  const groups = Object.entries(
    monthInvoices.reduce((acc, inv) => {
      (acc[inv.supplier] = acc[inv.supplier] || []).push(inv);
      return acc;
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, padding:"12px 18px", background:"#0d1626", borderRadius:10, border:"1px solid #1e2d45" }}>
        <button
          onClick={() => onMonthChange(prevMonth(selectedMonth))}
          style={{ background:"#131c2e", border:"1px solid #1e2d45", color:"#94a3b8", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:14, fontWeight:600 }}>
          ‹
        </button>
        <span style={{ fontWeight:700, fontSize:15, color:"#e2e8f0", flex:1, textAlign:"center" }}>
          {fmtMonth(selectedMonth)}
        </span>
        <button
          onClick={() => onMonthChange(nextMonth(selectedMonth))}
          style={{ background:"#131c2e", border:"1px solid #1e2d45", color:"#94a3b8", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:14, fontWeight:600 }}>
          ›
        </button>
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#334155" }}>
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
        />
      ))}
    </div>
  );
}
