import { useState, useEffect, useCallback, useRef } from "react";
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
    description: "Watch a Google Drive folder and automatically import new invoices.",
    color:       "#4285F4",
  },
  gmail: {
    label:       "Gmail",
    icon:        "📧",
    description: "Scan your Gmail inbox for invoice attachments from suppliers.",
    color:       "#EA4335",
  },
  green_invoice: {
    label:       "Green Invoice",
    icon:        "🟢",
    description: "חשבונית ירוקה — pull received expense documents from your Green Invoice account.",
    color:       "#34d399",
  },
  whatsapp: {
    label:       "WhatsApp",
    icon:        "💬",
    description: "Suppliers send invoice photos over WhatsApp — they're imported automatically.",
    color:       "#25D366",
  },
  bizzibox: {
    label:      "Bizzibox",
    icon:       "📊",
    description:"Connect your Bizzibox account to sync supplier invoices.",
    color:      "#6366f1",
    comingSoon: true,
  },
};

const defaultSyncFrom = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
};

const extractFolderId = raw => {
  if (!raw) return null;
  const m = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : raw.trim() || null;
};

const normalizeIsraeliPhone = raw => {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("972") && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 10) return `+972${digits.slice(1)}`;
  if (digits.length >= 9) return `+972${digits}`;
  return raw;
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", background: "#0d1626", border: "1px solid #1e2d45", borderRadius: 6,
  padding: "8px 10px", color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box",
};
const labelStyle = {
  fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4,
  display: "block", textTransform: "uppercase", letterSpacing: ".5px",
};

function StepIndicator({ steps, current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
      {steps.map((label, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 22, height: 22, borderRadius: "50%", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
            background: i < current ? "#6366f1" : i === current ? "linear-gradient(135deg,#6366f1,#a78bfa)" : "#131c2e",
            color: i <= current ? "#fff" : "#334155",
            border: i === current ? "none" : "1px solid #1e2d45",
            flexShrink: 0,
          }}>
            {i < current ? "✓" : i + 1}
          </div>
          <span style={{ fontSize: 11, color: i === current ? "#a78bfa" : i < current ? "#4ade80" : "#334155", whiteSpace: "nowrap" }}>
            {label}
          </span>
          {i < steps.length - 1 && (
            <div style={{ width: 24, height: 1, background: i < current ? "#6366f140" : "#1e2d45", flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
}

function WizardShell({ children, onBack, onNext, onComplete, nextLabel, completeLabel, saving, error, canNext = true }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {children}
      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        {onBack && (
          <button onClick={onBack}
            style={{ padding: "7px 14px", borderRadius: 6, background: "#131c2e", color: "#64748b",
              border: "1px solid #1e2d45", fontSize: 12, cursor: "pointer" }}>
            ← Back
          </button>
        )}
        {onNext && (
          <button onClick={onNext} disabled={!canNext || saving}
            style={{ padding: "7px 16px", borderRadius: 6, background: canNext ? "linear-gradient(135deg,#6366f1,#a78bfa)" : "#131c2e",
              color: canNext ? "#fff" : "#334155", border: "none", fontSize: 12, cursor: canNext ? "pointer" : "default",
              fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Loading…" : (nextLabel || "Next →")}
          </button>
        )}
        {onComplete && (
          <button onClick={onComplete} disabled={!canNext || saving}
            style={{ padding: "7px 16px", borderRadius: 6, background: canNext ? "linear-gradient(135deg,#6366f1,#a78bfa)" : "#131c2e",
              color: canNext ? "#fff" : "#334155", border: "none", fontSize: 12, cursor: canNext ? "pointer" : "default",
              fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : (completeLabel || "Complete setup →")}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function ShimmerRows({ count = 3, height = 32 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="shimmer"
          style={{ height, borderRadius: 6, marginBottom: 6, opacity: 1 - i * 0.2 }} />
      ))}
    </>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
      <span style={{ color: "#475569", minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#94a3b8" }}>{value}</span>
    </div>
  );
}

// ─── Google Drive: FolderBrowser ──────────────────────────────────────────────

function FolderBrowser({ onSelect }) {
  const [breadcrumb,   setBreadcrumb]   = useState([{ id: "root", name: "My Drive" }]);
  const [folders,      setFolders]      = useState([]);
  const [fileCount,    setFileCount]    = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [selectedId,   setSelectedId]   = useState(null); // null = "Watch entire Drive"

  const fetchLevel = useCallback(async parentId => {
    setLoading(true); setError(null);
    try {
      const data = await apiCall(`/api/integrations/google/drive/folders?parentId=${encodeURIComponent(parentId)}`);
      setFolders(data.folders || []);
      setFileCount(data.invoiceFileCount || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLevel("root"); }, [fetchLevel]);

  const navigateInto = (folder) => {
    setBreadcrumb(b => [...b, { id: folder.id, name: folder.name }]);
    setSelectedId(null);
    onSelect(null, null, 0);
    fetchLevel(folder.id);
  };

  const navigateTo = (idx) => {
    const crumb = breadcrumb[idx];
    setBreadcrumb(b => b.slice(0, idx + 1));
    setSelectedId(null);
    onSelect(null, null, 0);
    fetchLevel(crumb.id);
  };

  const selectFolder = (folder) => {
    setSelectedId(folder.id);
    onSelect(folder.id, folder.name, fileCount);
  };

  const selectEntireDrive = () => {
    setSelectedId("root");
    onSelect(null, null, 0);
  };

  const currentParentId = breadcrumb[breadcrumb.length - 1]?.id || "root";

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {breadcrumb.map((crumb, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ color: "#334155", fontSize: 11 }}>›</span>}
            <button onClick={() => navigateTo(i)}
              style={{ background: "none", border: "none", color: i === breadcrumb.length - 1 ? "#a78bfa" : "#475569",
                fontSize: 11, cursor: "pointer", padding: 0, fontWeight: i === breadcrumb.length - 1 ? 600 : 400 }}>
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {/* Folder list panel */}
      <div style={{ background: "#0d1626", border: "1px solid #1e2d45", borderRadius: 8,
        height: 210, overflowY: "auto", scrollbarWidth: "thin" }}>

        {/* "Watch entire Drive" option — always pinned at top */}
        <button onClick={selectEntireDrive}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
            background: selectedId === "root" ? "#13103a" : "transparent",
            borderLeft: selectedId === "root" ? "3px solid #6366f1" : "3px solid transparent",
            border: "none", borderBottom: "1px solid #1a2335", cursor: "pointer", textAlign: "left" }}>
          <span style={{ fontSize: 16 }}>🌐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: selectedId === "root" ? "#a78bfa" : "#94a3b8" }}>
              Watch entire Drive
            </div>
            <div style={{ fontSize: 10, color: "#334155", marginTop: 1 }}>
              All PDFs and images across all folders
            </div>
          </div>
          {selectedId === "root" && <span style={{ fontSize: 11, color: "#a78bfa" }}>✓</span>}
        </button>

        {loading ? (
          <div style={{ padding: 12 }}><ShimmerRows count={3} height={36} /></div>
        ) : error ? (
          <div style={{ padding: 12, fontSize: 12, color: "#f87171" }}>⚠ {error}</div>
        ) : folders.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: "#475569", textAlign: "center" }}>
            No subfolders found in this location
          </div>
        ) : (
          folders.map(folder => (
            <div key={folder.id}
              style={{ display: "flex", alignItems: "center",
                background: selectedId === folder.id ? "#0c1525" : "transparent",
                borderLeft: selectedId === folder.id ? "3px solid #6366f1" : "3px solid transparent",
                borderBottom: "1px solid #111d2e" }}>
              {/* Folder body — click to select */}
              <button onClick={() => selectFolder(folder)}
                style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontSize: 16 }}>📁</span>
                <span style={{ fontSize: 13, color: selectedId === folder.id ? "#e2e8f0" : "#94a3b8",
                  fontWeight: selectedId === folder.id ? 600 : 400 }}>
                  {folder.name}
                </span>
              </button>
              {/* Chevron — click to navigate in */}
              {folder.hasChildren && (
                <button onClick={() => navigateInto(folder)}
                  style={{ padding: "10px 14px", background: "none", border: "none",
                    color: "#334155", cursor: "pointer", fontSize: 14, flexShrink: 0 }}
                  title="Open folder">
                  ›
                </button>
              )}
              {selectedId === folder.id && (
                <span style={{ fontSize: 11, color: "#a78bfa", paddingRight: 12 }}>✓</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* File count hint for the selected folder */}
      {selectedId && selectedId !== "root" && (
        <div style={{ marginTop: 6, fontSize: 11, color: fileCount > 0 ? "#4ade80" : "#475569" }}>
          {fileCount > 0
            ? `✓ ${fileCount} invoice file${fileCount !== 1 ? "s" : ""} in this folder`
            : "No invoice files found in this folder (files added later will be synced)"}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: "#334155" }}>
        We only read files — we never modify or delete anything in your Drive.
      </div>
    </div>
  );
}

// ─── Google Drive wizard ──────────────────────────────────────────────────────

function GoogleDriveWizard({ integration, onComplete }) {
  const [step,              setStep]             = useState(0);
  const [browseMode,        setBrowseMode]        = useState(true);
  const [selectedFolderId,  setSelectedFolderId]  = useState(null);
  const [selectedFolderName,setSelectedFolderName]= useState(null);
  // URL fallback state
  const [folderUrl,         setFolderUrl]         = useState("");
  const [folderInfo,        setFolderInfo]        = useState(null);
  const [folderError,       setFolderError]       = useState(null);
  const [folderLoading,     setFolderLoading]     = useState(false);
  const [syncFrom,          setSyncFrom]          = useState(defaultSyncFrom());
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState(null);
  const debounceRef = useRef(null);

  const resolveFolderUrl = useCallback(async url => {
    const folderId = extractFolderId(url);
    if (!folderId) { setFolderInfo(null); setFolderError(null); return; }
    setFolderLoading(true); setFolderError(null); setFolderInfo(null);
    try {
      const info = await apiCall(`/api/integrations/google/drive/folder-info?folderId=${encodeURIComponent(folderId)}`);
      setFolderInfo(info);
    } catch (err) {
      setFolderError(err.message);
    } finally {
      setFolderLoading(false);
    }
  }, []);

  const onFolderUrlChange = e => {
    const val = e.target.value;
    setFolderUrl(val);
    setFolderInfo(null); setFolderError(null);
    clearTimeout(debounceRef.current);
    if (val.trim()) debounceRef.current = setTimeout(() => resolveFolderUrl(val), 600);
  };

  const handleBrowseSelect = (id, name, count) => {
    setSelectedFolderId(id);
    setSelectedFolderName(name);
    // Update folderInfo-compatible shape for save()
    setFolderInfo(id ? { name, fileCount: count } : null);
    setFolderUrl(id || "");
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const folderId = browseMode ? selectedFolderId : extractFolderId(folderUrl);
      const folderName = browseMode ? selectedFolderName : folderInfo?.name || null;
      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({
          config: {
            ...integration.config,
            setup_complete:      true,
            sync_from:           syncFrom,
            folder_id:           folderId || null,
            folder_name:         folderName || null,
            include_subfolders:  includeSubfolders,
          },
        }),
      });
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Determine display values for the confirm step
  const displayFolderName = browseMode
    ? (selectedFolderId === "root" || !selectedFolderId ? "Entire Drive" : selectedFolderName)
    : (folderInfo?.name || (folderUrl ? "Resolving…" : "Entire Drive"));

  const steps = ["Choose folder", "Scope the sync", "Confirm"];

  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 8, background: "#060d1a", border: "1px solid #1e2d45" }}>
      <StepIndicator steps={steps} current={step} />

      {step === 0 && (
        <WizardShell onNext={() => setStep(1)} canNext={true} nextLabel="Next →">
          {browseMode ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <label style={labelStyle}>Choose a folder to watch</label>
                <button onClick={() => setBrowseMode(false)}
                  style={{ background: "none", border: "none", color: "#334155", fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  Paste URL instead
                </button>
              </div>
              <FolderBrowser onSelect={handleBrowseSelect} />
              {selectedFolderId && selectedFolderId !== "root" && selectedFolderName && (
                <div style={{ marginTop: 8, padding: "7px 12px", borderRadius: 6,
                  background: "#0c1f0c", border: "1px solid #4ade8033", fontSize: 12, color: "#4ade80" }}>
                  ✓ Selected: <strong>{selectedFolderName}</strong>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <label style={labelStyle}>Google Drive folder URL</label>
                <button onClick={() => setBrowseMode(true)}
                  style={{ background: "none", border: "none", color: "#334155", fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                  Browse folders instead
                </button>
              </div>
              <input value={folderUrl} onChange={onFolderUrlChange}
                placeholder="Paste folder URL from Google Drive, or leave blank to watch all files"
                style={inputStyle} />
              {folderLoading && <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>Verifying folder…</div>}
              {folderInfo && (
                <div style={{ fontSize: 11, color: "#4ade80", marginTop: 5 }}>
                  ✓ Found: "{folderInfo.name}" · {folderInfo.fileCount} invoice file{folderInfo.fileCount !== 1 ? "s" : ""} available
                </div>
              )}
              {folderError && <div style={{ fontSize: 11, color: "#f87171", marginTop: 5 }}>✗ {folderError}</div>}
              {!folderUrl && (
                <div style={{ fontSize: 11, color: "#334155", marginTop: 5 }}>
                  Leave blank to scan your entire Drive (not recommended for large accounts).
                </div>
              )}
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: "#0a1120", border: "1px solid #1e2d45", fontSize: 11, color: "#475569" }}>
                We only read files — we never modify or delete anything in your Drive.
              </div>
            </div>
          )}
        </WizardShell>
      )}

      {step === 1 && (
        <WizardShell onBack={() => setStep(0)} onNext={() => setStep(2)} nextLabel="Review →">
          <div>
            <label style={labelStyle}>Import files from this date onwards</label>
            <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
              style={{ ...inputStyle, width: "auto", colorScheme: "dark" }} />
            <div style={{ fontSize: 11, color: "#334155", marginTop: 5 }}>
              Only files modified on or after this date will be imported.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" id="subfolders" checked={includeSubfolders}
              onChange={e => setIncludeSubfolders(e.target.checked)}
              style={{ accentColor: "#6366f1", width: 14, height: 14 }} />
            <label htmlFor="subfolders" style={{ fontSize: 12, color: "#94a3b8", cursor: "pointer" }}>
              Include subfolders
            </label>
          </div>
        </WizardShell>
      )}

      {step === 2 && (
        <WizardShell onBack={() => setStep(1)} onComplete={save} completeLabel="Start first sync"
          saving={saving} error={error}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>Setup summary</div>
            <SummaryRow label="Folder" value={displayFolderName} />
            <SummaryRow label="Sync from" value={syncFrom} />
            <SummaryRow label="Subfolders" value={includeSubfolders ? "Included" : "Top level only"} />
            {folderInfo?.fileCount > 0 && <SummaryRow label="Available files" value={`${folderInfo.fileCount} invoice files`} />}
          </div>
        </WizardShell>
      )}
    </div>
  );
}

// ─── Gmail: SenderChip ────────────────────────────────────────────────────────

function SenderChip({ domain, name, count, selected, onToggle }) {
  return (
    <button onClick={onToggle}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
        borderRadius: 99, cursor: "pointer", transition: "all .15s",
        background: selected ? "#0c1f0c" : "#0d1626",
        border: `1px solid ${selected ? "#4ade8044" : "#1e2d45"}`,
        color: selected ? "#4ade80" : "#94a3b8",
      }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
        background: selected ? "#4ade80" : "#334155" }} />
      <span style={{ fontSize: 12, fontWeight: selected ? 600 : 400 }}>
        {name && name !== domain ? name : domain}
      </span>
      {name && name !== domain && (
        <span style={{ fontSize: 10, color: selected ? "#86efac" : "#475569" }}>{domain}</span>
      )}
      <span style={{ padding: "1px 6px", borderRadius: 99, background: "#1e2d45",
        color: "#64748b", fontSize: 10, fontWeight: 600, marginLeft: 2 }}>
        {count}
      </span>
    </button>
  );
}

// ─── Gmail wizard ─────────────────────────────────────────────────────────────

function GmailWizard({ integration, onComplete }) {
  const [step,           setStep]          = useState(0);
  const [scanMode,       setScanMode]      = useState("all");
  // Smart sender detection
  const [recentSenders,  setRecentSenders] = useState([]);
  const [sendersLoading, setSendersLoading]= useState(false);
  const [sendersLoaded,  setSendersLoaded] = useState(false);
  const [selectedDomains,setSelectedDomains] = useState(new Set());
  const [showManualInput,setShowManualInput] = useState(false);
  const [manualDomains,  setManualDomains] = useState("");
  // Label filter
  const [labels,         setLabels]        = useState([]);
  const [labelId,        setLabelId]       = useState("");
  const [labelName,      setLabelName]     = useState("");
  // Advanced
  const [keywords,       setKeywords]      = useState("");
  const [showAdvanced,   setShowAdvanced]  = useState(false);
  const [syncFrom,       setSyncFrom]      = useState(defaultSyncFrom());
  const [saving,         setSaving]        = useState(false);
  const [error,          setError]         = useState(null);

  // Load recent senders when sender_filter is selected (once)
  useEffect(() => {
    if (scanMode === "sender_filter" && !sendersLoaded && !sendersLoading) {
      setSendersLoading(true);
      apiCall("/api/integrations/gmail/recent-senders")
        .then(({ senders }) => {
          setRecentSenders(senders || []);
          // Pre-select all detected senders
          setSelectedDomains(new Set((senders || []).map(s => s.domain)));
          setSendersLoaded(true);
        })
        .catch(() => { setSendersLoaded(true); })
        .finally(() => setSendersLoading(false));
    }
    if (scanMode === "label_filter" && labels.length === 0) {
      apiCall("/api/integrations/gmail/labels")
        .then(({ labels: l }) => setLabels(l))
        .catch(() => {});
    }
  }, [scanMode, sendersLoaded, sendersLoading, labels.length]);

  const toggleDomain = domain => {
    setSelectedDomains(prev => {
      const next = new Set(prev);
      next.has(domain) ? next.delete(domain) : next.add(domain);
      return next;
    });
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const chipDomains   = scanMode === "sender_filter" ? [...selectedDomains] : [];
      const manualList    = manualDomains.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      const senderDomains = [...new Set([...chipDomains, ...manualList])];
      const subjectKeywords = keywords.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      const selectedLabel   = labels.find(l => l.id === labelId);

      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({
          config: {
            ...integration.config,
            setup_complete:   true,
            sync_from:        syncFrom,
            scan_mode:        scanMode,
            sender_domains:   scanMode === "sender_filter" ? senderDomains : [],
            gmail_label_id:   scanMode === "label_filter"  ? labelId : null,
            gmail_label_name: scanMode === "label_filter"  ? (selectedLabel?.name || null) : null,
            subject_keywords: subjectKeywords,
          },
        }),
      });
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const steps = ["Filter emails", "Sync scope", "Confirm"];

  const radioStyle = (active) => ({
    padding: "8px 12px", borderRadius: 6, border: `1px solid ${active ? "#6366f1" : "#1e2d45"}`,
    background: active ? "#13103a" : "#0d1626", cursor: "pointer", fontSize: 12, color: active ? "#a78bfa" : "#64748b",
    textAlign: "left", width: "100%",
  });

  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 8, background: "#060d1a", border: "1px solid #1e2d45" }}>
      <StepIndicator steps={steps} current={step} />

      {step === 0 && (
        <WizardShell onNext={() => setStep(1)} nextLabel="Next →">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>Which emails should we watch?</div>
            {[
              { id: "all",           label: "All emails with PDF or image attachments" },
              { id: "sender_filter", label: "Only from specific senders (recommended)" },
              { id: "label_filter",  label: "Only emails with a specific Gmail label" },
            ].map(opt => (
              <button key={opt.id} onClick={() => setScanMode(opt.id)} style={radioStyle(scanMode === opt.id)}>
                <span style={{ marginRight: 6 }}>{scanMode === opt.id ? "●" : "○"}</span>{opt.label}
              </button>
            ))}

            {scanMode === "sender_filter" && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                  {sendersLoading ? "Detecting recent senders…" :
                    recentSenders.length > 0 ? "Select which senders to import from (all selected by default):" :
                    "No recent senders found. Add them manually below."}
                </div>

                {sendersLoading ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="shimmer"
                        style={{ height: 30, width: [90, 120, 75, 105][i], borderRadius: 99, opacity: 1 - i * 0.15 }} />
                    ))}
                  </div>
                ) : recentSenders.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {recentSenders.map(s => (
                      <SenderChip key={s.domain} domain={s.domain} name={s.name}
                        count={s.count} selected={selectedDomains.has(s.domain)}
                        onToggle={() => toggleDomain(s.domain)} />
                    ))}
                  </div>
                ) : null}

                {recentSenders.length > 0 && !showManualInput && (
                  <button onClick={() => setShowManualInput(true)}
                    style={{ marginTop: 10, background: "none", border: "none",
                      color: "#334155", fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    + Add sender manually
                  </button>
                )}
                {(showManualInput || recentSenders.length === 0) && (
                  <div style={{ marginTop: 8 }}>
                    <label style={labelStyle}>Add sender email addresses or domains (one per line)</label>
                    <textarea value={manualDomains} onChange={e => setManualDomains(e.target.value)}
                      placeholder={"tnuva.co.il\nosem.co.il\nsupplier@example.com"}
                      rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                  </div>
                )}
              </div>
            )}

            {scanMode === "label_filter" && (
              <div style={{ marginTop: 4 }}>
                <label style={labelStyle}>Gmail label</label>
                {labels.length === 0
                  ? <div style={{ fontSize: 12, color: "#475569" }}>Loading labels…</div>
                  : (
                    <select value={labelId} onChange={e => { setLabelId(e.target.value); setLabelName(labels.find(l => l.id === e.target.value)?.name || ""); }}
                      style={{ ...inputStyle, cursor: "pointer" }}>
                      <option value="">Select a label…</option>
                      {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )
                }
              </div>
            )}

            <button onClick={() => setShowAdvanced(v => !v)}
              style={{ alignSelf: "flex-start", background: "none", border: "none", color: "#334155", fontSize: 11, cursor: "pointer", padding: 0, marginTop: 4 }}>
              {showAdvanced ? "▾" : "▸"} Advanced options
            </button>
            {showAdvanced && (
              <div>
                <label style={labelStyle}>Subject must contain (optional keywords, comma-separated)</label>
                <input value={keywords} onChange={e => setKeywords(e.target.value)}
                  placeholder="invoice, חשבונית, receipt"
                  style={inputStyle} />
              </div>
            )}

            <div style={{ padding: "8px 12px", borderRadius: 6, background: "#0a1120", border: "1px solid #1e2d45", fontSize: 11, color: "#475569", marginTop: 4 }}>
              Only file attachments are processed — email body text is never read or stored.
            </div>
          </div>
        </WizardShell>
      )}

      {step === 1 && (
        <WizardShell onBack={() => setStep(0)} onNext={() => setStep(2)} nextLabel="Review →">
          <div>
            <label style={labelStyle}>Import emails received from this date onwards</label>
            <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
              style={{ ...inputStyle, width: "auto", colorScheme: "dark" }} />
            <div style={{ fontSize: 11, color: "#334155", marginTop: 5 }}>
              Only emails received on or after this date will be scanned for invoice attachments.
            </div>
          </div>
        </WizardShell>
      )}

      {step === 2 && (
        <WizardShell onBack={() => setStep(1)} onComplete={save} completeLabel="Start first sync" saving={saving} error={error}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>Setup summary</div>
            <SummaryRow label="Scan mode" value={{ all: "All attachments", sender_filter: "Sender filter", label_filter: "Gmail label" }[scanMode]} />
            {scanMode === "sender_filter" && selectedDomains.size > 0 && (
              <SummaryRow label="Senders" value={[...selectedDomains, ...manualDomains.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)].join(", ")} />
            )}
            {scanMode === "label_filter" && labelName && <SummaryRow label="Label" value={labelName} />}
            {keywords && <SummaryRow label="Keywords" value={keywords} />}
            <SummaryRow label="Sync from" value={syncFrom} />
          </div>
        </WizardShell>
      )}
    </div>
  );
}

// ─── Green Invoice forms ──────────────────────────────────────────────────────

function GreenInvoiceConnect({ onConnected }) {
  const [apiKey,    setApiKey]    = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);

  const connect = async () => {
    if (!apiKey || !apiSecret) { setError("Both fields are required"); return; }
    setSaving(true); setError(null);
    try {
      const { accountName } = await apiCall("/api/integrations/green-invoice", {
        method: "POST",
        body: JSON.stringify({ apiKey, apiSecret }),
      });
      onConnected(accountName);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <input value={apiKey} onChange={e => setApiKey(e.target.value)}
        placeholder="Green Invoice API ID" style={inputStyle} />
      <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)}
        placeholder="Green Invoice API Secret" style={inputStyle} />
      <div style={{ fontSize: 11, color: "#334155" }}>
        Find these in Green Invoice → Account Settings → API Keys.
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 11 }}>{error}</div>}
      <button onClick={connect} disabled={saving}
        style={{ alignSelf: "flex-start", padding: "7px 16px", borderRadius: 6,
          background: "linear-gradient(135deg,#34d39988,#34d399)", color: "#fff",
          border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
        {saving ? "Verifying credentials…" : "Connect"}
      </button>
    </div>
  );
}

function GreenInvoiceWizard({ integration, onComplete }) {
  const [syncFrom,      setSyncFrom]      = useState(defaultSyncFrom());
  const [previewCount,  setPreviewCount]  = useState(null);
  const [previewLoading,setPreviewLoading]= useState(false);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);
  const debounceRef = useRef(null);

  const accountName = integration.config?.account_name;

  // Live document count preview
  useEffect(() => {
    if (!syncFrom) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const { count } = await apiCall(
          `/api/integrations/green-invoice/preview?since=${encodeURIComponent(syncFrom)}`
        );
        setPreviewCount(count);
      } catch {
        setPreviewCount(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [syncFrom, integration.id]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({
          config: { ...integration.config, setup_complete: true, sync_from: syncFrom },
        }),
      });
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 8, background: "#060d1a", border: "1px solid #1e2d45", display: "flex", flexDirection: "column", gap: 14 }}>
      {accountName && (
        <div style={{ padding: "8px 12px", borderRadius: 6, background: "#052e16", border: "1px solid #166534",
          fontSize: 12, color: "#4ade80", display: "flex", alignItems: "center", gap: 6 }}>
          <span>✓</span>
          <span>Connected as <strong>{accountName}</strong></span>
        </div>
      )}
      <div>
        <label style={labelStyle}>Import invoices from this date onwards</label>
        <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
          style={{ ...inputStyle, width: "auto", colorScheme: "dark" }} />

        {previewLoading && (
          <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
            Checking available documents…
          </div>
        )}
        {!previewLoading && previewCount !== null && (
          <div key={previewCount} style={{
            marginTop: 10, padding: "10px 14px", borderRadius: 8,
            background: previewCount > 0 ? "#052e16" : "#0d1626",
            border: `1px solid ${previewCount > 0 ? "#166534" : "#1e2d45"}`,
            fontSize: 13, color: previewCount > 0 ? "#4ade80" : "#475569", fontWeight: 600,
            animation: "fadeIn .3s ease",
          }}>
            {previewCount > 0
              ? `✓ Found ${previewCount} expense document${previewCount !== 1 ? "s" : ""} since ${syncFrom}`
              : `No documents found since ${syncFrom}`}
          </div>
        )}

        <div style={{ fontSize: 11, color: "#334155", marginTop: 8 }}>
          Only received invoices (document type 500) from Green Invoice will be imported.
        </div>
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      <button onClick={save} disabled={saving}
        style={{ alignSelf: "flex-start", padding: "8px 20px", borderRadius: 6,
          background: "linear-gradient(135deg,#6366f1,#a78bfa)", color: "#fff",
          border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
        {saving ? "Saving…" : "Complete setup →"}
      </button>
    </div>
  );
}

// ─── WhatsApp: SupplierPhoneRow ───────────────────────────────────────────────

function SupplierPhoneRow({ supplier, checked, phone, phoneError, onToggle, onPhoneChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
      borderBottom: "1px solid #0d1626" }}>
      <input type="checkbox" checked={checked} onChange={onToggle}
        style={{ accentColor: "#25D366", width: 15, height: 15, flexShrink: 0, cursor: "pointer" }} />
      <span style={{ flex: 1, fontSize: 13, color: checked ? "#e2e8f0" : "#475569",
        fontWeight: checked ? 500 : 400, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {supplier.name}
      </span>
      {checked && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          <input value={phone} onChange={e => onPhoneChange(e.target.value)}
            placeholder="0501234567" autoFocus
            style={{ ...inputStyle, width: 140, fontFamily: "monospace", fontSize: 12,
              borderColor: phoneError ? "#7f1d1d" : "#1e2d45" }} />
          {phoneError && <div style={{ fontSize: 10, color: "#f87171" }}>{phoneError}</div>}
        </div>
      )}
    </div>
  );
}

// ─── WhatsApp wizard ──────────────────────────────────────────────────────────

function WhatsAppWizard({ integration, onComplete }) {
  const [step,          setStep]         = useState(0);
  const [savedContact,  setSavedContact] = useState(false);
  // Supplier-linked phones
  const [suppliers,     setSuppliers]    = useState([]);
  const [suppLoading,   setSuppLoading]  = useState(true);
  const [checkedIds,    setCheckedIds]   = useState(new Set());
  const [phoneMap,      setPhoneMap]     = useState({});
  // Manual additions
  const [manualPhones,  setManualPhones] = useState([]);
  const [saving,        setSaving]       = useState(false);
  const [error,         setError]        = useState(null);
  const isMounted = useRef(true);

  const systemPhone = import.meta.env.VITE_WHATSAPP_SYSTEM_PHONE || "+972-XX-XXXXXXX";

  useEffect(() => {
    isMounted.current = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || !isMounted.current) return;
      supabase.from("suppliers").select("id,name").eq("user_id", session.user.id)
        .then(({ data }) => {
          if (!isMounted.current) return;
          const list = data || [];
          setSuppliers(list);
          // Pre-populate from existing config if editing
          const existing = integration.config?.registered_phones || [];
          const initChecked = new Set();
          const initPhones = {};
          existing.forEach(p => {
            const sup = list.find(s => s.name === p.label);
            if (sup) {
              initChecked.add(sup.id);
              initPhones[sup.id] = p.phone;
            }
          });
          setCheckedIds(initChecked);
          setPhoneMap(initPhones);
        })
        .finally(() => { if (isMounted.current) setSuppLoading(false); });
    });
    return () => { isMounted.current = false; };
  }, [integration.id, integration.config]);

  const toggleSupplier = id => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const phoneError = (raw) => {
    if (!raw.trim()) return null;
    const norm = normalizeIsraeliPhone(raw.trim());
    return norm.startsWith("+972") ? null : "Israeli number required (e.g. 0501234567)";
  };

  const addManualPhone = () => setManualPhones(p => [...p, { phone: "", label: "" }]);
  const removeManualPhone = i => setManualPhones(p => p.filter((_, j) => j !== i));
  const updateManualPhone = (i, field, val) =>
    setManualPhones(p => p.map((ph, j) => j === i ? { ...ph, [field]: val } : ph));

  const supplierPhoneErrors = suppliers.map(s => checkedIds.has(s.id) ? phoneError(phoneMap[s.id] || "") : null);
  const manualPhoneErrors   = manualPhones.map(p => p.phone.trim() ? phoneError(p.phone) : null);
  const hasErrors = supplierPhoneErrors.some(Boolean) || manualPhoneErrors.some(Boolean);

  const registeredPhones = [
    ...suppliers.filter(s => checkedIds.has(s.id) && phoneMap[s.id]?.trim())
      .map(s => ({ phone: normalizeIsraeliPhone(phoneMap[s.id].trim()), label: s.name })),
    ...manualPhones.filter(p => p.phone.trim())
      .map(p => ({ phone: normalizeIsraeliPhone(p.phone.trim()), label: p.label.trim() })),
  ];

  const canProceed = registeredPhones.length > 0 && !hasErrors;

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({
          config: {
            ...integration.config,
            setup_complete:    true,
            registered_phones: registeredPhones,
            send_confirmation: true,
          },
        }),
      });
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const steps = ["Save contact", "Register suppliers", "Go live"];

  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 8, background: "#060d1a", border: "1px solid #1e2d45" }}>
      <StepIndicator steps={steps} current={step} />

      {step === 0 && (
        <WizardShell onNext={() => { if (savedContact) setStep(1); }} canNext={savedContact} nextLabel="Next →">
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
              Your Invoice WhatsApp number
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#25D366", marginBottom: 4, letterSpacing: 1 }}>
              {systemPhone}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 16 }}>
              Save this number in your contacts as "Invoice Bot" so suppliers can send invoices to it.
            </div>
            <button
              onClick={() => window.open(`https://wa.me/${systemPhone.replace(/\D/g, "")}`, "_blank")}
              style={{ padding: "8px 18px", borderRadius: 6, background: "#25D36622", border: "1px solid #25D36644",
                color: "#25D366", fontSize: 12, cursor: "pointer", fontWeight: 600, marginBottom: 12 }}>
              Open in WhatsApp ↗
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" id="saved" checked={savedContact} onChange={e => setSavedContact(e.target.checked)}
              style={{ accentColor: "#25D366", width: 14, height: 14 }} />
            <label htmlFor="saved" style={{ fontSize: 12, color: "#94a3b8", cursor: "pointer" }}>
              I've saved the number in my contacts
            </label>
          </div>
        </WizardShell>
      )}

      {step === 1 && (
        <WizardShell
          onBack={() => setStep(0)}
          onNext={() => { if (canProceed) setStep(2); }}
          canNext={canProceed}
          nextLabel="Review →"
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 2 }}>
              Which suppliers will send invoice photos on WhatsApp?
            </div>
            <div style={{ fontSize: 11, color: "#334155", marginBottom: 12 }}>
              Check a supplier and enter their WhatsApp number.
            </div>

            {suppLoading ? (
              <ShimmerRows count={4} height={40} />
            ) : suppliers.length > 0 ? (
              <div style={{ maxHeight: 240, overflowY: "auto", scrollbarWidth: "thin", marginBottom: 8 }}>
                {suppliers.map((sup, i) => (
                  <SupplierPhoneRow
                    key={sup.id}
                    supplier={sup}
                    checked={checkedIds.has(sup.id)}
                    phone={phoneMap[sup.id] || ""}
                    phoneError={supplierPhoneErrors[i]}
                    onToggle={() => toggleSupplier(sup.id)}
                    onPhoneChange={val => setPhoneMap(m => ({ ...m, [sup.id]: val }))}
                  />
                ))}
              </div>
            ) : (
              <div style={{ padding: "10px 12px", borderRadius: 6, background: "#0a1120",
                border: "1px solid #1e2d45", fontSize: 12, color: "#475569", marginBottom: 8 }}>
                No suppliers in your system yet. Add phone numbers below — they'll be matched when suppliers send messages.
              </div>
            )}

            {/* Manual additions */}
            <div style={{ borderTop: "1px solid #1e2d45", paddingTop: 12, marginTop: suppliers.length > 0 ? 8 : 0 }}>
              {suppliers.length > 0 && (
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>Supplier not in your list?</div>
              )}
              {manualPhones.map((ph, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <input value={ph.phone} onChange={e => updateManualPhone(i, "phone", e.target.value)}
                      placeholder="0501234567"
                      style={{ ...inputStyle, fontFamily: "monospace", borderColor: manualPhoneErrors[i] ? "#7f1d1d" : "#1e2d45" }} />
                    {manualPhoneErrors[i] && <div style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>{manualPhoneErrors[i]}</div>}
                  </div>
                  <input value={ph.label} onChange={e => updateManualPhone(i, "label", e.target.value)}
                    placeholder="Supplier name"
                    style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => removeManualPhone(i)}
                    style={{ padding: "8px 10px", background: "#1a0a0a", border: "1px solid #7f1d1d",
                      borderRadius: 6, color: "#f87171", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
              ))}
              <button onClick={addManualPhone}
                style={{ padding: "6px 12px", background: "#0d1626", border: "1px dashed #1e2d45",
                  borderRadius: 6, color: "#64748b", cursor: "pointer", fontSize: 12 }}>
                + Add supplier
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 10 }}>
              Israeli numbers only (+972). You can add more suppliers later in settings.
            </div>
          </div>
        </WizardShell>
      )}

      {step === 2 && (
        <WizardShell onBack={() => setStep(1)} onComplete={save} completeLabel="Go live →" saving={saving} error={error}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 4 }}>Setup summary</div>
            <SummaryRow label="System number" value={systemPhone} />
            <SummaryRow
              label="Registered suppliers"
              value={registeredPhones.map(p => `${p.label || "Unnamed"} (${p.phone})`).join(", ")}
            />
            <SummaryRow label="Auto-reply" value="Enabled — suppliers get a confirmation after each import" />
            <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, background: "#0a1120",
              border: "1px solid #25D36633", fontSize: 11, color: "#475569" }}>
              Once live, any invoice photo sent to {systemPhone} by a registered supplier will automatically
              appear in your Invoices tab.
            </div>
          </div>
        </WizardShell>
      )}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, setupComplete }) {
  if (status === "connected" && !setupComplete) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
        borderRadius: 99, background: "#1c1a00", color: "#facc15", fontSize: 11, fontWeight: 600 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#eab308", display: "inline-block" }} />
        Setup required
      </span>
    );
  }
  const cfg = {
    connected:    { bg: "#052e16", color: "#4ade80", dot: "#22c55e", label: "Connected"    },
    disconnected: { bg: "#1e1b40", color: "#a78bfa", dot: "#818cf8", label: "Disconnected" },
    error:        { bg: "#2d0a0a", color: "#f87171", dot: "#ef4444", label: "Error"        },
  }[status] || { bg: "#1e1b40", color: "#94a3b8", dot: "#64748b", label: status };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
      borderRadius: 99, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
      {cfg.label}
    </span>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ type, integration, onSync, onDisconnect }) {
  const meta            = INTEGRATION_META[type];
  const [syncing,       setSyncing]      = useState(false);
  const [showForm,      setShowForm]     = useState(false);
  const [showSettings,  setShowSettings] = useState(false);
  const [lastAdded,     setLastAdded]    = useState(null);
  const [connecting,    setConnecting]   = useState(false);

  const isConnected   = integration?.status === "connected";
  const setupComplete = integration?.config?.setup_complete === true;
  const isReady       = isConnected && setupComplete;
  const hasError      = integration?.status === "error";

  const handleConnect = async () => {
    if (type === "google_drive" || type === "gmail") {
      try {
        const returnUrl = encodeURIComponent(window.location.origin);
        const { url }   = await apiCall(`/api/integrations/google/auth-url?type=${type}&returnUrl=${returnUrl}`);
        window.location.href = url;
      } catch (err) { alert(err.message); }
    } else if (type === "green_invoice") {
      setShowForm(true);
    } else if (type === "whatsapp") {
      setConnecting(true);
      try {
        await apiCall("/api/integrations/whatsapp/connect", { method: "POST" });
        await onSync();
      } catch (err) { alert(err.message); }
      finally { setConnecting(false); }
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
    if (!confirm(`Disconnect ${meta.label}? Your imported invoices will be kept.`)) return;
    try {
      await apiCall(`/api/integrations/${integration.id}`, { method: "DELETE" });
      onDisconnect(type);
    } catch (err) { alert(err.message); }
  };

  const wizardDone = () => { setShowSettings(false); onSync(); };

  const config = integration?.config || {};

  const statsLine = (() => {
    if (!isReady) return null;
    const parts = [];
    if (type === "google_drive" && config.folder_name) parts.push(`Watching: ${config.folder_name}`);
    if (type === "gmail") {
      if (config.scan_mode === "sender_filter" && config.sender_domains?.length)
        parts.push(`${config.sender_domains.length} sender domain${config.sender_domains.length !== 1 ? "s" : ""}`);
      else if (config.scan_mode === "label_filter" && config.gmail_label_name)
        parts.push(`Label: ${config.gmail_label_name}`);
      else parts.push("All attachments");
    }
    if (type === "green_invoice" && config.account_name) parts.push(`Account: ${config.account_name}`);
    if (type === "whatsapp" && config.registered_phones?.length)
      parts.push(`${config.registered_phones.length} registered supplier${config.registered_phones.length !== 1 ? "s" : ""}`);
    if (config.sync_from) parts.push(`Since ${config.sync_from}`);
    return parts.length ? parts.join(" · ") : null;
  })();

  return (
    <div style={{
      background: "#0a1120",
      border: `1px solid ${isConnected && !setupComplete ? "#2a2200" : hasError ? "#4a1010" : "#1e2d45"}`,
      borderRadius: 12, padding: 20,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: `${meta.color}18`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
            {meta.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#e2e8f0" }}>{meta.label}</span>
              {meta.comingSoon
                ? <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "#1e2d45", color: "#64748b", fontWeight: 600 }}>COMING SOON</span>
                : <StatusBadge status={integration?.status || "disconnected"} setupComplete={setupComplete} />
              }
            </div>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{meta.description}</div>

            {integration?.error_message && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#f87171" }}>Error: {integration.error_message}</div>
            )}
            {statsLine && (
              <div style={{ marginTop: 4, fontSize: 11, color: "#334155" }}>{statsLine}</div>
            )}
            {isReady && integration.last_sync && (
              <div style={{ marginTop: 2, fontSize: 11, color: "#334155" }}>
                Last sync: {new Date(integration.last_sync).toLocaleString("he-IL")}
                {" · "}{integration.sync_count || 0} invoices imported
              </div>
            )}
            {isReady && !integration.last_sync && type !== "whatsapp" && (
              <div style={{ marginTop: 2, fontSize: 11, color: "#334155" }}>Ready — click "Sync now" to import</div>
            )}
            {isReady && !integration.last_sync && type === "whatsapp" && (
              <div style={{ marginTop: 2, fontSize: 11, color: "#334155" }}>Live — invoices auto-import as WhatsApp messages arrive</div>
            )}
            {lastAdded !== null && (
              <div style={{ marginTop: 4, fontSize: 11, color: lastAdded > 0 ? "#4ade80" : "#94a3b8" }}>
                {lastAdded > 0 ? `✓ ${lastAdded} new invoice${lastAdded !== 1 ? "s" : ""} added` : "No new invoices found"}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {!meta.comingSoon && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {isReady && type !== "whatsapp" && (
              <button onClick={handleSync} disabled={syncing}
                style={{ padding: "6px 14px", borderRadius: 6, background: "#131c2e",
                  color: "#a78bfa", border: "1px solid #2d1d5e", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                {syncing ? "Syncing…" : "↺ Sync now"}
              </button>
            )}
            {isReady && (
              <button onClick={() => setShowSettings(v => !v)}
                style={{ padding: "6px 12px", borderRadius: 6, background: showSettings ? "#13103a" : "#131c2e",
                  color: showSettings ? "#a78bfa" : "#64748b", border: `1px solid ${showSettings ? "#4338ca" : "#1e2d45"}`,
                  fontSize: 12, cursor: "pointer" }}>
                ⚙
              </button>
            )}
            {isReady && (
              <button onClick={handleDisconnect}
                style={{ padding: "6px 14px", borderRadius: 6, background: "#1a0a0a",
                  color: "#f87171", border: "1px solid #7f1d1d", fontSize: 12, cursor: "pointer" }}>
                Disconnect
              </button>
            )}
            {hasError && !setupComplete && (
              <button onClick={handleSync} disabled={syncing}
                style={{ padding: "6px 14px", borderRadius: 6, background: "#131c2e",
                  color: "#f87171", border: "1px solid #7f1d1d", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                {syncing ? "Retrying…" : "↺ Retry"}
              </button>
            )}
            {!isConnected && (
              <button onClick={handleConnect} disabled={connecting}
                style={{ padding: "7px 16px", borderRadius: 6,
                  background: `linear-gradient(135deg,${meta.color}cc,${meta.color})`,
                  color: "#fff", border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                {connecting ? "Connecting…" : "Connect"}
              </button>
            )}
            {isConnected && !setupComplete && !isReady && (
              <button onClick={handleDisconnect}
                style={{ padding: "6px 14px", borderRadius: 6, background: "#1a0a0a",
                  color: "#f87171", border: "1px solid #7f1d1d", fontSize: 12, cursor: "pointer" }}>
                Disconnect
              </button>
            )}
          </div>
        )}
      </div>

      {/* Setup wizard — shown after connection, before setup is complete */}
      {isConnected && !setupComplete && !showSettings && (() => {
        if (type === "google_drive") return <GoogleDriveWizard integration={integration} onComplete={wizardDone} />;
        if (type === "gmail")        return <GmailWizard       integration={integration} onComplete={wizardDone} />;
        if (type === "green_invoice") return <GreenInvoiceWizard integration={integration} onComplete={wizardDone} />;
        if (type === "whatsapp")     return <WhatsAppWizard    integration={integration} onComplete={wizardDone} />;
        return null;
      })()}

      {/* Edit settings panel */}
      {isReady && showSettings && (() => {
        if (type === "google_drive") return <GoogleDriveWizard integration={integration} onComplete={wizardDone} />;
        if (type === "gmail")        return <GmailWizard       integration={integration} onComplete={wizardDone} />;
        if (type === "green_invoice") return <GreenInvoiceWizard integration={integration} onComplete={wizardDone} />;
        if (type === "whatsapp")     return <WhatsAppWizard    integration={integration} onComplete={wizardDone} />;
        return null;
      })()}

      {/* Green Invoice connect form */}
      {!isConnected && showForm && type === "green_invoice" && (
        <GreenInvoiceConnect onConnected={() => { setShowForm(false); onSync(); }} />
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
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 20, color: "#f1f5f9", marginBottom: 6 }}>Integrations</div>
        <div style={{ fontSize: 13, color: "#475569" }}>
          Connect data sources to automatically import invoices — no manual upload needed.
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: 20, padding: "10px 16px", borderRadius: 8,
          background: notice.ok ? "#052e16" : "#2d0a0a",
          border: `1px solid ${notice.ok ? "#166534" : "#7f1d1d"}`,
          color: notice.ok ? "#4ade80" : "#f87171", fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#475569", fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.keys(INTEGRATION_META).map(type => (
            <IntegrationCard
              key={type}
              type={type}
              integration={integrations[type] || null}
              onSync={load}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 28, padding: 16, borderRadius: 8, background: "#080e1a",
        border: "1px solid #111d2e", fontSize: 12, color: "#334155", lineHeight: 1.7 }}>
        <div style={{ fontWeight: 600, color: "#475569", marginBottom: 4 }}>How syncing works</div>
        Each connected source checks for new invoices when you click "Sync now" (WhatsApp syncs automatically
        as photos arrive). New invoices are extracted using AI, matched to your supplier list, and
        deduplicated automatically — invoices already in the system are never added twice.
      </div>
    </div>
  );
}
