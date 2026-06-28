import { Search, Bell, Globe } from "lucide-react";

const VIEW_TITLES = {
  dashboard: "Dashboard", invoices: "Invoices", calendar: "Calendar",
  integrations: "Integrations", suppliers: "Suppliers", settings: "Settings", admin: "Admin",
};

export default function GlobalHeader({ view, unreadCount, onBellClick }) {
  return (
    <header className="global-hdr">
      <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: "var(--t1)", flex: 1 }}>
        {VIEW_TITLES[view] || ""}
      </span>

      <button style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--bdr)", borderRadius: 6, cursor: "pointer", color: "var(--t2)" }}>
        <Search size={14} />
      </button>

      <button
        onClick={onBellClick}
        title="Notifications"
        style={{ position: "relative", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid var(--bdr)", borderRadius: 6, cursor: "pointer", color: "var(--t2)" }}
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: 7, right: 7, width: 6, height: 6, background: "#EF4444", borderRadius: "50%", border: "1.5px solid var(--surf)" }} />
        )}
      </button>

      <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "transparent", border: "1px solid var(--bdr)", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--t2)" }}>
        <Globe size={12} />EN
      </button>
    </header>
  );
}
