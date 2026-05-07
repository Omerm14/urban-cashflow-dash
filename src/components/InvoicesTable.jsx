import { currency, fmt } from "../utils/dates";
import { statusStyle } from "../utils/invoice";
import { STATUS } from "../constants";

export default function InvoicesTable({ computed, dupeIds, invoices, saveInvoices, setEditInvoice, color }) {
  return (
    <div className="card" style={{ overflow:"hidden" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ borderBottom:"1px solid #111d2e" }}>
            {["Invoice #","Supplier","Date","Amount","Due Date","Status",""].map(h => (
              <th key={h} style={{ padding:"14px 18px", textAlign:"left", fontSize:10, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"1px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {computed.length === 0 && (
            <tr><td colSpan={7} style={{ padding:"60px 0", textAlign:"center", color:"#334155" }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🧾</div>
              <div>No invoices yet — upload some above</div>
            </td></tr>
          )}
          {computed.map(inv => {
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
                    : <span style={{ color:"#fb923c", fontSize:11, fontWeight:600, cursor:"pointer" }} onClick={() => setEditInvoice({...inv})}>⚠ Fix supplier</span>}
                </td>
                <td style={{ padding:"13px 18px" }}>
                  <span className="tag" style={{ background:ss.bg, color:ss.color }}>
                    <span style={{ width:5, height:5, borderRadius:"50%", background:ss.dot, marginRight:6, display:"inline-block" }} />
                    {inv.status}
                  </span>
                </td>
                <td style={{ padding:"13px 18px" }}>
                  <div style={{ display:"flex", gap:6, justifyContent:"flex-end" }}>
                    {inv.status !== STATUS.PAID && (
                      <button className="action-btn" style={{ background:"#052e16", color:"#4ade80" }}
                        onClick={() => saveInvoices(invoices.map(i => i.id===inv.id ? {...i, status:STATUS.PAID} : i))}>✓ Paid</button>
                    )}
                    <button className="action-btn" style={{ background:"#131c2e", color:"#64748b" }} onClick={() => setEditInvoice({...inv})}>Edit</button>
                    <button className="action-btn" style={{ background:"#2d0a0a", color:"#f87171" }}
                      onClick={() => { if (confirm("Delete this invoice?")) saveInvoices(invoices.filter(i => i.id !== inv.id)); }}>✕</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding:"14px 18px", borderTop:"1px solid #0d1626" }}>
        <button className="action-btn" style={{ background:"#131c2e", color:"#64748b", padding:"8px 16px" }}
          onClick={() => setEditInvoice({ id:null, supplier:"", invoiceNo:"", invoiceDate:"", amount:"", dueDate:"", status:STATUS.UNPAID, notes:"" })}>
          + Add Manually
        </button>
      </div>
    </div>
  );
}
