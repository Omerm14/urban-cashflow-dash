import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY } from "../theme";
import { PLAN_PRICES, PLAN_LIMITS } from "../constants/plans";
import { X, Check } from "lucide-react";

// No self-serve checkout — every paying client goes through support, who
// sends them a Hyp payment link by hand after the conversation below.
const contactHref = (subject) => `mailto:hello@gocashflow.co?subject=${encodeURIComponent(subject)}`;

export default function UpgradeModal({ onClose, planUsed, planLimit, planPct }) {
  const T = useT();
  const { isMobile } = useLayout();
  const { t } = useLang();
  const used = planUsed ?? 0, limit = planLimit ?? 20;
  const pct = planPct != null ? Math.round(planPct * 100) : Math.round((used / limit) * 100);

  const PLANS = { starter: PLAN_PRICES.starter, pro: PLAN_PRICES.pro };
  const FEATURES = [
    { labelKey: "upgrade_feat_upload_ocr",         starter: true,  pro: true },
    { labelKey: "upgrade_feat_dashboard_calendar", starter: true,  pro: true },
    { labelKey: "upgrade_feat_invoices_per_month", starter: PLAN_LIMITS.starter, pro: PLAN_LIMITS.pro },
    { labelKey: "upgrade_feat_auto_sync",          starter: false, pro: true },
    { labelKey: "upgrade_feat_priority_support",   starter: false, pro: true },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(4,8,6,0.82)", backdropFilter: "blur(6px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20, animation: "fadeIn 0.2s" }}>
      <div role="dialog" aria-modal="true" aria-label={t("upgrade_dialog_label")} style={{ width: "100%", maxWidth: isMobile ? "100%" : 560, background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: isMobile ? "16px 16px 0 0" : 16, padding: isMobile ? "24px 20px" : "30px 26px", boxShadow: "var(--shadow-modal)", animation: isMobile ? "slideUp 0.25s ease" : "scaleIn 0.2s cubic-bezier(.16,1,.3,1)", position: "relative", maxHeight: isMobile ? "90vh" : "none", overflowY: "auto" }}>
        <button onClick={onClose} aria-label={t("close")} style={{ position: "absolute", top: 14, insetInlineEnd: 16, background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: isMobile ? 19 : 21, letterSpacing: "-0.02em", color: T.t1, marginBottom: 6 }}>{t("upgrade_headline")}</div>
          <p style={{ fontFamily: SANS, color: T.t2, fontSize: 13, lineHeight: 1.6 }}>{t("upgrade_processed_pre")} <strong style={{ color: T.accent }}>{used} {t("kpi_invoices")}</strong> {t("upgrade_processed_post")}</p>
        </div>
        <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 13, color: T.t2 }}>{t("upgrade_invoices_month")}</span>
            <span className="num" style={{ fontSize: 13, fontWeight: 700, color: pct >= 100 ? T.red : pct >= 80 ? T.amber : T.t1 }}>{used} / {limit === Infinity ? "∞" : limit}</span>
          </div>
          <div style={{ height: 6, background: T.surf3, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? T.red : pct >= 80 ? T.amber : T.accent, borderRadius: 3, transition: "width 0.5s" }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.t3, marginBottom: 5 }}>{t("upgrade_tier_starter")}</div>
            <div style={{ marginBottom: 10 }}><span className="num" style={{ fontSize: 22, fontWeight: 500, color: T.t1 }}>₪{PLANS.starter}</span><span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{t("upgrade_per_month")}</span></div>
            <a className="btn btn-ghost" style={{ width: "100%", padding: "9px 0", display: "block", textAlign: "center" }} href={contactHref(t("upgrade_contact_subject_starter"))}>{t("upgrade_contact_us")}</a>
          </div>
          <div style={{ background: T.accentTint, border: `2px solid ${T.accent}`, borderRadius: 10, padding: 14, position: "relative" }}>
            <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: T.accent, color: T.accentInk, fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap" }}>{t("upgrade_popular")}</div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.accent, marginBottom: 5 }}>{t("upgrade_tier_pro")}</div>
            <div style={{ marginBottom: 10 }}><span className="num" style={{ fontSize: 22, fontWeight: 500, color: T.t1 }}>₪{PLANS.pro}</span><span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{t("upgrade_per_month")}</span></div>
            <a className="btn btn-accent" style={{ width: "100%", padding: "9px 0", fontWeight: 700, display: "block", textAlign: "center" }} href={contactHref(t("upgrade_contact_subject_pro"))}>{t("upgrade_contact_us")}</a>
          </div>
        </div>
        <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 50px", padding: "6px 12px", borderBottom: `1px solid ${T.bdr}` }}>
            {[null, t("upgrade_tier_starter"), t("upgrade_tier_pro")].map((h, i) => <span key={i} style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: i === 2 ? T.accent : T.t3, textAlign: i > 0 ? "center" : "start" }}>{h || ""}</span>)}
          </div>
          {FEATURES.map(f => (
            <div key={f.labelKey} style={{ display: "grid", gridTemplateColumns: "1fr 50px 50px", padding: "5px 12px", borderTop: `1px solid ${T.bdr}` }}>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.t2 }}>{t(f.labelKey)}</span>
              {[f.starter, f.pro].map((v, i) => (
                <span key={i} style={{ display: "flex", justifyContent: "center" }}>
                  {typeof v === "number"
                    ? <span className="num" style={{ fontSize: 12, fontWeight: 600, color: T.t1 }}>{v}</span>
                    : v ? <Check size={12} color={T.green} strokeWidth={2.5} aria-label={t("upgrade_included")} /> : <X size={12} color={T.bdr2} strokeWidth={2} aria-label={t("upgrade_not_included")} />}
                </span>
              ))}
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ display: "block", width: "100%", background: "none", border: "none", color: T.t3, fontFamily: SANS, fontSize: 13, cursor: "pointer", padding: "6px 0", textDecoration: "underline", textDecorationStyle: "dotted" }}>{t("upgrade_continue_readonly")}</button>
      </div>
    </div>
  );
}
