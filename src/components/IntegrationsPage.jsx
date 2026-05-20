import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const apiCall = async (path, opts = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
};

const INTEGRATION_META = {
  google_drive: {
    label:       "Google Drive",
    icon:        "📁",
    description: "Watch a Google Drive folder and automatically import new invoices. PDFs and images are extracted with AI.",
    color:       "#4285F4",
  },
  gmail: {
    label:       "Gmail",
    icon:        "📧",
    description: "Scan your Gmail inbox for invoice attachments from suppliers and import them automatically.",
    color:       "#EA4335",
  },
  green_invoice: {
    label:       "Green Invoice",
    icon:        "🟢",
    description: "חשבונית ירוקה — pull received expense documents directly from your Green Invoice account.",
    color:       "#34d399",
  },
  whatsapp: {
    label:      "WhatsApp",
    icon:       "💬",
    description:"Receive invoice photos from suppliers via WhatsApp and auto-import them. Requires WhatsApp Business API setup.",
    color:      "#25D366",
    comingSoon: true,
  },
  bizzibox: {
    label:      "Bizzibox",
    icon:       "📊",
    description:"Connect your Bizzibox account to sync supplier invoices. Contact us to set up the integration.",
    color:      "#6366f1",
    comingSoon: true,
  },
};

const defaultSyncFrom = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
};

// Extract folder ID from a Google Drive folder URL or treat as raw ID
const extractFolderId = raw => {
  if (!raw) return null;
  const m = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw.trim() || null;
};

function StatusBadge({ status, setupComplete }) {
  if (status === "connected" && !setupComplete) {
    return (
      <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px",
        borderRadius:99, background:"#1c1a00", color:"#facc15", fontSize:11, fontWeight:600 }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:"#eab308", display:"inline-block" }} />
        Setup required
      </span>
    );
  }
  const cfg = {
    connected:    { bg:"#052e16", color:"#4ade80", dot:"#22c55e", label:"Connected"    },
    disconnected: { bg:"#1e1b40", color:"#a78bfa", dot:"#818cf8", label:"Disconnected" },
    error:        { bg:"#2d0a0a", color:"#f87171", dot:"#ef4444", label:"Error"         },
  }[status] || { bg:"#1e1b40", color:"#94a3b8", dot:"#64748b", label: status };

  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px",
      borderRadius:99, background:cfg.bg, color:cfg.color, fontSize:11, fontWeight:600 }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:cfg.dot, display:"inline-block" }} />
      {cfg.label}
    </span>
  );
}

// ─── Setup wizard shown after OAuth / credential entry ────────────────────────

function SetupWizard({ type, integration, onComplete }) {
  const [folderUrl,  setFolderUrl]  = useState("");
  const [syncFrom,   setSyncFrom]   = useState(defaultSyncFrom());
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState(null);

  const complete = async () => {
    setSaving(true);
    setError(null);
    try {
      const config = {
        ...integration.config,
        setup_complete: true,
        sync_from:      syncFrom,
        folder_id:      type === "google_drive" ? extractFolderId(folderUrl) : undefined,
      };
      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body:   JSON.stringify({ config }),
      });
      onComplete({ ...integration, config });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%", background:"#0d1626", border:"1px solid #1e2d45", borderRadius:6,
    padding:"8px 10px", color:"#e2e8f0", fontSize:13, outline:"none", boxSizing:"border-box",
  };
  const labelStyle = { fontSize:11, fontWeight:600, color:"#64748b", marginBottom:4,
    display:"block", textTransform:"uppercase", letterSpacing:".5px" };

  return (
    <div style={{ marginTop:16, padding:16, borderRadius:8, background:"#060d1a",
      border:"1px solid #1e2d45", display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ fontSize:12, fontWeight:600, color:"#94a3b8" }}>
        Almost there — complete setup to start syncing
      </div>

      {type === "google_drive" && (
        <div>
          <label style={labelStyle}>Which folder to watch</label>
          <input
            value={folderUrl}
            onChange={e => setFolderUrl(e.target.value)}
            placeholder="Paste Google Drive folder URL, or leave blank to watch all files"
            style={inputStyle}
          />
          <div style={{ fontSize:11, color:"#334155", marginTop:5 }}>
            Tip: open the folder in Drive, copy the URL from the address bar and paste it here.
            Leave blank to import from your entire Drive (not recommended for large accounts).
          </div>
        </div>
      )}

      {type === "gmail" && (
        <div>
          <div style={{ fontSize:12, color:"#475569" }}>
            We'll scan your inbox for emails that have PDF or image attachments and look like invoices.
            Only attachments — not email content — are sent for processing.
          </div>
        </div>
      )}

      <div>
        <label style={labelStyle}>Import invoices from this date onwards</label>
        <input
          type="date"
          value={syncFrom}
          onChange={e => setSyncFrom(e.target.value)}
          style={{ ...inputStyle, width:"auto", colorScheme:"dark" }}
        />
        <div style={{ fontSize:11, color:"#334155", marginTop:5 }}>
          Only files modified on or after this date will be imported. Defaults to 1 month ago.
        </div>
      </div>

      {error && <div style={{ color:"#f87171", fontSize:12 }}>{error}</div>}

      <button onClick={complete} disabled={saving}
        style={{ alignSelf:"flex-start", padding:"8px 20px", borderRadius:6,
          background:"linear-gradient(135deg,#6366f1,#a78bfa)", color:"#fff",
          border:"none", fontSize:13, cursor:"pointer", fontWeight:600, opacity:saving?0.7:1 }}>
        {saving ? "Saving…" : "Complete setup →"}
      </button>
    </div>
  );
}

// ─── Green Invoice credential form ───────────────────────────────────────────

function GreenInvoiceForm({ onConnected }) {
  const [apiKey,    setApiKey]    = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);

  const connect = async () => {
    if (!apiKey || !apiSecret) { setError("Both fields are required"); return; }
    setSaving(true); setError(null);
    try {
      await apiCall("/api/integrations/green-invoice", {
        method: "POST",
        body:   JSON.stringify({ apiKey, apiSecret }),
      });
      onConnected();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width:"100%", background:"#0d1626", border:"1px solid #1e2d45", borderRadius:6,
    padding:"8px 10px", color:"#e2e8f0", fontSize:13, outline:"none", boxSizing:"border-box",
  };

  return (
    <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:8 }}>
      <input value={apiKey} onChange={e => setApiKey(e.target.value)}
        placeholder="Green Invoice API ID" style={inputStyle} />
      <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)}
        placeholder="Green Invoice API Secret" style={inputStyle} />
      {error && <div style={{ color:"#f87171", fontSize:11 }}>{error}</div>}
      <button onClick={connect} disabled={saving}
        style={{ alignSelf:"flex-start", padding:"7px 16px", borderRadius:6,
          background:"linear-gradient(135deg,#34d39988,#34d399)", color:"#fff",
          border:"none", fontSize:12, cursor:"pointer", fontWeight:600 }}>
        {saving ? "Connecting…" : "Connect"}
      </button>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

function IntegrationCard({ type, integration, onSync, onDisconnect, onUpdate }) {
  const meta         = INTEGRATION_META[type];
  const [syncing,    setSyncing]    = useState(false);
  const [showForm,   setShowForm]   = useState(false);
  const [lastAdded,  setLastAdded]  = useState(null);

  const isConnected    = integration?.status === "connected";
  const setupComplete  = integration?.config?.setup_complete === true;
  const isReady        = isConnected && setupComplete;

  const handleConnect = async () => {
    if (type === "google_drive" || type === "gmail") {
      try {
        const returnUrl = encodeURIComponent(window.location.origin);
        const { url } = await apiCall(`/api/integrations/google/auth-url?type=${type}&returnUrl=${returnUrl}`);
        window.location.href = url;
      } catch (err) { alert(err.message); }
    } else if (type === "green_invoice") {
      setShowForm(true);
    }
  };

  const handleSync = async () => {
    setSyncing(true); setLastAdded(null);
    try {
      const { added } = await apiCall(`/api/integrations/${integration.id}/sync`, { method: "POST" });
      setLastAdded(added);
      onSync();
    } catch (err) {
      alert(`Sync failed: ${err.message}`);
      onSync();
    } finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${meta.label}?`)) return;
    try {
      await apiCall(`/api/integrations/${integration.id}`, { method: "DELETE" });
      onDisconnect(type);
    } catch (err) { alert(err.message); }
  };

  return (
    <div style={{ background:"#0a1120", border:`1px solid ${isConnected && !setupComplete ? "#2a2200" : "#1e2d45"}`,
      borderRadius:12, padding:20 }}>

      {/* Header row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
        <div style={{ display:"flex", gap:12, alignItems:"flex-start", flex:1 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:`${meta.color}18`,
            display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
            {meta.icon}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
              <span style={{ fontWeight:700, fontSize:14, color:"#e2e8f0" }}>{meta.label}</span>
              {meta.comingSoon
                ? <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99,
                    background:"#1e2d45", color:"#64748b", fontWeight:600 }}>COMING SOON</span>
                : <StatusBadge status={integration?.status || "disconnected"} setupComplete={setupComplete} />
              }
            </div>
            <div style={{ fontSize:12, color:"#475569", lineHeight:1.5 }}>{meta.description}</div>

            {integration?.error_message && (
              <div style={{ marginTop:6, fontSize:11, color:"#f87171" }}>
                Error: {integration.error_message}
              </div>
            )}
            {isReady && integration.last_sync && (
              <div style={{ marginTop:4, fontSize:11, color:"#334155" }}>
                Last sync: {new Date(integration.last_sync).toLocaleString("he-IL")}
                {" · "}{integration.sync_count || 0} invoices imported
              </div>
            )}
            {isReady && integration.config?.sync_from && !integration.last_sync && (
              <div style={{ marginTop:4, fontSize:11, color:"#334155" }}>
                Ready — will import invoices from {integration.config.sync_from} onwards
              </div>
            )}
            {lastAdded !== null && (
              <div style={{ marginTop:4, fontSize:11, color: lastAdded > 0 ? "#4ade80" : "#94a3b8" }}>
                {lastAdded > 0 ? `✓ ${lastAdded} new invoice${lastAdded !== 1 ? "s" : ""} added` : "No new invoices found"}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {!meta.comingSoon && (
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            {isReady ? (
              <>
                <button onClick={handleSync} disabled={syncing}
                  style={{ padding:"6px 14px", borderRadius:6, background:"#131c2e",
                    color:"#a78bfa", border:"1px solid #2d1d5e", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                  {syncing ? "Syncing…" : "↺ Sync now"}
                </button>
                <button onClick={handleDisconnect}
                  style={{ padding:"6px 14px", borderRadius:6, background:"#1a0a0a",
                    color:"#f87171", border:"1px solid #7f1d1d", fontSize:12, cursor:"pointer" }}>
                  Disconnect
                </button>
              </>
            ) : !isConnected ? (
              <button onClick={handleConnect}
                style={{ padding:"7px 16px", borderRadius:6,
                  background:`linear-gradient(135deg,${meta.color}cc,${meta.color})`,
                  color:"#fff", border:"none", fontSize:12, cursor:"pointer", fontWeight:600 }}>
                Connect
              </button>
            ) : null /* connected but not set up — wizard shown below */}
          </div>
        )}
      </div>

      {/* Setup wizard — shown after OAuth returns but before setup is complete */}
      {isConnected && !setupComplete && (
        <SetupWizard
          type={type}
          integration={integration}
          onComplete={updated => onUpdate(updated)}
        />
      )}

      {/* Green Invoice credential form */}
      {!isConnected && showForm && type === "green_invoice" && (
        <GreenInvoiceForm onConnected={() => { setShowForm(false); onSync(); }} />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IntegrationsPage({ oauthResult }) {
  const [integrations, setIntegrations] = useState({});
  const [loading,      setLoading]      = useState(true);
  const [notice,       setNotice]       = useState(null);

  const load = useCallback(async () => {
    try {
      const { integrations: list } = await apiCall("/api/integrations");
      const map = {};
      list.forEach(i => { map[i.type] = i; });
      setIntegrations(map);
    } catch (err) {
      console.error("integrations load:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!oauthResult) return;
    if (oauthResult.connected) {
      const label = INTEGRATION_META[oauthResult.connected]?.label || oauthResult.connected;
      setNotice({ ok: true, text: `✓ ${label} connected — complete the setup below to start syncing` });
      load();
    } else if (oauthResult.error) {
      setNotice({ ok: false, text: `Connection failed: ${oauthResult.error}` });
    }
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [oauthResult, load]);

  const handleDisconnect = type => setIntegrations(p => { const n = { ...p }; delete n[type]; return n; });

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontWeight:700, fontSize:20, color:"#f1f5f9", marginBottom:6 }}>Integrations</div>
        <div style={{ fontSize:13, color:"#475569" }}>
          Connect data sources to automatically import invoices — no manual upload needed.
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom:20, padding:"10px 16px", borderRadius:8,
          background: notice.ok ? "#052e16" : "#2d0a0a",
          border:`1px solid ${notice.ok ? "#166534" : "#7f1d1d"}`,
          color: notice.ok ? "#4ade80" : "#f87171", fontSize:13 }}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div style={{ color:"#475569", fontSize:13 }}>Loading…</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {Object.keys(INTEGRATION_META).map(type => (
            <IntegrationCard
              key={type}
              type={type}
              integration={integrations[type] || null}
              onSync={load}
              onDisconnect={handleDisconnect}
              onUpdate={updated => setIntegrations(p => ({ ...p, [updated.type]: updated }))}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop:28, padding:16, borderRadius:8, background:"#080e1a",
        border:"1px solid #111d2e", fontSize:12, color:"#334155", lineHeight:1.7 }}>
        <div style={{ fontWeight:600, color:"#475569", marginBottom:4 }}>How syncing works</div>
        Each connected source is checked when you click "Sync now". New invoices are extracted using AI,
        matched to your supplier list, and deduplicated automatically — invoices already in the system
        are never added twice. All imports are visible immediately in the Invoices tab.
      </div>
    </div>
  );
}
