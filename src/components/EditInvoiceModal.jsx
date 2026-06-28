import { calcDueDate } from "../utils/dates";
import { STATUS } from "../constants";

export default function EditInvoiceModal({ editInvoice, setEditInvoice, suppliers, addInvoice, updateInvoice, getSupplier, onViewAttachment }) {
  const close = () => setEditInvoice(null);
  const save  = async () => {
    const { id, ...fields } = editInvoice;
    // Map camelCase UI fields → snake_case DB columns
    const patch = {
      supplier:     fields.supplier,
      invoice_no:   fields.invoiceNo   ?? fields.invoice_no   ?? '',
      invoice_date: fields.invoiceDate ?? fields.invoice_date ?? '',
      amount:       Number(fields.amount) || 0,
      due_date:     fields.dueDate     ?? fields.due_date     ?? '',
      status:       fields.status,
      notes:        fields.notes       ?? '',
    };
    if (id) await updateInvoice(id, patch);
    else    await addInvoice(patch);
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
            <div style={{ fontWeight:700, fontSize:17, color:"var(--t1)" }}>{editInvoice.id ? "Edit Invoice" : "New Invoice"}</div>
            <div style={{ fontSize:12, color:"var(--t2)", marginTop:2 }}>Invoice details & payment info</div>
          </div>
          <button onClick={close} style={{ width:32, height:32, borderRadius:8, background:"var(--surf)", border:"1px solid var(--bdr2)", color:"var(--t2)", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
          {[["Invoice #","invoiceNo","text"],["Invoice Date","invoiceDate","date"],["Amount","amount","number"],["Due Date (override)","dueDate","date"]].map(([label, key, type]) => (
            <div key={key}>
              <div style={{ fontSize:11, fontWeight:600, color:"var(--t2)", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>{label}</div>
              <input type={type} value={editInvoice[key] ?? editInvoice[key.replace(/([A-Z])/g, '_$1').toLowerCase()] ?? ''} className="input" onChange={e => onFieldChange(key, e.target.value)} />
            </div>
          ))}
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--t2)", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Supplier</div>
          <select value={editInvoice.supplier} className="input"
            onChange={e => {
              const sup = getSupplier(e.target.value);
              const due = editInvoice.invoiceDate && sup ? calcDueDate(editInvoice.invoiceDate, sup) : null;
              setEditInvoice({ ...editInvoice, supplier:e.target.value, dueDate: due ? due.toISOString().split("T")[0] : (editInvoice.dueDate || editInvoice.due_date || '') });
            }}>
            <option value="">— select supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name} · {s.terms}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"var(--t2)", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Status</div>
          <select value={editInvoice.status} className="input" onChange={e => setEditInvoice({...editInvoice, status:e.target.value})}>
            {Object.values(STATUS).map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        {/* Sync audit trail — read-only, shown only for auto-synced invoices */}
        {editInvoice.sync_source && (
          <div style={{ marginBottom:20, padding:"10px 14px", background:"var(--surf2)", borderRadius:10, border:"1px solid var(--bdr)" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".7px", marginBottom:6 }}>Sync Audit</div>
            <div style={{ fontSize:12, color:"var(--t2)", display:"flex", flexDirection:"column", gap:3 }}>
              <span>Source: <strong style={{ color:"var(--t3)" }}>
                {{ google_drive:"📁 Google Drive", gmail:"✉️ Gmail", whatsapp:"💬 WhatsApp", green_invoice:"🟢 Green Invoice" }[editInvoice.sync_source] || editInvoice.sync_source}
              </strong></span>
              {editInvoice.sync_timestamp && (
                <span>Synced: <strong style={{ color:"var(--t3)" }}>{new Date(editInvoice.sync_timestamp).toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}</strong></span>
              )}
              {editInvoice.sync_source_meta?.filename && (
                <span>File: <strong style={{ color:"var(--t3)" }}>{editInvoice.sync_source_meta.filename}</strong></span>
              )}
              {editInvoice.attachment_path && onViewAttachment && (
                <span style={{ marginTop:2 }}>
                  <button
                    style={{ background:"none", border:"none", cursor:"pointer", padding:0, fontFamily:"inherit", fontSize:12, color:"#6366f1", textDecoration:"underline" }}
                    onClick={() => { close(); onViewAttachment(editInvoice); }}>
                    📎 View original file
                  </button>
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={close} style={{ padding:"10px 20px", background:"var(--surf)", border:"1px solid var(--bdr2)", borderRadius:10, color:"var(--t2)", cursor:"pointer", fontFamily:"inherit", fontWeight:500, fontSize:13 }}>Cancel</button>
          <button onClick={save}  style={{ padding:"10px 24px", background:"var(--indigo)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13, boxShadow:"0 4px 15px rgba(99,102,241,.35)" }}>Save Invoice</button>
        </div>
      </div>
    </div>
  );
}
