import { useRef } from "react";
import { getInitials } from "../pages/SettingsPage";
import {
  LayoutDashboard, FileText, Calendar, Zap, Users, Upload,
  TrendingUp, Settings,
} from "lucide-react";

const Logo = () => (
  <svg width="26" height="26" viewBox="0 0 36 36" fill="none">
    <rect width="36" height="36" rx="7" fill="#6366F1"/>
    <TrendingUp size={14} color="#fff" strokeWidth={2.5} style={{ position: "absolute" }} />
  </svg>
);

const LogoIcon = () => (
  <div style={{ width: 26, height: 26, borderRadius: 7, background: "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <TrendingUp size={13} color="#fff" strokeWidth={2.5} />
  </div>
);

const PLAN_LABEL = { free: "FREE", basic: "BASIC", pro: "PRO", enterprise: "ENTERPRISE" };

const NAV_ICONS = {
  dashboard:    LayoutDashboard,
  invoices:     FileText,
  calendar:     Calendar,
  integrations: Zap,
  admin:        TrendingUp,
  suppliers:    Users,
};

export default function Sidebar({
  view, setView,
  user, onSignOut, onSettings,
  plan, used, limit, pct,
  suppliersCount,
  onSuppliersClick,
  onUpgrade,
  onUpload,
  isAtLimit,
  extracting,
  isAdmin,
}) {
  const fileRef = useRef();

  const mainLinks = [
    { key: "dashboard",    label: "Dashboard" },
    { key: "invoices",     label: "Invoices" },
    { key: "calendar",     label: "Calendar" },
    { key: "integrations", label: "Integrations" },
  ];
  if (isAdmin) mainLinks.push({ key: "admin", label: "Admin" });

  const handleUploadClick = () => {
    if (isAtLimit) { onUpgrade(); return; }
    if (fileRef.current) fileRef.current.click();
  };

  return (
    <aside className="sb">
      {/* Logo */}
      <div className="sb-logo" onClick={() => setView("dashboard")}>
        <LogoIcon />
        <span className="sb-logo-text">Cashflow</span>
      </div>

      {/* Upload CTA */}
      <button
        className="sb-upload"
        onClick={handleUploadClick}
        disabled={extracting}
        title={isAtLimit ? "Invoice limit reached — upgrade your plan" : "Upload invoices"}
      >
        <Upload size={13} strokeWidth={2.5} />
        {extracting ? "Extracting…" : isAtLimit ? "Limit reached" : "Upload Invoices"}
      </button>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={onUpload} style={{ display: "none" }} />

      {/* Main nav */}
      <div className="sb-section">MAIN</div>
      {mainLinks.map(({ key, label }) => {
        const Icon = NAV_ICONS[key] || LayoutDashboard;
        return (
          <button
            key={key}
            className={`sb-link${view === key ? " active" : ""}`}
            onClick={() => setView(key)}
          >
            <Icon size={14} strokeWidth={view === key ? 2.5 : 1.75} />
            {label}
          </button>
        );
      })}

      <div className="sb-divider" />

      {/* Manage */}
      <div className="sb-section">MANAGE</div>
      <button className={`sb-link${view === "suppliers" ? " active" : ""}`} onClick={onSuppliersClick}>
        <Users size={14} strokeWidth={view === "suppliers" ? 2.5 : 1.75} />
        Suppliers
        {suppliersCount > 0 && <span className="sb-badge">{suppliersCount}</span>}
      </button>

      {/* Bottom */}
      <div className="sb-bottom">
        {plan && (
          <div className="sb-plan">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
              <div className="sb-plan-label">{PLAN_LABEL[plan] || "FREE"} PLAN</div>
              {plan !== "enterprise" && (
                <button onClick={onUpgrade} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700, color: "#A5B4FC", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                  Upgrade →
                </button>
              )}
            </div>
            <div className="sb-plan-usage">{used ?? "–"} / {limit === Infinity ? "∞" : limit} invoices</div>
            <div className="sb-plan-bar">
              <div className="sb-plan-fill" style={{ width: `${Math.min(100, (pct || 0) * 100)}%`, background: (pct || 0) >= 0.8 ? "#EF4444" : "#6366F1" }} />
            </div>
          </div>
        )}

        {user && (
          <div className="sb-user" onClick={onSettings} title={user.email}>
            <div className="sb-avatar">{getInitials(user)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sb-user-name">{user.user_metadata?.full_name || user.email?.split("@")[0] || "Account"}</div>
              <div className="sb-user-sub">Settings</div>
            </div>
            <Settings size={12} color="#475569" />
          </div>
        )}
      </div>
    </aside>
  );
}
