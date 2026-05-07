import { calcDueDate } from "../utils/dates";
import { STATUS } from "../constants";

export default function EditInvoiceModal({ editInvoice, setEditInvoice, suppliers, invoices, saveInvoices, getSupplier }) {
  const close = () => setEditInvoice(null);
  const save  = () => {
    if (editInvoice.id) saveInvoices(invoices.map(i => i.id===editInvoice.id ? editInvoice : i));
    else                saveInvoices([...invoices, { ...editInvoice, id: Date.now() }]);
    close();
  };

  const onFieldChange = (key, value) => {
    const u = { ...editInvoice, [key]: value };
    if ((key === "invoiceDate" || key === "supplier") && u.invoiceDate && u.supplier) {
      const sup = getSupplier(u.supplier);
      if (sup && sup.terms !== "custom") {
        const d = calcDueDate(u.invoiceDate, sup);
        if (d) u.dueDate = d.toISOString().split("T")[0];
      }
    }
    setEditInvoice(u);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && close()}>
      <div className="modal">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:17, color:"#f1f5f9" }}>{editInvoice.id ? "Edit Invoice" : "New Invoice"}</div>
            <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>Invoice details & payment info</div>
          </div>
          <button onClick={close} style={{ width:32, height:32, borderRadius:8, background:"#131c2e", border:"1px solid #1e2d45", color:"#64748b", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
          {[["Invoice #","invoiceNo","text"],["Invoice Date","invoiceDate","date"],["Amount","amount","number"],["Due Date (override)","dueDate","date"]].map(([label, key, type]) => (
            <div key={key}>
              <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>{label}</div>
              <input type={type} value={editInvoice[key]} className="input" onChange={e => onFieldChange(key, e.target.value)} />
            </div>
          ))}
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Supplier</div>
          <select value={editInvoice.supplier} className="input"
            onChange={e => {
              const sup = getSupplier(e.target.value);
              const due = editInvoice.invoiceDate && sup ? calcDueDate(editInvoice.invoiceDate, sup) : null;
              setEditInvoice({ ...editInvoice, supplier:e.target.value, dueDate: due ? due.toISOString().split("T")[0] : editInvoice.dueDate });
            }}>
            <option value="">— select supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name} · {s.terms}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Status</div>
          <select value={editInvoice.status} className="input" onChange={e => setEditInvoice({...editInvoice, status:e.target.value})}>
            {Object.values(STATUS).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={close} style={{ padding:"10px 20px", background:"#131c2e", border:"1px solid #1e2d45", borderRadius:10, color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontWeight:500, fontSize:13 }}>Cancel</button>
          <button onClick={save}  style={{ padding:"10px 24px", background:"linear-gradient(135deg,#6366f1,#a78bfa)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13, boxShadow:"0 4px 15px #6366f133" }}>Save Invoice</button>
        </div>
      </div>
    </div>
  );
}
