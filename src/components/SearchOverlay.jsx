import { useState, useEffect, useRef } from "react";
import { useT, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_MONO as MONO } from "../theme";
import { fmt } from "../utils/format";

export default function SearchOverlay({ invoices, suppliers, onNavigate, onClose }) {
  const T = useT();
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const q = query.toLowerCase().trim();
  const invResults = q
    ? invoices.filter(i =>
        i.supplier?.toLowerCase().includes(q) ||
        i.invoiceNo?.toLowerCase().includes(q) ||
        String(i.amount || "").includes(q)
      ).slice(0, 5)
    : [];
  const supResults = q
    ? (suppliers || []).filter(s => s.name?.toLowerCase().includes(q)).slice(0, 5)
    : [];
  const hasResults = invResults.length > 0 || supResults.length > 0;

  const ResultItem = ({ icon, title, sub, onClick }) => (
    <button onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "start" }}
      onMouseEnter={e => e.currentTarget.style.background = T.surf2}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: T.surf3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: SANS, fontSize: 13, fontWeight: 700, color: T.accent }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{sub}</div>
      </div>
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(4,8,6,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80, animation: "fadeIn 0.15s" }}>
      <div role="dialog" aria-modal="true" aria-label={t("search_placeholder")} onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 14, boxShadow: "var(--shadow-modal)", overflow: "hidden", animation: "scaleIn 0.15s cubic-bezier(.16,1,.3,1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${T.bdr}` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={t("search_placeholder")} style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: SANS, fontSize: 15, color: T.t1 }} />
          <kbd onClick={onClose} style={{ fontFamily: MONO, fontSize: 11, color: T.t3, background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Esc</kbd>
        </div>
        {!q && (
          <div style={{ padding: "20px 18px", fontFamily: SANS, fontSize: 13, color: T.t3, textAlign: "center" }}>
            {t("search_placeholder")}
          </div>
        )}
        {q && !hasResults && (
          <div style={{ padding: "20px 18px", fontFamily: SANS, fontSize: 13, color: T.t3, textAlign: "center" }}>
            {t("search_no_results")}
          </div>
        )}
        {invResults.length > 0 && (
          <div>
            <div style={{ padding: "8px 18px 4px", fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.t3 }}>{t("search_invoices")}</div>
            {invResults.map(inv => (
              <ResultItem key={inv.id}
                icon={inv.supplier?.charAt(0) || "?"}
                title={inv.supplier}
                sub={`${inv.invoiceNo || ""} · ${fmt(inv.amount)} · ${inv.status || ""}`}
                onClick={() => { onNavigate("invoices", (inv.dueDate || inv.invoice_date || "").slice(0, 7), inv.id); onClose(); }}
              />
            ))}
          </div>
        )}
        {supResults.length > 0 && (
          <div style={{ borderTop: invResults.length > 0 ? `1px solid ${T.bdr}` : "none" }}>
            <div style={{ padding: "8px 18px 4px", fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.t3 }}>{t("search_suppliers")}</div>
            {supResults.map(sup => (
              <ResultItem key={sup.id}
                icon={sup.name?.charAt(0) || "?"}
                title={sup.name}
                sub={sup.terms || ""}
                onClick={() => { onNavigate("suppliers"); onClose(); }}
              />
            ))}
          </div>
        )}
        <div style={{ padding: "8px 18px", borderTop: (hasResults || q) ? `1px solid ${T.bdr}` : "none", display: "flex", gap: 16 }}>
          {[["↑↓", 0], ["↵", 1], ["Esc", 2]].map(([key, idx]) => (
            <span key={key} style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>
              <kbd style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 3, padding: "1px 5px", fontFamily: MONO, fontSize: 10 }}>{key}</kbd>{" "}
              {t("search_hint").split("·")[idx]?.replace("↑↓", "").replace("↵", "").replace("Esc", "").trim()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
