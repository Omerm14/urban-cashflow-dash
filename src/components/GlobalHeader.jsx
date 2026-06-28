import { useState, useEffect, useRef } from "react";
import { Bell, Sun, Moon, Globe, Menu } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

const SANS = "'IBM Plex Sans', system-ui, sans-serif";

const TITLES = {
  dashboard: "Dashboard",
  invoices: "Invoices",
  calendar: "Calendar",
  integrations: "Integrations",
  suppliers: "Suppliers",
  settings: "Settings",
  admin: "Admin",
};

function NotificationPanel({ notifications, markAllRead, onClose }) {
  const ref = useRef();

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const fmt = ts => {
    if (!ts) return "";
    const t = new Date(ts).getTime();
    if (isNaN(t)) return "";
    const diff = Date.now() - t;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const typeIcon = t => ({ sync_summary: "🔄", invoice_added: "📄", payment_due: "💳", overdue: "⚠️" }[t] || "🔔");

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 8px)", right: 0,
      width: 340, maxWidth: "calc(100vw - 24px)", maxHeight: 420, overflowY: "auto",
      background: "var(--surf)", border: "1px solid var(--bdr2)",
      borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,.5)",
      zIndex: 300, fontFamily: SANS,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--bdr)", flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--t1)" }}>Notifications</span>
        {notifications.length > 0 && (
          <button onClick={markAllRead} style={{ background: "none", border: "none", fontSize: 11, color: "var(--indigo)", cursor: "pointer", fontFamily: SANS, fontWeight: 600 }}>
            Mark all read
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--t3)", fontSize: 13 }}>No notifications yet</div>
      ) : (
        notifications.map(n => (
          <div key={n.id} style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--bdr)", alignItems: "flex-start" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{typeIcon(n.type || n.event_type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "var(--t1)", lineHeight: 1.45, marginBottom: 3 }}>
                {n.message || (n.count ? `${n.count} invoices synced from ${n.integration_type}` : "New notification")}
              </div>
              <div style={{ fontSize: 11, color: "var(--t3)" }}>{fmt(n.created_at)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function GlobalHeader({ view, onMenuOpen, unreadCount = 0, onBellClick, showNotifPanel, notifications = [], markAllRead }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = winW <= 640;
  const isTablet = winW <= 900;

  const headerBg = "#0C1017";
  const ghostBtn = {
    width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "1px solid rgba(255,255,255,.10)",
    borderRadius: 8, cursor: "pointer", color: "rgba(255,255,255,.4)", flexShrink: 0,
  };

  return (
    <div style={{
      height: 52, background: headerBg, borderBottom: "1px solid rgba(255,255,255,.07)",
      display: "flex", alignItems: "center",
      paddingLeft: isMobile ? 14 : 24, paddingRight: isMobile ? 12 : 24,
      gap: 10, flexShrink: 0, zIndex: 50, position: "relative",
    }}>
      {(isMobile || isTablet) && (
        <button onClick={onMenuOpen} style={{ ...ghostBtn, border: "none" }}>
          <Menu size={18} color="rgba(255,255,255,.6)" />
        </button>
      )}

      <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: isMobile ? 14 : 15, letterSpacing: "-0.015em", color: "#E8EFF8" }}>
        {TITLES[view] || ""}
      </span>

      <div style={{ flex: 1 }} />

      {!isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, height: 34, cursor: "pointer", minWidth: 180 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span style={{ fontFamily: SANS, fontSize: 13, color: "rgba(255,255,255,.25)", flex: 1 }}>Search anything…</span>
          <kbd style={{ fontFamily: SANS, fontSize: 10, color: "rgba(255,255,255,.2)", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 4, padding: "2px 6px" }}>⌘K</kbd>
        </div>
      )}

      <button style={ghostBtn}>
        <Globe size={13} />
      </button>

      <button onClick={toggleTheme} style={ghostBtn} title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      {/* Bell */}
      <div style={{ position: "relative" }}>
        <button onClick={onBellClick} style={{ position: "relative", ...ghostBtn }}>
          <Bell size={14} />
          {unreadCount > 0 && (
            <span style={{ position: "absolute", top: 7, right: 7, width: 6, height: 6, background: "#EF4444", borderRadius: "50%", border: `1.5px solid ${headerBg}` }} />
          )}
        </button>
        {showNotifPanel && (
          <NotificationPanel
            notifications={notifications}
            markAllRead={markAllRead}
            onClose={onBellClick}
          />
        )}
      </div>
    </div>
  );
}
