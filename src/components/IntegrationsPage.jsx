import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DrivePicker, DrivePickerDocsView } from "@googleworkspace/drive-picker-react";
import { supabase } from "../lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Settings, Unplug, Check, ChevronRight, Globe, Clock, AlertCircle } from "lucide-react";

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
    label:      "Google Drive",
    icon:       "📁",
    description:"Watch a Google Drive folder and automatically import new invoices.",
    color:      "#4285F4",
  },
  gmail: {
    label:      "Gmail",
    icon:       "📧",
    description:"Scan your Gmail inbox for invoice attachments from suppliers.",
    color:      "#EA4335",
  },
  green_invoice: {
    label:      "Green Invoice",
    icon:       "🟢",
    description:"חשבונית ירוקה — pull received expense documents from your Green Invoice account.",
    color:      "#34d399",
  },
  whatsapp: {
    label:      "WhatsApp",
    icon:       "💬",
    description:"Suppliers send invoice photos over WhatsApp — they're imported automatically.",
    color:      "#25D366",
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

const GOOGLE_APP_ID      = import.meta.env.VITE_GOOGLE_APP_ID  || "";
const GOOGLE_API_KEY     = import.meta.env.VITE_GOOGLE_API_KEY || "";
const canUseGooglePicker = !!GOOGLE_APP_ID && !!GOOGLE_API_KEY;
const WHATSAPP_ENABLED   = import.meta.env.VITE_WHATSAPP_ENABLED === "true";

const CADENCE_OPTIONS = [
  { value: "hourly",    label: "Every hour" },
  { value: "every_4h", label: "Every 4 hours" },
  { value: "daily",    label: "Daily" },
  { value: "weekly",   label: "Weekly" },
];

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

// ─── Step transition ──────────────────────────────────────────────────────────

const stepVariants = {
  enter:  dir => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   dir => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

function StepAnimator({ step, dir, children }) {
  return (
    <AnimatePresence mode="wait" custom={dir}>
      <motion.div
        key={step} custom={dir} variants={stepVariants}
        initial="enter" animate="center" exit="exit"
        transition={{ duration: 0.22, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <motion.div
              animate={{
                background: i < current ? "hsl(var(--primary))"
                  : i === current ? "hsl(var(--primary))"
                  : "hsl(var(--muted))",
                scale: i === current ? 1.05 : 1,
              }}
              transition={{ duration: 0.25 }}
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ color: i <= current ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))" }}
            >
              {i < current ? <Check className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
            </motion.div>
            <span className={cn(
              "text-[11px] whitespace-nowrap font-medium",
              i === current ? "text-primary" : i < current ? "text-muted-foreground" : "text-muted-foreground/50"
            )}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className="flex-1 h-px mx-2 mb-5"
              style={{ background: i < current ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Wizard navigation footer ─────────────────────────────────────────────────

function WizardFooter({ onBack, onNext, onComplete, nextLabel, completeLabel, saving, error, canNext = true }) {
  return (
    <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border">
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="text-xs text-destructive"
        >
          {error}
        </motion.p>
      )}
      <div className="flex gap-2">
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            ← Back
          </Button>
        )}
        {onNext && (
          <Button size="sm" onClick={onNext} disabled={!canNext || saving}>
            {saving ? "Loading…" : (nextLabel || "Next →")}
          </Button>
        )}
        {onComplete && (
          <Button size="sm" onClick={onComplete} disabled={!canNext || saving}>
            {saving ? "Saving…" : (completeLabel || "Complete setup →")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

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
    <div className="flex gap-2 text-xs">
      <span className="min-w-[110px] flex-shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground/70">{value}</span>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider mb-1 text-muted-foreground">
      {children}
    </div>
  );
}

function InfoBox({ children, variant = "default" }) {
  return (
    <div className={cn(
      "text-xs px-3 py-2 rounded-md border",
      variant === "success"
        ? "bg-green-950/50 border-green-800/50 text-green-400"
        : "bg-background/50 border-border text-muted-foreground"
    )}>
      {children}
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

  const handlePicked = (e) => {
    setOpen(false);
    const docs = e.detail?.docs || [];
    if (docs.length > 0) onSelect(docs[0].id, docs[0].name);
  };

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={openPicker}
        disabled={loading}
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

// ─── Fallback: FolderBrowser ──────────────────────────────────────────────────

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

  const selectFolder = folder => { setSelectedId(folder.id); onSelect(folder.id, folder.name, fileCount); };
  const selectEntireDrive = () => { setSelectedId("root"); onSelect(null, null, 0); };

  return (
    <div>
      {/* Breadcrumb */}
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

      <div className="rounded-lg overflow-y-auto border border-border" style={{ background: "hsl(var(--muted) / 0.3)", height: 210, scrollbarWidth: "thin" }}>
        <button onClick={selectEntireDrive}
          className={cn("w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-none cursor-pointer transition-colors",
            selectedId === "root" ? "bg-primary/10 border-l-2 border-l-primary" : "bg-transparent hover:bg-muted/50 border-l-2 border-l-transparent"
          )}
          style={{ borderBottom: "1px solid hsl(var(--border))" }}>
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
  const [cadence,            setCadence]           = useState("daily");
  const [saving,             setSaving]            = useState(false);
  const [error,              setError]             = useState(null);
  const debounceRef = useRef(null);

  const go = s => { setDir(s > step ? 1 : -1); setStep(s); };

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
      const folderName = browseMode ? selectedFolderName : folderInfo?.name || null;
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
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const displayFolderName = browseMode
    ? (selectedFolderId === "root" || !selectedFolderId ? "Entire Drive" : selectedFolderName)
    : (folderInfo?.name || (folderUrl ? "Resolving…" : "Entire Drive"));

  const steps = ["Choose folder", "Scope the sync", "Confirm"];

  return (
    <>
      <StepIndicator steps={steps} current={step} />
      <StepAnimator step={step} dir={dir}>
        {step === 0 && (
          <div className="flex flex-col gap-3">
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
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold"
                      style={{ background: "hsl(142 76% 5%)", border: "1px solid hsl(142 76% 36% / 0.2)", color: "#4ade80" }}
                    >
                      <Check className="w-4 h-4 flex-shrink-0" />
                      <span>Selected: <strong>{selectedFolderName}</strong></span>
                      <button whileHover={{ scale: 1.1 }}
                        onClick={() => { setSelectedFolderId(null); setSelectedFolderName(null); setFolderInfo(null); }}
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
                  placeholder="Paste folder URL from Google Drive, or leave blank to watch all" />
                {folderLoading && <p className="text-xs mt-1 text-muted-foreground">Verifying folder…</p>}
                {folderInfo  && <p className="text-xs mt-1 text-green-400">✓ Found: "{folderInfo.name}" · {folderInfo.fileCount} files</p>}
                {folderError && <p className="text-xs mt-1 text-destructive">✗ {folderError}</p>}
              </div>
            )}

            <InfoBox>🔒 We only read files — we never modify or delete anything in your Drive.</InfoBox>
            <WizardFooter onNext={() => go(1)} />
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div>
              <FieldLabel>Import files from this date onwards</FieldLabel>
              <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
                className="input" style={{ width: "auto", colorScheme: "dark" }} />
              <p className="text-xs mt-1.5 text-muted-foreground/50">Only files modified on or after this date.</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={includeSubfolders} onCheckedChange={setIncludeSubfolders} />
              <span className="text-sm text-muted-foreground">Include subfolders</span>
            </label>
            <WizardFooter onBack={() => go(0)} onNext={() => go(2)} nextLabel="Review →" />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Setup summary</p>
            <SummaryRow label="Folder"     value={displayFolderName} />
            <SummaryRow label="Sync from"  value={syncFrom} />
            <SummaryRow label="Subfolders" value={includeSubfolders ? "Included" : "Top level only"} />
            {folderInfo?.fileCount > 0 && <SummaryRow label="Available files" value={`${folderInfo.fileCount} invoice files`} />}
            <div className="pt-2 border-t border-border">
              <CadenceSelect value={cadence} onChange={setCadence} />
            </div>
            <WizardFooter onBack={() => go(1)} onComplete={save} completeLabel="Start first sync" saving={saving} error={error} />
          </div>
        )}
      </StepAnimator>
    </>
  );
}

// ─── Gmail: SenderChip ────────────────────────────────────────────────────────

function SenderChip({ domain, name, count, selected, onToggle }) {
  return (
    <motion.button
      layout whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full cursor-pointer text-xs transition-colors",
        selected
          ? "bg-green-950/60 border border-green-700/40 text-green-400"
          : "bg-muted/50 border border-border text-muted-foreground hover:border-border/80"
      )}
    >
      <motion.span
        animate={{ background: selected ? "#4ade80" : "hsl(var(--muted-foreground))" }}
        className="w-2 h-2 rounded-full flex-shrink-0"
      />
      <span style={{ fontWeight: selected ? 600 : 400 }}>
        {name && name !== domain ? name : domain}
      </span>
      {name && name !== domain && (
        <span className={cn("text-[10px]", selected ? "text-green-300/60" : "text-muted-foreground/50")}>{domain}</span>
      )}
      <span className="px-1.5 py-0 rounded-full text-[10px] font-semibold ml-1 bg-border/50 text-muted-foreground">
        {count}
      </span>
    </motion.button>
  );
}

// ─── Gmail wizard ─────────────────────────────────────────────────────────────

function GmailWizard({ integration, onComplete }) {
  const [step,           setStep]           = useState(0);
  const [dir,            setDir]            = useState(1);
  const [scanMode,       setScanMode]       = useState("all");
  const [recentSenders,  setRecentSenders]  = useState([]);
  const [sendersLoading, setSendersLoading] = useState(false);
  const [sendersLoaded,  setSendersLoaded]  = useState(false);
  const [selectedDomains,setSelectedDomains]= useState(new Set());
  const [showManualInput,setShowManualInput]= useState(false);
  const [manualDomains,  setManualDomains]  = useState("");
  const [labels,         setLabels]         = useState([]);
  const [labelId,        setLabelId]        = useState("");
  const [labelName,      setLabelName]      = useState("");
  const [keywords,       setKeywords]       = useState("");
  const [showAdvanced,   setShowAdvanced]   = useState(false);
  const [syncFrom,       setSyncFrom]       = useState(defaultSyncFrom());
  const [cadence,        setCadence]        = useState("daily");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);

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
      apiCall("/api/integrations/gmail/labels").then(({ labels: l }) => setLabels(l)).catch(() => {});
    }
  }, [scanMode, sendersLoaded, sendersLoading, labels.length]);

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
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const steps = ["Filter emails", "Sync scope", "Confirm"];

  return (
    <>
      <StepIndicator steps={steps} current={step} />
      <StepAnimator step={step} dir={dir}>
        {step === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground/80 mb-1">Which emails should we watch?</p>

            {[
              { id: "all",           label: "All emails with PDF or image attachments" },
              { id: "sender_filter", label: "Only from specific senders (recommended)" },
              { id: "label_filter",  label: "Only emails with a specific Gmail label" },
            ].map(opt => (
              <motion.button
                key={opt.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                onClick={() => setScanMode(opt.id)}
                className={cn(
                  "px-3 py-2.5 rounded-lg border text-sm text-left w-full cursor-pointer transition-colors",
                  scanMode === opt.id
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"
                )}
              >
                <span className="mr-2 text-xs">{scanMode === opt.id ? "●" : "○"}</span>{opt.label}
              </motion.button>
            ))}

            <AnimatePresence>
              {scanMode === "sender_filter" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-1">
                    <p className="text-xs text-muted-foreground mb-2">
                      {sendersLoading ? "Detecting senders from recent emails…" :
                        recentSenders.length > 0 ? "Select which senders to import from:" :
                        "No recent business senders found — add manually below."}
                    </p>
                    {sendersLoading ? (
                      <div className="flex flex-wrap gap-2">
                        {[90, 120, 75, 105].map((w, i) => (
                          <div key={i} className="shimmer rounded-full" style={{ height: 30, width: w, opacity: 1 - i * 0.15 }} />
                        ))}
                      </div>
                    ) : recentSenders.length > 0 ? (
                      <motion.div className="flex flex-wrap gap-2">
                        {recentSenders.map((s, i) => (
                          <motion.div key={s.domain} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }}>
                            <SenderChip domain={s.domain} name={s.name} count={s.count}
                              selected={selectedDomains.has(s.domain)} onToggle={() => toggleDomain(s.domain)} />
                          </motion.div>
                        ))}
                      </motion.div>
                    ) : null}
                    {recentSenders.length > 0 && !showManualInput && (
                      <button onClick={() => setShowManualInput(true)}
                        className="mt-2.5 text-xs text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer p-0 underline">
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
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-1">
                  <FieldLabel>Gmail label</FieldLabel>
                  {labels.length === 0
                    ? <p className="text-sm text-muted-foreground">Loading labels…</p>
                    : <select value={labelId}
                        onChange={e => { setLabelId(e.target.value); setLabelName(labels.find(l => l.id === e.target.value)?.name || ""); }}
                        className="input" style={{ cursor: "pointer" }}>
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

            <InfoBox>🔒 Only file attachments are processed — email body text is never read or stored.</InfoBox>
            <WizardFooter onNext={() => go(1)} />
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div>
              <FieldLabel>Import emails received from this date onwards</FieldLabel>
              <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
                className="input" style={{ width: "auto", colorScheme: "dark" }} />
              <p className="text-xs mt-1.5 text-muted-foreground/50">Only emails received on or after this date.</p>
            </div>
            <WizardFooter onBack={() => go(0)} onNext={() => go(2)} nextLabel="Review →" />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Setup summary</p>
            <SummaryRow label="Scan mode" value={{ all: "All attachments", sender_filter: "Sender filter", label_filter: "Gmail label" }[scanMode]} />
            {scanMode === "sender_filter" && selectedDomains.size > 0 && (
              <SummaryRow label="Senders" value={[...selectedDomains, ...manualDomains.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)].join(", ")} />
            )}
            {scanMode === "label_filter" && labelName && <SummaryRow label="Label" value={labelName} />}
            {keywords && <SummaryRow label="Keywords" value={keywords} />}
            <SummaryRow label="Sync from" value={syncFrom} />
            <div className="pt-2 border-t border-border">
              <CadenceSelect value={cadence} onChange={setCadence} />
            </div>
            <WizardFooter onBack={() => go(1)} onComplete={save} completeLabel="Start first sync" saving={saving} error={error} />
          </div>
        )}
      </StepAnimator>
    </>
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
        method: "POST", body: JSON.stringify({ apiKey, apiSecret }),
      });
      onConnected(accountName);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-3 mt-2">
      <Input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Green Invoice API ID" />
      <Input value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="Green Invoice API Secret" type="password" />
      <p className="text-xs text-muted-foreground/50">Find these in Green Invoice → Account Settings → API Keys.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        size="sm"
        onClick={connect}
        disabled={saving}
        className="self-start"
        style={{ background: "linear-gradient(135deg,#34d39988,#34d399)" }}
      >
        {saving ? "Verifying credentials…" : "Connect"}
      </Button>
    </div>
  );
}

function GreenInvoiceWizard({ integration, onComplete }) {
  const [syncFrom,       setSyncFrom]       = useState(defaultSyncFrom());
  const [cadence,        setCadence]        = useState("daily");
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
      } catch { setPreviewCount(null); }
      finally { setPreviewLoading(false); }
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [syncFrom, integration.id]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      await apiCall(`/api/integrations/${integration.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({ config: { ...integration.config, setup_complete: true, sync_from: syncFrom, auto_sync: true, cadence } }),
      });
      onComplete();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      {accountName && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <InfoBox variant="success">✓ Connected as <strong>{accountName}</strong></InfoBox>
        </motion.div>
      )}

      <div>
        <FieldLabel>Import invoices from this date onwards</FieldLabel>
        <input type="date" value={syncFrom} onChange={e => setSyncFrom(e.target.value)}
          className="input" style={{ width: "auto", colorScheme: "dark" }} />

        <AnimatePresence mode="wait">
          {previewLoading ? (
            <motion.p key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-2 text-xs text-muted-foreground">Checking available documents…</motion.p>
          ) : previewCount !== null ? (
            <motion.div key={previewCount} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
              <InfoBox variant={previewCount > 0 ? "success" : "default"} className="mt-2.5">
                {previewCount > 0
                  ? `✓ Found ${previewCount} expense document${previewCount !== 1 ? "s" : ""} since ${syncFrom}`
                  : `No documents found since ${syncFrom}`}
              </InfoBox>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className="mt-2 text-xs text-muted-foreground/40">Only received invoices (document type 500) from Green Invoice will be imported.</p>
      </div>

      <div className="pt-2 border-t border-border">
        <CadenceSelect value={cadence} onChange={setCadence} />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button size="sm" onClick={save} disabled={saving} className="self-start">
        {saving ? "Saving…" : "Complete setup →"}
      </Button>
    </div>
  );
}

// ─── WhatsApp: SupplierPhoneRow ───────────────────────────────────────────────

function SupplierPhoneRow({ supplier, checked, phone, phoneError, onToggle, onPhoneChange }) {
  return (
    <motion.div layout className="flex items-center gap-2.5 py-2.5 border-b border-muted/30">
      <Checkbox checked={checked} onCheckedChange={onToggle}
        className="border-[#25D366]/40 data-[state=checked]:bg-[#25D366] data-[state=checked]:border-[#25D366]" />
      <span className={cn("flex-1 text-sm min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
        checked ? "text-foreground font-medium" : "text-muted-foreground")}>
        {supplier.name}
      </span>
      <AnimatePresence>
        {checked && (
          <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }} className="flex flex-col gap-0.5 flex-shrink-0 overflow-hidden">
            <input value={phone} onChange={e => onPhoneChange(e.target.value)}
              placeholder="0501234567" autoFocus
              className="input"
              style={{ width: 140, fontFamily: "monospace", fontSize: 12, borderColor: phoneError ? "#7f1d1d" : undefined }} />
            {phoneError && <p className="text-[10px] text-destructive">{phoneError}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── WhatsApp wizard ──────────────────────────────────────────────────────────

function WhatsAppWizard({ integration, onComplete }) {
  const [step,         setStep]         = useState(0);
  const [dir,          setDir]          = useState(1);
  const [savedContact, setSavedContact] = useState(false);
  const [suppliers,    setSuppliers]    = useState([]);
  const [suppLoading,  setSuppLoading]  = useState(true);
  const [checkedIds,   setCheckedIds]   = useState(new Set());
  const [phoneMap,     setPhoneMap]     = useState({});
  const [manualPhones, setManualPhones] = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState(null);
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
          const initChecked = new Set(); const initPhones = {};
          existing.forEach(p => {
            const sup = list.find(s => s.name === p.label);
            if (sup) { initChecked.add(sup.id); initPhones[sup.id] = p.phone; }
          });
          setCheckedIds(initChecked); setPhoneMap(initPhones);
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
        body: JSON.stringify({ config: {
          ...integration.config, setup_complete: true,
          registered_phones: registeredPhones, send_confirmation: true,
        }}),
      });
      onComplete();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const steps = ["Save contact", "Register suppliers", "Go live"];

  return (
    <>
      <StepIndicator steps={steps} current={step} />
      <StepAnimator step={step} dir={dir}>
        {step === 0 && (
          <div>
            <div className="text-center py-4">
              <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="text-[40px] mb-3">
                💬
              </motion.div>
              <p className="text-sm font-bold mb-1.5 text-foreground">Your Invoice WhatsApp number</p>
              <p className="text-2xl font-bold mb-1 tracking-wider" style={{ color: "#25D366" }}>{systemPhone}</p>
              <p className="text-xs text-muted-foreground mb-4">Save this number in your contacts as "Invoice Bot" so suppliers can send invoices to it.</p>
              <Button variant="outline" size="sm"
                onClick={() => window.open(`https://wa.me/${systemPhone.replace(/\D/g, "")}`, "_blank")}
                className="border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#25D366] mb-4">
                Open in WhatsApp ↗
              </Button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={savedContact} onCheckedChange={setSavedContact}
                className="border-[#25D366]/40 data-[state=checked]:bg-[#25D366] data-[state=checked]:border-[#25D366]" />
              <span className="text-sm text-muted-foreground">I've saved the number in my contacts</span>
            </label>
            <WizardFooter onNext={() => { if (savedContact) go(1); }} canNext={savedContact} />
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="text-sm font-semibold text-foreground/80 mb-0.5">Which suppliers will send invoice photos on WhatsApp?</p>
            <p className="text-xs text-muted-foreground mb-3">Check a supplier and enter their WhatsApp number.</p>

            {suppLoading ? (
              <ShimmerRows count={4} height={40} />
            ) : suppliers.length > 0 ? (
              <div className="max-h-60 overflow-y-auto mb-2" style={{ scrollbarWidth: "thin" }}>
                {suppliers.map((sup, i) => (
                  <SupplierPhoneRow key={sup.id} supplier={sup}
                    checked={checkedIds.has(sup.id)} phone={phoneMap[sup.id] || ""}
                    phoneError={supplierPhoneErrors[i]}
                    onToggle={() => toggleSupplier(sup.id)}
                    onPhoneChange={val => setPhoneMap(m => ({ ...m, [sup.id]: val }))} />
                ))}
              </div>
            ) : (
              <InfoBox className="mb-2">No suppliers yet — add phone numbers below and they'll match when suppliers send messages.</InfoBox>
            )}

            <div className="pt-3 mt-2 border-t border-border">
              {suppliers.length > 0 && <p className="text-xs text-muted-foreground mb-2">Supplier not in your list?</p>}
              {manualPhones.map((ph, i) => (
                <div key={i} className="flex gap-1.5 mb-2 items-start">
                  <div className="flex-1">
                    <Input value={ph.phone} onChange={e => updateManualPhone(i, "phone", e.target.value)}
                      placeholder="0501234567"
                      className={cn("font-mono text-xs", manualPhoneErrors[i] && "border-destructive")} />
                    {manualPhoneErrors[i] && <p className="text-[10px] mt-0.5 text-destructive">{manualPhoneErrors[i]}</p>}
                  </div>
                  <Input value={ph.label} onChange={e => updateManualPhone(i, "label", e.target.value)} placeholder="Supplier name" className="text-xs" />
                  <Button variant="destructive" size="sm" onClick={() => removeManualPhone(i)} className="flex-shrink-0">✕</Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addManualPhone} className="border-dashed text-muted-foreground">
                + Add supplier
              </Button>
            </div>
            <p className="text-xs mt-2.5 text-muted-foreground/40">Israeli numbers only (+972). Add more suppliers later in settings.</p>
            <WizardFooter onBack={() => go(0)} onNext={() => { if (canProceed) go(2); }} canNext={canProceed} nextLabel="Review →" />
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Setup summary</p>
            <SummaryRow label="System number" value={systemPhone} />
            <SummaryRow label="Registered suppliers"
              value={registeredPhones.map(p => `${p.label || "Unnamed"} (${p.phone})`).join(", ")} />
            <SummaryRow label="Auto-reply" value="Enabled — suppliers get a confirmation after each import" />
            <InfoBox>Once live, any invoice photo sent to {systemPhone} by a registered supplier will automatically appear in your Invoices tab.</InfoBox>
            <WizardFooter onBack={() => go(1)} onComplete={save} completeLabel="Go live →" saving={saving} error={error} />
          </div>
        )}
      </StepAnimator>
    </>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, setupComplete }) {
  if (status === "connected" && !setupComplete) {
    return (
      <Badge variant="outline" className="text-yellow-400 border-yellow-400/30 bg-yellow-950/30 gap-1.5 text-[10px]">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
        Setup required
      </Badge>
    );
  }
  const cfg = {
    connected:    { className: "text-green-400 border-green-400/30 bg-green-950/30",   dot: "bg-green-400",   label: "Connected"    },
    disconnected: { className: "text-violet-400 border-violet-400/30 bg-violet-950/30", dot: "bg-violet-400",  label: "Disconnected" },
    error:        { className: "text-red-400 border-red-400/30 bg-red-950/30",           dot: "bg-red-400",     label: "Error"        },
  }[status] || { className: "text-muted-foreground border-border", dot: "bg-muted-foreground", label: status };

  return (
    <Badge variant="outline" className={cn("gap-1.5 text-[10px]", cfg.className)}>
      {status === "connected" && setupComplete ? (
        <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }}
          className={cn("w-1.5 h-1.5 rounded-full inline-block", cfg.dot)} />
      ) : (
        <span className={cn("w-1.5 h-1.5 rounded-full inline-block", cfg.dot)} />
      )}
      {cfg.label}
    </Badge>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const relativeTime = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

const parseApiError = (msg) => {
  if (!msg) return { message: null, url: null };
  const url = (msg.match(/https?:\/\/[^\s)]+/) || [])[0] || null;
  if (msg.includes("has not been used") || msg.includes("is disabled")) {
    const apiName = msg.toLowerCase().includes("gmail") ? "Gmail" : "Google Drive";
    return { message: `${apiName} API is not enabled in your Google Cloud project.`, url };
  }
  return { message: msg, url };
};

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({ type, integration, onSync, onDisconnect }) {
  const meta           = INTEGRATION_META[type];
  const [syncing,      setSyncing]      = useState(false);
  const [wizardOpen,   setWizardOpen]   = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [lastAdded,    setLastAdded]    = useState(null);
  const [connecting,   setConnecting]   = useState(false);
  const [localError,   setLocalError]   = useState(null);

  const isConnected   = integration?.status === "connected";
  const setupComplete = integration?.config?.setup_complete === true;
  const isReady       = isConnected && setupComplete;
  const hasError      = integration?.status === "error";
  const isPending     = type === "whatsapp" && !WHATSAPP_ENABLED;

  const handleConnect = async () => {
    setLocalError(null);
    if (type === "google_drive" || type === "gmail") {
      try {
        const returnUrl = encodeURIComponent(window.location.origin);
        const { url }   = await apiCall(`/api/integrations/google/auth-url?type=${type}&returnUrl=${returnUrl}`);
        window.location.href = url;
      } catch (err) { setLocalError(err.message); }
    } else if (type === "green_invoice") {
      setShowForm(true);
    } else if (type === "whatsapp") {
      setConnecting(true);
      try {
        await apiCall("/api/integrations/whatsapp/connect", { method: "POST" });
        await onSync();
        setWizardOpen(true);
      } catch (err) { setLocalError(err.message); }
      finally { setConnecting(false); }
    }
  };

  const handleSync = async () => {
    setSyncing(true); setLastAdded(null); setLocalError(null);
    try {
      const { added } = await apiCall(`/api/integrations/${integration.id}/sync`, { method: "POST" });
      setLastAdded(added); onSync();
    } catch (err) { setLocalError(err.message); onSync(); }
    finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${meta.label}? Your imported invoices will be kept.`)) return;
    setLocalError(null);
    try {
      await apiCall(`/api/integrations/${integration.id}`, { method: "DELETE" });
      onDisconnect(type);
    } catch (err) { setLocalError(err.message); }
  };

  const wizardDone = () => { setWizardOpen(false); onSync(); };

  // Open wizard automatically when connected but not set up yet
  useEffect(() => {
    if (isConnected && !setupComplete) setWizardOpen(true);
  }, [isConnected, setupComplete]);

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
    if (config.cadence) {
      const cadenceLabel = CADENCE_OPTIONS.find(o => o.value === config.cadence)?.label;
      if (cadenceLabel) parts.push(`Auto-sync: ${cadenceLabel.toLowerCase()}`);
    }
    return parts.length ? parts.join(" · ") : null;
  })();

  const hasWizard = type === "google_drive" || type === "gmail" || type === "green_invoice" || type === "whatsapp";

  const errorDisplay = parseApiError(localError || (hasError ? integration?.error_message : null));
  const showErrorBox = !!errorDisplay.message;

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Card className={cn(
          "overflow-hidden transition-all duration-200",
          !meta.comingSoon && !isPending && "hover:border-border/60",
          meta.comingSoon && "opacity-60"
        )}
          style={{ borderColor: isReady && !showErrorBox ? `${meta.color}25` : undefined }}
        >
          {/* ── Card body ── */}
          <CardContent className="p-5 pb-4">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${meta.color}20, ${meta.color}0a)`,
                  border: `1px solid ${meta.color}18`,
                  boxShadow: `0 2px 8px ${meta.color}10`,
                }}
              >
                {meta.icon}
              </div>

              {/* Title + status + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-foreground leading-tight">{meta.label}</span>
                  {meta.comingSoon
                    ? <Badge variant="outline" className="text-[10px] text-muted-foreground border-border flex-shrink-0">Soon</Badge>
                    : isPending
                    ? <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30 bg-amber-950/20 gap-1 flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                        Pending
                      </Badge>
                    : <StatusBadge status={integration?.status || "disconnected"} setupComplete={setupComplete} />
                  }
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {isPending
                    ? "Available once Meta Business verification is complete."
                    : meta.description}
                </p>
              </div>
            </div>

            {/* Error box */}
            <AnimatePresence>
              {showErrorBox && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-lg bg-destructive/8 border border-destructive/20 px-3 py-2.5 flex gap-2.5 items-start">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-destructive leading-relaxed">{errorDisplay.message}</p>
                      {errorDisplay.url && (
                        <a
                          href={errorDisplay.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-destructive/80 underline underline-offset-2 hover:text-destructive mt-0.5 inline-block"
                        >
                          Enable in Cloud Console →
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Stats row */}
            {isReady && statsLine && !showErrorBox && (
              <p className="mt-3 text-[11px] text-muted-foreground/60 leading-relaxed">{statsLine}</p>
            )}

            {/* Sync success feedback */}
            <AnimatePresence>
              {lastAdded !== null && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={cn("mt-2 text-xs font-medium", lastAdded > 0 ? "text-green-400" : "text-muted-foreground/60")}>
                  {lastAdded > 0 ? `✓ ${lastAdded} new invoice${lastAdded !== 1 ? "s" : ""} added` : "No new invoices found"}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Green Invoice credential form (inline before connecting) */}
            {!isConnected && showForm && type === "green_invoice" && (
              <div className="mt-4">
                <GreenInvoiceConnect onConnected={() => { setShowForm(false); onSync(); }} />
              </div>
            )}
          </CardContent>

          {/* ── Card footer ── */}
          {!meta.comingSoon && (
            <div className="px-5 py-3 border-t border-border/40 flex items-center gap-2">
              {/* Left: last sync time or status hint */}
              <div className="flex-1 min-w-0">
                {isReady && integration?.last_sync && (
                  <span className="text-[11px] text-muted-foreground/50">
                    Last synced {relativeTime(integration.last_sync)}
                    {integration.sync_count > 0 && ` · ${integration.sync_count} invoices`}
                  </span>
                )}
                {isReady && !integration?.last_sync && type !== "whatsapp" && (
                  <span className="text-[11px] text-muted-foreground/50">Ready to sync</span>
                )}
                {isReady && type === "whatsapp" && (
                  <span className="text-[11px] text-muted-foreground/50">Live — auto-imports on WhatsApp</span>
                )}
              </div>

              {/* Right: action buttons */}
              <div className="flex items-center gap-1.5">
                {isReady && type !== "whatsapp" && (
                  <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}
                    className="h-7 px-2.5 gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/10 hover:text-primary">
                    <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
                    {syncing ? "Syncing…" : "Sync"}
                  </Button>
                )}
                {hasError && setupComplete && (
                  <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}
                    className="h-7 px-2.5 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                    <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
                    {syncing ? "Retrying…" : "Retry"}
                  </Button>
                )}
                {isReady && (
                  <Button variant="ghost" size="sm" onClick={() => setWizardOpen(true)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                )}
                {(isReady || (isConnected && !setupComplete)) && (
                  <Button variant="ghost" size="sm" onClick={handleDisconnect}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                    <Unplug className="w-3.5 h-3.5" />
                  </Button>
                )}
                {!isConnected && !isPending && (
                  <Button size="sm" onClick={handleConnect} disabled={connecting}
                    style={{ background: `linear-gradient(135deg,${meta.color}cc,${meta.color})` }}
                    className="h-7 px-3 text-xs text-white border-none hover:opacity-90 shadow-sm">
                    {connecting ? "Connecting…" : "Connect"}
                  </Button>
                )}
                {isPending && (
                  <Button size="sm" onClick={() => setWizardOpen(true)} variant="outline"
                    className="h-7 px-3 text-xs text-amber-400 border-amber-400/30 hover:bg-amber-950/40 hover:text-amber-300">
                    Pre-configure
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Wizard Sheet (slide-over panel) */}
      {hasWizard && (integration || isPending) && (
        <Sheet open={wizardOpen} onOpenChange={setWizardOpen}>
          <SheetContent>
            <SheetHeader>
              <div className="flex items-center gap-3 pr-6">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${meta.color}22, ${meta.color}10)`, border: `1px solid ${meta.color}20` }}
                >
                  {meta.icon}
                </div>
                <div>
                  <SheetTitle>{isReady ? `${meta.label} settings` : `Set up ${meta.label}`}</SheetTitle>
                  <SheetDescription>{meta.description}</SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "thin" }}>
              {integration && type === "google_drive"  && <GoogleDriveWizard  integration={integration} onComplete={wizardDone} />}
              {integration && type === "gmail"         && <GmailWizard        integration={integration} onComplete={wizardDone} />}
              {integration && type === "green_invoice" && <GreenInvoiceWizard integration={integration} onComplete={wizardDone} />}
              {(integration || isPending) && type === "whatsapp" && (
                integration
                  ? <WhatsAppWizard integration={integration} onComplete={wizardDone} />
                  : <div className="flex flex-col gap-4 text-center py-8">
                      <div className="text-5xl">⏳</div>
                      <p className="text-sm font-semibold text-foreground">Pending Meta verification</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        WhatsApp will be available once Meta Business verification completes.
                        Once live, supplier invoice photos sent to your dedicated number will automatically appear in your Invoices tab.
                      </p>
                    </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
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
        <h2 className="font-bold text-xl mb-1.5 text-foreground">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect data sources to automatically import invoices — no manual upload needed.</p>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={cn("mb-5 px-4 py-2.5 rounded-lg text-sm border",
              notice.ok ? "bg-green-950/50 border-green-800/50 text-green-400" : "bg-red-950/50 border-red-800/50 text-red-400"
            )}>
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="shimmer rounded-xl" style={{ height: 110, opacity: 1 - (i - 1) * 0.18 }} />
          ))}
        </div>
      ) : (
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          initial="hidden" animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.07 } } }}>
          {Object.keys(INTEGRATION_META).map(type => (
            <IntegrationCard key={type} type={type}
              integration={integrations[type] || null}
              onSync={load} onDisconnect={handleDisconnect} />
          ))}
        </motion.div>
      )}

      <div className="mt-7 px-4 py-3.5 rounded-lg text-xs leading-relaxed border border-border/40 text-muted-foreground/50">
        <p className="font-semibold mb-1 text-muted-foreground">How syncing works</p>
        Connected sources run on the schedule you choose during setup. WhatsApp syncs automatically
        as photos arrive. New invoices are AI-extracted, matched to your supplier list, and
        deduplicated — invoices already in the system are never added twice.
      </div>
    </div>
  );
}
