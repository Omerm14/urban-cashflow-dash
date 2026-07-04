import { useT, useLayout, useLang } from "../../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO } from "../../theme";
import {
  LayoutDashboard, FileText, Calendar, Zap, Users, Settings, X, Plus, LogOut, History,
} from "lucide-react";

export function BrandMark({ size = 28 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: size * 0.28, background: "var(--accent)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      color: "var(--accent-ink)", fontFamily: DISPLAY, fontWeight: 700, fontSize: size * 0.52, flexShrink: 0,
    }}>₪</span>
  );
}

export default function Sidebar({ view, setView, suppliersCount, onUpgrade, onUpload, mobileOpen, setMobileOpen, plan, planUsed, planLimit, planPct, user, onSignOut, integrationError }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
  const { t } = useLang();
  const isDrawer = isMobile || isTablet;
  const used = planUsed ?? 0, limit = planLimit ?? 20;
  const pct = planPct != null ? Math.round(planPct * 100) : Math.round((used / limit) * 100);
  const navigate = (id) => { setView(id); if (isDrawer) setMobileOpen(false); };

  // `badge` = numeric count pill (e.g. supplier count); `alert` = presence-only dot for
  // "something needs attention" (e.g. an integration error) — distinct semantics, not
  // designed to co-occur on the same nav item today.
  const NavItem = ({ id, label, Icon, badge, alert }) => {
    const active = view === id;
    return (
      <button className="sb-nav-item" aria-current={active ? "page" : undefined} onClick={() => navigate(id)}>
        <Icon size={15} strokeWidth={1.75} color={active ? T.accent : "currentColor"} style={{ flexShrink: 0 }} aria-hidden="true" />
        <span style={{ flex: 1 }}>{label}</span>
        {badge !== undefined && <span className="sb-badge">{badge}</span>}
        {alert && <span className="sb-alert-dot" aria-hidden="true" title={t("int_has_errors")} />}
      </button>
    );
  };

  if (isDrawer && !mobileOpen) return null;

  return (
    <>
      {isDrawer && <button className="sb-scrim" aria-label={t("close")} onClick={() => setMobileOpen(false)} />}
      <nav className={`sb${isDrawer ? " sb-drawer drawer-anim" : ""}`} aria-label="Main navigation">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 10px 18px" }}>
          <BrandMark />
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.01em", color: T.t1, flex: 1 }}>Cashflow</span>
          {isDrawer && (
            <button onClick={() => setMobileOpen(false)} aria-label={t("close")}
              style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex", padding: 4 }}>
              <X size={16} />
            </button>
          )}
        </div>

        <div style={{ paddingBottom: 14 }}>
          <button className="btn btn-accent" style={{ width: "100%", padding: "9px 14px" }}
            onClick={() => { onUpload(); if (isDrawer) setMobileOpen(false); }}>
            <Plus size={13} strokeWidth={2.5} aria-hidden="true" />
            {t("nav_upload")}
          </button>
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.t3, padding: "4px 12px 8px", textTransform: "uppercase", fontFamily: SANS }}>{t("nav_menu")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <NavItem id="dashboard" label={t("nav_dashboard")} Icon={LayoutDashboard} />
          <NavItem id="invoices" label={t("nav_invoices")} Icon={FileText} />
          <NavItem id="calendar" label={t("nav_calendar")} Icon={Calendar} />
          <NavItem id="integrations" label={t("nav_integrations")} Icon={Zap} alert={integrationError} />
          <NavItem id="activity" label={t("nav_activity")} Icon={History} />
        </div>

        <div style={{ height: 1, background: T.bdr, margin: "10px 2px" }} />
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.t3, padding: "4px 12px 8px", textTransform: "uppercase", fontFamily: SANS }}>{t("nav_manage")}</div>
        <NavItem id="suppliers" label={t("nav_suppliers")} Icon={Users} badge={suppliersCount} />
        {user?.user_metadata?.role === "admin" && <NavItem id="admin" label={t("nav_admin")} Icon={Settings} />}

        <div style={{ flex: 1 }} />

        <div style={{ padding: "12px 2px 0" }}>
          <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: T.brass, letterSpacing: "0.08em" }}>{(plan || "FREE").toUpperCase()} {t("plan_label")}</span>
              <button onClick={onUpgrade} style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: T.t3, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>{t("plan_manage")}</button>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: T.t2, marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
              <span>{t("plan_usage", { used, limit: limit === Infinity ? "∞" : limit })}</span>
              <span style={{ color: T.accent, fontWeight: 600, fontFamily: MONO }}>{pct}%</span>
            </div>
            <div style={{ height: 3, background: T.surf3, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? T.red : T.accent, borderRadius: 4 }} />
            </div>
          </div>

          <button onClick={() => navigate("settings")}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", textAlign: "start" }}
            onMouseEnter={e => e.currentTarget.style.background = T.surf2}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <div aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", background: T.surf3, border: `1px solid ${T.bdr2}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 10, color: T.t2, flexShrink: 0 }}>
              {(user?.email?.[0] || "U").toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Account"}</div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: T.t3 }}>{t("nav_settings")}</div>
            </div>
            <Settings size={12} color={T.t3} aria-hidden="true" />
          </button>

          <button onClick={onSignOut}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", marginTop: 2, textAlign: "start" }}
            onMouseEnter={e => e.currentTarget.style.background = T.redTint}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <LogOut size={13} color={T.red} strokeWidth={1.75} style={{ opacity: 0.75 }} aria-hidden="true" />
            <span style={{ fontFamily: SANS, fontSize: 12, color: T.red, fontWeight: 500, opacity: 0.85 }}>{t("nav_sign_out")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
