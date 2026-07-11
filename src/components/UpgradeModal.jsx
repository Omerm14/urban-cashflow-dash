import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY } from "../theme";
import { X, Check } from "lucide-react";

export default function UpgradeModal({ onClose, planUsed, planLimit, planPct }) {
  const T = useT();
  const { isMobile } = useLayout();
  const { t } = useLang();
  const [billing, setBilling] = useState("monthly");
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const used = planUsed ?? 0, limit = planLimit ?? 20;
  const pct = planPct != null ? Math.round(planPct * 100) : Math.round((used / limit) * 100);

  const handleSubscribe = async (tier) => {
    setLoading(tier); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ plan: tier, billing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("upgrade_subscribe_failed"));
      if (data.url) window.location.href = data.url;
      else onClose();
    } catch (e) { setError(e.message); } finally { setLoading(null); }
  };
  const PLANS = { basic: { monthly: 99, annual: 79 }, pro: { monthly: 199, annual: 159 } };
  const BILLING_LABELS = { monthly: t("upgrade_billing_monthly"), annual: t("upgrade_billing_annual") };
  const FEATURES = [
    { labelKey: "upgrade_feat_upload_ocr",         basic: true,  pro: true },
    { labelKey: "upgrade_feat_dashboard_calendar", basic: true,  pro: true },
    { labelKey: "upgrade_feat_50_invoices",        basic: true,  pro: false },
    { labelKey: "upgrade_feat_150_invoices",       basic: false, pro: true },
    { labelKey: "upgrade_feat_auto_sync",          basic: false, pro: true },
    { labelKey: "upgrade_feat_priority_support",   basic: false, pro: true },
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, padding: 2 }}>
            {["monthly", "annual"].map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{ padding: "5px 12px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: billing === b ? 600 : 400, background: billing === b ? T.surf : "transparent", color: billing === b ? T.t1 : T.t2 }}>{BILLING_LABELS[b]}</button>
            ))}
          </div>
          {billing === "annual" && <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: T.brass, background: T.brassTint, border: `1px solid ${T.brassBdr}`, borderRadius: 3, padding: "2px 8px" }}>{t("upgrade_save_20")}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.t3, marginBottom: 5 }}>{t("upgrade_tier_basic")}</div>
            <div style={{ marginBottom: 10 }}><span className="num" style={{ fontSize: 22, fontWeight: 500, color: T.t1 }}>₪{PLANS.basic[billing]}</span><span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{t("upgrade_per_month")}</span></div>
            <button className="btn btn-ghost" style={{ width: "100%", padding: "9px 0" }} onClick={() => handleSubscribe("basic")} disabled={!!loading}>{loading === "basic" ? "…" : t("upgrade_get_basic")}</button>
          </div>
          <div style={{ background: T.accentTint, border: `2px solid ${T.accent}`, borderRadius: 10, padding: 14, position: "relative" }}>
            <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: T.accent, color: T.accentInk, fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap" }}>{t("upgrade_popular")}</div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.accent, marginBottom: 5 }}>{t("upgrade_tier_pro")}</div>
            <div style={{ marginBottom: 10 }}><span className="num" style={{ fontSize: 22, fontWeight: 500, color: T.t1 }}>₪{PLANS.pro[billing]}</span><span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{t("upgrade_per_month")}</span></div>
            <button className="btn btn-accent" style={{ width: "100%", padding: "9px 0", fontWeight: 700 }} onClick={() => handleSubscribe("pro")} disabled={!!loading}>{loading === "pro" ? "…" : t("upgrade_get_pro")}</button>
          </div>
        </div>
        <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 50px", padding: "6px 12px", borderBottom: `1px solid ${T.bdr}` }}>
            {[null, t("upgrade_tier_basic"), t("upgrade_tier_pro")].map((h, i) => <span key={i} style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: i === 2 ? T.accent : T.t3, textAlign: i > 0 ? "center" : "start" }}>{h || ""}</span>)}
          </div>
          {FEATURES.map(f => (
            <div key={f.labelKey} style={{ display: "grid", gridTemplateColumns: "1fr 50px 50px", padding: "5px 12px", borderTop: `1px solid ${T.bdr}` }}>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.t2 }}>{t(f.labelKey)}</span>
              <span style={{ display: "flex", justifyContent: "center" }}>{f.basic ? <Check size={12} color={T.green} strokeWidth={2.5} aria-label={t("upgrade_included")} /> : <X size={12} color={T.bdr2} strokeWidth={2} aria-label={t("upgrade_not_included")} />}</span>
              <span style={{ display: "flex", justifyContent: "center" }}>{f.pro ? <Check size={12} color={T.green} strokeWidth={2.5} aria-label={t("upgrade_included")} /> : <X size={12} color={T.bdr2} strokeWidth={2} aria-label={t("upgrade_not_included")} />}</span>
            </div>
          ))}
        </div>
        {error && <div role="alert" style={{ fontFamily: SANS, fontSize: 12, color: T.red, background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>{error}</div>}
        <button onClick={onClose} style={{ display: "block", width: "100%", background: "none", border: "none", color: T.t3, fontFamily: SANS, fontSize: 13, cursor: "pointer", padding: "6px 0", textDecoration: "underline", textDecorationStyle: "dotted" }}>{t("upgrade_continue_readonly")}</button>
      </div>
    </div>
  );
}
