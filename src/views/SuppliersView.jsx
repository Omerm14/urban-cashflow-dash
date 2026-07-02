import { useState, useRef } from "react";
import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_MONO as MONO, chartPalette } from "../theme";
import TermsPicker from "../components/TermsPicker";
import { parseCSV } from "../utils/invoice";
import { Check, X, Pencil, Trash2, Plus } from "lucide-react";

export default function SuppliersView({ suppliers, onAdd, onUpdate, onDelete }) {
  const T = useT();
  const { isMobile } = useLayout();
  const { t } = useLang();
  const palette = chartPalette(T.isDark);
  const [filterTerm, setFilterTerm] = useState("all");
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [csvToast, setCsvToast] = useState(null);
  const csvRef = useRef(null);
  const TERMS = ["all", "shotef_plus(75)", "shotef_plus(45)", "shotef_plus(30)", "shotef", "immediate", "net75", "net45", "net30"];
  const filtered = filterTerm === "all" ? suppliers : suppliers.filter(s => s.terms === filterTerm);
  const inp = { flex: 1, padding: "6px 10px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 5, fontFamily: SANS, fontSize: 12, color: T.t1, minWidth: 0, outline: "none" };

  const handleCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { setCsvToast(t("sup_csv_empty")); setTimeout(() => setCsvToast(null), 4000); e.target.value = ""; return; }
    let added = 0;
    for (const row of rows) {
      if (row.name) { try { await onAdd?.({ name: row.name, terms: row.terms || "shotef", notes: row.notes || "" }); added++; } catch { /* skip row */ } }
    }
    setCsvToast(t("sup_imported", { n: added }));
    setTimeout(() => setCsvToast(null), 3000);
    e.target.value = "";
  };

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      {csvToast && (
        <div role="status" style={{ marginBottom: 10, padding: "8px 14px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 7, fontFamily: SANS, fontSize: 13, color: T.green, animation: "fadeIn 0.2s" }}>
          {csvToast}
        </div>
      )}
      <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleCSV} />
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {TERMS.map(term => (
          <button key={term} onClick={() => setFilterTerm(term)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${filterTerm === term ? T.accentBdr : T.bdr}`, background: filterTerm === term ? T.accentTint : "transparent", color: filterTerm === term ? T.accent : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>
            {term === "all" ? `${t("sup_all")} (${suppliers.length})` : isMobile ? term.replace("shotef_plus(", "+").replace(")", "") : term}
          </button>
        ))}
        <div style={{ marginInlineStart: "auto" }}>
          <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => csvRef.current?.click()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {t("sup_import")}
          </button>
        </div>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", fontFamily: SANS, fontSize: 13, color: T.t3 }}>{t("sup_no_results")}</div>
        )}
        {filtered.map((sup, idx) => (
          <div key={sup.id} style={{ padding: "11px 14px", borderTop: idx > 0 ? `1px solid ${T.bdr}` : "none" }}>
            {editId === sup.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <input value={editData.name ?? ""} placeholder={t("sup_name")} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} style={inp} />
                  <TermsPicker value={editData.terms || "shotef"} onChange={v => setEditData(d => ({ ...d, terms: v }))} />
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <input value={editData.notes ?? ""} placeholder={t("sup_notes")} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} style={inp} />
                  <button onClick={async () => { try { await onUpdate?.(sup.id, editData); } catch { /* keep editing */ } setEditId(null); }} style={{ padding: "6px 12px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 5, color: T.green, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}><Check size={11} aria-hidden="true" />{t("sup_save")}</button>
                  <button onClick={() => setEditId(null)} aria-label={t("cancel")} style={{ padding: "6px 10px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}><X size={11} /></button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", background: palette[idx % palette.length], display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 11, color: "#fff", flexShrink: 0 }}>{sup.name.charAt(0)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{sup.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: T.t3 }}>{sup.terms}</div>
                </div>
                {!isMobile && sup.notes && <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{sup.notes}</span>}
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => { setEditId(sup.id); setEditData({ name: sup.name, terms: sup.terms, notes: sup.notes }); }} aria-label={t("sup_edit")} style={{ padding: "3px 8px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 4, color: T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><Pencil size={10} aria-hidden="true" />{!isMobile && t("sup_edit")}</button>
                  <button onClick={() => onDelete?.(sup.id)} aria-label={t("sup_delete")} style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${T.redBdr}`, borderRadius: 4, color: T.red, cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={10} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={() => onAdd?.({ name: "New Supplier", terms: "shotef", notes: "" })}>
          <Plus size={13} aria-hidden="true" />{t("sup_add")}
        </button>
      </div>
    </div>
  );
}
