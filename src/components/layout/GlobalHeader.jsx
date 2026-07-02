import { useState, useEffect, useRef } from "react";
import { useT, useLayout, useLang } from "../../contexts/AppContexts";
import { FONT_UI as SANS } from "../../theme";
import {
  Bell, Menu, Sun, Moon, AlertTriangle, TrendingUp, ChevronRight, RefreshCw,
} from "lucide-react";

export default function GlobalHeader({ view, isDark, onToggleTheme, onToggleLang, lang, onMenuOpen, onMissingAlert, onAnomalyAlert, missingCount, anomalyCount, appNotifs, onClearAppNotifs, onSearchOpen }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
  const { t } = useLang();
  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef(null);
  const TITLES = { dashboard: t("nav_dashboard"), invoices: t("nav_invoices"), calendar: t("nav_calendar"), integrations: t("nav_integrations"), suppliers: t("nav_suppliers"), settings: t("nav_settings"), admin: t("nav_admin") };
  const totalAlerts = (missingCount || 0) + (anomalyCount || 0);
  const recentAppNotifs = (appNotifs || []).slice(0, 5);
  const totalCount = totalAlerts + recentAppNotifs.length;

  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  return (
    <header className="hd">
      {(isMobile || isTablet) && (
        <button className="hd-btn" style={{ border: "none" }} onClick={onMenuOpen} aria-label={t("nav_menu")}>
          <Menu size={18} />
        </button>
      )}
      <span className="hd-title">{TITLES[view] || ""}</span>
      <div style={{ flex: 1 }} />
      {!isMobile && (
        <button className="hd-search" onClick={onSearchOpen} aria-label={t("search_placeholder")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span style={{ flex: 1, textAlign: "start" }}>{t("search_placeholder")}</span>
          <kbd>⌘K</kbd>
        </button>
      )}
      <button className="hd-btn" onClick={onToggleTheme} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>
      <button className="hd-btn" onClick={onToggleLang} title={lang === "he" ? "Switch to English" : "עברית"} aria-label={lang === "he" ? "Switch to English" : "החלף לעברית"}
        style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {lang === "he" ? "EN" : "עב"}
      </button>

      <div ref={bellRef} style={{ position: "relative" }}>
        <button className="hd-btn" onClick={() => setNotifOpen(v => !v)} aria-label={t("notif_title")} aria-expanded={notifOpen}
          style={{ position: "relative", background: notifOpen ? T.surf2 : "transparent" }}>
          <Bell size={14} />
          {totalCount > 0 && (
            <span style={{ position: "absolute", top: 5, insetInlineEnd: 5, minWidth: 14, height: 14, background: T.red, borderRadius: 7, border: `1.5px solid ${T.surf}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 8, fontWeight: 700, color: "#fff", padding: "0 3px" }}>
              {totalCount > 9 ? "9+" : totalCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div role="dialog" aria-label={t("notif_title")} style={{ position: "absolute", top: 42, insetInlineEnd: 0, width: 300, background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 10, boxShadow: "var(--shadow-pop)", zIndex: 9999, overflow: "hidden", animation: "scaleIn 0.15s cubic-bezier(.16,1,.3,1)" }}>
            <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${T.bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: T.t1, letterSpacing: "-0.01em" }}>{t("notif_title")}</span>
              {recentAppNotifs.length > 0 && <button onClick={() => onClearAppNotifs?.()} style={{ fontFamily: SANS, fontSize: 11, color: T.t3, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{t("notif_clear")}</button>}
              {totalCount === 0 && <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{t("notif_all_clear")}</span>}
            </div>

            {totalCount === 0 && (
              <div style={{ padding: "20px 14px", textAlign: "center", fontFamily: SANS, fontSize: 13, color: T.t3 }}>
                {t("notif_empty")}
              </div>
            )}

            {missingCount > 0 && (
              <button onClick={() => { setNotifOpen(false); onMissingAlert?.(); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${T.bdr}`, cursor: "pointer", textAlign: "start" }}
                onMouseEnter={e => e.currentTarget.style.background = T.surf2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: T.amberTint, border: `1px solid ${T.amberBdr}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertTriangle size={14} color={T.amber} aria-hidden="true" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{t("notif_missing")}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 1 }}>{missingCount !== 1 ? t("notif_missing_sub_plural", { n: missingCount }) : t("notif_missing_sub", { n: missingCount })}</div>
                </div>
                <ChevronRight size={13} color={T.t3} aria-hidden="true" />
              </button>
            )}

            {anomalyCount > 0 && (
              <button onClick={() => { setNotifOpen(false); onAnomalyAlert?.(); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "transparent", border: "none", borderBottom: recentAppNotifs.length > 0 ? `1px solid ${T.bdr}` : "none", cursor: "pointer", textAlign: "start" }}
                onMouseEnter={e => e.currentTarget.style.background = T.surf2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: T.accentTint, border: `1px solid ${T.accentBdr}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <TrendingUp size={14} color={T.accent} aria-hidden="true" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{t("notif_anomaly")}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 1 }}>{anomalyCount !== 1 ? t("notif_anomaly_sub_plural", { n: anomalyCount }) : t("notif_anomaly_sub", { n: anomalyCount })}</div>
                </div>
                <ChevronRight size={13} color={T.t3} aria-hidden="true" />
              </button>
            )}

            <div style={{ borderTop: (missingCount > 0 || anomalyCount > 0) ? `1px solid ${T.bdr}` : "none" }}>
              <div style={{ padding: "8px 14px 4px", fontFamily: SANS, fontSize: 10, fontWeight: 700, color: T.t3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("notif_recent")}</div>
              {recentAppNotifs.length === 0 && (
                <div style={{ padding: "10px 14px 14px", fontFamily: SANS, fontSize: 12, color: T.t3 }}>{t("notif_no_activity")}</div>
              )}
              {recentAppNotifs.map((n, i) => {
                const isError = n.type === "error";
                const isUpload = n.type === "upload";
                const iconBg = isError ? T.redTint : isUpload ? T.accentTint : T.greenTint;
                const iconBdr = isError ? T.redBdr : isUpload ? T.accentBdr : T.greenBdr;
                const iconColor = isError ? T.red : isUpload ? T.accent : T.green;
                const relTime = (() => {
                  const diff = Math.floor((Date.now() - n.ts) / 1000);
                  if (diff < 60) return `${diff}s ago`;
                  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                  return `${Math.floor(diff / 3600)}h ago`;
                })();
                return (
                  <div key={n.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderBottom: i < recentAppNotifs.length - 1 ? `1px solid ${T.bdr}` : "none" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, border: `1px solid ${iconBdr}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isError
                        ? <AlertTriangle size={13} color={iconColor} aria-hidden="true" />
                        : isUpload
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          : <RefreshCw size={13} color={iconColor} aria-hidden="true" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: SANS, fontSize: 12, color: T.t1, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.text}</div>
                      {n.ts && <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 2 }}>{relTime}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
