import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

// ─── API helpers ─────────────────────────────────────────────────────────────

const apiFetch = async (path, opts = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  if (!res.ok) throw new Error(json.error || `Server error (${res.status}) — please try again`);
  return json;
};

// ─── Brand SVG icons ─────────────────────────────────────────────────────────

const GoogleDriveIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
    <path d="M43.65 25L29.9 0C28.55.8 27.4 1.9 26.6 3.3L1.2 48.5A9 9 0 000 53h27.5z" fill="#00ac47"/>
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 12.2z" fill="#ea4335"/>
    <path d="M43.65 25L57.4 0c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
    <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
    <path d="M73.4 26.5l-12.6-21.85C60 3.25 58.85 2.15 57.5 1.35L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
  </svg>
);

const GmailIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
  </svg>
);

const GreenInvoiceIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="#34d399"/>
  </svg>
);

const WhatsAppIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

const PROVIDERS = {
  google_drive: {
    label:       "Google Drive",
    description: "Automatically pull invoice PDFs and images from a Drive folder.",
    color:       "#4285f4",
    accent:      "rgba(66,133,244,0.12)",
    authType:    "oauth",
  },
  gmail: {
    label:       "Gmail",
    description: "Extract invoice attachments from Gmail labels.",
    color:       "#ea4335",
    accent:      "rgba(234,67,53,0.12)",
    authType:    "oauth",
  },
  green_invoice: {
    label:       "חשבונית ירוקה",
    description: "Import documents directly from your Green Invoice account.",
    color:       "#34d399",
    accent:      "rgba(52,211,153,0.12)",
    authType:    "apikey",
  },
  whatsapp: {
    label:       "WhatsApp Business",
    description: "Receive invoice images and PDFs from vendors via WhatsApp.",
    color:       "#25d366",
    accent:      "rgba(37,211,102,0.12)",
    authType:    "webhook",
  },
};

const FREQ_OPTIONS = [
  { label: "Every hour",  value: 60   },
  { label: "Every 4h",   value: 240  },
  { label: "Once a day", value: 1440 },
];

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

const StatusPill = ({ status }) => {
  const map = {
    connected:    { label: "Connected",    color: "#4ade80", bg: "#052e16" },
    disconnected: { label: "Disconnected", color: "#475569", bg: "#0d1626" },
    error:        { label: "Error",        color: "#f87171", bg: "#2d0a0a" },
  };
  const s = map[status] || map.disconnected;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, letterSpacing: ".4px",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, opacity: .9 }} />
      {s.label}
    </span>
  );
};

const Btn = ({ children, onClick, disabled, variant = "primary", style: extra = {} }) => {
  const v = {
    primary:   { background: "linear-gradient(135deg,#6366f1,#a78bfa)", color: "#fff", border: "none" },
    secondary: { background: "#131c2e", color: "#94a3b8", border: "1px solid #1e2d45" },
    danger:    { background: "#1a0606", color: "#f87171", border: "1px solid #7f1d1d" },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "8px 18px", borderRadius: 10,
      fontFamily: "inherit", fontSize: 13, fontWeight: 600,
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
    ? (selectedFolderName || "Selected folder")
    : null;

  return (
    <div>
      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
        {stack.map((crumb, i) => (
          <span key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ color: "#334155", fontSize: 11 }}>›</span>}
            <button
              onClick={() => navigateTo(i)}
              style={{
                background: "none", border: "none", cursor: i < stack.length - 1 ? "pointer" : "default",
                color: i < stack.length - 1 ? "#6366f1" : "#f1f5f9",
                fontSize: 12, fontWeight: i === stack.length - 1 ? 700 : 400,
                fontFamily: "inherit", padding: "2px 4px", borderRadius: 4,
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
        placeholder="Search folders…"
        style={{
          width: "100%", boxSizing: "border-box", marginBottom: 8,
          padding: "6px 10px", borderRadius: 7, border: "1px solid #1e2d45",
          background: "#0d1626", color: "#cbd5e1", fontSize: 12, fontFamily: "inherit", outline: "none",
        }}
      />

      {/* Folder list */}
      <div style={{
        border: "1px solid #1e2d45", borderRadius: 10, overflow: "hidden",
        maxHeight: 220, overflowY: "auto",
      }}>
        {/* "Sync all in current folder" row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderBottom: "1px solid #0d1626",
          background: isSelected(current.id === "root" ? "" : current.id) ? "#6366f111" : "transparent",
        }}>
          <span style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
            {current.id === "root" ? "Sync all of My Drive" : `Sync all in "${current.name}"`}
          </span>
          <button
            onClick={() => onSelect(current.id === "root" ? "" : current.id, current.id === "root" ? "" : current.name)}
            style={{
              padding: "3px 12px", borderRadius: 6, fontSize: 11, fontFamily: "inherit", fontWeight: 600,
              cursor: "pointer",
              background: isSelected(current.id === "root" ? "" : current.id) ? "#6366f1" : "#1e2d45",
              color:      isSelected(current.id === "root" ? "" : current.id) ? "#fff"    : "#94a3b8",
              border: "none",
            }}
          >
            {isSelected(current.id === "root" ? "" : current.id) ? "✓ Selected" : "Select"}
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "14px 12px", color: "#475569", fontSize: 12 }}>Loading…</div>
        ) : !filtered.length ? (
          <div style={{ padding: "14px 12px", color: "#334155", fontSize: 12 }}>
            {search ? "No folders match" : "No subfolders"}
          </div>
        ) : (
          filtered.map(f => (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px", borderBottom: "1px solid #0d1626",
              background: isSelected(f.id) ? "#6366f111" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ color: "#4285f4", fontSize: 14, flexShrink: 0 }}>📁</span>
                <span style={{ fontSize: 12, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => onSelect(f.id, f.name)}
                  style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 11, fontFamily: "inherit", fontWeight: 600,
                    cursor: "pointer",
                    background: isSelected(f.id) ? "#6366f1" : "#1e2d45",
                    color:      isSelected(f.id) ? "#fff"    : "#94a3b8",
                    border: "none",
                  }}
                >
                  {isSelected(f.id) ? "✓" : "Select"}
                </button>
                <button
                  onClick={() => navigateInto(f)}
                  style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 11, fontFamily: "inherit",
                    cursor: "pointer", background: "#0d1626", color: "#475569", border: "1px solid #1e2d45",
                  }}
                >
                  Open ▶
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Confirmation + remove */}
      {selectedLabel && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "#4ade80" }}>✓ Syncing: {selectedLabel}</span>
          <button
            onClick={() => onSelect("", "")}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 11, color: "#64748b", fontFamily: "inherit", padding: "0 2px",
            }}
          >
            ✕ Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sync event timeline ──────────────────────────────────────────────────────

function EventTimeline({ integrationId, refreshTrigger }) {
  const [events,     setEvents]     = useState(null);
  const [totalSaved, setTotalSaved] = useState(0);

  useEffect(() => {
    apiFetch(`/api/integrations/${integrationId}/events`)
      .then(d => { setEvents(d.events); setTotalSaved(d.totalSaved || 0); })
      .catch(() => setEvents([]));
  }, [integrationId, refreshTrigger]);

  const iconFor = type => ({
    saved:           { ch: "✓", color: "#4ade80" },
    dedup_skipped:   { ch: "⊘", color: "#94a3b8" },
    ocr_failed:      { ch: "✕", color: "#f87171" },
    download_failed: { ch: "↯", color: "#fb923c" },
  }[type] || { ch: "·", color: "#475569" });

  if (!events) return <div style={{ color: "#475569", fontSize: 12 }}>Loading…</div>;
  if (!events.length) return <div style={{ color: "#475569", fontSize: 12 }}>No sync events yet.</div>;

  return (
    <div>
      {totalSaved > 0 && (
        <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>
          {totalSaved} invoice{totalSaved !== 1 ? "s" : ""} synced in total
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 200, overflowY: "auto" }}>
        {events.map(ev => {
          const { ch, color } = iconFor(ev.event_type);
          const ts = new Date(ev.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
          return (
            <div key={ev.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12 }}>
              <span style={{ color, fontWeight: 700, flexShrink: 0, fontSize: 11 }}>{ch}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "#94a3b8" }}>{ev.source_file || ev.event_type}</span>
                {ev.error_message && <div style={{ color: "#f87171", fontSize: 11 }}>{ev.error_message}</div>}
              </div>
              <span style={{ color: "#334155", flexShrink: 0, fontSize: 11 }}>{ts}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Green Invoice modal ──────────────────────────────────────────────────────

function GreenInvoiceModal({ onClose, onSave }) {
  const [apiKey,    setApiKey]    = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState(null);

  const save = async () => {
    if (!apiKey || !apiSecret) return setErr("Both fields are required");
    setSaving(true); setErr(null);
    try {
      await apiFetch("/api/integrations/green-invoice", { method: "POST", body: { apiKey, apiSecret } });
      onSave();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <GreenInvoiceIcon size={24} />
            <span style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>Connect Green Invoice</span>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: "#131c2e", border: "1px solid #1e2d45", color: "#64748b", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>
          Enter your API credentials from greeninvoice.co.il → Account Settings → API.
        </p>
        {[["API Key (מזהה)", apiKey, setApiKey], ["API Secret (סיסמה)", apiSecret, setApiSecret]].map(([label, val, setter]) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
            <input type="text" value={val} className="input" onChange={e => setter(e.target.value)} />
          </div>
        ))}
        {err && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={saving} style={{ background: "linear-gradient(135deg,#34d399,#059669)" }}>
            {saving ? "Connecting…" : "Connect"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp modal ───────────────────────────────────────────────────────────

function WhatsAppModal({ onClose, onSave }) {
  const [apiToken,      setApiToken]      = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saving,        setSaving]        = useState(false);
  const [err,           setErr]           = useState(null);
  const webhookUrl = `${window.location.origin}/api/webhook/whatsapp`;

  const save = async () => {
    if (!apiToken || !phoneNumberId || !webhookSecret) return setErr("All fields are required");
    setSaving(true); setErr(null);
    try {
      await apiFetch("/api/integrations/whatsapp", {
        method: "POST",
        body: { api_token: apiToken, phone_number_id: phoneNumberId, webhook_secret: webhookSecret },
      });
      onSave();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <WhatsAppIcon size={24} />
            <span style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>Connect WhatsApp Business</span>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: "#131c2e", border: "1px solid #1e2d45", color: "#64748b", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
        <div style={{ marginBottom: 18, background: "#0a1628", borderRadius: 10, padding: "12px 14px", border: "1px solid #1e2d45" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>Your Webhook URL</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ fontSize: 11, color: "#a78bfa", flex: 1, wordBreak: "break-all" }}>{webhookUrl}</code>
            <button onClick={() => navigator.clipboard.writeText(webhookUrl)}
              style={{ padding: "4px 10px", background: "#1e2d45", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", cursor: "pointer", fontSize: 11, fontFamily: "inherit", flexShrink: 0 }}>
              Copy
            </button>
          </div>
        </div>
        {[
          ["Permanent Access Token", apiToken,      setApiToken,      "Meta → WhatsApp → API Setup"],
          ["Phone Number ID",        phoneNumberId, setPhoneNumberId, "Meta → WhatsApp → API Setup"],
          ["Webhook Verify Token",   webhookSecret, setWebhookSecret, "Create any random string — paste same value in Meta console"],
        ].map(([label, val, setter, hint]) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 2, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
            {hint && <div style={{ fontSize: 11, color: "#334155", marginBottom: 5 }}>{hint}</div>}
            <input type="text" value={val} className="input" onChange={e => setter(e.target.value)} />
          </div>
        ))}
        {err && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} disabled={saving} style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>
            {saving ? "Connecting…" : "Connect"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ type, integration, onRefresh, onInvoicesRefresh, onNotificationsRefresh, showToast, onConnectModal }) {
  const cfg      = PROVIDERS[type];
  const Icon     = ICONS[type];
  const status   = integration?.status || "disconnected";
  const connected = status === "connected";
  const hasError  = status === "error";

  const [syncing,          setSyncing]          = useState(false);
  const [resyncing,        setResyncing]        = useState(false);
  const [configOpen,       setConfigOpen]       = useState(false);
  const [historyOpen,      setHistoryOpen]      = useState(false);
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);

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
    ? new Date(integration.last_sync).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Never";

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
      showToast("Settings saved", true);
      setConfigOpen(false);
      onRefresh();
    } catch (e) { showToast(e.message, false); }
    finally { setSavingConfig(false); }
  };

  const handleSync = async (isResync = false) => {
    if (isResync && !confirm("Re-process all historical files? May create duplicates if some slipped through.")) return;
    isResync ? setResyncing(true) : setSyncing(true);
    try {
      const ep = isResync
        ? `/api/integrations/${integration.id}/resync`
        : `/api/integrations/${integration.id}/sync`;
      const { added, filesFound, errors } = await apiFetch(ep, { method: "POST" });
      let msg;
      if (filesFound === 0 || filesFound == null) {
        msg = `No files found — try setting a longer lookback window in Settings`;
      } else if (added === 0) {
        msg = `Found ${filesFound} file${filesFound !== 1 ? "s" : ""} but none were new${errors > 0 ? ` (${errors} failed extraction)` : " (all already imported)"}`;
      } else {
        msg = `${added} new invoice${added !== 1 ? "s" : ""} added from ${cfg.label}`;
      }
      showToast(msg, added > 0);
      onRefresh();
      setEventsRefreshKey(k => k + 1);
      setHistoryOpen(true);
      if (added > 0) onInvoicesRefresh?.();
      if (added > 0) onNotificationsRefresh?.();
    } catch (e) { showToast(e.message, false); }
    finally { setSyncing(false); setResyncing(false); }
  };

  const handleConnect = async () => {
    if (cfg.authType !== "oauth") { onConnectModal(type); return; }
    try {
      const { url } = await apiFetch(
        `/api/integrations/google/auth-url?type=${type}&returnUrl=${encodeURIComponent(window.location.origin)}`
      );
      window.location.href = url;
    } catch (e) { showToast(e.message, false); }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${cfg.label}? Existing invoices are kept.`)) return;
    try {
      await apiFetch(`/api/integrations/${integration.id}`, { method: "DELETE" });
      showToast(`${cfg.label} disconnected`, true);
      onRefresh();
    } catch (e) { showToast(e.message, false); }
  };

  const toggleLabel = id => setSelectedLabels(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const isActive    = syncing || resyncing;
  const cardBorder  = isActive ? `1px solid ${cfg.color}55` : hasError ? "1px solid #7f1d1d" : "1px solid #111d2e";

  return (
    <div className="card" style={{
      border: cardBorder, transition: "border-color .3s, box-shadow .3s",
      position: "relative", padding: 0, overflow: "hidden",
      ...(isActive ? { boxShadow: `0 0 24px ${cfg.color}18` } : {}),
    }}>

      {/* Sync progress bar */}
      {isActive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)`,
          animation: "shimmer 1.5s infinite",
        }} />
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
            <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9", marginBottom: 3 }}>{cfg.label}</div>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{cfg.description}</div>
          </div>
          <StatusPill status={status} />
        </div>

        {/* Error banner */}
        {hasError && integration?.error_message && (
          <div style={{
            background: "#2d0a0a", border: "1px solid #7f1d1d", borderRadius: 8,
            padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#f87171",
            display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <span style={{ flexShrink: 0 }}>⚠</span>
            <div style={{ flex: 1 }}>
              {integration.error_message}
              {cfg.authType === "oauth" && (
                <button onClick={handleConnect}
                  style={{ marginLeft: 8, color: "#a78bfa", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", textDecoration: "underline" }}>
                  Re-authorize
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        {connected && (
          <div style={{ display: "flex", gap: 24, marginBottom: 16, fontSize: 12 }}>
            <div>
              <div style={{ color: "#334155", marginBottom: 2 }}>Last sync</div>
              <div style={{ color: "#94a3b8", fontWeight: 600 }}>{lastSync}</div>
            </div>
            <div>
              <div style={{ color: "#334155", marginBottom: 2 }}>Invoices synced</div>
              <div style={{ color: "#94a3b8", fontWeight: 600 }}>{integration?.sync_count || 0}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingBottom: connected ? 16 : 22 }}>
          {!connected ? (
            <Btn onClick={handleConnect} style={{ background: `linear-gradient(135deg,${cfg.color},${cfg.color}cc)`, boxShadow: `0 4px 16px ${cfg.color}30` }}>
              Connect
            </Btn>
          ) : (
            <>
              <Btn onClick={() => handleSync(false)} disabled={isActive}>
                {syncing ? "Syncing…" : "Sync Now"}
              </Btn>
              <Btn variant="secondary" onClick={openConfig} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>⚙</span> {configOpen ? "Close" : "Settings"}
              </Btn>
              <Btn variant="danger" onClick={handleDisconnect}>Disconnect</Btn>
            </>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {connected && configOpen && (
        <div style={{ borderTop: "1px solid #111d2e", padding: "18px 22px 0" }}>

          {/* Drive folder navigator */}
          {type === "google_drive" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
                Sync folder
              </div>
              <DriveNavigator
                selectedFolder={selectedFolder}
                selectedFolderName={selectedFolderName || (selectedFolder ? "Selected folder" : "")}
                onSelect={(id, name) => { setSelectedFolder(id); setSelectedFolderName(name || ""); }}
              />
            </div>
          )}

          {/* Gmail label picker */}
          {type === "gmail" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".5px" }}>Labels to scan</div>
                <button onClick={reloadLabels} disabled={labelsLoading} title="Refresh"
                  style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 14, padding: 0 }}>↺</button>
              </div>
              {labelsLoading ? (
                <div style={{ color: "#475569", fontSize: 12 }}>Loading labels…</div>
              ) : !labels?.length ? (
                <div style={{ color: "#475569", fontSize: 12 }}>No custom labels found.</div>
              ) : (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {labels.map(l => (
                      <label key={l.id} style={{
                        display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                        padding: "5px 12px", borderRadius: 20, fontSize: 12,
                        background: selectedLabels.includes(l.id) ? "#6366f122" : "#0d1626",
                        border: `1px solid ${selectedLabels.includes(l.id) ? "#6366f1" : "#1e2d45"}`,
                        color: selectedLabels.includes(l.id) ? "#a78bfa" : "#64748b",
                        transition: "all .15s",
                      }}>
                        <input type="checkbox" checked={selectedLabels.includes(l.id)} onChange={() => toggleLabel(l.id)}
                          style={{ accentColor: "#6366f1", width: 12, height: 12 }} />
                        {l.name}
                      </label>
                    ))}
                  </div>
                  {selectedLabels.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#4ade80" }}>
                      ✓ {selectedLabels.length} label{selectedLabels.length !== 1 ? "s" : ""} selected (OR logic)
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Gmail additional filters */}
          {type === "gmail" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>
                Additional filters
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>Sender (from:)</div>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. invoices@vendor.com or @vendor.co.il"
                    value={fromFilter}
                    onChange={e => setFromFilter(e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>Subject contains</div>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. invoice or חשבונית"
                    value={subjFilter}
                    onChange={e => setSubjFilter(e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp webhook info */}
          {type === "whatsapp" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>Webhook URL</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#0a1628", borderRadius: 8, padding: "8px 12px", border: "1px solid #1e2d45" }}>
                <code style={{ fontSize: 11, color: "#a78bfa", flex: 1, wordBreak: "break-all" }}>
                  {window.location.origin}/api/webhook/whatsapp
                </code>
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhook/whatsapp`)}
                  style={{ padding: "3px 10px", background: "#1e2d45", border: "none", borderRadius: 6, color: "#94a3b8", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                  Copy
                </button>
              </div>
              {integration?.config?.phone_number_id && (
                <div style={{ fontSize: 11, color: "#334155", marginTop: 6 }}>Phone ID: {integration.config.phone_number_id}</div>
              )}
            </div>
          )}

          {/* Lookback window (Drive + Gmail only) */}
          {type !== "whatsapp" && type !== "green_invoice" && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>
                How far back to search
              </div>
              <select
                value={lookbackDays}
                onChange={e => setLookbackDays(Number(e.target.value))}
                className="input"
                style={{ fontSize: 12, padding: "6px 10px" }}
              >
                <option value={0}>Since last sync (smart — default)</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 3 months</option>
                <option value={180}>Last 6 months</option>
                <option value={365}>Last year</option>
                <option value={-1}>All time (may be slow)</option>
              </select>
              {lookbackDays === -1 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#fb923c" }}>
                  ⚠ All-time scan can be slow for large {type === "gmail" ? "inboxes" : "drives"}.
                </div>
              )}
              {lookbackDays === 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#475569" }}>
                  Only new items since the last successful sync are checked. Use "Resync All" below to re-scan from the beginning.
                </div>
              )}
            </div>
          )}

          {/* Auto-sync */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#94a3b8", marginBottom: 8 }}>
              <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)}
                style={{ accentColor: "#6366f1", width: 14, height: 14 }} />
              Auto-sync enabled
            </label>
            {autoSync && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "#475569" }}>Frequency:</span>
                <select value={syncFreq} onChange={e => setSyncFreq(Number(e.target.value))}
                  className="input" style={{ width: "auto", fontSize: 12, padding: "5px 10px" }}>
                  {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Save + Resync */}
          <div style={{ display: "flex", gap: 8, paddingBottom: 18 }}>
            <Btn onClick={saveConfig} disabled={savingConfig}>
              {savingConfig ? "Saving…" : "Save Settings"}
            </Btn>
            {type !== "whatsapp" && (
              <Btn variant="secondary" onClick={() => handleSync(true)} disabled={isActive} style={{ fontSize: 12 }}>
                {resyncing ? "Resyncing…" : "↺ Resync All (from beginning)"}
              </Btn>
            )}
          </div>
        </div>
      )}

      {/* Sync history */}
      {connected && (
        <div style={{ borderTop: "1px solid #0d1626", padding: "10px 22px 14px" }}>
          <button onClick={() => setHistoryOpen(h => !h)}
            style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10 }}>{historyOpen ? "▲" : "▼"}</span>
            Sync history
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

export default function IntegrationsPage({ oauthResult, onClearOAuthResult, onInvoicesRefresh, onNotificationsRefresh }) {
  const [integrations,      setIntegrations]      = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [toast,             setToast]             = useState(null);
  const [showGreenModal,    setShowGreenModal]    = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

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
      showToast(
        `${PROVIDERS[oauthResult.connected]?.label || oauthResult.connected} connected — open Settings to pick a folder or label.`,
        true
      );
    } else if (oauthResult.error) {
      showToast(`Connection failed: ${oauthResult.error}`, false);
    }
    onClearOAuthResult();
  }, [oauthResult, showToast, onClearOAuthResult]);

  const getIntegration = type => integrations.find(i => i.type === type);
  const hasAnyError    = integrations.some(i => i.status === "error");

  const handleConnectModal = type => {
    if (type === "green_invoice") setShowGreenModal(true);
    if (type === "whatsapp")      setShowWhatsAppModal(true);
  };

  if (loading) return (
    <div style={{ color: "#475569", padding: "60px 0", textAlign: "center", fontSize: 14 }}>
      Loading integrations…
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: "#f1f5f9", marginBottom: 6 }}>Auto-Sync Integrations</div>
        <div style={{ fontSize: 14, color: "#475569" }}>
          Connect your invoice sources. Cashflow will automatically pull in new invoices — no manual uploads needed.
        </div>
        {hasAnyError && (
          <div style={{ marginTop: 14, padding: "10px 16px", background: "#2d0a0a", border: "1px solid #7f1d1d", borderRadius: 10, fontSize: 13, color: "#f87171" }}>
            ⚠ One or more integrations have errors — expand the card to re-authorize.
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          marginBottom: 20, padding: "10px 16px", borderRadius: 10, fontSize: 13, animation: "fadeIn .3s",
          background: toast.ok ? "#052e16" : "#2d0a0a",
          border:     `1px solid ${toast.ok ? "#166534" : "#7f1d1d"}`,
          color:      toast.ok ? "#4ade80" : "#f87171",
        }}>
          {toast.ok ? "✓ " : "✕ "}{toast.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
        {Object.keys(PROVIDERS).map(type => (
          <IntegrationCard
            key={type}
            type={type}
            integration={getIntegration(type)}
            onRefresh={load}
            onInvoicesRefresh={onInvoicesRefresh}
            onNotificationsRefresh={onNotificationsRefresh}
            showToast={showToast}
            onConnectModal={handleConnectModal}
          />
        ))}
      </div>

      {showGreenModal && (
        <GreenInvoiceModal
          onClose={() => setShowGreenModal(false)}
          onSave={() => { setShowGreenModal(false); load(); showToast("Green Invoice connected", true); }}
        />
      )}
      {showWhatsAppModal && (
        <WhatsAppModal
          onClose={() => setShowWhatsAppModal(false)}
          onSave={() => { setShowWhatsAppModal(false); load(); showToast("WhatsApp Business connected", true); }}
        />
      )}
    </div>
  );
}
