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

export default function GlobalHeader({ view, onMenuOpen, unreadCount = 0 }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const isMobile = window.innerWidth <= 640;
  const isTablet = window.innerWidth <= 900;

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
      gap: 10, flexShrink: 0, zIndex: 50,
    }}>
      {/* Hamburger (mobile/tablet) */}
      {(isMobile || isTablet) && (
        <button onClick={onMenuOpen} style={{ ...ghostBtn, border: "none" }}>
          <Menu size={18} color="rgba(255,255,255,.6)" />
        </button>
      )}

      {/* Page title */}
      <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: isMobile ? 14 : 15, letterSpacing: "-0.015em", color: "#E8EFF8" }}>
        {TITLES[view] || ""}
      </span>

      <div style={{ flex: 1 }} />

      {/* Search bar (desktop only) */}
      {!isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, height: 34, cursor: "pointer", minWidth: 180 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span style={{ fontFamily: SANS, fontSize: 13, color: "rgba(255,255,255,.25)", flex: 1 }}>Search anything…</span>
          <kbd style={{ fontFamily: SANS, fontSize: 10, color: "rgba(255,255,255,.2)", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 4, padding: "2px 6px" }}>⌘K</kbd>
        </div>
      )}

      {/* Globe (language placeholder) */}
      <button style={ghostBtn}>
        <Globe size={13} />
      </button>

      {/* Theme toggle */}
      <button onClick={toggleTheme} style={ghostBtn} title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      {/* Bell */}
      <button style={{ position: "relative", ...ghostBtn }}>
        <Bell size={14} />
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: 7, right: 7, width: 6, height: 6, background: "#EF4444", borderRadius: "50%", border: `1.5px solid ${headerBg}` }} />
        )}
      </button>
    </div>
  );
}
