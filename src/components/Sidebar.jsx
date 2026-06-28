import { LayoutDashboard, FileText, Calendar, Zap, Users, Settings, X, LogOut } from "lucide-react";
import LogoIcon from "./LogoIcon";

const SB = {
  bg: "#0C1017",
  bdr: "rgba(255,255,255,0.07)",
  t1: "#CBD6E6",
  t2: "rgba(255,255,255,0.35)",
  t3: "rgba(255,255,255,0.28)",
};
const SANS = "'IBM Plex Sans', system-ui, sans-serif";

const MAIN_NAV = [
  { id: "dashboard",    label: "Dashboard",    Icon: LayoutDashboard },
  { id: "invoices",     label: "Invoices",     Icon: FileText        },
  { id: "calendar",     label: "Calendar",     Icon: Calendar        },
  { id: "integrations", label: "Integrations", Icon: Zap             },
];

export default function Sidebar({
  view, setView, suppliersCount, onUpgrade, onUpload,
  mobileOpen, setMobileOpen, plan, user, onSignOut,
}) {
  const isDrawer = window.innerWidth <= 900;
  const used = plan?.invoiceCount ?? 0;
  const limit = plan?.invoiceLimit ?? 20;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const planName = (plan?.tier ?? "free").toUpperCase();

  const navigate = (id) => {
    setView(id);
    if (isDrawer) setMobileOpen(false);
  };

  const navItem = (id, label, Icon, badge) => {
    const active = view === id;
    return (
      <button
        key={id}
        onClick={() => navigate(id)}
        style={{
          display: "flex", alignItems: "center", gap: 9, width: "100%",
          padding: "8px 10px", borderRadius: 7, border: "none", cursor: "pointer",
          background: active ? "rgba(99,102,241,.10)" : "transparent",
          boxShadow: active ? "inset 3px 0 0 #6366F1" : "none",
          color: active ? SB.t1 : SB.t2,
          fontFamily: SANS, fontSize: 13, fontWeight: active ? 600 : 400,
          transition: "background .12s",
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,.05)"; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
      >
        <Icon size={14} strokeWidth={1.75} color={active ? "#A5B4FC" : "#4A6278"} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{label}</span>
        {badge !== undefined && (
          <span style={{ background: "rgba(255,255,255,.06)", color: SB.t2, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, fontFamily: SANS }}>{badge}</span>
        )}
      </button>
    );
  };

  if (isDrawer && !mobileOpen) return null;

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "U";
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <>
      {isDrawer && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 199, animation: "fadeIn 0.2s" }}
        />
      )}
      <div style={{
        width: 240, background: SB.bg, display: "flex", flexDirection: "column",
        flexShrink: 0, height: "100vh", overflowY: "auto",
        borderRight: `1px solid ${SB.bdr}`,
        ...(isDrawer
          ? { position: "fixed", top: 0, left: 0, zIndex: 200, animation: "slideRight 0.25s ease" }
          : { position: "sticky", top: 0 }
        ),
      }}>
        {/* Logo */}
        <div style={{ padding: "18px 20px 14px", display: "flex", alignItems: "center", gap: 9 }}>
          <LogoIcon size={26} />
          <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, letterSpacing: "-0.02em", color: "#E8EFF8", flex: 1 }}>Cashflow</span>
          {isDrawer && (
            <button onClick={() => setMobileOpen(false)} style={{ background: "none", border: "none", color: SB.t2, cursor: "pointer", display: "flex", padding: 4 }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Upload CTA */}
        <div style={{ padding: "0 10px 14px" }}>
          <button
            onClick={() => { onUpload(); if (isDrawer) setMobileOpen(false); }}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", borderRadius: 8, background: "#6366F1", border: "none", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "#fff", letterSpacing: "-0.01em", boxShadow: "0 4px 16px rgba(99,102,241,.4)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Upload Invoice
          </button>
        </div>

        {/* Main nav */}
        <div style={{ padding: "0 8px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: SB.t3, padding: "4px 10px 8px", textTransform: "uppercase" }}>Menu</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {MAIN_NAV.map(({ id, label, Icon }) => navItem(id, label, Icon))}
          </div>
        </div>

        <div style={{ height: 1, background: SB.bdr, margin: "8px 2px" }} />

        {/* Manage nav */}
        <div style={{ padding: "0 8px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: SB.t3, padding: "4px 10px 8px", textTransform: "uppercase" }}>Manage</div>
          {navItem("suppliers", "Suppliers", Users, suppliersCount)}
        </div>

        <div style={{ flex: 1 }} />

        {/* Plan card */}
        <div style={{ padding: "12px" }}>
          <div style={{ background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.18)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: "#818CF8", letterSpacing: "0.08em" }}>{planName} PLAN</span>
              <button onClick={onUpgrade} style={{ fontFamily: SANS, fontSize: 10, fontWeight: 500, color: SB.t2, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Upgrade</button>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: SB.t2, marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
              <span>{used} of {limit} invoices</span>
              <span style={{ color: "#818CF8", fontWeight: 600 }}>{pct}%</span>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,.07)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "#6366F1", borderRadius: 4 }} />
            </div>
          </div>

          {/* User row + sign out */}
          <button
            onClick={() => navigate("settings")}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", marginBottom: 2 }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.05)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#818CF8)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 10, color: "#fff", flexShrink: 0 }}>
              {userInitials}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: SB.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: SB.t2 }}>Settings</div>
            </div>
            <Settings size={12} color={SB.t2} />
          </button>

          <button
            onClick={onSignOut}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, color: "rgba(239,68,68,.6)", transition: "all .15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,.08)"; e.currentTarget.style.color = "#EF4444"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(239,68,68,.6)"; }}
          >
            <LogOut size={13} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
