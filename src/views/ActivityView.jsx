import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_MONO as MONO } from "../theme";
import { History, FileText, Copy, AlertTriangle, Download } from "lucide-react";

export const SOURCE_NAMES = { google_drive: "Google Drive", gmail: "Gmail", whatsapp: "WhatsApp", green_invoice: "Green Invoice" };

// The audit trail: every auto-synced file's origin, timestamp, and outcome.
// Reads sync_events directly under RLS, same pattern as invoices/suppliers.
export default function ActivityView() {
  const T = useT();
  const { t, lang } = useLang();
  const { isMobile } = useLayout();
  const { user } = useAuth();
  const locale = lang === "he" ? "he-IL" : "en-US";
  const [events, setEvents] = useState(null); // null = loading
  const [integrations, setIntegrations] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    Promise.all([
      supabase.from("sync_events").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("integrations").select("id,type").eq("user_id", user.id),
    ]).then(([ev, ints]) => {
      if (!mounted) return;
      if (ev.error) { setLoadError(ev.error.message); setEvents([]); return; }
      setEvents(ev.data ?? []);
      setIntegrations(Object.fromEntries((ints.data ?? []).map(i => [i.id, i.type])));
    });
    return () => { mounted = false; };
  }, [user]);

  const OUTCOMES = {
    saved:           { label: t("act_saved"),   cls: "pill-paid",    Icon: FileText },
    dedup_skipped:   { label: t("act_dupe"),    cls: "pill-neutral", Icon: Copy },
    ocr_failed:      { label: t("act_failed"),  cls: "pill-overdue", Icon: AlertTriangle },
    download_failed: { label: t("act_dl_failed"), cls: "pill-overdue", Icon: Download },
  };
  const FILTERS = [
    { key: "all", label: t("act_all") },
    { key: "saved", label: t("act_saved") },
    { key: "dedup_skipped", label: t("act_dupe") },
    { key: "failed", label: t("act_failed") },
  ];
  const visible = (events || []).filter(e =>
    filter === "all" ? true :
    filter === "failed" ? (e.event_type === "ocr_failed" || e.event_type === "download_failed") :
    e.event_type === filter
  );

  if (events === null) {
    return (
      <div aria-busy="true">
        <div className="shimmer" style={{ height: 24, width: 220, marginBottom: 16 }} />
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="shimmer" style={{ height: 56, marginBottom: 8 }} />)}
      </div>
    );
  }

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)", maxWidth: 860 }}>
      <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, margin: "0 0 14px" }}>{t("act_sub")}</p>

      {loadError && (
        <div role="alert" style={{ padding: "10px 14px", background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 8, fontFamily: SANS, fontSize: 13, color: T.red, marginBottom: 12 }}>
          {loadError}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${filter === f.key ? T.accentBdr : T.bdr}`, background: filter === f.key ? T.accentTint : "transparent", color: filter === f.key ? T.accent : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>
            {f.label}
          </button>
        ))}
        <span className="num" style={{ marginInlineStart: "auto", fontSize: 11, color: T.t3, alignSelf: "center" }}>
          {visible.length}{filter !== "all" ? ` / ${events.length}` : ""} {t("act_events")}
        </span>
      </div>

      {visible.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: T.t3 }}>
          <History size={28} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block" }} aria-hidden="true" />
          <div style={{ fontFamily: SANS, fontSize: 13, maxWidth: 340, margin: "0 auto", lineHeight: 1.6 }}>
            {events.length === 0 ? t("act_empty") : t("act_empty_filter")}
          </div>
        </div>
      )}

      {visible.length > 0 && (
        <div className="card" style={{ overflow: "hidden" }}>
          {visible.map((ev, i) => {
            const outcome = OUTCOMES[ev.event_type] || OUTCOMES.saved;
            const source = SOURCE_NAMES[integrations[ev.integration_id]] || t("act_sync");
            const when = ev.created_at
              ? new Date(ev.created_at).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "—";
            return (
              <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderTop: i > 0 ? `1px solid ${T.bdr}` : "none" }}>
                <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 8, background: T.surf2, border: `1px solid ${T.bdr}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <outcome.Icon size={14} color={ev.event_type === "saved" ? T.green : ev.event_type === "dedup_skipped" ? T.t3 : T.red} strokeWidth={1.75} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.source_file || t("act_unnamed")}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 11.5, color: T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {source}
                    {ev.error_message && <> · <span style={{ color: T.red }}>{ev.error_message}</span></>}
                  </div>
                </div>
                {!isMobile && <span className="num" style={{ fontSize: 11, color: T.t3, flexShrink: 0 }}>{when}</span>}
                <span className={`pill ${outcome.cls}`} style={{ flexShrink: 0 }}>
                  <i aria-hidden="true" />{outcome.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
