import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DrivePicker, DrivePickerDocsView } from "@googleworkspace/drive-picker-react";
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
    gradient:    "from-blue-600 to-blue-500",
  },
  gmail: {
    label:       "Gmail",
    icon:        "📧",
    description: "Scan your Gmail inbox for invoice attachments from suppliers.",
    color:       "#EA4335",
    gradient:    "from-red-600 to-red-500",
  },
  green_invoice: {
    label:       "Green Invoice",
    icon:        "🟢",
    description: "חשבונית ירוקה — pull received expense documents from your Green Invoice account.",
    color:       "#34d399",
    gradient:    "from-emerald-500 to-emerald-400",
  },
  whatsapp: {
    label:       "WhatsApp",
    icon:        "💬",
    description: "Suppliers send invoice photos over WhatsApp — they're imported automatically.",
    color:       "#25D366",
    gradient:    "from-green-600 to-green-500",
  },
  bizzibox: {
    label:       "Bizzibox",
    icon:        "📊",
    description: "Connect your Bizzibox account to sync supplier invoices.",
    color:       "#6366f1",
    gradient:    "from-indigo-600 to-indigo-500",
    comingSoon:  true,
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

const GOOGLE_APP_ID  = import.meta.env.VITE_GOOGLE_APP_ID  || "";
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || "";
const canUseGooglePicker = !!GOOGLE_APP_ID && !!GOOGLE_API_KEY;

// ─── Step transition config ───────────────────────────────────────────────────

const stepVariants = {
  enter:  dir => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   dir => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

function StepAnimator({ step, dir, children }) {
  return (
    <AnimatePresence mode="wait" custom={dir}>
      <motion.div
        key={step}
        custom={dir}
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.22, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-1.5 mb-5">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <motion.div
            animate={{
              background: i < current
                ? "#6366f1"
                : i === current
                  ? "linear-gradient(135deg,#6366f1,#a78bfa)"
                  : "#131c2e",
              scale: i === current ? 1.1 : 1,
            }}
            transition={{ duration: 0.3 }}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
            style={{
              color: i <= current ? "#fff" : "#334155",
              border: i === current ? "none" : "1px solid #1e2d45",
            }}
          >
            {i < current ? "✓" : i + 1}
          </motion.div>
          <span className="text-[11px] whitespace-nowrap" style={{
            color: i === current ? "#a78bfa" : i < current ? "#4ade80" : "#334155",
          }}>
            {label}
          </span>
          {i < steps.length - 1 && (
            <div className="w-5 h-px flex-shrink-0" style={{ background: i < current ? "#6366f140" : "#1e2d45" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function WizardShell({ children, onBack, onNext, onComplete, nextLabel, completeLabel, saving, error, canNext = true }) {
  return (
    <div className="flex flex-col gap-3.5">
      {children}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[12px]"
          style={{ color: "#f87171" }}
        >
          {error}
        </motion.div>
      )}
      <div className="flex gap-2 mt-1">
        {onBack && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="px-3.5 py-1.5 rounded-md text-[12px] cursor-pointer"
            style={{ background: "#131c2e", color: "#64748b", border: "1px solid #1e2d45" }}
          >
            ← Back
          </motion.button>
        )}
        {onNext && (
          <motion.button
            whileHover={canNext ? { scale: 1.02, filter: "brightness(1.1)" } : {}}
            whileTap={canNext ? { scale: 0.98 } : {}}
            onClick={onNext}
            disabled={!canNext || saving}
            className="px-4 py-1.5 rounded-md text-[12px] font-semibold border-none"
            style={{
              background: canNext ? "linear-gradient(135deg,#6366f1,#a78bfa)" : "#131c2e",
              color: canNext ? "#fff" : "#334155",
              cursor: canNext ? "pointer" : "default",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Loading…" : (nextLabel || "Next →")}
          </motion.button>
        )}
        {onComplete && (
          <motion.button
            whileHover={canNext ? { scale: 1.02, filter: "brightness(1.1)" } : {}}
            whileTap={canNext ? { scale: 0.98 } : {}}
            onClick={onComplete}
            disabled={!canNext || saving}
            className="px-4 py-1.5 rounded-md text-[12px] font-semibold border-none"
            style={{
              background: canNext ? "linear-gradient(135deg,#6366f1,#a78bfa)" : "#131c2e",
              color: canNext ? "#fff" : "#334155",
              cursor: canNext ? "pointer" : "default",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : (completeLabel || "Complete setup →")}
          </motion.button>
        )}
      </div>
    </div>
  );
}

function ShimmerRows({ count = 3, height = 32 }) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="shimmer rounded-md" style={{ height, opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="min-w-[110px] flex-shrink-0" style={{ color: "#475569" }}>{label}</span>
      <span style={{ color: "#94a3b8" }}>{value}</span>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div className="block text-[11px] font-semibold uppercase tracking-[0.5px] mb-1" style={{ color: "#64748b" }}>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", style = {} }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="input"
      style={style}
    />
  );
}

function InfoBox({ children, color = "#475569", border = "#1e2d45", bg = "#0a1120" }) {
  return (
    <div className="text-[11px] px-3 py-2 rounded-md" style={{ background: bg, border: `1px solid ${border}`, color }}>
      {children}
    </div>
  );
}

// ─── Google Drive Picker ──────────────────────────────────────────────────────

function DrivePickerButton({ onSelect }) {
  const [open,        setOpen]        = useState(false);
  const [oauthToken,  setOauthToken]  = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  const openPicker = async () => {
    setError(null);
    if (!oauthToken) {
      setLoading(true);
      try {
        const { token } = await apiCall("/api/integrations/google/access-token");
        setOauthToken(token);
      } catch (err) {
        setError("Could not load Drive access. Try reconnecting Google Drive.");
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    setOpen(true);
  };

  const handlePicked = (e) => {
    setOpen(false);
    const docs = e.detail?.docs || [];
    if (docs.length > 0) {
      const doc = docs[0];
      onSelect(doc.id, doc.name);
    }
  };

  const handleCanceled = () => setOpen(false);

  return (
    <div>
      <motion.button
        whileHover={{ scale: 1.02, filter: "brightness(1.1)" }}
        whileTap={{ scale: 0.97 }}
        onClick={openPicker}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-[13px] border-none cursor-pointer"
        style={{ background: "linear-gradient(135deg,#4285F4cc,#4285F4)", color: "#fff", opacity: loading ? 0.7 : 1 }}
      >
        <span style={{ fontSize: 16 }}>📁</span>
        {loading ? "Loading Drive…" : "Browse Google Drive"}
      </motion.button>

      {error && (
        <div className="mt-2 text-[11px]" style={{ color: "#f87171" }}>{error}</div>
      )}

      {open && oauthToken && (
        <DrivePicker
          appId={GOOGLE_APP_ID}
          developerKey={GOOGLE_API_KEY}
          oauthToken={oauthToken}
          onPicked={handlePicked}
          onCanceled={handleCanceled}
          visible
        >
          <DrivePickerDocsView
            selectFolderEnabled
            includeFolders
            mimeTypes="application/vnd.google-apps.folder"
          />
        </DrivePicker>
      )}
    </div>
  );
}

// ─── Fallback: FolderBrowser (when Google Picker env vars not configured) ────

function FolderBrowser({ onSelect }) {
  const [breadcrumb, setBreadcrumb] = useState([{ id: "root", name: "My Drive" }]);
  const [folders,    setFolders]    = useState([]);
  const [fileCount,  setFileCount]  = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [selectedId, setSelectedId] = useState(null);

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

  const navigateInto = folder => {
    setBreadcrumb(b => [...b, { id: folder.id, name: folder.name }]);
    setSelectedId(null);
    onSelect(null, null, 0);
    fetchLevel(folder.id);
  };

  const navigateTo = idx => {
    const crumb = breadcrumb[idx];
    setBreadcrumb(b => b.slice(0, idx + 1));
    setSelectedId(null);
    onSelect(null, null, 0);
    fetchLevel(crumb.id);
  };

  const selectFolder = folder => {
    setSelectedId(folder.id);
    onSelect(folder.id, folder.name, fileCount);
  };

  const selectEntireDrive = () => {
    setSelectedId("root");
    onSelect(null, null, 0);
  };

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[11px]" style={{ color: "#334155" }}>›</span>}
            <button onClick={() => navigateTo(i)}
              className="text-[11px] bg-none border-none cursor-pointer p-0"
              style={{ color: i === breadcrumb.length - 1 ? "#a78bfa" : "#475569", fontWeight: i === breadcrumb.length - 1 ? 600 : 400 }}>
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      <div className="rounded-lg overflow-y-auto" style={{ background: "#0d1626", border: "1px solid #1e2d45", height: 210, scrollbarWidth: "thin" }}>
        <button onClick={selectEntireDrive}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-none cursor-pointer"
          style={{
            background: selectedId === "root" ? "#13103a" : "transparent",
            borderLeft: selectedId === "root" ? "3px solid #6366f1" : "3px solid transparent",
            borderBottom: "1px solid #1a2335",
          }}>
          <span style={{ fontSize: 16 }}>🌐</span>
          <div className="flex-1">
            <div className="text-[12px] font-semibold" style={{ color: selectedId === "root" ? "#a78bfa" : "#94a3b8" }}>Watch entire Drive</div>
            <div className="text-[10px] mt-0.5" style={{ color: "#334155" }}>All PDFs and images across all folders</div>
          </div>
          {selectedId === "root" && <span className="text-[11px]" style={{ color: "#a78bfa" }}>✓</span>}
        </button>

        {loading ? (
          <div className="p-3"><ShimmerRows count={3} height={36} /></div>
        ) : error ? (
          <div className="p-3 text-[12px]" style={{ color: "#f87171" }}>⚠ {error}</div>
        ) : folders.length === 0 ? (
          <div className="p-4 text-[12px] text-center" style={{ color: "#475569" }}>No subfolders found</div>
        ) : (
          folders.map(folder => (
            <div key={folder.id} className="flex items-center"
              style={{
                background: selectedId === folder.id ? "#0c1525" : "transparent",
                borderLeft: selectedId === folder.id ? "3px solid #6366f1" : "3px solid transparent",
                borderBottom: "1px solid #111d2e",
              }}>
              <button onClick={() => selectFolder(folder)}
                className="flex-1 flex items-center gap-2.5 px-3 py-2.5 bg-transparent border-none cursor-pointer text-left">
                <span style={{ fontSize: 16 }}>📁</span>
                <span className="text-[13px]" style={{ color: selectedId === folder.id ? "#e2e8f0" : "#94a3b8", fontWeight: selectedId === folder.id ? 600 : 400 }}>
                  {folder.name}
                </span>
              </button>
              {folder.hasChildren && (
                <button onClick={() => navigateInto(folder)}
                  className="px-3.5 py-2.5 bg-transparent border-none cursor-pointer text-[14px] flex-shrink-0"
                  style={{ color: "#334155" }}>›</button>
              )}
              {selectedId === folder.id && (
                <span className="text-[11px] pr-3" style={{ color: "#a78bfa" }}>✓</span>
              )}
            </div>
          ))
        )}
      </div>

      {selectedId && selectedId !== "root" && (
        <div className="mt-1.5 text-[11px]" style={{ color: fileCount > 0 ? "#4ade80" : "#475569" }}>
          {fileCount > 0
            ? `✓ ${fileCount} invoice file${fileCount !== 1 ? "s" : ""} in this folder`
            : "No invoice files yet — files added later will be synced"}
        </div>
      )}
      <div className="mt-2 text-[11px]" style={{ color: "#334155" }}>We only read files — we never modify or delete anything.</div>
    </div>
  );
}

// ─── Google Drive wizard ──────────────────────────────────────────────────────

function GoogleDriveWizard({ integration, onComplete }) {
  const [step,               setStep]             = useState(0);
  const [dir,                setDir]              = useState(1);
  const [browseMode,         setBrowseMode]        = useState(true);
  const [selectedFolderId,   setSelectedFolderId]  = useState(null);
  const [selectedFolderName, setSelectedFolderName]= useState(null);
  const [folderUrl,          setFolderUrl]         = useState("");
  const [folderInfo,         setFolderInfo]        = useState(null);
  const [folderError,        setFolderError]       = useState(null);
  const [folderLoading,      setFolderLoading]     = useState(false);
  const [syncFrom,           setSyncFrom]          = useState(defaultSyncFrom());
  const [includeSubfolders,  setIncludeSubfolders] = useState(true);
  const [saving,             setSaving]            = useState(false);
  const [error,              setError]             = useState(null);
  const debounceRef = useRef(null);

  const go = (s) => { setDir(s > step ? 1 : -1); setStep(s); };

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

  // Used by FolderBrowser (fallback)
  const handleBrowseSelect = (id, name, count) => {
    setSelectedFolderId(id);
    setSelectedFolderName(name);
    setFolderInfo(id ? { name, fileCount: count } : null);
    setFolderUrl(id || "");
  };

  // Used by Google Drive Picker (primary)
  const handlePickerSelect = (id, name) => {
    setSelectedFolderId(id);
    setSelectedFolderName(name);
    setFolderInfo({ name, fileCount: null });
    setFolderUrl(id || "");
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const folderId   = browseMode ? selectedFolderId : extractFolderId(folderUrl);
      const folderName = browseMode ? selectedFolderName : folderInfo?.name || null;
      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({
          config: {
            ...integration.config,
            setup_complete:     true,
            sync_from:          syncFrom,
            folder_id:          folderId || null,
            folder_name:        folderName || null,
            include_subfolders: includeSubfolders,
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

  const displayFolderName = browseMode
    ? (selectedFolderId === "root" || !selectedFolderId ? "Entire Drive" : selectedFolderName)
    : (folderInfo?.name || (folderUrl ? "Resolving…" : "Entire Drive"));

  const steps = ["Choose folder", "Scope the sync", "Confirm"];

  return (
    <div className="mt-4 p-4 rounded-xl" style={{ background: "#060d1a", border: "1px solid #1e2d45" }}>
      <StepIndicator steps={steps} current={step} />
      <StepAnimator step={step} dir={dir}>
        {step === 0 && (
          <WizardShell onNext={() => go(1)} canNext={true} nextLabel="Next →">
            {canUseGooglePicker && browseMode ? (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-baseline">
                  <FieldLabel>Choose a folder to watch</FieldLabel>
                  <button onClick={() => setBrowseMode(false)}
                    className="text-[11px] bg-none border-none cursor-pointer p-0 underline"
                    style={{ color: "#334155" }}>
                    Paste URL instead
                  </button>
                </div>

                <DrivePickerButton onSelect={handlePickerSelect} />

                <AnimatePresence>
                  {selectedFolderName && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-semibold"
                      style={{ background: "#0c1f0c", border: "1px solid #4ade8033", color: "#4ade80" }}
                    >
                      <span>✓</span>
                      <span>Selected: <strong>{selectedFolderName}</strong></span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        onClick={() => { setSelectedFolderId(null); setSelectedFolderName(null); setFolderInfo(null); }}
                        className="ml-auto text-[11px] bg-none border-none cursor-pointer"
                        style={{ color: "#4ade8080" }}
                      >
                        ✕ change
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!selectedFolderName && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-2 text-[12px]"
                    style={{ color: "#334155" }}
                  >
                    or leave blank to watch your entire Drive
                  </motion.div>
                )}

                <InfoBox>🔒 We only read files — we never modify or delete anything in your Drive.</InfoBox>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {canUseGooglePicker && (
                  <div className="flex justify-between items-baseline">
                    <FieldLabel>Google Drive folder URL</FieldLabel>
                    <button onClick={() => setBrowseMode(true)}
                      className="text-[11px] bg-none border-none cursor-pointer p-0 underline"
                      style={{ color: "#334155" }}>
                      Browse folders instead
                    </button>
                  </div>
                )}
                {!canUseGooglePicker && <FieldLabel>Choose a folder to watch</FieldLabel>}

                {!canUseGooglePicker ? (
                  <FolderBrowser onSelect={handleBrowseSelect} />
                ) : (
                  <div>
                    <TextInput value={folderUrl} onChange={onFolderUrlChange}
                      placeholder="Paste folder URL from Google Drive, or leave blank to watch all" />
                    {folderLoading && <div className="text-[11px] mt-1" style={{ color: "#64748b" }}>Verifying folder…</div>}
                    {folderInfo && <div className="text-[11px] mt-1" style={{ color: "#4ade80" }}>✓ Found: "{folderInfo.name}" · {folderInfo.fileCount} files</div>}
                    {folderError && <div className="text-[11px] mt-1" style={{ color: "#f87171" }}>✗ {folderError}</div>}
                  </div>
                )}

                <InfoBox>🔒 We only read files — we never modify or delete anything in your Drive.</InfoBox>
              </div>
            )}
          </WizardShell>
        )}

        {step === 1 && (
          <WizardShell onBack={() => go(0)} onNext={() => go(2)} nextLabel="Review →">
            <div className="flex flex-col gap-3">
              <div>
                <FieldLabel>Import files from this date onwards</FieldLabel>
                <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
                  className="input" style={{ width: "auto", colorScheme: "dark" }} />
                <div className="text-[11px] mt-1.5" style={{ color: "#334155" }}>Only files modified on or after this date.</div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeSubfolders}
                  onChange={e => setIncludeSubfolders(e.target.checked)}
                  style={{ accentColor: "#6366f1", width: 14, height: 14 }} />
                <span className="text-[12px]" style={{ color: "#94a3b8" }}>Include subfolders</span>
              </label>
            </div>
          </WizardShell>
        )}

        {step === 2 && (
          <WizardShell onBack={() => go(1)} onComplete={save} completeLabel="Start first sync" saving={saving} error={error}>
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-semibold mb-1" style={{ color: "#94a3b8" }}>Setup summary</div>
              <SummaryRow label="Folder"     value={displayFolderName} />
              <SummaryRow label="Sync from"  value={syncFrom} />
              <SummaryRow label="Subfolders" value={includeSubfolders ? "Included" : "Top level only"} />
              {folderInfo?.fileCount > 0 && <SummaryRow label="Available files" value={`${folderInfo.fileCount} invoice files`} />}
            </div>
          </WizardShell>
        )}
      </StepAnimator>
    </div>
  );
}

// ─── Gmail: SenderChip ────────────────────────────────────────────────────────

function SenderChip({ domain, name, count, selected, onToggle }) {
  return (
    <motion.button
      layout
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full cursor-pointer"
      style={{
        background: selected ? "#0c1f0c" : "#0d1626",
        border: `1px solid ${selected ? "#4ade8044" : "#1e2d45"}`,
        color: selected ? "#4ade80" : "#94a3b8",
        transition: "background 0.2s, border-color 0.2s, color 0.2s",
      }}
    >
      <motion.span
        animate={{ background: selected ? "#4ade80" : "#334155" }}
        className="w-2 h-2 rounded-full flex-shrink-0"
      />
      <span className="text-[12px]" style={{ fontWeight: selected ? 600 : 400 }}>
        {name && name !== domain ? name : domain}
      </span>
      {name && name !== domain && (
        <span className="text-[10px]" style={{ color: selected ? "#86efac" : "#475569" }}>{domain}</span>
      )}
      <span className="px-1.5 py-0 rounded-full text-[10px] font-semibold ml-1"
        style={{ background: "#1e2d45", color: "#64748b" }}>
        {count}
      </span>
    </motion.button>
  );
}

// ─── Gmail wizard ─────────────────────────────────────────────────────────────

function GmailWizard({ integration, onComplete }) {
  const [step,           setStep]          = useState(0);
  const [dir,            setDir]           = useState(1);
  const [scanMode,       setScanMode]      = useState("all");
  const [recentSenders,  setRecentSenders] = useState([]);
  const [sendersLoading, setSendersLoading]= useState(false);
  const [sendersLoaded,  setSendersLoaded] = useState(false);
  const [selectedDomains,setSelectedDomains] = useState(new Set());
  const [showManualInput,setShowManualInput] = useState(false);
  const [manualDomains,  setManualDomains] = useState("");
  const [labels,         setLabels]        = useState([]);
  const [labelId,        setLabelId]       = useState("");
  const [labelName,      setLabelName]     = useState("");
  const [keywords,       setKeywords]      = useState("");
  const [showAdvanced,   setShowAdvanced]  = useState(false);
  const [syncFrom,       setSyncFrom]      = useState(defaultSyncFrom());
  const [saving,         setSaving]        = useState(false);
  const [error,          setError]         = useState(null);

  const go = s => { setDir(s > step ? 1 : -1); setStep(s); };

  useEffect(() => {
    if (scanMode === "sender_filter" && !sendersLoaded && !sendersLoading) {
      setSendersLoading(true);
      apiCall("/api/integrations/gmail/recent-senders")
        .then(({ senders }) => {
          setRecentSenders(senders || []);
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
      const chipDomains     = scanMode === "sender_filter" ? [...selectedDomains] : [];
      const manualList      = manualDomains.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      const senderDomains   = [...new Set([...chipDomains, ...manualList])];
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

  return (
    <div className="mt-4 p-4 rounded-xl" style={{ background: "#060d1a", border: "1px solid #1e2d45" }}>
      <StepIndicator steps={steps} current={step} />
      <StepAnimator step={step} dir={dir}>
        {step === 0 && (
          <WizardShell onNext={() => go(1)} nextLabel="Next →">
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-semibold mb-1" style={{ color: "#94a3b8" }}>Which emails should we watch?</div>

              {[
                { id: "all",           label: "All emails with PDF or image attachments" },
                { id: "sender_filter", label: "Only from specific senders (recommended)" },
                { id: "label_filter",  label: "Only emails with a specific Gmail label" },
              ].map(opt => (
                <motion.button
                  key={opt.id}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setScanMode(opt.id)}
                  className="px-3 py-2 rounded-md border text-[12px] text-left w-full cursor-pointer"
                  style={{
                    border: `1px solid ${scanMode === opt.id ? "#6366f1" : "#1e2d45"}`,
                    background: scanMode === opt.id ? "#13103a" : "#0d1626",
                    color: scanMode === opt.id ? "#a78bfa" : "#64748b",
                  }}
                >
                  <span className="mr-1.5">{scanMode === opt.id ? "●" : "○"}</span>{opt.label}
                </motion.button>
              ))}

              <AnimatePresence>
                {scanMode === "sender_filter" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1">
                      <div className="text-[11px] mb-2" style={{ color: "#64748b" }}>
                        {sendersLoading ? "Detecting senders from recent emails…" :
                          recentSenders.length > 0 ? "Select which senders to import from:" :
                          "No recent business senders found — add manually below."}
                      </div>

                      {sendersLoading ? (
                        <div className="flex flex-wrap gap-2">
                          {[90, 120, 75, 105].map((w, i) => (
                            <div key={i} className="shimmer rounded-full"
                              style={{ height: 30, width: w, opacity: 1 - i * 0.15 }} />
                          ))}
                        </div>
                      ) : recentSenders.length > 0 ? (
                        <motion.div className="flex flex-wrap gap-2">
                          {recentSenders.map((s, i) => (
                            <motion.div
                              key={s.domain}
                              initial={{ opacity: 0, scale: 0.85 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: i * 0.06 }}
                            >
                              <SenderChip
                                domain={s.domain} name={s.name} count={s.count}
                                selected={selectedDomains.has(s.domain)}
                                onToggle={() => toggleDomain(s.domain)}
                              />
                            </motion.div>
                          ))}
                        </motion.div>
                      ) : null}

                      {recentSenders.length > 0 && !showManualInput && (
                        <button onClick={() => setShowManualInput(true)}
                          className="mt-2.5 bg-none border-none cursor-pointer p-0 underline text-[11px]"
                          style={{ color: "#334155" }}>
                          + Add sender manually
                        </button>
                      )}

                      {(showManualInput || recentSenders.length === 0) && (
                        <div className="mt-2">
                          <FieldLabel>Sender emails or domains (one per line)</FieldLabel>
                          <textarea value={manualDomains} onChange={e => setManualDomains(e.target.value)}
                            placeholder={"tnuva.co.il\nosem.co.il\nsupplier@example.com"}
                            rows={3} className="input" style={{ resize: "vertical" }} />
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {scanMode === "label_filter" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-1"
                  >
                    <FieldLabel>Gmail label</FieldLabel>
                    {labels.length === 0
                      ? <div className="text-[12px]" style={{ color: "#475569" }}>Loading labels…</div>
                      : (
                        <select value={labelId}
                          onChange={e => { setLabelId(e.target.value); setLabelName(labels.find(l => l.id === e.target.value)?.name || ""); }}
                          className="input" style={{ cursor: "pointer" }}>
                          <option value="">Select a label…</option>
                          {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      )
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              <button onClick={() => setShowAdvanced(v => !v)}
                className="self-start bg-none border-none cursor-pointer p-0 text-[11px] mt-1"
                style={{ color: "#334155" }}>
                {showAdvanced ? "▾" : "▸"} Advanced options
              </button>
              <AnimatePresence>
                {showAdvanced && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <FieldLabel>Subject must contain (keywords, comma-separated)</FieldLabel>
                    <TextInput value={keywords} onChange={e => setKeywords(e.target.value)}
                      placeholder="invoice, חשבונית, receipt" />
                  </motion.div>
                )}
              </AnimatePresence>

              <InfoBox>🔒 Only file attachments are processed — email body text is never read or stored.</InfoBox>
            </div>
          </WizardShell>
        )}

        {step === 1 && (
          <WizardShell onBack={() => go(0)} onNext={() => go(2)} nextLabel="Review →">
            <div>
              <FieldLabel>Import emails received from this date onwards</FieldLabel>
              <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
                className="input" style={{ width: "auto", colorScheme: "dark" }} />
              <div className="text-[11px] mt-1.5" style={{ color: "#334155" }}>Only emails received on or after this date.</div>
            </div>
          </WizardShell>
        )}

        {step === 2 && (
          <WizardShell onBack={() => go(1)} onComplete={save} completeLabel="Start first sync" saving={saving} error={error}>
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-semibold mb-1" style={{ color: "#94a3b8" }}>Setup summary</div>
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
      </StepAnimator>
    </div>
  );
}

// ─── Green Invoice ────────────────────────────────────────────────────────────

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
    <div className="mt-4 flex flex-col gap-2">
      <TextInput value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Green Invoice API ID" />
      <TextInput value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="Green Invoice API Secret" type="password" />
      <div className="text-[11px]" style={{ color: "#334155" }}>Find these in Green Invoice → Account Settings → API Keys.</div>
      {error && <div className="text-[11px]" style={{ color: "#f87171" }}>{error}</div>}
      <motion.button
        whileHover={{ scale: 1.02, filter: "brightness(1.1)" }}
        whileTap={{ scale: 0.98 }}
        onClick={connect}
        disabled={saving}
        className="self-start px-4 py-1.5 rounded-md text-[12px] font-semibold border-none cursor-pointer"
        style={{ background: "linear-gradient(135deg,#34d39988,#34d399)", color: "#fff" }}
      >
        {saving ? "Verifying credentials…" : "Connect"}
      </motion.button>
    </div>
  );
}

function GreenInvoiceWizard({ integration, onComplete }) {
  const [syncFrom,       setSyncFrom]       = useState(defaultSyncFrom());
  const [previewCount,   setPreviewCount]   = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);
  const debounceRef = useRef(null);
  const accountName = integration.config?.account_name;

  useEffect(() => {
    if (!syncFrom) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const { count } = await apiCall(`/api/integrations/green-invoice/preview?since=${encodeURIComponent(syncFrom)}`);
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
        body: JSON.stringify({ config: { ...integration.config, setup_complete: true, sync_from: syncFrom } }),
      });
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 p-4 rounded-xl flex flex-col gap-3.5" style={{ background: "#060d1a", border: "1px solid #1e2d45" }}>
      {accountName && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
          style={{ background: "#052e16", border: "1px solid #166534", color: "#4ade80" }}
        >
          <span>✓</span>
          <span>Connected as <strong>{accountName}</strong></span>
        </motion.div>
      )}

      <div>
        <FieldLabel>Import invoices from this date onwards</FieldLabel>
        <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
          className="input" style={{ width: "auto", colorScheme: "dark" }} />

        <AnimatePresence mode="wait">
          {previewLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-2 text-[11px]" style={{ color: "#64748b" }}>
              Checking available documents…
            </motion.div>
          ) : previewCount !== null ? (
            <motion.div
              key={previewCount}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-2.5 px-3.5 py-2.5 rounded-lg text-[13px] font-semibold"
              style={{
                background: previewCount > 0 ? "#052e16" : "#0d1626",
                border: `1px solid ${previewCount > 0 ? "#166534" : "#1e2d45"}`,
                color: previewCount > 0 ? "#4ade80" : "#475569",
              }}
            >
              {previewCount > 0
                ? `✓ Found ${previewCount} expense document${previewCount !== 1 ? "s" : ""} since ${syncFrom}`
                : `No documents found since ${syncFrom}`}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="mt-2 text-[11px]" style={{ color: "#334155" }}>
          Only received invoices (document type 500) from Green Invoice will be imported.
        </div>
      </div>

      {error && <div className="text-[12px]" style={{ color: "#f87171" }}>{error}</div>}

      <motion.button
        whileHover={{ scale: 1.02, filter: "brightness(1.1)" }}
        whileTap={{ scale: 0.98 }}
        onClick={save}
        disabled={saving}
        className="self-start px-5 py-2 rounded-lg text-[13px] font-semibold border-none cursor-pointer"
        style={{ background: "linear-gradient(135deg,#6366f1,#a78bfa)", color: "#fff", opacity: saving ? 0.7 : 1 }}
      >
        {saving ? "Saving…" : "Complete setup →"}
      </motion.button>
    </div>
  );
}

// ─── WhatsApp: SupplierPhoneRow ───────────────────────────────────────────────

function SupplierPhoneRow({ supplier, checked, phone, phoneError, onToggle, onPhoneChange }) {
  return (
    <motion.div
      layout
      className="flex items-center gap-2.5 py-2.5"
      style={{ borderBottom: "1px solid #0d1626" }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle}
        style={{ accentColor: "#25D366", width: 15, height: 15, flexShrink: 0, cursor: "pointer" }} />
      <span className="flex-1 text-[13px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ color: checked ? "#e2e8f0" : "#475569", fontWeight: checked ? 500 : 400 }}>
        {supplier.name}
      </span>
      <AnimatePresence>
        {checked && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="flex flex-col gap-0.5 flex-shrink-0 overflow-hidden"
          >
            <input value={phone} onChange={e => onPhoneChange(e.target.value)}
              placeholder="0501234567" autoFocus
              className="input"
              style={{ width: 140, fontFamily: "monospace", fontSize: 12, borderColor: phoneError ? "#7f1d1d" : "#1e2d45" }} />
            {phoneError && <div className="text-[10px]" style={{ color: "#f87171" }}>{phoneError}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── WhatsApp wizard ──────────────────────────────────────────────────────────

function WhatsAppWizard({ integration, onComplete }) {
  const [step,         setStep]        = useState(0);
  const [dir,          setDir]         = useState(1);
  const [savedContact, setSavedContact]= useState(false);
  const [suppliers,    setSuppliers]   = useState([]);
  const [suppLoading,  setSuppLoading] = useState(true);
  const [checkedIds,   setCheckedIds]  = useState(new Set());
  const [phoneMap,     setPhoneMap]    = useState({});
  const [manualPhones, setManualPhones]= useState([]);
  const [saving,       setSaving]      = useState(false);
  const [error,        setError]       = useState(null);
  const isMounted = useRef(true);

  const systemPhone = import.meta.env.VITE_WHATSAPP_SYSTEM_PHONE || "+972-XX-XXXXXXX";

  const go = s => { setDir(s > step ? 1 : -1); setStep(s); };

  useEffect(() => {
    isMounted.current = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || !isMounted.current) return;
      supabase.from("suppliers").select("id,name").eq("user_id", session.user.id)
        .then(({ data }) => {
          if (!isMounted.current) return;
          const list = data || [];
          setSuppliers(list);
          const existing = integration.config?.registered_phones || [];
          const initChecked = new Set();
          const initPhones  = {};
          existing.forEach(p => {
            const sup = list.find(s => s.name === p.label);
            if (sup) { initChecked.add(sup.id); initPhones[sup.id] = p.phone; }
          });
          setCheckedIds(initChecked);
          setPhoneMap(initPhones);
        })
        .finally(() => { if (isMounted.current) setSuppLoading(false); });
    });
    return () => { isMounted.current = false; };
  }, [integration.id, integration.config]);

  const toggleSupplier = id => {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const phoneError = raw => {
    if (!raw.trim()) return null;
    return normalizeIsraeliPhone(raw.trim()).startsWith("+972") ? null : "Israeli number required (e.g. 0501234567)";
  };

  const addManualPhone    = () => setManualPhones(p => [...p, { phone: "", label: "" }]);
  const removeManualPhone = i  => setManualPhones(p => p.filter((_, j) => j !== i));
  const updateManualPhone = (i, field, val) => setManualPhones(p => p.map((ph, j) => j === i ? { ...ph, [field]: val } : ph));

  const supplierPhoneErrors = suppliers.map(s => checkedIds.has(s.id) ? phoneError(phoneMap[s.id] || "") : null);
  const manualPhoneErrors   = manualPhones.map(p => p.phone.trim() ? phoneError(p.phone) : null);
  const hasErrors           = supplierPhoneErrors.some(Boolean) || manualPhoneErrors.some(Boolean);

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
          config: { ...integration.config, setup_complete: true, registered_phones: registeredPhones, send_confirmation: true },
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
    <div className="mt-4 p-4 rounded-xl" style={{ background: "#060d1a", border: "1px solid #1e2d45" }}>
      <StepIndicator steps={steps} current={step} />
      <StepAnimator step={step} dir={dir}>
        {step === 0 && (
          <WizardShell onNext={() => { if (savedContact) go(1); }} canNext={savedContact} nextLabel="Next →">
            <div className="text-center py-3">
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="text-[40px] mb-3"
              >
                💬
              </motion.div>
              <div className="text-[14px] font-bold mb-1.5" style={{ color: "#e2e8f0" }}>Your Invoice WhatsApp number</div>
              <div className="text-[26px] font-bold mb-1 tracking-wider" style={{ color: "#25D366" }}>{systemPhone}</div>
              <div className="text-[11px] mb-4" style={{ color: "#475569" }}>
                Save this number in your contacts as "Invoice Bot" so suppliers can send invoices to it.
              </div>
              <motion.button
                whileHover={{ scale: 1.04, filter: "brightness(1.1)" }}
                whileTap={{ scale: 0.97 }}
                onClick={() => window.open(`https://wa.me/${systemPhone.replace(/\D/g, "")}`, "_blank")}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold cursor-pointer mb-4"
                style={{ background: "#25D36622", border: "1px solid #25D36644", color: "#25D366" }}
              >
                Open in WhatsApp ↗
              </motion.button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="saved" checked={savedContact} onChange={e => setSavedContact(e.target.checked)}
                style={{ accentColor: "#25D366", width: 14, height: 14 }} />
              <span className="text-[12px]" style={{ color: "#94a3b8" }}>I've saved the number in my contacts</span>
            </label>
          </WizardShell>
        )}

        {step === 1 && (
          <WizardShell onBack={() => go(0)} onNext={() => { if (canProceed) go(2); }} canNext={canProceed} nextLabel="Review →">
            <div>
              <div className="text-[12px] font-semibold mb-0.5" style={{ color: "#94a3b8" }}>
                Which suppliers will send invoice photos on WhatsApp?
              </div>
              <div className="text-[11px] mb-3" style={{ color: "#334155" }}>
                Check a supplier and enter their WhatsApp number.
              </div>

              {suppLoading ? (
                <ShimmerRows count={4} height={40} />
              ) : suppliers.length > 0 ? (
                <div className="max-h-60 overflow-y-auto mb-2" style={{ scrollbarWidth: "thin" }}>
                  {suppliers.map((sup, i) => (
                    <SupplierPhoneRow
                      key={sup.id} supplier={sup}
                      checked={checkedIds.has(sup.id)}
                      phone={phoneMap[sup.id] || ""}
                      phoneError={supplierPhoneErrors[i]}
                      onToggle={() => toggleSupplier(sup.id)}
                      onPhoneChange={val => setPhoneMap(m => ({ ...m, [sup.id]: val }))}
                    />
                  ))}
                </div>
              ) : (
                <InfoBox className="mb-2">
                  No suppliers yet — add phone numbers below and they'll match when suppliers send messages.
                </InfoBox>
              )}

              <div className="pt-3 mt-2" style={{ borderTop: "1px solid #1e2d45" }}>
                {suppliers.length > 0 && (
                  <div className="text-[11px] mb-2" style={{ color: "#475569" }}>Supplier not in your list?</div>
                )}
                {manualPhones.map((ph, i) => (
                  <div key={i} className="flex gap-1.5 mb-2 items-start">
                    <div className="flex-1">
                      <TextInput value={ph.phone} onChange={e => updateManualPhone(i, "phone", e.target.value)}
                        placeholder="0501234567"
                        style={{ fontFamily: "monospace", borderColor: manualPhoneErrors[i] ? "#7f1d1d" : "#1e2d45" }} />
                      {manualPhoneErrors[i] && <div className="text-[10px] mt-0.5" style={{ color: "#f87171" }}>{manualPhoneErrors[i]}</div>}
                    </div>
                    <TextInput value={ph.label} onChange={e => updateManualPhone(i, "label", e.target.value)} placeholder="Supplier name" />
                    <button onClick={() => removeManualPhone(i)}
                      className="px-2.5 py-2 rounded-md cursor-pointer text-[12px] flex-shrink-0"
                      style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", color: "#f87171" }}>✕</button>
                  </div>
                ))}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={addManualPhone}
                  className="px-3 py-1.5 rounded-md text-[12px] cursor-pointer"
                  style={{ background: "#0d1626", border: "1px dashed #1e2d45", color: "#64748b" }}
                >
                  + Add supplier
                </motion.button>
              </div>
              <div className="text-[11px] mt-2.5" style={{ color: "#334155" }}>
                Israeli numbers only (+972). Add more suppliers later in settings.
              </div>
            </div>
          </WizardShell>
        )}

        {step === 2 && (
          <WizardShell onBack={() => go(1)} onComplete={save} completeLabel="Go live →" saving={saving} error={error}>
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-semibold mb-1" style={{ color: "#94a3b8" }}>Setup summary</div>
              <SummaryRow label="System number" value={systemPhone} />
              <SummaryRow
                label="Registered suppliers"
                value={registeredPhones.map(p => `${p.label || "Unnamed"} (${p.phone})`).join(", ")}
              />
              <SummaryRow label="Auto-reply" value="Enabled — suppliers get a confirmation after each import" />
              <InfoBox border="#25D36633">
                Once live, any invoice photo sent to {systemPhone} by a registered supplier will automatically appear in your Invoices tab.
              </InfoBox>
            </div>
          </WizardShell>
        )}
      </StepAnimator>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, setupComplete }) {
  if (status === "connected" && !setupComplete) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ background: "#1c1a00", color: "#facc15" }}>
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#eab308" }} />
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
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}>
      {status === "connected" && setupComplete ? (
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full inline-block"
          style={{ background: cfg.dot }}
        />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: cfg.dot }} />
      )}
      {cfg.label}
    </span>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ type, integration, onSync, onDisconnect }) {
  const meta           = INTEGRATION_META[type];
  const [syncing,      setSyncing]     = useState(false);
  const [showForm,     setShowForm]    = useState(false);
  const [showSettings, setShowSettings]= useState(false);
  const [lastAdded,    setLastAdded]   = useState(null);
  const [connecting,   setConnecting]  = useState(false);

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
    if (type === "google_drive" && config.folder_name) parts.push(`📁 ${config.folder_name}`);
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

  const borderColor = isConnected && !setupComplete ? "#2a2200"
    : hasError ? "#4a1010"
    : isReady   ? `${meta.color}18`
    : "#1e2d45";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={!meta.comingSoon ? { borderColor: `${meta.color}30` } : {}}
      transition={{ duration: 0.25 }}
      className="rounded-xl p-5"
      style={{ background: "#0a1120", border: `1px solid ${borderColor}` }}
    >
      {/* Header */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex gap-3 items-start flex-1">
          <motion.div
            whileHover={!meta.comingSoon ? { scale: 1.1 } : {}}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: `${meta.color}18` }}
          >
            {meta.icon}
          </motion.div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-bold text-[14px]" style={{ color: "#e2e8f0" }}>{meta.label}</span>
              {meta.comingSoon
                ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "#1e2d45", color: "#64748b" }}>COMING SOON</span>
                : <StatusBadge status={integration?.status || "disconnected"} setupComplete={setupComplete} />
              }
            </div>
            <div className="text-[12px] leading-relaxed" style={{ color: "#475569" }}>{meta.description}</div>

            {integration?.error_message && (
              <div className="mt-1.5 text-[11px]" style={{ color: "#f87171" }}>Error: {integration.error_message}</div>
            )}
            {statsLine && (
              <div className="mt-1 text-[11px]" style={{ color: "#334155" }}>{statsLine}</div>
            )}
            {isReady && integration.last_sync && (
              <div className="mt-0.5 text-[11px]" style={{ color: "#334155" }}>
                Last sync: {new Date(integration.last_sync).toLocaleString("he-IL")}
                {" · "}{integration.sync_count || 0} invoices imported
              </div>
            )}
            {isReady && !integration.last_sync && type !== "whatsapp" && (
              <div className="mt-0.5 text-[11px]" style={{ color: "#334155" }}>Ready — click "Sync now" to import</div>
            )}
            {isReady && !integration.last_sync && type === "whatsapp" && (
              <div className="mt-0.5 text-[11px]" style={{ color: "#334155" }}>Live — invoices auto-import as WhatsApp messages arrive</div>
            )}
            <AnimatePresence>
              {lastAdded !== null && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-1 text-[11px]"
                  style={{ color: lastAdded > 0 ? "#4ade80" : "#94a3b8" }}
                >
                  {lastAdded > 0 ? `✓ ${lastAdded} new invoice${lastAdded !== 1 ? "s" : ""} added` : "No new invoices found"}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Action buttons */}
        {!meta.comingSoon && (
          <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
            {isReady && type !== "whatsapp" && (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={handleSync} disabled={syncing}
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer"
                style={{ background: "#131c2e", color: "#a78bfa", border: "1px solid #2d1d5e" }}
              >
                {syncing ? "Syncing…" : "↺ Sync now"}
              </motion.button>
            )}
            {isReady && (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowSettings(v => !v)}
                className="px-3 py-1.5 rounded-lg text-[12px] cursor-pointer"
                style={{
                  background: showSettings ? "#13103a" : "#131c2e",
                  color: showSettings ? "#a78bfa" : "#64748b",
                  border: `1px solid ${showSettings ? "#4338ca" : "#1e2d45"}`,
                }}
              >
                ⚙
              </motion.button>
            )}
            {isReady && (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={handleDisconnect}
                className="px-3.5 py-1.5 rounded-lg text-[12px] cursor-pointer"
                style={{ background: "#1a0a0a", color: "#f87171", border: "1px solid #7f1d1d" }}
              >
                Disconnect
              </motion.button>
            )}
            {hasError && !setupComplete && (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={handleSync} disabled={syncing}
                className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer"
                style={{ background: "#131c2e", color: "#f87171", border: "1px solid #7f1d1d" }}
              >
                {syncing ? "Retrying…" : "↺ Retry"}
              </motion.button>
            )}
            {!isConnected && (
              <motion.button
                whileHover={{ scale: 1.04, filter: "brightness(1.1)" }} whileTap={{ scale: 0.97 }}
                onClick={handleConnect} disabled={connecting}
                className="px-4 py-1.5 rounded-lg text-[12px] font-semibold border-none cursor-pointer"
                style={{ background: `linear-gradient(135deg,${meta.color}cc,${meta.color})`, color: "#fff" }}
              >
                {connecting ? "Connecting…" : "Connect"}
              </motion.button>
            )}
            {isConnected && !setupComplete && !isReady && (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={handleDisconnect}
                className="px-3.5 py-1.5 rounded-lg text-[12px] cursor-pointer"
                style={{ background: "#1a0a0a", color: "#f87171", border: "1px solid #7f1d1d" }}
              >
                Disconnect
              </motion.button>
            )}
          </div>
        )}
      </div>

      {/* Wizard / settings panels */}
      <AnimatePresence>
        {isConnected && !setupComplete && !showSettings && (() => {
          if (type === "google_drive")  return <GoogleDriveWizard integration={integration} onComplete={wizardDone} />;
          if (type === "gmail")         return <GmailWizard       integration={integration} onComplete={wizardDone} />;
          if (type === "green_invoice") return <GreenInvoiceWizard integration={integration} onComplete={wizardDone} />;
          if (type === "whatsapp")      return <WhatsAppWizard    integration={integration} onComplete={wizardDone} />;
          return null;
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {isReady && showSettings && (() => {
          if (type === "google_drive")  return <GoogleDriveWizard integration={integration} onComplete={wizardDone} />;
          if (type === "gmail")         return <GmailWizard       integration={integration} onComplete={wizardDone} />;
          if (type === "green_invoice") return <GreenInvoiceWizard integration={integration} onComplete={wizardDone} />;
          if (type === "whatsapp")      return <WhatsAppWizard    integration={integration} onComplete={wizardDone} />;
          return null;
        })()}
      </AnimatePresence>

      {!isConnected && showForm && type === "green_invoice" && (
        <GreenInvoiceConnect onConnected={() => { setShowForm(false); onSync(); }} />
      )}
    </motion.div>
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
      <div className="mb-6">
        <div className="font-bold text-[20px] mb-1.5" style={{ color: "#f1f5f9" }}>Integrations</div>
        <div className="text-[13px]" style={{ color: "#475569" }}>
          Connect data sources to automatically import invoices — no manual upload needed.
        </div>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-5 px-4 py-2.5 rounded-lg text-[13px]"
            style={{
              background: notice.ok ? "#052e16" : "#2d0a0a",
              border: `1px solid ${notice.ok ? "#166534" : "#7f1d1d"}`,
              color: notice.ok ? "#4ade80" : "#f87171",
            }}
          >
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="shimmer rounded-xl" style={{ height: 96, opacity: 1 - (i - 1) * 0.2 }} />
          ))}
        </div>
      ) : (
        <motion.div
          className="flex flex-col gap-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
        >
          {Object.keys(INTEGRATION_META).map(type => (
            <IntegrationCard
              key={type}
              type={type}
              integration={integrations[type] || null}
              onSync={load}
              onDisconnect={handleDisconnect}
            />
          ))}
        </motion.div>
      )}

      <div className="mt-7 px-4 py-3.5 rounded-lg text-[12px] leading-relaxed" style={{ background: "#080e1a", border: "1px solid #111d2e", color: "#334155" }}>
        <div className="font-semibold mb-1" style={{ color: "#475569" }}>How syncing works</div>
        Each connected source checks for new invoices when you click "Sync now" (WhatsApp syncs automatically
        as photos arrive). New invoices are extracted using AI, matched to your supplier list, and
        deduplicated automatically — invoices already in the system are never added twice.
      </div>
    </div>
  );
}
