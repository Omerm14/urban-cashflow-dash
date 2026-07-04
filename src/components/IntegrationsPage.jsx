import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api";
import { useT, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_MONO as MONO } from "../theme";

// ─── Brand SVG icons ─────────────────────────────────────────────────────────
// Third-party brand marks — colors are the providers' own, not app theme.

const GoogleDriveIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
    <path d="M43.65 25L29.9 0C28.55.8 27.4 1.9 26.6 3.3L1.2 48.5A9 9 0 000 53h27.5z" fill="#00ac47"/>
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 12.2z" fill="#ea4335"/>
    <path d="M43.65 25L57.4 0c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
    <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
    <path d="M73.4 26.5l-12.6-21.85C60 3.25 58.85 2.15 57.5 1.35L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
  </svg>
);

const GmailIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
  </svg>
);

const GreenInvoiceIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="#34d399"/>
  </svg>
);

const WhatsAppIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.658 1.438 5.168L2 22l4.978-1.304A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm-2.63 5.8c-.21-.49-.432-.5-.63-.508L8.19 7.28c-.2 0-.52.075-.792.375-.27.3-1.032 1.008-1.032 2.457s1.056 2.85 1.204 3.048c.147.198 2.04 3.245 5.01 4.42 2.478.978 2.98.784 3.517.735.537-.05 1.73-.707 1.974-1.39.245-.683.245-1.27.172-1.39-.073-.122-.27-.197-.567-.344-.298-.148-1.73-.854-1.998-.952-.27-.098-.467-.148-.664.148-.197.296-.763.952-.935 1.149-.172.197-.344.222-.641.074-.298-.148-1.258-.463-2.396-1.48-.885-.79-1.483-1.764-1.655-2.062-.173-.297-.018-.457.13-.605.132-.132.297-.344.445-.516.148-.172.197-.296.296-.493.099-.197.05-.37-.025-.518-.074-.148-.656-1.617-.906-2.209z" fill="#25D366"/>
  </svg>
);

const ICONS = {
  google_drive:  GoogleDriveIcon,
  gmail:         GmailIcon,
  green_invoice: GreenInvoiceIcon,
  whatsapp:      WhatsAppIcon,
};

// ─── Provider config ──────────────────────────────────────────────────────────
// `color`/`accent` are the providers' own brand colors (used for the icon chip
// and active-sync glow only) — not swapped for theme tokens.

const PROVIDERS = {
  google_drive: {
    label:       "Google Drive",
    descKey:     "int_desc_drive",
    color:       "#4285f4",
    accent:      "rgba(66,133,244,0.12)",
    authType:    "oauth",
  },
  gmail: {
    label:       "Gmail",
    descKey:     "int_desc_gmail",
    color:       "#ea4335",
    accent:      "rgba(234,67,53,0.12)",
    authType:    "oauth",
  },
  green_invoice: {
    label:       "חשבונית ירוקה",
    descKey:     "int_desc_green",
    color:       "#34d399",
    accent:      "rgba(52,211,153,0.12)",
    authType:    "apikey",
  },
  whatsapp: {
    label:       "WhatsApp Business",
    descKey:     "int_desc_whatsapp",
    color:       "#25d366",
    accent:      "rgba(37,211,102,0.12)",
    authType:    "webhook",
  },
};

const FREQ_OPTIONS = [
  { key: "int_freq_hourly",  value: 60   },
  { key: "int_freq_4h",      value: 240  },
  { key: "int_freq_daily",   value: 1440 },
];

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

const ConnStatusPill = ({ status }) => {
  const T = useT();
  const { t } = useLang();
  const map = {
    connected:    { key: "int_connected",     color: T.green, bg: T.greenTint },
    disconnected: { key: "int_not_connected", color: T.t3,    bg: T.surf2 },
    error:        { key: "int_error",         color: T.red,   bg: T.redTint },
  };
  const s = map[status] || map.disconnected;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20,
      background: s.bg, color: s.color, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: ".4px",
    }}>
      <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, opacity: .9 }} />
      {t(s.key)}
    </span>
  );
};

const Btn = ({ children, onClick, disabled, variant = "primary", style: extra = {}, title }) => {
  const T = useT();
  const v = {
    primary:   { background: T.accent, color: T.accentInk, border: "none" },
    secondary: { background: T.surf2, color: T.t2, border: `1px solid ${T.bdr}` },
    danger:    { background: T.redTint, color: T.red, border: `1px solid ${T.redBdr}` },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      padding: "8px 18px", borderRadius: 10,
      fontFamily: SANS, fontSize: 13, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? .6 : 1,
      transition: "opacity .15s",
      ...v, ...extra,
    }}>
      {children}
    </button>
  );
};

// ─── Drive folder navigator (breadcrumb tree) ────────────────────────────────

function DriveNavigator({ selectedFolder, selectedFolderName, onSelect }) {
  const T = useT();
  const { t } = useLang();
  const [stack,    setStack]    = useState([{ id: "root", name: "My Drive" }]);
  const [children, setChildren] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState("");

  const current = stack[stack.length - 1];
  const filtered = search.trim()
    ? children.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : children;

  const fetchChildren = useCallback(async id => {
    setLoading(true);
    try {
      const { folders } = await apiFetch(`/api/integrations/google/folders?parent=${id}`);
      setChildren(folders || []);
    } catch { setChildren([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchChildren(current.id); }, [current.id, fetchChildren]);

  const navigateInto = folder => {
    setStack(s => [...s, { id: folder.id, name: folder.name }]);
  };

  const navigateTo = idx => {
    setStack(s => s.slice(0, idx + 1));
  };

  const isSelected = id => selectedFolder === id;
  const selectedLabel = selectedFolder
    ? (selectedFolderName || t("int_selected_folder"))
    : null;

  return (
    <div>
      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {stack.map((crumb, i) => (
          <span key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ color: T.t3, fontSize: 11 }} aria-hidden="true">›</span>}
            <button
              onClick={() => navigateTo(i)}
              style={{
                background: "none", border: "none", cursor: i < stack.length - 1 ? "pointer" : "default",
                color: i < stack.length - 1 ? T.accent : T.t1,
                fontFamily: SANS, fontSize: 12, fontWeight: i === stack.length - 1 ? 700 : 400,
                padding: "2px 4px", borderRadius: 4,
                textDecoration: i < stack.length - 1 ? "underline" : "none",
              }}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t("int_search_folders")}
        aria-label={t("int_search_folders")}
        className="input"
        style={{ marginBottom: 8, fontSize: 12 }}
      />

      {/* Folder list */}
      <div style={{ border: `1px solid ${T.bdr}`, borderRadius: 10, overflow: "hidden", maxHeight: 220, overflowY: "auto" }}>
        {/* "Sync all in current folder" row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderBottom: `1px solid ${T.bdr}`,
          background: isSelected(current.id === "root" ? "" : current.id) ? T.accentTint : "transparent",
        }}>
          <span style={{ fontFamily: SANS, fontSize: 12, color: T.t2, fontStyle: "italic" }}>
            {current.id === "root" ? t("int_sync_all_drive") : t("int_sync_all_in", { folder: current.name })}
          </span>
          <button
            onClick={() => onSelect(current.id === "root" ? "" : current.id, current.id === "root" ? "" : current.name)}
            style={{
              padding: "3px 12px", borderRadius: 6, fontFamily: SANS, fontSize: 11, fontWeight: 600,
              cursor: "pointer",
              background: isSelected(current.id === "root" ? "" : current.id) ? T.accent : T.surf3,
              color:      isSelected(current.id === "root" ? "" : current.id) ? T.accentInk : T.t2,
              border: "none",
            }}
          >
            {isSelected(current.id === "root" ? "" : current.id) ? `✓ ${t("int_selected")}` : t("int_select")}
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "14px 12px", color: T.t3, fontFamily: SANS, fontSize: 12 }}>{t("loading")}</div>
        ) : !filtered.length ? (
          <div style={{ padding: "14px 12px", color: T.t3, fontFamily: SANS, fontSize: 12 }}>
            {search ? t("int_no_folders_match") : t("int_no_subfolders")}
          </div>
        ) : (
          filtered.map(f => (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", borderBottom: `1px solid ${T.bdr}`,
              background: isSelected(f.id) ? T.accentTint : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }} aria-hidden="true">📁</span>
                <span style={{ fontFamily: SANS, fontSize: 12, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => onSelect(f.id, f.name)}
                  style={{
                    padding: "3px 10px", borderRadius: 6, fontFamily: SANS, fontSize: 11, fontWeight: 600,
                    cursor: "pointer",
                    background: isSelected(f.id) ? T.accent : T.surf3,
                    color:      isSelected(f.id) ? T.accentInk : T.t2,
                    border: "none",
                  }}
                >
                  {isSelected(f.id) ? "✓" : t("int_select")}
                </button>
                <button
                  onClick={() => navigateInto(f)}
                  style={{
                    padding: "3px 10px", borderRadius: 6, fontFamily: SANS, fontSize: 11,
                    cursor: "pointer", background: T.surf2, color: T.t3, border: `1px solid ${T.bdr}`,
                  }}
                >
                  {t("int_open")} ▶
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Confirmation + remove */}
      {selectedLabel && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: SANS, fontSize: 11, color: T.green }}>✓ {t("int_syncing_label")}: {selectedLabel}</span>
          <button
            onClick={() => onSelect("", "")}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 11, color: T.t3, padding: "0 2px" }}
          >
            ✕ {t("int_remove")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sync event timeline ──────────────────────────────────────────────────────

function EventTimeline({ integrationId, refreshTrigger }) {
  const T = useT();
  const { t, lang } = useLang();
  const locale = lang === "he" ? "he-IL" : "en-GB";
  const [events,     setEvents]     = useState(null);
  const [totalSaved, setTotalSaved] = useState(0);

  useEffect(() => {
    apiFetch(`/api/integrations/${integrationId}/events`)
      .then(d => { setEvents(d.events); setTotalSaved(d.totalSaved || 0); })
      .catch(() => setEvents([]));
  }, [integrationId, refreshTrigger]);

  const iconFor = type => ({
    saved:           { ch: "✓", color: T.green },
    dedup_skipped:   { ch: "⊘", color: T.t2 },
    ocr_failed:      { ch: "✕", color: T.red },
    download_failed: { ch: "↯", color: T.amber },
  }[type] || { ch: "·", color: T.t3 });

  if (!events) return <div style={{ color: T.t3, fontFamily: SANS, fontSize: 12 }}>{t("loading")}</div>;
  if (!events.length) return <div style={{ color: T.t3, fontFamily: SANS, fontSize: 12 }}>{t("int_no_events")}</div>;

  return (
    <div>
      {totalSaved > 0 && (
        <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginBottom: 8 }}>
          {t("int_total_synced", { n: totalSaved })}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 200, overflowY: "auto" }}>
        {events.map(ev => {
          const { ch, color } = iconFor(ev.event_type);
          const ts = new Date(ev.created_at).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
          return (
            <div key={ev.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: SANS, fontSize: 12 }}>
              <span aria-hidden="true" style={{ color, fontWeight: 700, flexShrink: 0, fontSize: 11 }}>{ch}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: T.t2 }}>{ev.source_file || ev.event_type}</span>
                {ev.error_message && <div style={{ color: T.red, fontSize: 11 }}>{ev.error_message}</div>}
              </div>
              <span className="num" style={{ color: T.t3, flexShrink: 0, fontSize: 11 }}>{ts}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Green Invoice modal ──────────────────────────────────────────────────────

function GreenInvoiceModal({ onClose, onSave }) {
  const T = useT();
  const { t } = useLang();
  const [apiKey,    setApiKey]    = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState(null);

  const save = async () => {
    if (!apiKey || !apiSecret) return setErr(t("int_gi_both_required"));
    setSaving(true); setErr(null);
    try {
      await apiFetch("/api/integrations/green-invoice", { method: "POST", body: { apiKey, apiSecret } });
      onSave();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t("int_gi_connect_title")} style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <GreenInvoiceIcon size={24} />
            <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 16, color: T.t1 }}>{t("int_gi_connect_title")}</span>
          </div>
          <button onClick={onClose} aria-label={t("close")} style={{ width: 30, height: 30, borderRadius: 8, background: T.surf2, border: `1px solid ${T.bdr}`, color: T.t2, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
        <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, marginBottom: 18 }}>
          {t("int_gi_instructions")}
        </p>
        {[["int_gi_api_key", apiKey, setApiKey], ["int_gi_api_secret", apiSecret, setApiSecret]].map(([labelKey, val, setter]) => (
          <div key={labelKey} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>{t(labelKey)}</div>
            <input type="text" value={val} className="input" aria-label={t(labelKey)} onChange={e => setter(e.target.value)} />
          </div>
        ))}
        {err && <div role="alert" style={{ color: T.red, fontFamily: SANS, fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose}>{t("cancel")}</Btn>
          <Btn onClick={save} disabled={saving}>
            {saving ? t("int_connecting") : t("int_connect")}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ type, integration, onRefresh, onInvoicesRefresh, onNotificationsRefresh, onSyncResult, showToast, onConnectModal, onStartSync, onCancelSync, activeSyncJob, isAtLimit, onUpgrade }) {
  const T = useT();
  const { t, lang } = useLang();
  const locale = lang === "he" ? "he-IL" : "en-GB";
  const cfg       = PROVIDERS[type];
  const Icon      = ICONS[type];
  const status    = integration?.status || "disconnected";
  const connected = status === "connected";
  const hasError  = status === "error";

  // Job-based sync state (Drive) — reflects the useSyncJob hook state from App.jsx
  const isJobSyncing = activeSyncJob && !activeSyncJob.done && !activeSyncJob.error;
  const jobProgress  = activeSyncJob?.totalFiles
    ? Math.round((activeSyncJob.cursor / activeSyncJob.totalFiles) * 100)
    : 0;

  const [resyncing,        setResyncing]        = useState(false);
  const [discovering,      setDiscovering]      = useState(false);  // waiting for /sync response
  const [syncDone,         setSyncDone]         = useState(false);
  const [configOpen,       setConfigOpen]       = useState(false);
  const [historyOpen,      setHistoryOpen]      = useState(false);
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);

  // When job finishes, flash green and refresh
  useEffect(() => {
    if (activeSyncJob?.done && !syncDone) {
      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
      onRefresh();
      setEventsRefreshKey(k => k + 1);
      setHistoryOpen(true);
      if (activeSyncJob.added > 0) onInvoicesRefresh?.();
      onNotificationsRefresh?.();
      onSyncResult?.({ source: integration?.config?.label || type, added: activeSyncJob.added || 0, dupes: activeSyncJob.dupes || 0, filesFound: activeSyncJob.totalFiles || 0 });
    }
  }, [activeSyncJob?.done]);

  const [labels,         setLabels]         = useState(null);
  const [labelsLoading,  setLabelsLoading]  = useState(false);

  const [selectedFolder,     setSelectedFolder]     = useState(integration?.config?.folder_id   || "");
  const [selectedFolderName, setSelectedFolderName] = useState(integration?.config?.folder_name || "");
  const [selectedLabels,     setSelectedLabels]     = useState(integration?.config?.label_ids   || []);
  const [fromFilter,         setFromFilter]         = useState(integration?.config?.filters?.from    || "");
  const [subjFilter,         setSubjFilter]         = useState(integration?.config?.filters?.subject || "");
  const [lookbackDays,       setLookbackDays]       = useState(integration?.config?.lookback_days ?? 0);
  const [autoSync,           setAutoSync]           = useState(integration?.auto_sync_enabled  || false);
  const [syncFreq,           setSyncFreq]           = useState(integration?.sync_frequency_min || 60);
  const [savingConfig,       setSavingConfig]       = useState(false);

  const lastSync = integration?.last_sync
    ? new Date(integration.last_sync).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : t("int_never");

  const loadLabels = useCallback(async () => {
    if (labels !== null || labelsLoading) return;
    setLabelsLoading(true);
    try { setLabels((await apiFetch("/api/integrations/google/labels")).labels); }
    catch { setLabels([]); }
    finally { setLabelsLoading(false); }
  }, [labels, labelsLoading]);

  const reloadLabels = async () => {
    setLabels(null);
    setLabelsLoading(true);
    try { setLabels((await apiFetch("/api/integrations/google/labels")).labels); }
    catch { setLabels([]); }
    finally { setLabelsLoading(false); }
  };

  const openConfig = () => {
    const next = !configOpen;
    setConfigOpen(next);
    if (next) {
      if (type === "gmail") loadLabels();
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const config = type === "google_drive"
        ? { folder_id: selectedFolder, folder_name: selectedFolderName, lookback_days: lookbackDays }
        : type === "gmail"
        ? {
            label_ids:    selectedLabels,
            label_names:  selectedLabels.map(id => labels?.find(l => l.id === id)?.name).filter(Boolean),
            filters:      { from: fromFilter, subject: subjFilter },
            lookback_days: lookbackDays,
          }
        : integration?.config || {};
      await apiFetch(`/api/integrations/${integration.id}/config`, { method: "PATCH", body: { config } });
      await apiFetch(`/api/integrations/${integration.id}/auto-sync`, {
        method: "PATCH",
        body: { auto_sync_enabled: autoSync, sync_frequency_min: syncFreq },
      });
      showToast(t("int_settings_saved"), true);
      setConfigOpen(false);
      onRefresh();
    } catch (e) { showToast(e.message, false); }
    finally { setSavingConfig(false); }
  };

  const handleSync = async (isResync = false) => {
    if (isResync && !confirm(t("int_resync_confirm"))) return;
    const ep = isResync
      ? `/api/integrations/${integration.id}/resync`
      : `/api/integrations/${integration.id}/sync`;

    isResync ? setResyncing(true) : setDiscovering(true);
    try {
      // For Drive this returns { jobId, totalFiles, filesFound } quickly.
      // For Gmail/GreenInvoice it returns { jobId: null, added, filesFound, errors }.
      const res = type === "google_drive"
        ? await onStartSync(integration.id, ep)
        : await apiFetch(ep, { method: "POST" });

      if (res.jobId) {
        // Drive: job started, useSyncJob will poll and update activeSyncJob
        if (res.totalFiles === 0) {
          const msg = res.filesFound === 0 ? t("int_no_files_found") : t("int_all_imported", { n: res.filesFound });
          showToast(msg, false);
        }
        // Progress shown via activeSyncJob / global bottom bar
      } else {
        // Gmail / Green Invoice: result already complete
        const { added = 0, skipped = 0, filesFound = 0, errors = 0 } = res;
        let msg;
        if (filesFound === 0 || filesFound == null) msg = t("int_no_files_found");
        else if (added === 0) msg = errors > 0 ? t("int_found_none_new_errors", { n: filesFound, errors }) : t("int_found_none_new", { n: filesFound });
        else msg = t("int_added_from", { n: added, source: cfg.label });
        showToast(msg, added > 0);
        if (added > 0) { setSyncDone(true); setTimeout(() => setSyncDone(false), 3000); }
        onSyncResult?.({ source: cfg.label || type, added, dupes: skipped, filesFound });
        onInvoicesRefresh?.();
        onRefresh();
        setEventsRefreshKey(k => k + 1);
        setHistoryOpen(true);
        onNotificationsRefresh?.();
      }
    } catch (e) { showToast(e.message, false); }
    finally { setDiscovering(false); setResyncing(false); }
  };

  const handleConnect = async () => {
    // WhatsApp: one-click connect, no credentials needed from the user
    if (type === "whatsapp") {
      try {
        await apiFetch("/api/integrations/whatsapp", { method: "POST" });
        showToast(t("int_wa_connected_toast"), true);
        onRefresh();
      } catch (e) { showToast(e.message, false); }
      return;
    }
    if (cfg.authType !== "oauth") { onConnectModal(type); return; }
    try {
      const { url } = await apiFetch(
        `/api/integrations/google/auth-url?type=${type}&returnUrl=${encodeURIComponent(window.location.origin + '/app')}`
      );
      window.location.href = url;
    } catch (e) { showToast(e.message, false); }
  };

  const handleDisconnect = async () => {
    if (!confirm(t("int_disconnect_confirm", { label: cfg.label }))) return;
    try {
      await apiFetch(`/api/integrations/${integration.id}`, { method: "DELETE" });
      showToast(t("int_disconnected_toast", { label: cfg.label }), true);
      onRefresh();
    } catch (e) { showToast(e.message, false); }
  };

  const toggleLabel = id => setSelectedLabels(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const isActive   = discovering || resyncing || isJobSyncing;
  const cardBorder = isActive ? `1px solid ${cfg.color}55` : hasError ? `1px solid ${T.redBdr}` : `1px solid ${T.bdr}`;

  return (
    <div className="card" style={{
      border: cardBorder, transition: "border-color .3s, box-shadow .3s",
      position: "relative", padding: 0, overflow: "hidden",
      ...(isActive ? { boxShadow: `0 0 24px ${cfg.color}18` } : {}),
    }}>

      {/* Sync progress bar — deterministic for job-based, shimmer for blocking */}
      {(isActive || syncDone) && (
        <div style={{
          position: "absolute", top: 0, insetInlineStart: 0, insetInlineEnd: 0, height: 3,
          background: syncDone ? T.green : "transparent",
          transition: "background 0.4s ease",
        }}>
          {!syncDone && isJobSyncing && (
            <div style={{
              height: "100%", background: cfg.color, borderRadius: 2,
              width: `${jobProgress}%`, transition: "width 0.6s ease",
            }} />
          )}
          {!syncDone && (discovering || resyncing) && (
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)`,
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
            }} />
          )}
        </div>
      )}

      {/* Card body */}
      <div style={{ padding: "22px 22px 0" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, flexShrink: 0,
            background: cfg.accent, boxShadow: `0 0 0 1px ${cfg.color}22`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: T.t1, marginBottom: 3 }}>{cfg.label}</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, lineHeight: 1.5 }}>{t(cfg.descKey)}</div>
          </div>
          <ConnStatusPill status={status} />
        </div>

        {/* Error banner */}
        {hasError && integration?.error_message && (
          <div style={{
            background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 8,
            padding: "10px 12px", marginBottom: 14, fontFamily: SANS, fontSize: 12, color: T.red,
            display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <span style={{ flexShrink: 0 }} aria-hidden="true">⚠</span>
            <div style={{ flex: 1 }}>
              {integration.error_message}
              {cfg.authType === "oauth" && (
                <button onClick={handleConnect}
                  style={{ marginInlineStart: 8, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, textDecoration: "underline" }}>
                  {t("int_reauthorize")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        {connected && (
          <div style={{ display: "flex", gap: 24, marginBottom: 16, fontFamily: SANS, fontSize: 12 }}>
            <div>
              <div style={{ color: T.t3, marginBottom: 2 }}>{t("int_last_sync")}</div>
              <div className="num" style={{ color: T.t2, fontWeight: 600 }}>{lastSync}</div>
            </div>
            <div>
              <div style={{ color: T.t3, marginBottom: 2 }}>{t("int_invoices_synced")}</div>
              <div className="num" style={{ color: T.t2, fontWeight: 600 }}>{integration?.sync_count || 0}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: connected ? 16 : 22 }}>
          {!connected ? (
            <Btn onClick={handleConnect} style={{ background: `linear-gradient(135deg,${cfg.color},${cfg.color}cc)`, color: "#fff", boxShadow: `0 4px 16px ${cfg.color}30` }}>
              {t("int_connect")}
            </Btn>
          ) : (
            <>
              {cfg.authType !== "webhook" && (
              <Btn
                onClick={isAtLimit ? onUpgrade : () => handleSync(false)}
                disabled={isActive}
                title={isAtLimit ? t("int_limit_reached") : undefined}
                style={syncDone ? { background: T.greenTint, color: T.green, border: `1px solid ${T.greenBdr}` } : isAtLimit ? { opacity: .6 } : {}}>
                {discovering ? t("int_finding_files")
                  : isJobSyncing ? t("int_file_progress", { cursor: Math.min(activeSyncJob.cursor, activeSyncJob.totalFiles), total: activeSyncJob.totalFiles })
                  : resyncing ? t("int_resyncing")
                  : syncDone ? `✓ ${t("int_done")}`
                  : isAtLimit ? `🔒 ${t("int_sync")}`
                  : t("int_sync")}
              </Btn>
              )}
              {isJobSyncing && (
                <Btn variant="danger" onClick={() => onCancelSync?.(integration.id)} style={{ padding: "0 14px" }}>
                  {t("int_stop")}
                </Btn>
              )}
              <Btn variant="secondary" onClick={openConfig} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }} aria-hidden="true">⚙</span> {configOpen ? t("close") : t("int_settings")}
              </Btn>
              <Btn variant="danger" onClick={handleDisconnect}>{t("int_disconnect")}</Btn>
            </>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {connected && configOpen && (
        <div style={{ borderTop: `1px solid ${T.bdr}`, padding: "18px 22px 0" }}>

          {/* Drive folder navigator */}
          {type === "google_drive" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
                {t("int_sync_folder")}
              </div>
              <DriveNavigator
                selectedFolder={selectedFolder}
                selectedFolderName={selectedFolderName || (selectedFolder ? t("int_selected_folder") : "")}
                onSelect={(id, name) => { setSelectedFolder(id); setSelectedFolderName(name || ""); }}
              />
            </div>
          )}

          {/* Gmail label picker */}
          {type === "gmail" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, textTransform: "uppercase", letterSpacing: ".5px" }}>{t("int_labels_to_scan")}</div>
                <button onClick={reloadLabels} disabled={labelsLoading} title={t("int_refresh")} aria-label={t("int_refresh")}
                  style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", fontSize: 14, padding: 0 }}>↺</button>
              </div>
              {labelsLoading ? (
                <div style={{ color: T.t3, fontFamily: SANS, fontSize: 12 }}>{t("int_loading_labels")}</div>
              ) : !labels?.length ? (
                <div style={{ color: T.t3, fontFamily: SANS, fontSize: 12 }}>{t("int_no_labels")}</div>
              ) : (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {labels.map(l => (
                      <label key={l.id} style={{
                        display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                        padding: "5px 12px", borderRadius: 20, fontFamily: SANS, fontSize: 12,
                        background: selectedLabels.includes(l.id) ? T.accentTint : T.surf2,
                        border: `1px solid ${selectedLabels.includes(l.id) ? T.accent : T.surf3}`,
                        color: selectedLabels.includes(l.id) ? T.accent : T.t2,
                        transition: "all .15s",
                      }}>
                        <input type="checkbox" checked={selectedLabels.includes(l.id)} onChange={() => toggleLabel(l.id)}
                          style={{ accentColor: T.accent, width: 12, height: 12 }} />
                        {l.name}
                      </label>
                    ))}
                  </div>
                  {selectedLabels.length > 0 && (
                    <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 11, color: T.green }}>
                      ✓ {t("int_labels_selected", { n: selectedLabels.length })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Gmail additional filters */}
          {type === "gmail" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
                {t("int_additional_filters")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginBottom: 4 }}>{t("int_filter_from")}</div>
                  <input
                    type="text"
                    className="input"
                    placeholder={t("int_filter_from_placeholder")}
                    aria-label={t("int_filter_from")}
                    value={fromFilter}
                    onChange={e => setFromFilter(e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginBottom: 4 }}>{t("int_filter_subject")}</div>
                  <input
                    type="text"
                    className="input"
                    placeholder={t("int_filter_subject_placeholder")}
                    aria-label={t("int_filter_subject")}
                    value={subjFilter}
                    onChange={e => setSubjFilter(e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp vendor sharing panel */}
          {type === "whatsapp" && integration?.config?.wa_link && (
            <div style={{ marginBottom: 18 }}>
              {/* Inbox code badge */}
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>{t("int_inbox_code")}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span className="num" style={{
                  fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: 4,
                  color: "#25d366", background: "rgba(37,211,102,0.08)",
                  border: "1px solid rgba(37,211,102,0.25)", borderRadius: 10,
                  padding: "8px 18px",
                }}>
                  {integration.config.inbox_code}
                </span>
              </div>

              {/* QR code + instructions side by side */}
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap" }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&color=25d366&bgcolor=${T.isDark ? "0d1626" : "ffffff"}&data=${encodeURIComponent(integration.config.wa_link)}`}
                  alt={t("int_wa_qr_alt")}
                  width={120} height={120}
                  style={{ borderRadius: 10, border: `1px solid ${T.bdr}`, flexShrink: 0 }}
                />
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, lineHeight: 1.6 }}>
                  <div style={{ color: T.t1, fontWeight: 600, marginBottom: 4 }}>{t("int_wa_how_to")}</div>
                  <ol style={{ margin: 0, paddingInlineStart: 16 }}>
                    <li>{t("int_wa_step1")}</li>
                    <li>{t("int_wa_step2")}</li>
                    <li>{t("int_wa_step3")}</li>
                    <li>{t("int_wa_step4")}</li>
                    <li>{t("int_wa_step5")}</li>
                  </ol>
                </div>
              </div>

              {/* Shareable link */}
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>{t("int_shareable_link")}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", background: T.surf2, borderRadius: 8, padding: "8px 12px", border: `1px solid ${T.bdr}` }}>
                <code style={{ fontFamily: MONO, fontSize: 11, color: T.accent, flex: 1, wordBreak: "break-all" }}>{integration.config.wa_link}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(integration.config.wa_link); }}
                  style={{ padding: "3px 10px", background: T.surf3, border: "none", borderRadius: 6, color: T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 11, flexShrink: 0 }}>
                  {t("int_copy")}
                </button>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 6 }}>
                {t("int_wa_register_note")} <strong style={{ color: T.t2 }}>{integration.config.inbox_code}</strong> {t("int_wa_register_note2")}
              </div>
            </div>
          )}

          {/* Lookback window (Drive + Gmail only) */}
          {type !== "whatsapp" && type !== "green_invoice" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>
                {t("int_lookback_title")}
              </div>
              <select
                value={lookbackDays}
                onChange={e => setLookbackDays(Number(e.target.value))}
                className="input"
                aria-label={t("int_lookback_title")}
                style={{ fontSize: 12, padding: "6px 10px" }}
              >
                <option value={0}>{t("int_lookback_smart")}</option>
                <option value={7}>{t("int_lookback_7")}</option>
                <option value={30}>{t("int_lookback_30")}</option>
                <option value={90}>{t("int_lookback_90")}</option>
                <option value={180}>{t("int_lookback_180")}</option>
                <option value={365}>{t("int_lookback_365")}</option>
                <option value={-1}>{t("int_lookback_all")}</option>
              </select>
              {lookbackDays === -1 && (
                <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 11, color: T.amber }}>
                  ⚠ {type === "gmail" ? t("int_lookback_slow_gmail") : t("int_lookback_slow_drive")}
                </div>
              )}
              {lookbackDays === 0 && (
                <div style={{ marginTop: 6, fontFamily: SANS, fontSize: 11, color: T.t3 }}>
                  {t("int_lookback_smart_note")}
                </div>
              )}
            </div>
          )}

          {/* Auto-sync (not applicable for webhook-driven integrations) */}
          {cfg.authType !== "webhook" && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: SANS, fontSize: 13, color: T.t2, marginBottom: 8 }}>
              <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)}
                style={{ accentColor: T.accent, width: 14, height: 14 }} />
              {t("int_auto_sync_enabled")}
            </label>
            {autoSync && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{t("int_frequency")}:</span>
                <select value={syncFreq} onChange={e => setSyncFreq(Number(e.target.value))}
                  className="input" aria-label={t("int_frequency")} style={{ width: "auto", fontSize: 12, padding: "5px 10px" }}>
                  {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.key)}</option>)}
                </select>
              </div>
            )}
          </div>
          )}

          {/* Save + Resync */}
          <div style={{ display: "flex", gap: 8, paddingBottom: 18 }}>
            <Btn onClick={saveConfig} disabled={savingConfig}>
              {savingConfig ? t("int_saving") : t("int_save_settings")}
            </Btn>
            {type !== "whatsapp" && (
              <Btn
                variant="secondary"
                onClick={isAtLimit ? onUpgrade : () => handleSync(true)}
                disabled={isActive}
                title={isAtLimit ? t("int_limit_reached") : undefined}
                style={{ fontSize: 12, ...(isAtLimit ? { opacity: .6 } : {}) }}>
                {resyncing ? t("int_resyncing") : isAtLimit ? `🔒 ${t("int_resync_all")}` : `↺ ${t("int_resync_all")}`}
              </Btn>
            )}
          </div>
        </div>
      )}

      {/* Sync history */}
      {connected && (
        <div style={{ borderTop: `1px solid ${T.bdr}`, padding: "10px 22px 14px" }}>
          <button onClick={() => setHistoryOpen(h => !h)}
            style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", fontFamily: SANS, fontSize: 12, padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10 }} aria-hidden="true">{historyOpen ? "▲" : "▼"}</span>
            {t("int_sync_history")}
          </button>
          {historyOpen && (
            <div style={{ marginTop: 10 }}>
              <EventTimeline integrationId={integration.id} refreshTrigger={eventsRefreshKey} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage({ oauthResult, onClearOAuthResult, onInvoicesRefresh, onNotificationsRefresh, onSyncResult, onStartSync, onCancelSync, syncJobs, isAtLimit, onUpgrade }) {
  const T = useT();
  const { t } = useLang();
  const [integrations,   setIntegrations]   = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [toast,          setToast]          = useState(null);
  const [showGreenModal, setShowGreenModal] = useState(false);

  const showToast = useCallback((text, ok) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const load = useCallback(async () => {
    try {
      const { integrations: data } = await apiFetch("/api/integrations");
      setIntegrations(data || []);
    } catch (e) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!oauthResult) return;
    if (oauthResult.connected) {
      showToast(t("int_oauth_connected", { label: PROVIDERS[oauthResult.connected]?.label || oauthResult.connected }), true);
    } else if (oauthResult.error) {
      const msg = oauthResult.error === "access_denied" ? t("int_oauth_access_denied") : t("int_oauth_failed", { error: oauthResult.error });
      showToast(msg, false);
    }
    onClearOAuthResult();
  }, [oauthResult, showToast, onClearOAuthResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const getIntegration = type => integrations.find(i => i.type === type);
  const hasAnyError    = integrations.some(i => i.status === "error");

  const handleConnectModal = type => {
    if (type === "green_invoice") setShowGreenModal(true);
  };

  if (loading) return (
    <div style={{ color: T.t3, padding: "60px 0", textAlign: "center", fontFamily: SANS, fontSize: 14 }}>
      {t("int_loading_page")}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 22, color: T.t1, marginBottom: 6 }}>{t("int_page_title")}</div>
        <div style={{ fontFamily: SANS, fontSize: 14, color: T.t3 }}>
          {t("int_page_sub")}
        </div>
        {hasAnyError && (
          <div style={{ marginTop: 14, padding: "10px 16px", background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 10, fontFamily: SANS, fontSize: 13, color: T.red }}>
            ⚠ {t("int_has_errors")}
          </div>
        )}
      </div>

      {toast && (
        <div role="status" style={{
          marginBottom: 20, padding: "10px 16px", borderRadius: 10, fontFamily: SANS, fontSize: 13, animation: "fadeIn .3s",
          background: toast.ok ? T.greenTint : T.redTint,
          border:     `1px solid ${toast.ok ? T.greenBdr : T.redBdr}`,
          color:      toast.ok ? T.green : T.red,
        }}>
          {toast.ok ? "✓ " : "✕ "}{toast.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
        {Object.keys(PROVIDERS).map(type => {
          const intg = getIntegration(type);
          const activeSyncJob = intg ? (syncJobs?.[intg.id] || null) : null;
          return (
            <IntegrationCard
              key={type}
              type={type}
              integration={intg}
              onRefresh={load}
              onInvoicesRefresh={onInvoicesRefresh}
              onNotificationsRefresh={onNotificationsRefresh}
              onSyncResult={onSyncResult}
              showToast={showToast}
              onConnectModal={handleConnectModal}
              onStartSync={onStartSync}
              onCancelSync={onCancelSync}
              activeSyncJob={activeSyncJob}
              isAtLimit={isAtLimit}
              onUpgrade={onUpgrade}
            />
          );
        })}
      </div>

      {showGreenModal && (
        <GreenInvoiceModal
          onClose={() => setShowGreenModal(false)}
          onSave={() => { setShowGreenModal(false); load(); showToast(t("int_gi_connected_toast"), true); }}
        />
      )}
    </div>
  );
}
