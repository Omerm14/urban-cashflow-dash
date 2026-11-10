import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_MONO as MONO } from "../theme";
import { X } from "lucide-react";

// Floating selection bar shared by Invoices and Collections: a pill centered over the
// content area on desktop (offset past the 232px sidebar), a full-width bottom sheet on
// phones. Each view supplies its own action buttons as children.
export default function BulkBar({ count, label, onClear, children }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
  const { t } = useLang();
  if (!count) return null;
  return (
    <div style={{ position: "fixed", bottom: isMobile ? 0 : 24, insetInlineStart: isMobile || isTablet ? 0 : 232, insetInlineEnd: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 200, animation: "slideUp 0.25s cubic-bezier(.16,1,.3,1)" }}>
      <div role="region" aria-label={label} style={{ pointerEvents: "auto", background: T.surf3, border: `1px solid ${T.bdr2}`, padding: isMobile ? "14px 20px" : "10px 12px 10px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "var(--shadow-pop)", borderRadius: isMobile ? "14px 14px 0 0" : 999, width: isMobile ? "100%" : "auto", whiteSpace: "nowrap", flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: 11, color: T.accentInk }}>{count}</span>
        <span style={{ fontFamily: SANS, fontWeight: 500, color: T.t2, fontSize: 13, flex: 1 }}>{label}</span>
        {children}
        <button onClick={onClear} aria-label={t("close")} style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={15} /></button>
      </div>
    </div>
  );
}
