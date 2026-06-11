import { useState } from "react";

const TERM_FILTERS = ["all", "shotef_plus(75)", "shotef_plus(45)", "shotef_plus(30)", "shotef_plus(10)", "shotef", "immediate", "custom"];

export default function SuppliersModal({ suppliers, addSupplier, updateSupplier, deleteSupplier, editSupplier, setEditSupplier, onClose }) {
  const [filterTerm, setFilterTerm] = useState("all");

  const filtered = filterTerm === "all" ? suppliers : suppliers.filter(s => s.terms === filterTerm);
  const activeCounts = TERM_FILTERS.map(t => ({ t, count: t === "all" ? suppliers.length : suppliers.filter(s => s.terms === t).length }));

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width:600 }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:20 }}>Suppliers</div>
            <div style={{ fontSize:13, color:"var(--t2)", marginTop:3 }}>
              Manage payment terms · {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--t3)", cursor:"pointer", fontSize:24, lineHeight:1 }}>×</button>
        </div>

        {/* Filter pills */}
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {activeCounts.filter(({ count }) => count > 0 || filterTerm === "all").map(({ t, count }) => (
            <button
              key={t}
              onClick={() => setFilterTerm(t)}
              style={{
                padding:"3px 12px", borderRadius:20, border:`1px solid ${filterTerm === t ? "var(--purple)" : "var(--bdr)"}`,
                background: filterTerm === t ? "rgba(139,92,246,.1)" : "transparent",
                color: filterTerm === t ? "var(--purple)" : "var(--t3)",
                cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit", transition:"all .15s",
              }}>
              {t === "all" ? `All (${count})` : t}
            </button>
          ))}
        </div>

        {/* Suppliers list */}
        <div style={{ borderTop:"1px solid var(--bdr)", paddingTop:4 }}>
          {filtered.map(sup => (
            <div key={sup.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,.04)" }}>
              {editSupplier?.id === sup.id ? (
                <>
                  <div style={{ flex:1, display:"flex", gap:8 }}>
                    {["name","terms","notes"].map(k => (
                      <input
                        key={k}
                        value={editSupplier[k]}
                        className="input"
                        style={{ padding:"6px 10px", fontSize:12 }}
                        placeholder={k}
                        onChange={e => setEditSupplier({ ...editSupplier, [k]: e.target.value })}
                      />
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                    <button className="btn btn-success btn-sm"
                      onClick={() => { updateSupplier(editSupplier.id, { name:editSupplier.name, terms:editSupplier.terms, notes:editSupplier.notes }); setEditSupplier(null); }}>✓</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditSupplier(null)}>✕</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width:30, height:30, borderRadius:"50%", background:"var(--surf2)", border:"1px solid var(--bdr2)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"var(--t2)", flexShrink:0 }}>
                    {sup.name.charAt(0)}
                  </div>
                  <span style={{ flex:1, fontSize:13.5 }}>{sup.name}</span>
                  <span style={{ background:"var(--surf2)", padding:"3px 10px", borderRadius:6, fontSize:11.5, fontWeight:600, color:"var(--t2)", fontFamily:"monospace", whiteSpace:"nowrap" }}>{sup.terms || "—"}</span>
                  {sup.notes && <span style={{ fontSize:12, color:"var(--t3)", maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sup.notes}</span>}
                  <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditSupplier({...sup})}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => { if (confirm("Delete?")) deleteSupplier(sup.id); }}>×</button>
                  </div>
                </>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding:"24px 0", textAlign:"center", color:"var(--t3)", fontSize:13 }}>
              No suppliers with this payment term
            </div>
          )}
        </div>

        <button className="btn btn-ghost" style={{ marginTop:16 }}
          onClick={() => addSupplier({ name:"New Supplier", terms:"shotef", notes:"" }).then(row => setEditSupplier(row))}>
          + Add Supplier
        </button>
      </div>
    </div>
  );
}
