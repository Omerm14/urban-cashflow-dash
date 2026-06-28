import { useRef, useEffect } from "react";
import { currency, fmt } from "../utils/dates";
import { STATUS } from "../constants";

function statusBadge(status) {
  const map = {
    [STATUS.UNPAID]:  { cls:"badge-unpaid",  label:"Unpaid" },
    [STATUS.PAID]:    { cls:"badge-paid",    label:"Paid" },
    [STATUS.OVERDUE]: { cls:"badge-overdue", label:"Overdue" },
    [STATUS.CREDIT]:  { cls:"badge-credit",  label:"Credit" },
  };
  return map[status] || map[STATUS.UNPAID];
}

const SOURCE_LABELS = { google_drive:"Drive", gmail:"Gmail", whatsapp:"WhatsApp", green_invoice:"GreenInv" };

export default function InvoicesTable({ computed, dupeIds, updateInvoice, deleteInvoice, setEditInvoice, color, selectedIds, onToggleSelect, onToggleAll, onViewAttachment }) {
  const allIds = computed.map(i => i.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const someSelected = !allSelected && allIds.some(id => selectedIds.has(id));

  const selectAllRef = useRef();
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  return (
    <div className="card" style={{ padding:0, overflow:"hidden" }}>
      <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
      <table className="itbl">
        <thead>
          <tr>
            <th style={{ width:44, padding:"10px 14px 10px 18px" }}>
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll(allIds)}
                style={{ accentColor:"var(--cyan)", cursor:"pointer", width:14, height:14 }}
              />
            </th>
            {["Invoice #","Supplier","Date","Amount","Due Date","Status","Source",""].map(h => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {computed.length === 0 && (
            <tr><td colSpan={9} style={{ padding:"60px 0", textAlign:"center", color:"var(--t3)" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom:10, opacity:.4 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <div style={{ fontSize:14 }}>No invoices yet — upload some</div>
            </td></tr>
          )}
          {computed.map(inv => {
            const isSelected = selectedIds.has(inv.id);
            const { cls, label } = statusBadge(inv.status);
            return (
              <tr key={inv.id} className={isSelected ? "sel" : ""}>
                <td style={{ padding:"13px 14px 13px 18px" }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(inv.id)}
                    style={{ accentColor:"var(--cyan)", cursor:"pointer", width:14, height:14 }}
                  />
                </td>
                <td style={{ color:"var(--t3)", fontFamily:"monospace", fontSize:12 }}>{inv.invoiceNo}</td>
                <td>
                  <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:color(inv.supplier), display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff", flexShrink:0 }}>
                      {inv.supplier.charAt(0)}
                    </div>
                    <div>
                      <span style={{ fontWeight:500, fontSize:13 }}>{inv.supplier}</span>
                      {dupeIds.has(inv.id) && <div style={{ fontSize:10, fontWeight:700, color:"var(--amber)", marginTop:1 }}>⚠ POSSIBLE DUPLICATE</div>}
                    </div>
                  </div>
                </td>
                <td style={{ color:"var(--t2)" }}>{fmt(inv.invoiceDate)}</td>
                <td className="mono" style={{ fontWeight:600 }}>{currency(inv.amount)}</td>
                <td>
                  {inv.dueDate
                    ? <span style={{ color:"var(--t2)" }}>{fmt(inv.dueDate)}</span>
                    : <span style={{ color:"var(--amber)", fontSize:11, fontWeight:600, cursor:"pointer" }} onClick={() => setEditInvoice({...inv})}>⚠ Fix supplier</span>}
                </td>
                <td>
                  <span className={`badge ${cls}`}>{label}</span>
                </td>
                <td>
                  <span style={{ fontSize:11, color:"var(--t3)" }}>
                    {inv.sync_source ? (SOURCE_LABELS[inv.sync_source] || inv.sync_source) : "Manual"}
                  </span>
                </td>
                <td>
                  <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                    {inv.attachment_path && (
                      <button className="btn btn-ghost btn-sm" title="View original file" onClick={() => onViewAttachment?.(inv)}>📎</button>
                    )}
                    {inv.status !== STATUS.PAID && (
                      <button className="btn btn-success btn-sm" onClick={() => updateInvoice(inv.id, { status: STATUS.PAID })}>✓ Paid</button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditInvoice({...inv})}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteInvoice(inv.id)}>✕</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div style={{ padding:"14px 18px", borderTop:"1px solid rgba(255,255,255,.04)" }}>
        <button className="btn btn-ghost btn-sm"
          onClick={() => setEditInvoice({ id:null, supplier:"", invoiceNo:"", invoiceDate:"", amount:"", dueDate:"", status:STATUS.UNPAID, notes:"" })}>
          + Add Manually
        </button>
      </div>
    </div>
  );
}
