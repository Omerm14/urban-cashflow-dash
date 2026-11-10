import { useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY } from "../theme";
import { fmt } from "../utils/format";
import { CheckCircle2 } from "lucide-react";

export const CONFETTI_COLORS = ["#3DD6A3", "#D9A93F", "#3987E5", "#D55181", "#8FE8C9"];

// Full-screen confetti confirmation after a bulk action (Invoices "paid", Collections
// "collected"). Deliberately always dark, matching the original Invoices overlay.
export default function SuccessOverlay({ title, sub, total, backLabel, nextLabel, onBack, onNext }) {
  const { t } = useLang();
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(6,11,9,0.95)", backdropFilter: "blur(14px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.3s", padding: 24 }}>
      {[...Array(20)].map((_, i) => (
        <span key={i} aria-hidden="true" style={{ position: "fixed", left: `${5 + i * 4.5}%`, top: `${20 + (i % 5) * 10}%`, width: i % 3 === 0 ? 9 : 6, height: i % 3 === 0 ? 9 : 6, borderRadius: i % 2 === 0 ? 2 : "50%", background: CONFETTI_COLORS[i % CONFETTI_COLORS.length], animation: `confettiFall ${0.5 + (i % 7) * 0.07}s ease-out ${i * 0.05}s both`, pointerEvents: "none" }} />
      ))}
      <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(61,214,163,0.14)", border: "1px solid rgba(61,214,163,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <CheckCircle2 size={34} color="#3DD6A3" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28, letterSpacing: "-0.02em", color: "#F2F1EA", marginBottom: 7 }}>{title}</div>
      <div style={{ fontFamily: SANS, color: "#A8B5AE", fontSize: 15, marginBottom: 5 }}>{sub}</div>
      <div className="num" style={{ fontWeight: 500, fontSize: 24, color: "#3DD6A3", marginBottom: 24 }}>{fmt(total)}</div>
      <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 320 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "10px 0", background: "transparent", border: "1px solid rgba(242,241,234,0.16)", borderRadius: 999, color: "#A8B5AE", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 14 }}>{backLabel || t("back")}</button>
        {onNext && (
          <button onClick={onNext} style={{ flex: 2, padding: "10px 0", background: "#3DD6A3", border: "none", borderRadius: 999, color: "#07120E", cursor: "pointer", fontFamily: SANS, fontWeight: 700, fontSize: 14 }}>
            {nextLabel} →
          </button>
        )}
      </div>
    </div>
  );
}
