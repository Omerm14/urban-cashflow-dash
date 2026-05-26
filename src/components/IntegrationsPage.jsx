import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DrivePicker, DrivePickerDocsView } from "@googleworkspace/drive-picker-react";
import { supabase } from "../lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw, Settings, Unplug, Check, ChevronRight, Globe,
  AlertCircle, Zap, Clock, Eye, EyeOff, Plus, X as XIcon,
} from "lucide-react";

// ─── API helper ───────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const INTEGRATION_META = {
  google_drive: {
    label:       "Google Drive",
    icon:        "📁",
    description: "Watch a folder and automatically import new invoices.",
    color:       "#4285F4",
  },
  gmail: {
    label:       "Gmail",
    icon:        "📧",
    description: "Scan your inbox for invoice attachments from suppliers.",
    color:       "#EA4335",
  },
  green_invoice: {
    label:       "Green Invoice",
    icon:        "🟢",
    description: "Pull received expense documents from your חשבונית ירוקה account.",
    color:       "#34d399",
  },
  whatsapp: {
    label:       "WhatsApp",
    icon:        "💬",
    description: "Suppliers send invoice photos via WhatsApp — imported automatically.",
    color:       "#25D366",
  },
  bizzibox: {
    label:       "Bizzibox",
    icon:        "📊",
    description: "Connect your Bizzibox account to sync supplier invoices.",
    color:       "#6366f1",
    comingSoon:  true,
  },
};

const CADENCE_OPTIONS = [
  { value: "hourly",    label: "Every hour" },
  { value: "every_4h", label: "Every 4 hours" },
  { value: "daily",    label: "Daily" },
  { value: "weekly",   label: "Weekly" },
];

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

const relativeTime = iso => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

const parseApiError = msg => {
  if (!msg) return { message: null, url: null };
  const url = (msg.match(/https?:\/\/[^\s)]+/) || [])[0] || null;
  if (msg.includes("has not been used") || msg.includes("is disabled")) {
    const apiName = msg.toLowerCase().includes("gmail") ? "Gmail" : "Google Drive";
    return { message: `${apiName} API is not enabled in your Google Cloud project.`, url };
  }
  return { message: msg, url };
};

const GOOGLE_APP_ID      = import.meta.env.VITE_GOOGLE_APP_ID  || "";
const GOOGLE_API_KEY     = import.meta.env.VITE_GOOGLE_API_KEY || "";
const canUseGooglePicker = !!GOOGLE_APP_ID && !!GOOGLE_API_KEY;
const WHATSAPP_ENABLED   = import.meta.env.VITE_WHATSAPP_ENABLED === "true";

// ─── Shared primitives ────────────────────────────────────────────────────────

function FieldLabel({ children }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground">
      {children}
    </div>
  );
}

function InfoBox({ children, variant = "default", className }) {
  return (
    <div className={cn(
      "text-xs px-3 py-2.5 rounded-lg border",
      variant === "success"
        ? "bg-green-950/40 border-green-800/40 text-green-400"
        : "bg-muted/30 border-border/60 text-muted-foreground",
      className
    )}>
      {children}
    </div>
  );
}

function ShimmerRows({ count = 3, height = 32 }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="shimmer rounded-lg" style={{ height, opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}

function CadenceSelect({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>Auto-sync schedule</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select schedule…" />
        </SelectTrigger>
        <SelectContent>
          {CADENCE_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground/50">How often to check for new invoices automatically.</p>
    </div>
  );
}

function StepDots({ total, current }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <motion.div
            animate={{
              background: i < current ? "hsl(var(--primary))"
                : i === current ? "hsl(var(--primary))"
                : "hsl(var(--border))",
              width: i === current ? 20 : 8,
            }}
            transition={{ duration: 0.25 }}
            className="h-2 rounded-full"
            style={{ width: i === current ? 20 : 8 }}
          />
        </div>
      ))}
      <span className="text-[11px] text-muted-foreground/50 ml-1">
        Step {current + 1} of {total}
      </span>
    </div>
  );
}

// ─── Google Drive Picker ──────────────────────────────────────────────────────

function DrivePickerButton({ onSelect }) {
  const [open,       setOpen]       = useState(false);
  const [oauthToken, setOauthToken] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

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

  const handlePicked = e => {
    setOpen(false);
    const docs = e.detail?.docs || [];
    if (docs.length > 0) onSelect(docs[0].id, docs[0].name);
  };

  return (
    <div>
      <Button
        variant="outline" size="sm" onClick={openPicker} disabled={loading}
        className="gap-2 border-[#4285F4]/30 text-[#4285F4] hover:bg-[#4285F4]/10 hover:text-[#4285F4]"
      >
        <span className="text-base">📁</span>
        {loading ? "Loading Drive…" : "Browse Google Drive"}
      </Button>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      {open && oauthToken && (
        <DrivePicker
          appId={GOOGLE_APP_ID} developerKey={GOOGLE_API_KEY}
          oauthToken={oauthToken} onPicked={handlePicked}
          onCanceled={() => setOpen(false)} visible
        >
          <DrivePickerDocsView selectFolderEnabled includeFolders
            mimeTypes="application/vnd.google-apps.folder" />
        </DrivePicker>
      )}
    </div>
  );
}

// ─── Folder Browser (fallback when no Google Picker keys) ────────────────────

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
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLevel("root"); }, [fetchLevel]);

  const navigateInto = folder => {
    setBreadcrumb(b => [...b, { id: folder.id, name: folder.name }]);
    setSelectedId(null); onSelect(null, null, 0);
    fetchLevel(folder.id);
  };

  const navigateTo = idx => {
    const crumb = breadcrumb[idx];
    setBreadcrumb(b => b.slice(0, idx + 1));
    setSelectedId(null); onSelect(null, null, 0);
    fetchLevel(crumb.id);
  };

  const selectFolder    = folder => { setSelectedId(folder.id); onSelect(folder.id, folder.name, fileCount); };
  const selectEntireDrive = () => { setSelectedId("root"); onSelect(null, null, 0); };

  return (
    <div>
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
            <button onClick={() => navigateTo(i)}
              className={cn("text-xs bg-transparent border-none cursor-pointer p-0",
                i === breadcrumb.length - 1 ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground")}>
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      <div className="rounded-lg overflow-y-auto border border-border" style={{ background: "hsl(var(--muted) / 0.3)", height: 200, scrollbarWidth: "thin" }}>
        <button onClick={selectEntireDrive}
          className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-none cursor-pointer transition-colors",
            selectedId === "root" ? "bg-primary/10 border-l-2 border-l-primary" : "bg-transparent hover:bg-muted/50 border-l-2 border-l-transparent"
          )} style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1">
            <div className={cn("text-xs font-semibold", selectedId === "root" ? "text-primary" : "text-foreground/70")}>
              Watch entire Drive
            </div>
            <div className="text-[10px] text-muted-foreground/50 mt-0.5">All PDFs and images across all folders</div>
          </div>
          {selectedId === "root" && <Check className="w-3.5 h-3.5 text-primary" />}
        </button>

        {loading ? (
          <div className="p-3"><ShimmerRows count={3} height={36} /></div>
        ) : error ? (
          <div className="p-3 text-xs text-destructive">⚠ {error}</div>
        ) : folders.length === 0 ? (
          <div className="p-4 text-xs text-center text-muted-foreground">No subfolders found</div>
        ) : (
          folders.map(folder => (
            <div key={folder.id} className={cn("flex items-center transition-colors",
              selectedId === folder.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/30 border-l-2 border-l-transparent"
            )} style={{ borderBottom: "1px solid hsl(var(--border) / 0.5)" }}>
              <button onClick={() => selectFolder(folder)}
                className="flex-1 flex items-center gap-2.5 px-3 py-2.5 bg-transparent border-none cursor-pointer text-left">
                <span className="text-base">📁</span>
                <span className={cn("text-sm", selectedId === folder.id ? "text-foreground font-semibold" : "text-foreground/60")}>
                  {folder.name}
                </span>
              </button>
              {folder.hasChildren && (
                <button onClick={() => navigateInto(folder)}
                  className="px-3 py-2.5 bg-transparent border-none cursor-pointer flex-shrink-0 text-muted-foreground/40 hover:text-muted-foreground">
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {selectedId === folder.id && <Check className="w-3.5 h-3.5 text-primary mr-3" />}
            </div>
          ))
        )}
      </div>
      {selectedId && selectedId !== "root" && (
        <p className={cn("mt-1.5 text-xs", fileCount > 0 ? "text-green-400" : "text-muted-foreground")}>
          {fileCount > 0
            ? `✓ ${fileCount} invoice file${fileCount !== 1 ? "s" : ""} in this folder`
            : "No invoice files yet — files added later will be synced"}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground/50">We only read files — we never modify or delete anything.</p>
    </div>
  );
}

// ─── Google Drive Setup Modal ─────────────────────────────────────────────────

function GoogleDriveSetupModal({ integration, open, onOpenChange, onComplete }) {
  const isNew = !integration?.config?.setup_complete;
  const [step,               setStep]              = useState(isNew ? 0 : 0);
  const [browseMode,         setBrowseMode]         = useState(true);
  const [selectedFolderId,   setSelectedFolderId]   = useState(integration?.config?.folder_id   || null);
  const [selectedFolderName, setSelectedFolderName] = useState(integration?.config?.folder_name || null);
  const [folderUrl,          setFolderUrl]          = useState("");
  const [folderInfo,         setFolderInfo]         = useState(null);
  const [folderError,        setFolderError]        = useState(null);
  const [folderLoading,      setFolderLoading]      = useState(false);
  const [syncFrom,           setSyncFrom]           = useState(integration?.config?.sync_from || defaultSyncFrom());
  const [includeSubfolders,  setIncludeSubfolders]  = useState(integration?.config?.include_subfolders !== false);
  const [cadence,            setCadence]            = useState(integration?.config?.cadence || "daily");
  const [saving,             setSaving]             = useState(false);
  const [error,              setError]              = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedFolderId(integration?.config?.folder_id || null);
      setSelectedFolderName(integration?.config?.folder_name || null);
      setSyncFrom(integration?.config?.sync_from || defaultSyncFrom());
      setIncludeSubfolders(integration?.config?.include_subfolders !== false);
      setCadence(integration?.config?.cadence || "daily");
      setError(null);
    }
  }, [open, integration]);

  const resolveFolderUrl = useCallback(async url => {
    const folderId = extractFolderId(url);
    if (!folderId) { setFolderInfo(null); setFolderError(null); return; }
    setFolderLoading(true); setFolderError(null); setFolderInfo(null);
    try {
      const info = await apiCall(`/api/integrations/google/drive/folder-info?folderId=${encodeURIComponent(folderId)}`);
      setFolderInfo(info);
    } catch (err) { setFolderError(err.message); }
    finally { setFolderLoading(false); }
  }, []);

  const onFolderUrlChange = e => {
    const val = e.target.value;
    setFolderUrl(val); setFolderInfo(null); setFolderError(null);
    clearTimeout(debounceRef.current);
    if (val.trim()) debounceRef.current = setTimeout(() => resolveFolderUrl(val), 600);
  };

  const handleBrowseSelect = (id, name, count) => {
    setSelectedFolderId(id); setSelectedFolderName(name);
    setFolderInfo(id ? { name, fileCount: count } : null);
    setFolderUrl(id || "");
  };

  const handlePickerSelect = (id, name) => {
    setSelectedFolderId(id); setSelectedFolderName(name);
    setFolderInfo({ name, fileCount: null }); setFolderUrl(id || "");
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const folderId   = browseMode ? selectedFolderId : extractFolderId(folderUrl);
      const folderName = browseMode ? selectedFolderName : (folderInfo?.name || null);
      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({ config: {
          ...integration.config, setup_complete: true,
          sync_from: syncFrom, folder_id: folderId || null,
          folder_name: folderName || null, include_subfolders: includeSubfolders,
          auto_sync: true, cadence,
        }}),
      });
      onComplete();
      onOpenChange(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const displayFolderName = browseMode
    ? (selectedFolderId === "root" || !selectedFolderId ? "Entire Drive" : selectedFolderName)
    : (folderInfo?.name || (folderUrl ? "Resolving…" : "Entire Drive"));

  const totalSteps = 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: "#4285F422", border: "1px solid #4285F430" }}>
              📁
            </div>
            <div>
              <DialogTitle>
                {isNew ? "Set up Google Drive" : "Google Drive settings"}
              </DialogTitle>
              <DialogDescription>
                {isNew ? "Choose which folder to watch for new invoices" : "Update your sync configuration"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <StepDots total={totalSteps} current={step} />

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }} className="flex flex-col gap-3">

              <div className="flex justify-between items-baseline">
                <FieldLabel>Choose a folder to watch</FieldLabel>
                {canUseGooglePicker && (
                  <button onClick={() => setBrowseMode(v => !v)}
                    className="text-[11px] text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer p-0 underline">
                    {browseMode ? "Paste URL instead" : "Browse folders"}
                  </button>
                )}
              </div>

              {canUseGooglePicker && browseMode ? (
                <>
                  <DrivePickerButton onSelect={handlePickerSelect} />
                  <AnimatePresence>
                    {selectedFolderName && (
                      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold"
                        style={{ background: "hsl(142 76% 5%)", border: "1px solid hsl(142 76% 36% / 0.2)", color: "#4ade80" }}>
                        <Check className="w-4 h-4 flex-shrink-0" />
                        <span>Selected: <strong>{selectedFolderName}</strong></span>
                        <button onClick={() => { setSelectedFolderId(null); setSelectedFolderName(null); setFolderInfo(null); }}
                          className="ml-auto text-xs bg-transparent border-none cursor-pointer text-green-400/50 hover:text-green-400">
                          ✕ change
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {!selectedFolderName && (
                    <p className="text-center text-xs text-muted-foreground/40">or leave blank to watch your entire Drive</p>
                  )}
                </>
              ) : !canUseGooglePicker ? (
                <FolderBrowser onSelect={handleBrowseSelect} />
              ) : (
                <div>
                  <Input value={folderUrl} onChange={onFolderUrlChange}
                    placeholder="Paste folder URL, or leave blank to watch all" />
                  {folderLoading && <p className="text-xs mt-1 text-muted-foreground">Verifying folder…</p>}
                  {folderInfo   && <p className="text-xs mt-1 text-green-400">✓ Found: "{folderInfo.name}"</p>}
                  {folderError  && <p className="text-xs mt-1 text-destructive">✗ {folderError}</p>}
                </div>
              )}

              <InfoBox>🔒 We only read files — we never modify or delete anything in your Drive.</InfoBox>

              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={() => setStep(1)}>Configure sync →</Button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }} className="flex flex-col gap-4">

              <div className="p-3 rounded-lg border border-border/60 bg-muted/20 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Watching:</span>{" "}
                {displayFolderName || "Entire Drive"}
              </div>

              <div>
                <FieldLabel>Import files from this date onwards</FieldLabel>
                <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
                  className="input" style={{ width: "auto", colorScheme: "dark" }} />
                <p className="text-[11px] mt-1 text-muted-foreground/50">Only files modified on or after this date.</p>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox checked={includeSubfolders} onCheckedChange={setIncludeSubfolders} />
                <span className="text-sm text-foreground/80">Include subfolders</span>
              </label>

              <CadenceSelect value={cadence} onChange={setCadence} />

              {error && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
                </p>
              )}

              <div className="flex gap-2 justify-between pt-1">
                <Button variant="outline" size="sm" onClick={() => setStep(0)}>← Back</Button>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save & start syncing →"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ─── Gmail Setup Modal ────────────────────────────────────────────────────────

function GmailSetupModal({ integration, open, onOpenChange, onComplete }) {
  const isNew = !integration?.config?.setup_complete;
  const [step,           setStep]           = useState(0);
  const [scanMode,       setScanMode]       = useState(integration?.config?.scan_mode || "all");
  const [recentSenders,  setRecentSenders]  = useState([]);
  const [sendersLoading, setSendersLoading] = useState(false);
  const [sendersLoaded,  setSendersLoaded]  = useState(false);
  const [selectedDomains,setSelectedDomains]= useState(new Set());
  const [showManualInput,setShowManualInput]= useState(false);
  const [manualDomains,  setManualDomains]  = useState("");
  const [labels,         setLabels]         = useState([]);
  const [labelId,        setLabelId]        = useState(integration?.config?.gmail_label_id || "");
  const [keywords,       setKeywords]       = useState((integration?.config?.subject_keywords || []).join(", "));
  const [showAdvanced,   setShowAdvanced]   = useState(false);
  const [syncFrom,       setSyncFrom]       = useState(integration?.config?.sync_from || defaultSyncFrom());
  const [cadence,        setCadence]        = useState(integration?.config?.cadence || "daily");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);

  useEffect(() => {
    if (open) {
      setScanMode(integration?.config?.scan_mode || "all");
      setSyncFrom(integration?.config?.sync_from || defaultSyncFrom());
      setCadence(integration?.config?.cadence || "daily");
      setError(null);
    }
  }, [open, integration]);

  useEffect(() => {
    if (!open) return;
    if (scanMode === "sender_filter" && !sendersLoaded && !sendersLoading) {
      setSendersLoading(true);
      apiCall("/api/integrations/gmail/recent-senders")
        .then(({ senders }) => {
          setRecentSenders(senders || []);
          setSelectedDomains(new Set((senders || []).map(s => s.domain)));
          setSendersLoaded(true);
        })
        .catch(() => setSendersLoaded(true))
        .finally(() => setSendersLoading(false));
    }
    if (scanMode === "label_filter" && labels.length === 0) {
      apiCall("/api/integrations/gmail/labels").then(({ labels: l }) => setLabels(l)).catch(() => {});
    }
  }, [open, scanMode, sendersLoaded, sendersLoading, labels.length]);

  const toggleDomain = domain => {
    setSelectedDomains(prev => { const n = new Set(prev); n.has(domain) ? n.delete(domain) : n.add(domain); return n; });
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
        body: JSON.stringify({ config: {
          ...integration.config, setup_complete: true, sync_from: syncFrom, scan_mode: scanMode,
          sender_domains: scanMode === "sender_filter" ? senderDomains : [],
          gmail_label_id: scanMode === "label_filter" ? labelId : null,
          gmail_label_name: scanMode === "label_filter" ? (selectedLabel?.name || null) : null,
          subject_keywords: subjectKeywords,
          auto_sync: true, cadence,
        }}),
      });
      onComplete();
      onOpenChange(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const totalSteps = 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: "#EA433522", border: "1px solid #EA433530" }}>
              📧
            </div>
            <div>
              <DialogTitle>{isNew ? "Set up Gmail" : "Gmail settings"}</DialogTitle>
              <DialogDescription>
                {isNew ? "Choose which emails to scan for invoice attachments" : "Update your inbox scan settings"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <StepDots total={totalSteps} current={step} />

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="step0" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }} className="flex flex-col gap-2">

              <p className="text-sm font-medium text-foreground/80 mb-1">Which emails should we watch?</p>

              {[
                { id: "all",           label: "All emails with PDF or image attachments" },
                { id: "sender_filter", label: "Only from specific senders (recommended)" },
                { id: "label_filter",  label: "Only emails with a specific Gmail label" },
              ].map(opt => (
                <button key={opt.id} onClick={() => setScanMode(opt.id)}
                  className={cn(
                    "px-3 py-2.5 rounded-lg border text-sm text-left w-full cursor-pointer transition-colors",
                    scanMode === opt.id
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted/20 text-muted-foreground hover:border-border/80 hover:text-foreground"
                  )}>
                  <span className="mr-2 text-xs">{scanMode === opt.id ? "●" : "○"}</span>{opt.label}
                </button>
              ))}

              <AnimatePresence>
                {scanMode === "sender_filter" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-2">
                      {sendersLoading ? (
                        <div className="flex flex-wrap gap-2">
                          {[90, 120, 75, 105].map((w, i) => (
                            <div key={i} className="shimmer rounded-full" style={{ height: 28, width: w, opacity: 1 - i * 0.15 }} />
                          ))}
                        </div>
                      ) : recentSenders.length > 0 ? (
                        <>
                          <p className="text-xs text-muted-foreground mb-2">Select which senders to import from:</p>
                          <div className="flex flex-wrap gap-2">
                            {recentSenders.map(s => (
                              <button key={s.domain} onClick={() => toggleDomain(s.domain)}
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full cursor-pointer text-xs transition-colors border",
                                  selectedDomains.has(s.domain)
                                    ? "bg-green-950/60 border-green-700/40 text-green-400"
                                    : "bg-muted/50 border-border text-muted-foreground hover:border-border/80"
                                )}>
                                <span className={cn("w-2 h-2 rounded-full flex-shrink-0",
                                  selectedDomains.has(s.domain) ? "bg-green-400" : "bg-muted-foreground/50")} />
                                {s.name && s.name !== s.domain ? s.name : s.domain}
                                <span className="px-1 rounded-full text-[10px] bg-border/50 text-muted-foreground">{s.count}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">No recent business senders found — add manually below.</p>
                      )}
                      {(showManualInput || recentSenders.length === 0) ? (
                        <div className="mt-2">
                          <FieldLabel>Sender emails or domains (one per line)</FieldLabel>
                          <textarea value={manualDomains} onChange={e => setManualDomains(e.target.value)}
                            placeholder={"tnuva.co.il\nosem.co.il\nsupplier@example.com"}
                            rows={3} className="input w-full" style={{ resize: "vertical" }} />
                        </div>
                      ) : recentSenders.length > 0 ? (
                        <button onClick={() => setShowManualInput(true)}
                          className="mt-2 text-xs text-muted-foreground/50 hover:text-muted-foreground bg-transparent border-none cursor-pointer p-0 underline">
                          + Add sender manually
                        </button>
                      ) : null}
                    </div>
                  </motion.div>
                )}
                {scanMode === "label_filter" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-1">
                    <FieldLabel>Gmail label</FieldLabel>
                    {labels.length === 0
                      ? <p className="text-sm text-muted-foreground">Loading labels…</p>
                      : <select value={labelId}
                          onChange={e => setLabelId(e.target.value)}
                          className="input w-full cursor-pointer">
                          <option value="">Select a label…</option>
                          {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              <button onClick={() => setShowAdvanced(v => !v)}
                className="self-start text-xs text-muted-foreground/50 hover:text-muted-foreground bg-transparent border-none cursor-pointer p-0 mt-1">
                {showAdvanced ? "▾" : "▸"} Advanced options
              </button>
              <AnimatePresence>
                {showAdvanced && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <FieldLabel>Subject must contain (keywords, comma-separated)</FieldLabel>
                    <Input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="invoice, חשבונית, receipt" />
                  </motion.div>
                )}
              </AnimatePresence>

              <InfoBox>🔒 Only file attachments are processed — email body text is never read.</InfoBox>

              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={() => setStep(1)}>Sync settings →</Button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }} className="flex flex-col gap-4">

              <div>
                <FieldLabel>Import emails received from this date onwards</FieldLabel>
                <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
                  className="input" style={{ width: "auto", colorScheme: "dark" }} />
                <p className="text-[11px] mt-1 text-muted-foreground/50">Only emails received on or after this date.</p>
              </div>

              <CadenceSelect value={cadence} onChange={setCadence} />

              {error && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
                </p>
              )}

              <div className="flex gap-2 justify-between pt-1">
                <Button variant="outline" size="sm" onClick={() => setStep(0)}>← Back</Button>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save & start syncing →"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ─── Green Invoice Setup Modal ────────────────────────────────────────────────

function GreenInvoiceSetupModal({ integration, open, onOpenChange, onComplete }) {
  const isConnected  = !!integration;
  const accountName  = integration?.config?.account_name;
  const [apiKey,         setApiKey]         = useState("");
  const [apiSecret,      setApiSecret]      = useState("");
  const [showSecret,     setShowSecret]     = useState(false);
  const [syncFrom,       setSyncFrom]       = useState(integration?.config?.sync_from || defaultSyncFrom());
  const [cadence,        setCadence]        = useState(integration?.config?.cadence || "daily");
  const [previewCount,   setPreviewCount]   = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setSyncFrom(integration?.config?.sync_from || defaultSyncFrom());
      setCadence(integration?.config?.cadence || "daily");
      setError(null);
    }
  }, [open, integration]);

  useEffect(() => {
    if (!isConnected || !syncFrom || !open) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const { count } = await apiCall(`/api/integrations/green-invoice/preview?since=${encodeURIComponent(syncFrom)}`);
        setPreviewCount(count);
      } catch { setPreviewCount(null); }
      finally { setPreviewLoading(false); }
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [syncFrom, isConnected, open]);

  const connectNew = async () => {
    if (!apiKey || !apiSecret) { setError("Both fields are required"); return; }
    setSaving(true); setError(null);
    try {
      await apiCall("/api/integrations/green-invoice", {
        method: "POST", body: JSON.stringify({ apiKey, apiSecret }),
      });
      onComplete();
      onOpenChange(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const saveSettings = async () => {
    setSaving(true); setError(null);
    try {
      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({ config: { ...integration.config, setup_complete: true, sync_from: syncFrom, auto_sync: true, cadence } }),
      });
      onComplete();
      onOpenChange(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: "#34d39922", border: "1px solid #34d39930" }}>
              🟢
            </div>
            <div>
              <DialogTitle>{isConnected ? "Green Invoice settings" : "Connect Green Invoice"}</DialogTitle>
              <DialogDescription>חשבונית ירוקה — pull received expense documents automatically</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {isConnected ? (
            <>
              <InfoBox variant="success">✓ Connected{accountName ? ` as ${accountName}` : ""}</InfoBox>

              <div>
                <FieldLabel>Import invoices from this date onwards</FieldLabel>
                <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
                  className="input" style={{ width: "auto", colorScheme: "dark" }} />
                <AnimatePresence mode="wait">
                  {previewLoading ? (
                    <motion.p key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="mt-1.5 text-xs text-muted-foreground">Checking available documents…</motion.p>
                  ) : previewCount !== null ? (
                    <motion.div key={previewCount} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mt-2">
                      <InfoBox variant={previewCount > 0 ? "success" : "default"}>
                        {previewCount > 0
                          ? `✓ Found ${previewCount} expense document${previewCount !== 1 ? "s" : ""} since ${syncFrom}`
                          : `No documents found since ${syncFrom}`}
                      </InfoBox>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <p className="mt-1.5 text-[11px] text-muted-foreground/40">Only received invoices (type 500) will be imported.</p>
              </div>

              <CadenceSelect value={cadence} onChange={setCadence} />
            </>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <div>
                  <FieldLabel>API ID</FieldLabel>
                  <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Green Invoice API ID" />
                </div>
                <div>
                  <FieldLabel>API Secret</FieldLabel>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      value={apiSecret} onChange={e => setApiSecret(e.target.value)}
                      placeholder="Green Invoice API Secret" className="pr-10"
                    />
                    <button onClick={() => setShowSecret(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer p-0">
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <InfoBox>Find your API keys in Green Invoice → Account Settings → API Keys.</InfoBox>
            </>
          )}

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={isConnected ? saveSettings : connectNew} disabled={saving}
              style={{ background: isConnected ? undefined : "linear-gradient(135deg,#34d39988,#34d399)" }}>
              {saving ? (isConnected ? "Saving…" : "Verifying…") : (isConnected ? "Save settings →" : "Connect →")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── WhatsApp Setup Modal ─────────────────────────────────────────────────────

function WhatsAppSetupModal({ integration, open, onOpenChange, onComplete }) {
  const config = integration?.config || {};
  const systemPhone = config.system_phone || "Pending assignment";
  const [phones,  setPhones]  = useState(
    (config.registered_phones || []).map(p => ({ phone: p.phone || "", label: p.label || "" }))
  );
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (open) {
      setPhones((config.registered_phones || []).map(p => ({ phone: p.phone || "", label: p.label || "" })));
      setError(null);
    }
  }, [open]);

  const addPhone    = () => setPhones(p => [...p, { phone: "", label: "" }]);
  const removePhone = i => setPhones(p => p.filter((_, j) => j !== i));
  const updatePhone = (i, field, val) => setPhones(p => p.map((ph, j) => j === i ? { ...ph, [field]: val } : ph));

  const save = async () => {
    const normalized = phones.map(p => ({ phone: normalizeIsraeliPhone(p.phone), label: p.label }));
    const invalid = normalized.filter(p => !p.phone || p.phone.length < 10);
    if (invalid.length > 0) { setError("Some phone numbers appear invalid. Use format: 0501234567 or +972501234567"); return; }

    setSaving(true); setError(null);
    try {
      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({ config: { ...config, setup_complete: true, registered_phones: normalized } }),
      });
      onComplete();
      onOpenChange(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: "#25D36622", border: "1px solid #25D36630" }}>
              💬
            </div>
            <div>
              <DialogTitle>WhatsApp settings</DialogTitle>
              <DialogDescription>Register supplier phone numbers to auto-import their invoice photos</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <InfoBox>
            Suppliers send invoice photos to <strong>{systemPhone}</strong> — they're imported automatically.
          </InfoBox>

          <div>
            <FieldLabel>Registered supplier numbers</FieldLabel>
            <div className="flex flex-col gap-2">
              {phones.map((ph, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input value={ph.phone} onChange={e => updatePhone(i, "phone", e.target.value)}
                    placeholder="0501234567" className="font-mono text-sm flex-1" />
                  <Input value={ph.label} onChange={e => updatePhone(i, "label", e.target.value)}
                    placeholder="Supplier name" className="text-sm flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => removePhone(i)}
                    className="flex-shrink-0 h-9 w-9 p-0 text-muted-foreground hover:text-destructive">
                    <XIcon className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addPhone}
                className="self-start gap-1.5 border-dashed text-muted-foreground hover:text-foreground">
                <Plus className="w-3.5 h-3.5" /> Add supplier number
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/40">Israeli numbers only (+972). You can add more suppliers later.</p>
          </div>

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </p>
          )}

          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={save} disabled={saving || phones.length === 0}>
              {saving ? "Saving…" : "Save suppliers →"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, setupComplete }) {
  if (status === "connected" && !setupComplete) {
    return (
      <Badge variant="outline" className="text-amber-400 border-amber-400/30 bg-amber-950/30 gap-1.5 text-[10px]">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
        Setup required
      </Badge>
    );
  }

  const cfg = {
    connected:    { cls: "text-green-400 border-green-400/30 bg-green-950/30",  dot: "bg-green-400",           label: "Connected",    pulse: true  },
    disconnected: { cls: "text-zinc-500 border-zinc-700/40 bg-zinc-900/30",     dot: "bg-zinc-500",            label: "Not connected", pulse: false },
    error:        { cls: "text-red-400 border-red-400/30 bg-red-950/30",        dot: "bg-red-400",             label: "Error",         pulse: false },
  }[status] || { cls: "text-muted-foreground border-border", dot: "bg-muted-foreground", label: status, pulse: false };

  return (
    <Badge variant="outline" className={cn("gap-1.5 text-[10px]", cfg.cls)}>
      {cfg.pulse ? (
        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
          className={cn("w-1.5 h-1.5 rounded-full inline-block", cfg.dot)} />
      ) : (
        <span className={cn("w-1.5 h-1.5 rounded-full inline-block", cfg.dot)} />
      )}
      {cfg.label}
    </Badge>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ type, integration, onReload }) {
  const meta           = INTEGRATION_META[type];
  const [syncing,      setSyncing]      = useState(false);
  const [syncFlash,    setSyncFlash]    = useState(null); // 'ok' | 'error' | null
  const [setupOpen,    setSetupOpen]    = useState(false);
  const [connecting,   setConnecting]   = useState(false);
  const [localError,   setLocalError]   = useState(null);

  const isConnected   = integration?.status === "connected";
  const setupComplete = integration?.config?.setup_complete === true;
  const isReady       = isConnected && setupComplete;
  const hasError      = integration?.status === "error";
  const isPending     = type === "whatsapp" && !WHATSAPP_ENABLED;
  const config        = integration?.config || {};

  // Auto-open setup when connected but not yet configured
  useEffect(() => {
    if (isConnected && !setupComplete && !meta.comingSoon) {
      setSetupOpen(true);
    }
  }, [isConnected, setupComplete, meta.comingSoon]);

  const handleConnect = async () => {
    setLocalError(null);
    if (type === "google_drive" || type === "gmail") {
      try {
        const returnUrl = encodeURIComponent(window.location.origin);
        const { url }   = await apiCall(`/api/integrations/google/auth-url?type=${type}&returnUrl=${returnUrl}`);
        window.location.href = url;
      } catch (err) { setLocalError(err.message); }
    } else if (type === "green_invoice") {
      setSetupOpen(true);
    } else if (type === "whatsapp") {
      setConnecting(true);
      try {
        await apiCall("/api/integrations/whatsapp/connect", { method: "POST" });
        await onReload();
        setSetupOpen(true);
      } catch (err) { setLocalError(err.message); }
      finally { setConnecting(false); }
    }
  };

  const handleSync = async () => {
    setSyncing(true); setSyncFlash(null); setLocalError(null);
    try {
      await apiCall(`/api/integrations/${integration.id}/sync`, { method: "POST" });
      setSyncFlash("ok");
      onReload();
      setTimeout(() => setSyncFlash(null), 2500);
    } catch (err) {
      setLocalError(err.message);
      setSyncFlash("error");
      onReload();
      setTimeout(() => setSyncFlash(null), 3000);
    } finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${meta.label}? Your imported invoices will be kept.`)) return;
    setLocalError(null);
    try {
      await apiCall(`/api/integrations/${integration.id}`, { method: "DELETE" });
      onReload();
    } catch (err) { setLocalError(err.message); }
  };

  const handleSetupComplete = () => { setSetupOpen(false); onReload(); };

  const configSummary = (() => {
    if (!isReady) return null;
    const parts = [];
    if (type === "google_drive") {
      parts.push(config.folder_name ? `📁 ${config.folder_name}` : "📁 Entire Drive");
    }
    if (type === "gmail") {
      if (config.scan_mode === "sender_filter" && config.sender_domains?.length)
        parts.push(`${config.sender_domains.length} sender${config.sender_domains.length !== 1 ? "s" : ""}`);
      else if (config.scan_mode === "label_filter" && config.gmail_label_name)
        parts.push(`Label: ${config.gmail_label_name}`);
      else parts.push("All attachments");
    }
    if (type === "green_invoice" && config.account_name) parts.push(config.account_name);
    if (type === "whatsapp" && config.registered_phones?.length)
      parts.push(`${config.registered_phones.length} supplier${config.registered_phones.length !== 1 ? "s" : ""}`);
    const cadenceLabel = CADENCE_OPTIONS.find(o => o.value === config.cadence)?.label;
    if (cadenceLabel) parts.push(cadenceLabel);
    return parts.join(" · ") || null;
  })();

  const errorDisplay = parseApiError(localError || (hasError ? integration?.error_message : null));

  const accentColor = (isReady || (isConnected && !setupComplete)) ? meta.color
    : hasError ? "#f87171"
    : null;

  const syncBtnContent = () => {
    if (syncing) return <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing…</>;
    if (syncFlash === "ok")    return <><Check className="w-3.5 h-3.5 text-green-400" /> <span className="text-green-400">Synced!</span></>;
    if (syncFlash === "error") return <><AlertCircle className="w-3.5 h-3.5 text-red-400" /> <span className="text-red-400">Failed</span></>;
    return <><RefreshCw className="w-3.5 h-3.5" /> Sync now</>;
  };

  return (
    <>
      <motion.div layout className={cn(
        "rounded-2xl border bg-card overflow-hidden transition-shadow hover:shadow-lg hover:shadow-black/20",
        hasError ? "border-red-500/30" : "border-border/50",
        meta.comingSoon ? "opacity-60" : ""
      )} style={accentColor ? { borderLeftColor: `${accentColor}50`, borderLeftWidth: 3 } : {}}>

        {/* Card header */}
        <div className="p-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${meta.color}18, ${meta.color}08)`,
                  border: `1px solid ${meta.color}25`,
                }}>
                {meta.icon}
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground">{meta.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{meta.description}</div>
              </div>
            </div>
            <div className="flex-shrink-0 pt-0.5">
              {meta.comingSoon ? (
                <Badge variant="outline" className="text-indigo-400 border-indigo-400/30 bg-indigo-950/30 text-[10px]">
                  Coming soon
                </Badge>
              ) : integration ? (
                <StatusBadge status={integration.status} setupComplete={setupComplete} />
              ) : (
                <StatusBadge status="disconnected" setupComplete={false} />
              )}
            </div>
          </div>

          {/* Config summary */}
          {configSummary && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground/60 bg-muted/20 px-3 py-1.5 rounded-lg">
              <Zap className="w-3 h-3 flex-shrink-0" />
              {configSummary}
            </div>
          )}

          {/* Error message */}
          {errorDisplay.message && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-start gap-2 text-xs text-red-400 bg-red-950/20 border border-red-500/20 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                {errorDisplay.message}
                {errorDisplay.url && (
                  <> — <a href={errorDisplay.url} target="_blank" rel="noopener noreferrer"
                    className="underline hover:text-red-300">Enable in Google Console ↗</a></>
                )}
              </span>
            </motion.div>
          )}

          {/* WhatsApp pending */}
          {isPending && !integration && (
            <div className="mt-3 text-xs text-muted-foreground/50 bg-muted/20 px-3 py-2 rounded-lg">
              ⏳ Awaiting Meta Business verification
            </div>
          )}
        </div>

        {/* Card footer */}
        {!meta.comingSoon && (
          <div className="px-5 py-3 border-t border-border/30 flex items-center gap-2 bg-muted/10">
            {/* Left: last sync time */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              {isReady && integration?.last_sync && (
                <>
                  <Clock className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground/50 truncate">
                    {relativeTime(integration.last_sync)}
                    {integration.sync_count > 0 && ` · ${integration.sync_count} invoice${integration.sync_count !== 1 ? "s" : ""}`}
                  </span>
                </>
              )}
              {isReady && !integration?.last_sync && type !== "whatsapp" && (
                <span className="text-[11px] text-muted-foreground/40">Ready to sync</span>
              )}
              {isReady && type === "whatsapp" && (
                <>
                  <Zap className="w-3 h-3 text-green-400/50 flex-shrink-0" />
                  <span className="text-[11px] text-muted-foreground/50">Live</span>
                </>
              )}
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-1.5">
              {/* Sync button (connected + setup complete + not whatsapp) */}
              {isReady && type !== "whatsapp" && (
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}
                  className="h-7 px-2.5 gap-1.5 text-xs border-border/60 hover:border-primary/30 hover:text-primary">
                  {syncBtnContent()}
                </Button>
              )}

              {/* Retry button (error + setup complete) */}
              {hasError && setupComplete && (
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}
                  className="h-7 px-2.5 gap-1.5 text-xs text-red-400 border-red-500/30 hover:bg-red-950/20">
                  <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                  {syncing ? "Retrying…" : "Retry"}
                </Button>
              )}

              {/* Settings button (connected) */}
              {(isReady || (isConnected && !setupComplete)) && (
                <Button variant="ghost" size="sm" onClick={() => setSetupOpen(true)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              )}

              {/* Disconnect button (connected) */}
              {(isReady || (isConnected && !setupComplete)) && (
                <Button variant="ghost" size="sm" onClick={handleDisconnect}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                  <Unplug className="w-3.5 h-3.5" />
                </Button>
              )}

              {/* Connect button (not connected) */}
              {!isConnected && !isPending && (
                <Button size="sm" onClick={handleConnect} disabled={connecting}
                  style={{ background: `linear-gradient(135deg, ${meta.color}bb, ${meta.color})` }}
                  className="h-7 px-3 text-xs text-white border-none hover:opacity-90 shadow-sm">
                  {connecting ? "Connecting…" : "Connect →"}
                </Button>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* Setup modals */}
      {integration && type === "google_drive" && (
        <GoogleDriveSetupModal
          integration={integration} open={setupOpen}
          onOpenChange={setSetupOpen} onComplete={handleSetupComplete}
        />
      )}
      {integration && type === "gmail" && (
        <GmailSetupModal
          integration={integration} open={setupOpen}
          onOpenChange={setSetupOpen} onComplete={handleSetupComplete}
        />
      )}
      {type === "green_invoice" && (
        <GreenInvoiceSetupModal
          integration={integration} open={setupOpen}
          onOpenChange={setSetupOpen} onComplete={handleSetupComplete}
        />
      )}
      {integration && type === "whatsapp" && (
        <WhatsAppSetupModal
          integration={integration} open={setupOpen}
          onOpenChange={setSetupOpen} onComplete={handleSetupComplete}
        />
      )}
    </>
  );
}

// ─── Notice banner ────────────────────────────────────────────────────────────

function NoticeBanner({ notice }) {
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium mb-5",
            notice.ok
              ? "bg-green-950/40 border-green-700/40 text-green-300"
              : "bg-red-950/40 border-red-700/40 text-red-300"
          )}
        >
          {notice.ok
            ? <Check className="w-4 h-4 flex-shrink-0 text-green-400" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          }
          {notice.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Page skeleton ────────────────────────────────────────────────────────────

function IntegrationsPageSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/30 bg-card p-5 space-y-3"
          style={{ opacity: 1 - i * 0.12 }}>
          <div className="flex items-center gap-3">
            <div className="shimmer w-10 h-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="shimmer h-3.5 w-24 rounded" />
              <div className="shimmer h-2.5 w-40 rounded" />
            </div>
          </div>
          <div className="shimmer h-7 w-full rounded-lg mt-1" />
        </div>
      ))}
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
    } catch (err) { console.error("integrations load:", err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!oauthResult) return;
    if (oauthResult.connected) {
      const label = INTEGRATION_META[oauthResult.connected]?.label || oauthResult.connected;
      setNotice({ ok: true, text: `${label} connected — complete the setup below to start syncing` });
      load();
    } else if (oauthResult.error) {
      setNotice({ ok: false, text: `Connection failed: ${oauthResult.error}` });
    }
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [oauthResult, load]);

  const integrationTypes = ["google_drive", "gmail", "green_invoice", "whatsapp", "bizzibox"];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="font-bold text-xl mb-1.5 text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect data sources to automatically import invoices — no manual upload needed.
        </p>
      </div>

      {/* OAuth result banner */}
      <NoticeBanner notice={notice} />

      {/* Cards grid */}
      {loading ? (
        <IntegrationsPageSkeleton />
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrationTypes.map(type => (
            <IntegrationCard
              key={type}
              type={type}
              integration={integrations[type] || null}
              onReload={load}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}
