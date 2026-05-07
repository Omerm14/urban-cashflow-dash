export default function SuppliersModal({ suppliers, addSupplier, updateSupplier, deleteSupplier, editSupplier, setEditSupplier, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{ width:580, maxHeight:"85vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:17, color:"#f1f5f9" }}>Suppliers</div>
            <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>Manage payment terms</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, background:"#131c2e", border:"1px solid #1e2d45", color:"#64748b", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
        <div style={{ background:"#0d1626", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#475569", marginTop:14 }}>
          Terms: <code style={{color:"#a78bfa",fontSize:11}}>shotef</code> · <code style={{color:"#a78bfa",fontSize:11}}>shotef_plus(30)</code> · <code style={{color:"#a78bfa",fontSize:11}}>immediate</code> · <code style={{color:"#a78bfa",fontSize:11}}>custom</code>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:"1px solid #111d2e" }}>
              {["Supplier","Terms","Notes",""].map(h => (
                <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:10, fontWeight:700, color:"#334155", textTransform:"uppercase", letterSpacing:"1px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppliers.map(sup => (
              <tr key={sup.id} style={{ borderTop:"1px solid #0d1626" }}>
                {editSupplier?.id === sup.id ? (
                  <>
                    {["name","terms","notes"].map(k => (
                      <td key={k} style={{ padding:"6px 8px" }}>
                        <input value={editSupplier[k]} className="input" style={{ padding:"6px 10px", fontSize:12 }}
                          onChange={e => setEditSupplier({...editSupplier, [k]:e.target.value})} />
                      </td>
                    ))}
                    <td style={{ padding:"6px 8px", whiteSpace:"nowrap" }}>
                      <button className="action-btn" style={{ background:"#052e16", color:"#4ade80", marginRight:4 }}
                        onClick={() => { updateSupplier(editSupplier.id, { name: editSupplier.name, terms: editSupplier.terms, notes: editSupplier.notes }); setEditSupplier(null); }}>✓</button>
                      <button className="action-btn" style={{ background:"#131c2e", color:"#64748b" }} onClick={() => setEditSupplier(null)}>✕</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding:"11px 10px", fontWeight:500 }}>{sup.name}</td>
                    <td style={{ padding:"11px 10px" }}><code style={{ fontSize:11, color:"#a78bfa", background:"#1e1b40", padding:"2px 8px", borderRadius:5 }}>{sup.terms}</code></td>
                    <td style={{ padding:"11px 10px", color:"#475569", fontSize:12 }}>{sup.notes||"—"}</td>
                    <td style={{ padding:"8px", whiteSpace:"nowrap" }}>
                      <button className="action-btn" style={{ background:"#131c2e", color:"#64748b", marginRight:4 }} onClick={() => setEditSupplier({...sup})}>Edit</button>
                      <button className="action-btn" style={{ background:"#2d0a0a", color:"#f87171" }}
                        onClick={() => { if (confirm("Delete?")) deleteSupplier(sup.id); }}>✕</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <button className="action-btn" style={{ background:"#131c2e", color:"#64748b", marginTop:16, padding:"9px 18px" }}
          onClick={() => addSupplier({ name:"New Supplier", terms:"shotef", notes:"" }).then(row => setEditSupplier(row))}>
          + Add Supplier
        </button>
      </div>
    </div>
  );
}
