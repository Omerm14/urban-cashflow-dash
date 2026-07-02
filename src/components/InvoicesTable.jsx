import { useRef, useEffect, useState } from "react";
import { currency, fmt } from "../utils/dates";
import { STATUS } from "../constants";

function statusBadge(status) {
  const map = {
    [STATUS.UNPAID]:  { cls:"badge-unpaid",  dot:"● " },
    [STATUS.PAID]:    { cls:"badge-paid",    dot:"✓ " },
    [STATUS.OVERDUE]: { cls:"badge-overdue", dot:"! " },
    [STATUS.CREDIT]:  { cls:"badge-credit",  dot:"↩ " },
  };
  return map[status] || map[STATUS.UNPAID];
}

export default function InvoicesTable({ computed, dupeIds, anomalyMap, updateInvoice, deleteInvoice, setEditInvoice, color, selectedIds, onToggleSelect, onToggleAll, onViewAttachment, onMarkPaid, onAddSupplier }) {
  const allIds = computed.map(i => i.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const someSelected = !allSelected && allIds.some(id => selectedIds.has(id));
  const [addingSupplier, setAddingSupplier] = useState(null); // { name, terms }
  const [addSupplierOk, setAddSupplierOk]   = useState(null); // invoice id just saved

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
              <div style={{ fontSize:36, marginBottom:10 }}>🧾</div>
              <div>No invoices yet — upload some above</div>
            </td></tr>
          )}
          {computed.map(inv => {
            const isSelected = selectedIds.has(inv.id);
            const { cls, dot } = statusBadge(inv.status);
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
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontWeight:500, fontSize:13 }}>{inv.supplier}</span>
                        {!inv.supplierMatched && inv.supplier && onAddSupplier && addSupplierOk !== inv.id && (
                          addingSupplier?.id === inv.id
                            ? <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                                <input
                                  autoFocus
                                  value={addingSupplier.terms}
                                  onChange={e => setAddingSupplier(s => ({ ...s, terms: e.target.value }))}
                                  placeholder="Payment terms"
                                  style={{ fontSize:11, padding:"2px 6px", borderRadius:4, border:"1px solid #1e2d45", background:"#0a1628", color:"#94a3b8", width:120 }}
                                />
                                <button
                                  onClick={async () => {
                                    await onAddSupplier({ name: addingSupplier.name, terms: addingSupplier.terms, notes: '' });
                                    setAddSupplierOk(inv.id);
                                    setAddingSupplier(null);
                                  }}
                                  style={{ fontSize:11, padding:"2px 8px", borderRadius:4, border:"none", background:"#0ea5e9", color:"#fff", cursor:"pointer" }}>Add</button>
                                <button
                                  onClick={() => setAddingSupplier(null)}
                                  style={{ fontSize:11, padding:"2px 6px", borderRadius:4, border:"none", background:"#1e2d45", color:"#94a3b8", cursor:"pointer" }}>✕</button>
                              </span>
                            : <button
                                title="Add as new supplier"
                                onClick={() => setAddingSupplier({ id: inv.id, name: inv.supplier, terms: '' })}
                                style={{ fontSize:11, padding:"1px 6px", borderRadius:4, border:"1px solid #0ea5e9", background:"transparent", color:"#0ea5e9", cursor:"pointer", lineHeight:1.4 }}>＋ New supplier</button>
                        )}
                        {addSupplierOk === inv.id && <span style={{ fontSize:11, color:"#22c55e" }}>✓ Added</span>}
                      </div>
                      {dupeIds.has(inv.id) && <div style={{ fontSize:10, fontWeight:700, color:"var(--amber)", marginTop:1 }}>⚠ POSSIBLE DUPLICATE</div>}
                    </div>
                  </div>
                </td>
                <td style={{ color:"var(--t2)" }}>{fmt(inv.invoiceDate)}</td>
                <td style={{ fontWeight:700, fontSize:14 }}>
                  <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                    {currency(inv.amount)}
                    {anomalyMap?.get(inv.id) && (() => {
                      const a = anomalyMap.get(inv.id);
                      return (
                        <span
                          title={`${a.direction === 'higher' ? 'גבוה' : 'נמוך'} ב-${a.deviationPct}% מהממוצע של הספק (${currency(a.average)})`}
                          style={{ color:"#fbbf24", fontSize:12, cursor:"help", flexShrink:0 }}>
                          ⚠
                        </span>
                      );
                    })()}
                  </span>
                </td>
                <td>
                  {inv.dueDate
                    ? <span style={{ color:"var(--t2)" }}>{fmt(inv.dueDate)}</span>
                    : <span style={{ color:"var(--amber)", fontSize:11, fontWeight:600, cursor:"pointer" }} onClick={() => setEditInvoice({...inv})}>⚠ Fix supplier</span>}
                </td>
                <td>
                  <span className={`badge ${cls}`}>{dot}{inv.status}</span>
                </td>
                <td>
                  {inv.sync_source ? (
                    <span style={{ fontSize:11, color:"var(--t3)", display:"flex", alignItems:"center", gap:4 }}>
                      {{ google_drive:"📁", gmail:"✉️", whatsapp:"💬", green_invoice:"🟢" }[inv.sync_source] || "🔗"}
                      {inv.sync_source === "google_drive" ? "Drive" : inv.sync_source === "gmail" ? "Gmail" : inv.sync_source === "whatsapp" ? "WA" : inv.sync_source === "green_invoice" ? "GI" : inv.sync_source}
                    </span>
                  ) : (
                    <span style={{ fontSize:11, color:"var(--t3)" }}>Manual</span>
                  )}
                </td>
                <td>
                  <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                    {inv.attachment_path && (
                      <button className="btn btn-ghost btn-sm" title="View original file" onClick={() => onViewAttachment?.(inv)}>📎</button>
                    )}
                    {onMarkPaid
                      ? <button
                          className={`btn btn-sm ${inv.status === STATUS.PAID ? "btn-ghost" : "btn-success"}`}
                          title={inv.status === STATUS.PAID ? "Mark as Unpaid" : "Mark as Paid"}
                          onClick={() => onMarkPaid(inv.id)}
                        >{inv.status === STATUS.PAID ? "↻ Unpaid" : "✓ Paid"}</button>
                      : inv.status !== STATUS.PAID && (
                          <button className="btn btn-success btn-sm" onClick={() => updateInvoice(inv.id, { status: STATUS.PAID })}>✓ Paid</button>
                        )
                    }
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
