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
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
};

// ─── Static config per integration type ─────────────────────────────────────

const SOURCE_CONFIG = {
  google_drive: {
    label:       "Google Drive",
    icon:        "📁",
    description: "Sync invoice PDFs and images from your Drive folders automatically.",
    color:       "#4285f4",
  },
  gmail: {
    label:       "Gmail",
    icon:        "✉️",
    description: "Extract invoice attachments from your Gmail labels.",
    color:       "#ea4335",
  },
  green_invoice: {
    label:       "Green Invoice",
    icon:        "🟢",
    description: "Import invoices directly from your חשבונית ירוקה account.",
    color:       "#34d399",
  },
  whatsapp: {
    label:       "WhatsApp Business",
    icon:        "💬",
    description: "Receive invoice images and PDFs sent by vendors on WhatsApp.",
    color:       "#25d366",
  },
};

const FREQ_OPTIONS = [
  { label: "Every hour",  value: 60  },
  { label: "Every 4h",   value: 240 },
  { label: "Once a day", value: 1440 },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    connected:    { bg: "#052e16", color: "#4ade80", dot: "#4ade80", label: "Connected" },
    disconnected: { bg: "#0d1626", color: "#475569", dot: "#334155", label: "Disconnected" },
    error:        { bg: "#2d0a0a", color: "#f87171", dot: "#f87171", label: "Error" },
  };
  const s = styles[status] || styles.disconnected;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20,
      background:s.bg, color:s.color, fontSize:11, fontWeight:700, letterSpacing:".4px" }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:s.dot }} />
      {s.label}
    </span>
  );
}

// ─── Sync event timeline ─────────────────────────────────────────────────────

function EventTimeline({ integrationId }) {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/integrations/${integrationId}/events`)
      .then(d => setEvents(d.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [integrationId]);

  const icon = type => ({
    saved:          { icon: "✓", color: "#4ade80" },
    dedup_skipped:  { icon: "⊘", color: "#94a3b8" },
    ocr_failed:     { icon: "✕", color: "#f87171" },
    download_failed:{ icon: "↯", color: "#fb923c" },
  }[type] || { icon: "·", color: "#475569" });

  if (loading) return <div style={{ color:"#475569", fontSize:12, padding:"8px 0" }}>Loading history…</div>;
  if (!events?.length) return <div style={{ color:"#475569", fontSize:12, padding:"8px 0" }}>No sync events yet.</div>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:220, overflowY:"auto" }}>
      {events.map(ev => {
        const { icon: ic, color } = icon(ev.event_type);
        const ts = new Date(ev.created_at).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
        return (
          <div key={ev.id} style={{ display:"flex", gap:10, alignItems:"flex-start", fontSize:12 }}>
            <span style={{ color, fontWeight:700, flexShrink:0, marginTop:1, fontSize:11 }}>{ic}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <span style={{ color:"#94a3b8" }}>{ev.source_file || ev.event_type}</span>
              {ev.error_message && <div style={{ color:"#f87171", fontSize:11 }}>{ev.error_message}</div>}
            </div>
            <span style={{ color:"#334155", flexShrink:0, fontSize:11 }}>{ts}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Green Invoice modal ─────────────────────────────────────────────────────

function GreenInvoiceModal({ onClose, onSave }) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

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
      <div className="modal" style={{ maxWidth:400 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:16, color:"#f1f5f9" }}>🟢 Connect Green Invoice</div>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:8, background:"#131c2e", border:"1px solid #1e2d45", color:"#64748b", cursor:"pointer", fontSize:14 }}>✕</button>
        </div>
        <p style={{ fontSize:13, color:"#64748b", marginBottom:18 }}>
          Enter your Green Invoice API credentials. Find them in your account settings at greeninvoice.co.il.
        </p>
        {[["API Key", apiKey, setApiKey], ["API Secret", apiSecret, setApiSecret]].map(([label, val, setter]) => (
          <div key={label} style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>{label}</div>
            <input type="text" value={val} className="input" onChange={e => setter(e.target.value)} />
          </div>
        ))}
        {err && <div style={{ color:"#f87171", fontSize:12, marginBottom:12 }}>{err}</div>}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"9px 18px", background:"#131c2e", border:"1px solid #1e2d45", borderRadius:10, color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding:"9px 20px", background:"linear-gradient(135deg,#34d399,#059669)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
            {saving ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp modal ──────────────────────────────────────────────────────────

function WhatsAppModal({ onClose, onSave }) {
  const [apiToken, setApiToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
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
      <div className="modal" style={{ maxWidth:460 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:16, color:"#f1f5f9" }}>💬 Connect WhatsApp Business</div>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:8, background:"#131c2e", border:"1px solid #1e2d45", color:"#64748b", cursor:"pointer", fontSize:14 }}>✕</button>
        </div>
        <p style={{ fontSize:13, color:"#64748b", marginBottom:16 }}>
          Enter your WhatsApp Business API credentials from the Meta for Developers console.
        </p>

        <div style={{ marginBottom:16, background:"#0d1626", borderRadius:10, padding:"12px 14px", border:"1px solid #1e2d45" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Webhook URL (paste into Meta console)</div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <code style={{ fontSize:11, color:"#a78bfa", flex:1, wordBreak:"break-all" }}>{webhookUrl}</code>
            <button onClick={() => navigator.clipboard.writeText(webhookUrl)}
              style={{ padding:"4px 10px", background:"#1e2d45", border:"1px solid #334155", borderRadius:6, color:"#94a3b8", cursor:"pointer", fontSize:11, fontFamily:"inherit", flexShrink:0 }}>
              Copy
            </button>
          </div>
        </div>

        {[
          ["Permanent Access Token", apiToken, setApiToken, "From Meta → WhatsApp → API Setup"],
          ["Phone Number ID", phoneNumberId, setPhoneNumberId, "From Meta → WhatsApp → API Setup"],
          ["Webhook Verify Token / Secret", webhookSecret, setWebhookSecret, "You create this — paste same value in Meta console"],
        ].map(([label, val, setter, hint]) => (
          <div key={label} style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:4, textTransform:"uppercase", letterSpacing:".5px" }}>{label}</div>
            {hint && <div style={{ fontSize:11, color:"#334155", marginBottom:5 }}>{hint}</div>}
            <input type="text" value={val} className="input" onChange={e => setter(e.target.value)} />
          </div>
        ))}

        {err && <div style={{ color:"#f87171", fontSize:12, marginBottom:12 }}>{err}</div>}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"9px 18px", background:"#131c2e", border:"1px solid #1e2d45", borderRadius:10, color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding:"9px 20px", background:"linear-gradient(135deg,#25d366,#128c7e)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
            {saving ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Integration card ────────────────────────────────────────────────────────

function IntegrationCard({ type, integration, onRefresh, showToast }) {
  const cfg           = SOURCE_CONFIG[type];
  const connected     = integration?.status === "connected";
  const hasError      = integration?.status === "error";
  const [syncing, setSyncing]         = useState(false);
  const [resyncing, setResyncing]     = useState(false);
  const [expanded, setExpanded]       = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [folders, setFolders]         = useState(null);
  const [labels, setLabels]           = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(integration?.config?.folder_id || "");
  const [selectedLabels, setSelectedLabels] = useState(integration?.config?.label_ids || []);
  const [autoSync, setAutoSync]       = useState(integration?.auto_sync_enabled || false);
  const [syncFreq, setSyncFreq]       = useState(integration?.sync_frequency_min || 60);
  const [savingConfig, setSavingConfig] = useState(false);

  const lastSync = integration?.last_sync
    ? new Date(integration.last_sync).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })
    : "Never";

  const loadFolders = useCallback(async () => {
    if (folders !== null) return;
    try { setFolders((await apiFetch("/api/integrations/google/folders")).folders); }
    catch { setFolders([]); }
  }, [folders]);

  const loadLabels = useCallback(async () => {
    if (labels !== null) return;
    try { setLabels((await apiFetch("/api/integrations/google/labels")).labels); }
    catch { setLabels([]); }
  }, [labels]);

  const handleExpand = () => {
    setExpanded(e => !e);
    if (!expanded) {
      if (type === "google_drive") loadFolders();
      if (type === "gmail")        loadLabels();
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const config = type === "google_drive" ? { folder_id: selectedFolder }
                   : type === "gmail"        ? { label_ids: selectedLabels }
                   : integration?.config || {};
      await apiFetch(`/api/integrations/${integration.id}/config`, { method: "PATCH", body: { config } });
      await apiFetch(`/api/integrations/${integration.id}/auto-sync`, {
        method: "PATCH",
        body: { auto_sync_enabled: autoSync, sync_frequency_min: syncFreq },
      });
      showToast("✓ Settings saved", true);
      onRefresh();
    } catch (e) { showToast(e.message, false); }
    finally { setSavingConfig(false); }
  };

  const handleSync = async (isResync = false) => {
    if (isResync) {
      if (!confirm("This will re-process all historical files and may add duplicates if any slipped through. Continue?")) return;
      setResyncing(true);
    } else {
      setSyncing(true);
    }
    try {
      const endpoint = isResync ? `/api/integrations/${integration.id}/resync` : `/api/integrations/${integration.id}/sync`;
      const { added } = await apiFetch(endpoint, { method: "POST" });
      showToast(`✓ ${added} new invoice${added !== 1 ? "s" : ""} added from ${cfg.label}`, true);
      onRefresh();
    } catch (e) { showToast(e.message, false); }
    finally { setSyncing(false); setResyncing(false); }
  };

  const handleConnect = async () => {
    if (type === "green_invoice" || type === "whatsapp") return; // handled by parent modal
    try {
      const returnUrl = window.location.origin;
      const { url } = await apiFetch(`/api/integrations/google/auth-url?type=${type}&returnUrl=${encodeURIComponent(returnUrl)}`);
      window.location.href = url;
    } catch (e) { showToast(e.message, false); }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${cfg.label}? Existing invoices are not deleted.`)) return;
    try {
      await apiFetch(`/api/integrations/${integration.id}`, { method: "DELETE" });
      showToast(`${cfg.label} disconnected`, true);
      onRefresh();
    } catch (e) { showToast(e.message, false); }
  };

  const toggleLabel = id => setSelectedLabels(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const cardBorder = syncing || resyncing ? `1px solid ${cfg.color}55` : hasError ? "1px solid #7f1d1d" : "1px solid #111d2e";

  return (
    <div className="card" style={{ border:cardBorder, transition:"border-color .3s", position:"relative",
      ...(syncing || resyncing ? { boxShadow:`0 0 20px ${cfg.color}15` } : {}) }}>

      {/* Sync progress pulse */}
      {(syncing || resyncing) && (
        <div style={{ position:"absolute", top:0, left:0, right:0, height:2, borderRadius:"10px 10px 0 0",
          background:`linear-gradient(90deg, transparent, ${cfg.color}, transparent)`,
          animation:"shimmer 1.5s infinite" }} />
      )}

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
        <div style={{ width:42, height:42, borderRadius:12, background:`${cfg.color}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
          {cfg.icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>{cfg.label}</div>
          <div style={{ fontSize:12, color:"#475569", marginTop:1 }}>{cfg.description}</div>
        </div>
        <StatusBadge status={integration?.status || "disconnected"} />
      </div>

      {/* Error message */}
      {hasError && integration?.error_message && (
        <div style={{ background:"#2d0a0a", border:"1px solid #7f1d1d", borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:12, color:"#f87171" }}>
          ⚠ {integration.error_message}
          {(type === "google_drive" || type === "gmail") && (
            <button onClick={handleConnect} style={{ marginLeft:10, color:"#a78bfa", background:"none", border:"none", cursor:"pointer", fontSize:12, fontFamily:"inherit", textDecoration:"underline" }}>
              Re-authorize
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      {connected && (
        <div style={{ display:"flex", gap:20, marginBottom:14, fontSize:12, color:"#475569" }}>
          <span>Last sync: <strong style={{ color:"#94a3b8" }}>{lastSync}</strong></span>
          <span>Invoices synced: <strong style={{ color:"#94a3b8" }}>{integration?.sync_count || 0}</strong></span>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom: connected ? 12 : 0 }}>
        {!connected ? (
          <button onClick={handleConnect}
            style={{ padding:"9px 20px", background:`linear-gradient(135deg,${cfg.color},${cfg.color}cc)`, border:"none",
              borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13, boxShadow:`0 4px 15px ${cfg.color}33` }}>
            Connect
          </button>
        ) : (
          <>
            <button onClick={() => handleSync(false)} disabled={syncing || resyncing}
              style={{ padding:"8px 18px", background:"#6366f1", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13, opacity: syncing ? .7 : 1 }}>
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
            <button onClick={handleExpand}
              style={{ padding:"8px 14px", background:"#131c2e", border:"1px solid #1e2d45", borderRadius:10, color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
              {expanded ? "▲ Settings" : "▼ Settings"}
            </button>
            <button onClick={handleDisconnect}
              style={{ padding:"8px 14px", background:"#2d0a0a", border:"1px solid #7f1d1d", borderRadius:10, color:"#f87171", cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
              Disconnect
            </button>
          </>
        )}
      </div>

      {/* Expandable settings */}
      {connected && expanded && (
        <div style={{ borderTop:"1px solid #111d2e", paddingTop:14, marginTop:4 }}>

          {/* Google Drive folder picker */}
          {type === "google_drive" && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Sync from folder</div>
              {folders === null ? (
                <div style={{ color:"#475569", fontSize:12 }}>Loading folders…</div>
              ) : (
                <select value={selectedFolder} className="input" onChange={e => setSelectedFolder(e.target.value)}>
                  <option value="">— All files in Drive —</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Gmail label picker */}
          {type === "gmail" && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Sync from labels</div>
              {labels === null ? (
                <div style={{ color:"#475569", fontSize:12 }}>Loading labels…</div>
              ) : labels.length === 0 ? (
                <div style={{ color:"#475569", fontSize:12 }}>No custom labels found.</div>
              ) : (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {labels.map(l => (
                    <label key={l.id} style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer",
                      padding:"4px 10px", borderRadius:20, fontSize:12,
                      background: selectedLabels.includes(l.id) ? "#6366f122" : "#0d1626",
                      border: `1px solid ${selectedLabels.includes(l.id) ? "#6366f1" : "#1e2d45"}`,
                      color: selectedLabels.includes(l.id) ? "#a78bfa" : "#64748b" }}>
                      <input type="checkbox" checked={selectedLabels.includes(l.id)} onChange={() => toggleLabel(l.id)}
                        style={{ accentColor:"#6366f1", width:12, height:12 }} />
                      {l.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WhatsApp webhook URL */}
          {type === "whatsapp" && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Webhook URL</div>
              <div style={{ display:"flex", gap:8, alignItems:"center", background:"#0d1626", borderRadius:8, padding:"8px 12px", border:"1px solid #1e2d45" }}>
                <code style={{ fontSize:11, color:"#a78bfa", flex:1, wordBreak:"break-all" }}>
                  {window.location.origin}/api/webhook/whatsapp
                </code>
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhook/whatsapp`)}
                  style={{ padding:"3px 10px", background:"#1e2d45", border:"none", borderRadius:6, color:"#94a3b8", cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>
                  Copy
                </button>
              </div>
              <div style={{ fontSize:11, color:"#334155", marginTop:6 }}>Phone Number ID: {integration?.config?.phone_number_id || "—"}</div>
            </div>
          )}

          {/* Auto-sync settings */}
          <div style={{ marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, color:"#94a3b8" }}>
                <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)}
                  style={{ accentColor:"#6366f1", width:14, height:14 }} />
                Auto-sync enabled
              </label>
            </div>
            {autoSync && (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ fontSize:12, color:"#475569" }}>Frequency:</div>
                <select value={syncFreq} onChange={e => setSyncFreq(Number(e.target.value))} className="input" style={{ width:"auto", fontSize:12, padding:"5px 10px" }}>
                  {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Save + Resync row */}
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={saveConfig} disabled={savingConfig}
              style={{ padding:"8px 18px", background:"linear-gradient(135deg,#6366f1,#a78bfa)", border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
              {savingConfig ? "Saving…" : "Save Settings"}
            </button>
            {type !== "whatsapp" && (
              <button onClick={() => handleSync(true)} disabled={syncing || resyncing}
                style={{ padding:"8px 14px", background:"#0d1626", border:"1px solid #1e2d45", borderRadius:10, color:"#64748b", cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>
                {resyncing ? "Resyncing…" : "↺ Resync All"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sync history toggle */}
      {connected && (
        <div style={{ marginTop:12, borderTop:"1px solid #0d1626", paddingTop:10 }}>
          <button onClick={() => setShowHistory(h => !h)}
            style={{ background:"none", border:"none", color:"#334155", cursor:"pointer", fontFamily:"inherit", fontSize:12, padding:0 }}>
            {showHistory ? "▲ Hide" : "▼ Sync history"}
          </button>
          {showHistory && (
            <div style={{ marginTop:10 }}>
              <EventTimeline integrationId={integration.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function IntegrationsPage({ oauthResult, onClearOAuthResult }) {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState(null);
  const [showGreenModal, setShowGreenModal]   = useState(false);
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

  // Show OAuth result toast on mount (passed from App via URL param)
  useEffect(() => {
    if (!oauthResult) return;
    if (oauthResult.connected) {
      showToast(`✓ ${SOURCE_CONFIG[oauthResult.connected]?.label || oauthResult.connected} connected successfully`, true);
    } else if (oauthResult.error) {
      showToast(`Connection failed: ${oauthResult.error}`, false);
    }
    onClearOAuthResult();
  }, [oauthResult, showToast, onClearOAuthResult]);

  const getIntegration = type => integrations.find(i => i.type === type);

  const handleConnectClick = type => {
    if (type === "green_invoice") return setShowGreenModal(true);
    if (type === "whatsapp")      return setShowWhatsAppModal(true);
    // Google types handled inside the card
  };

  const hasAnyError = integrations.some(i => i.status === "error");

  if (loading) return (
    <div style={{ color:"#475569", padding:"60px 0", textAlign:"center", fontSize:14 }}>Loading integrations…</div>
  );

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom:32 }}>
        <div style={{ fontWeight:800, fontSize:22, color:"#f1f5f9", marginBottom:6 }}>Auto-Sync Integrations</div>
        <div style={{ fontSize:14, color:"#475569" }}>
          Connect your invoice sources and let Cashflow automatically pull in new invoices — no manual uploads needed.
        </div>
        {hasAnyError && (
          <div style={{ marginTop:12, padding:"10px 16px", background:"#2d0a0a", border:"1px solid #7f1d1d", borderRadius:10, fontSize:13, color:"#f87171" }}>
            ⚠ One or more integrations have errors. Expand the card to re-authorize.
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ marginBottom:20, padding:"10px 16px", borderRadius:10, fontSize:13, animation:"fadeIn .3s",
          background: toast.ok ? "#052e16" : "#2d0a0a",
          border:     `1px solid ${toast.ok ? "#166534" : "#7f1d1d"}`,
          color:      toast.ok ? "#4ade80" : "#f87171" }}>
          {toast.text}
        </div>
      )}

      {/* Integration cards grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:20 }}>
        {Object.keys(SOURCE_CONFIG).map(type => {
          const integration = getIntegration(type);
          const connected   = integration?.status === "connected";
          return (
            <div key={type}>
              {/* Show connect button outside card for disconnected non-Google types */}
              {!connected && (type === "green_invoice" || type === "whatsapp") ? (
                <div className="card" style={{ border:"1px solid #111d2e" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                    <div style={{ width:42, height:42, borderRadius:12, background:`${SOURCE_CONFIG[type].color}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>
                      {SOURCE_CONFIG[type].icon}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:"#f1f5f9" }}>{SOURCE_CONFIG[type].label}</div>
                      <div style={{ fontSize:12, color:"#475569", marginTop:1 }}>{SOURCE_CONFIG[type].description}</div>
                    </div>
                    <StatusBadge status="disconnected" />
                  </div>
                  <button onClick={() => handleConnectClick(type)}
                    style={{ padding:"9px 20px", background:`linear-gradient(135deg,${SOURCE_CONFIG[type].color},${SOURCE_CONFIG[type].color}cc)`,
                      border:"none", borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13,
                      boxShadow:`0 4px 15px ${SOURCE_CONFIG[type].color}33` }}>
                    Connect
                  </button>
                </div>
              ) : (
                <IntegrationCard
                  type={type}
                  integration={integration}
                  onRefresh={load}
                  showToast={showToast}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {showGreenModal && (
        <GreenInvoiceModal
          onClose={() => setShowGreenModal(false)}
          onSave={() => { setShowGreenModal(false); load(); showToast("✓ Green Invoice connected", true); }}
        />
      )}
      {showWhatsAppModal && (
        <WhatsAppModal
          onClose={() => setShowWhatsAppModal(false)}
          onSave={() => { setShowWhatsAppModal(false); load(); showToast("✓ WhatsApp Business connected", true); }}
        />
      )}
    </div>
  );
}
