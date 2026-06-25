import { useState, useRef, useCallback, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth }            from "./contexts/AuthContext";
import { useInvoiceData }     from "./hooks/useInvoiceData";
import { useNotifications }   from "./hooks/useNotifications";
import { useSyncJob }         from "./hooks/useSyncJob";
import { usePlan }            from "./hooks/usePlan";
import LoginPage              from "./pages/LoginPage";
import AdminPage              from "./pages/AdminPage";
import NavBar                 from "./components/NavBar";
import Dashboard              from "./components/Dashboard";
import InvoicesView           from "./components/InvoicesView";
import CalendarView           from "./components/CalendarView";
import IntegrationsPage       from "./components/IntegrationsPage";
import EditInvoiceModal       from "./components/EditInvoiceModal";
import SuppliersModal         from "./components/SuppliersModal";
import AttachmentPreviewModal from "./components/AttachmentPreviewModal";
import UsageBanner            from "./components/UsageBanner";
import UpgradeModal           from "./components/UpgradeModal";
import { processPdf, fileToBase64, extractInvoice, translateSupplierName } from "./utils/image";
import { findDuplicates, parseCSV, isLatinOnly }                           from "./utils/invoice";
import { calcDueDate, toYM, correctSwappedDate }                           from "./utils/dates";
import { STATUS }                                    from "./constants";
import { supabase }                                  from "./lib/supabase";

// SHA-256 hex of a file — used to name attachment objects so repeat uploads
// (including every page of one PDF) dedup to a single stored original.
const sha256Hex = async file => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// Store the original file in the active backend and return attachment columns.
// Asks the API which backend is active: 'r2' → presigned PUT direct to R2;
// otherwise (or on any presign hiccup) → Supabase Storage via the SDK as before.
const uploadOriginal = async (file, userId, accessToken) => {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  let fileHash = null;
  try { fileHash = await sha256Hex(file); } catch { /* hashing is best-effort */ }

  let presign = { backend: 'supabase' };
  try {
    const res = await fetch('/api/attachments/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ filename: file.name, contentType: file.type, fileHash }),
    });
    if (res.ok) presign = await res.json();
  } catch { /* fall back to Supabase direct upload */ }

  if (presign.backend === 'r2' && presign.uploadUrl) {
    const put = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!put.ok) throw new Error(`upload failed (${put.status})`);
    return { attachment_path: presign.key, attachment_backend: 'r2', file_hash: fileHash, attachment_status: 'present' };
  }

  const key = `${userId}/${fileHash || `${Date.now()}-${Math.random().toString(36).slice(2)}`}.${ext}`;
  const { error } = await supabase.storage
    .from('invoice-attachments')
    .upload(key, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  return { attachment_path: key, attachment_backend: 'supabase', file_hash: fileHash, attachment_status: 'present' };
};

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  const [view,            setView]            = useState("dashboard");
  const [extracting,      setExtracting]      = useState(false);
  const [extractMsg,      setExtractMsg]      = useState(null);
  const [editInvoice,     setEditInvoice]     = useState(null);
  const [showSuppliers,   setShowSuppliers]   = useState(false);
  const [editSupplier,    setEditSupplier]    = useState(null);
  const [calMonth,        setCalMonth]        = useState(() => toYM(new Date()));
  const [oauthResult,     setOAuthResult]     = useState(null);
  const [showNotifPanel,  setShowNotifPanel]  = useState(false);
  const [previewUrl,      setPreviewUrl]      = useState(null);
  const [previewFilename, setPreviewFilename] = useState(null);
  const [loadingPreview,  setLoadingPreview]  = useState(false);
  const [preSelMonth,     setPreSelMonth]     = useState(null);
  const [fading,          setFading]          = useState(false);
  const fileRef = useRef();
  const csvRef  = useRef();

  // Handle OAuth redirect params and view= param from Google OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam      = params.get("view");
    const oauthConnected = params.get("oauth_connected");
    const oauthError     = params.get("oauth_error");
    if (viewParam === "integrations") {
      setView("integrations");
      if (oauthConnected) setOAuthResult({ connected: oauthConnected });
      if (oauthError)     setOAuthResult({ error: decodeURIComponent(oauthError) });
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const {
    suppliers, invoices, computed, dupeIds, monthlyData, allNames, color, maxTotal, kpis, loading,
    addInvoice, updateInvoice, deleteInvoice, bulkMarkPaid, bulkMarkUnpaid, bulkDelete,
    addSupplier, updateSupplier, deleteSupplier,
    getSupplier, refreshInvoices, appendInvoices,
  } = useInvoiceData();

  const { notifications, unreadCount, markAllRead, refresh: refreshNotifications } = useNotifications();

  const { jobs: syncJobs, startSync, clearJob: clearSyncJob, cancelSync, activeJob: activeSyncJob } = useSyncJob({
    onBatchDone: appendInvoices,
    onJobDone:   () => refreshNotifications(),
  });

  const { plan, limit, used, remaining, pct, isAtLimit, isNearLimit, refresh: refreshPlan } = usePlan();
  const [upgradeModalDismissed, setUpgradeModalDismissed] = useState(false);
  const [upgradeModalForced,    setUpgradeModalForced]    = useState(false);
  const showUpgradeModal = (isAtLimit && !upgradeModalDismissed) || upgradeModalForced;
  const openUpgrade  = () => { setUpgradeModalDismissed(false); setUpgradeModalForced(true); };
  const closeUpgrade = () => { setUpgradeModalDismissed(true);  setUpgradeModalForced(false); };

  const handleViewAttachment = useCallback(async inv => {
    setLoadingPreview(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/invoices/${inv.id}/attachment-url`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load attachment");
      setPreviewFilename(inv.source_file || "Invoice");
      setPreviewUrl(json.url);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const handleUpload = useCallback(async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setExtracting(true);
    setExtractMsg({ text: `Processing ${files.length} file${files.length > 1 ? "s" : ""}…`, ok: null });

    // Pre-filter by filename to avoid wasting API tokens on already-uploaded files
    const existingFileNames = new Set(invoices.map(i => i.source_file).filter(Boolean).map(n => n.toLowerCase()));
    const [toExtract, fileSkipped] = files.reduce(([ok, skip], f) =>
      existingFileNames.has(f.name.toLowerCase()) ? [ok, [...skip, f]] : [[...ok, f], skip],
      [[], []]
    );

    const imageResults = await Promise.allSettled(
      toExtract.map(f => f.type === "application/pdf" ? processPdf(f) : fileToBase64(f).then(img => [img]))
    );

    // Flatten: each PDF page becomes its own extraction unit
    const pageUnits = [];
    imageResults.forEach((r, i) => {
      if (r.status === "rejected") {
        pageUnits.push({ file: toExtract[i], error: r.reason });
      } else {
        r.value.forEach(pageImage => pageUnits.push({ file: toExtract[i], pageImage }));
      }
    });

    const extractResults = await Promise.allSettled(
      pageUnits.map(unit => {
        if (unit.error) return Promise.reject(new Error(`${unit.file.name}: ${unit.error.message}`));
        return extractInvoice(unit.pageImage).then(ex => ({ file: unit.file, ex }));
      })
    );

    const candidateResults = await Promise.allSettled(
      extractResults.map(async (r, i) => {
        if (r.status === "rejected") throw new Error(r.reason?.message || `${pageUnits[i].file.name}: failed`);
        const { file, ex } = r.value;
        const invoiceDate = correctSwappedDate(ex.invoiceDate) || ex.invoiceDate || "";
        let sup = getSupplier(ex.supplier);
        if (!sup && isLatinOnly(ex.supplier)) {
          const hebrew = await translateSupplierName(ex.supplier);
          if (hebrew) sup = getSupplier(hebrew) || null;
        }
        const isCredit  = ex.type === "credit";
        const rawAmount = Math.abs(Number(ex.amount)) || 0;
        const due       = isCredit ? null : calcDueDate(invoiceDate, sup);
        return {
          file,
          candidate: {
            supplier:     sup?.name || ex.supplier || "",
            invoice_no:   ex.invoiceNo   || "",
            invoice_date: invoiceDate,
            amount:       isCredit ? -rawAmount : rawAmount,
            due_date:     isCredit ? "" : (due ? due.toISOString().split("T")[0] : ""),
            status:       isCredit ? STATUS.CREDIT : STATUS.UNPAID,
            invoice_type: isCredit ? "credit" : "invoice",
            notes:        "",
            source_file:  file.name,
          },
        };
      })
    );

    const candidates = [], errors = [];
    candidateResults.forEach((r, i) => {
      if (r.status === "rejected") { errors.push(r.reason?.message || `${pageUnits[i].file.name}: failed`); return; }
      candidates.push(r.value);
    });

    // Deduplicate against existing invoices
    const computedForDedup = computed.map(inv => ({
      ...inv,
      supplier: getSupplier(inv.supplier)?.name || inv.supplier,
    }));
    const withTempIds = candidates.map((c, i) => ({
      ...c.candidate,
      id: `__new_${i}`,
      invoiceNo:   c.candidate.invoice_no,
      invoiceDate: c.candidate.invoice_date,
    }));
    const dupeSet = findDuplicates([...computedForDedup, ...withTempIds]);
    const toAdd = candidates.filter((_, i) => !dupeSet.has(`__new_${i}`));
    const contentDupeCount = candidates.length - toAdd.length;

    // Add non-duplicate candidates (store original file first so it's openable)
    const { data: { session: uploadSession } } = await supabase.auth.getSession();
    let added = 0, attachmentIssues = 0;
    await Promise.allSettled(
      toAdd.map(async ({ file, candidate }) => {
        try {
          let attachment;
          try {
            attachment = await uploadOriginal(file, user.id, uploadSession?.access_token);
          } catch (upErr) {
            // Keep the invoice but flag the missing original for repair.
            console.warn(`attachment upload failed for ${file.name}:`, upErr.message);
            attachment = { attachment_status: 'missing' };
            attachmentIssues++;
          }
          await addInvoice({ ...candidate, ...attachment });
          added++;
        } catch (err) {
          errors.push(`${file.name}: ${err.message}`);
        }
      })
    );

    setExtracting(false);
    if (added > 0) refreshPlan();
    const parts = [];
    if (added) parts.push(`${added} added`);
    if (fileSkipped.length) parts.push(`${fileSkipped.length} already uploaded`);
    if (contentDupeCount) parts.push(`${contentDupeCount} already exist`);
    if (attachmentIssues) parts.push(`${attachmentIssues} saved without file`);
    if (errors.length) parts.push(`${errors.length} failed: ${errors[0]}`);
    const hasIssue = fileSkipped.length || contentDupeCount || attachmentIssues || errors.length;
    setExtractMsg({ text: (added && !hasIssue ? "✓ " : "") + (parts.join(" · ") || "nothing to add"), ok: !hasIssue && added > 0 });
    setTimeout(() => setExtractMsg(null), 5000);
    e.target.value = "";
    if (added > 0) refreshNotifications();
  }, [invoices, suppliers, addInvoice, getSupplier, computed]);

  const handleCSV = useCallback(async e => {
    const file = e.target.files[0]; if (!file) return;
    const parsed = parseCSV(await file.text());
    if (parsed.length) {
      const results = await Promise.allSettled(parsed.map(s => addSupplier({ name: s.name, terms: s.terms || "shotef", notes: s.notes || "" })));
      const failed = results.filter(r => r.status === "rejected");
      if (failed.length) {
        setExtractMsg({ text: `${parsed.length - failed.length} added · ${failed.length} failed: ${failed[0].reason?.message || "unknown error"}`, ok: false });
      } else {
        setExtractMsg({ text: `✓ ${parsed.length} suppliers loaded`, ok: true });
      }
    } else {
      setExtractMsg({ text: "Could not parse CSV — expected columns: name, terms, notes", ok: false });
    }
    setTimeout(() => setExtractMsg(null), 5000);
    e.target.value = "";
  }, [addSupplier]);

  const payMonth = useCallback(ym => {
    setFading(true);
    setTimeout(() => {
      setPreSelMonth(ym);
      setView("invoices");
      setFading(false);
    }, 160);
  }, []);

  if (authLoading) return (
    <Routes>
      <Route path="*" element={
        <div style={{ background:"var(--bg)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ color:"var(--t3)", fontSize:14 }}>Loading…</div>
        </div>
      } />
    </Routes>
  );

  if (!user) return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*"      element={<Navigate to="/login" replace />} />
    </Routes>
  );

  if (loading) return (
    <div style={{ background:"var(--bg)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"var(--t3)", fontSize:14 }}>Loading…</div>
    </div>
  );

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/app" replace />} />
      <Route path="*" element={
    <div style={{ background:"var(--bg)", minHeight:"100vh", color:"var(--t1)" }}>
      <NavBar view={view} setView={setView} suppliersCount={suppliers.length}
        onSuppliersClick={() => setShowSuppliers(true)} user={user} onSignOut={signOut}
        integrationError={false}
        unreadCount={unreadCount}
        onBellClick={() => { setShowNotifPanel(v => !v); if (!showNotifPanel) markAllRead(); }}
        plan={plan}
        onUpgrade={openUpgrade}
      />

      <UsageBanner plan={plan} used={used} limit={limit} remaining={remaining} onUpgrade={openUpgrade} />

      {showUpgradeModal && (
        <UpgradeModal
          plan={plan} used={used} limit={limit}
          onContinueReadonly={closeUpgrade}
        />
      )}

      {/* Notification panel — slides in from top-right below navbar */}
      {showNotifPanel && (
        <div style={{ position:"fixed", top:60, right:24, zIndex:50, width:320,
          background:"var(--surf)", border:"1px solid var(--bdr2)", borderRadius:12,
          boxShadow:"0 16px 40px rgba(0,0,0,.5)", overflow:"hidden", animation:"fadeIn .2s" }}
          onMouseLeave={() => {}}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid var(--bdr)" }}>
            <span style={{ fontSize:13, fontWeight:700 }}>Notifications</span>
            <button onClick={() => setShowNotifPanel(false)}
              style={{ background:"none", border:"none", color:"var(--t3)", cursor:"pointer", fontSize:14 }}>✕</button>
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding:"24px 16px", textAlign:"center", color:"#334155", fontSize:13 }}>No notifications yet</div>
          ) : (
            <div style={{ maxHeight:360, overflowY:"auto" }}>
              {notifications.map(n => {
                const srcLabel = n.integration_type
                  ? { google_drive:"Drive", gmail:"Gmail", whatsapp:"WhatsApp", green_invoice:"GreenInv" }[n.integration_type] || n.integration_type
                  : "Manual";
                const ago = (() => {
                  const sec = Math.floor((Date.now() - new Date(n.created_at)) / 1000);
                  if (sec < 60) return `${sec}s ago`;
                  if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
                  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
                  return `${Math.floor(sec/86400)}d ago`;
                })();
                const isSummary = n.type === "sync_summary";
                const icon  = isSummary ? "✓" : { ocr_failed:"✕", download_failed:"↯" }[n.event_type] || "·";
                const color = isSummary ? "#4ade80" : { ocr_failed:"#f87171", download_failed:"#fb923c" }[n.event_type] || "#94a3b8";
                const label = isSummary
                  ? `${n.count} new invoice${n.count !== 1 ? "s" : ""} synced`
                  : (n.source_file || n.event_type);
                return (
                  <div key={n.id} style={{ display:"flex", gap:10, padding:"10px 16px", borderBottom:"1px solid #0d1626", alignItems:"flex-start" }}>
                    <span style={{ color, fontWeight:700, fontSize:11, flexShrink:0, marginTop:2 }}>{icon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, color: isSummary ? "#e2e8f0" : "#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {label}
                      </div>
                      {n.error_message && <div style={{ fontSize:11, color:"#f87171", marginTop:2 }}>{n.error_message}</div>}
                    </div>
                    <div style={{ flexShrink:0, textAlign:"right" }}>
                      <div style={{ fontSize:10, color:"#334155" }}>{srcLabel}</div>
                      <div style={{ fontSize:10, color:"#1e2d45", marginTop:1 }}>{ago}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ maxWidth:1140, margin:"0 auto", padding:"28px 28px 60px" }}>
        {view !== "admin" && view !== "integrations" && (
          <div style={{ display:"flex", gap:10, marginBottom:32, alignItems:"center", flexWrap:"wrap" }}>
            <button className="btn btn-primary" style={{ padding:"10px 20px", fontSize:13 }}
              onClick={isAtLimit ? openUpgrade : () => fileRef.current.click()}
              disabled={extracting || loading}
              title={isAtLimit ? 'Invoice limit reached — upgrade your plan' : undefined}>
              <span style={{ fontSize:16 }}>+</span>
              {extracting ? "Extracting…" : loading ? "Loading…" : isAtLimit ? "🔒 Upload Invoices" : "Upload Invoices"}
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleUpload} style={{ display:"none" }} />

            <button className="btn btn-secondary" style={{ padding:"10px 20px", fontSize:13 }} onClick={() => csvRef.current.click()}>
              <span>📋</span> Load Supplier Sheet
            </button>
            <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleCSV} style={{ display:"none" }} />

            {extractMsg && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:8,
                background: extractMsg.ok===false?"rgba(239,68,68,.1)":extractMsg.ok?"rgba(16,185,129,.1)":"var(--surf2)",
                border:`1px solid ${extractMsg.ok===false?"rgba(239,68,68,.3)":extractMsg.ok?"rgba(16,185,129,.3)":"var(--bdr2)"}`,
                color: extractMsg.ok===false?"var(--red)":extractMsg.ok?"var(--green)":"var(--t2)", fontSize:13, animation:"fadeIn .3s" }}>
                {extractMsg.text}
              </div>
            )}
            <div style={{ marginLeft:"auto", fontSize:12, color:"var(--t3)", fontWeight:500 }}>{invoices.length} invoices</div>
          </div>
        )}

        <div style={{ opacity:fading ? 0 : 1, transition:"opacity .16s ease" }}>
        {view === "dashboard"    && <Dashboard  kpis={kpis} monthlyData={monthlyData} allNames={allNames} color={color} maxTotal={maxTotal} onPayMonth={payMonth} />}
        {view === "invoices"     && <InvoicesView computed={computed} dupeIds={dupeIds} updateInvoice={updateInvoice} deleteInvoice={deleteInvoice} bulkMarkPaid={bulkMarkPaid} bulkMarkUnpaid={bulkMarkUnpaid} bulkDelete={bulkDelete} setEditInvoice={setEditInvoice} color={color} onViewAttachment={handleViewAttachment} preSelMonth={preSelMonth} onClearPreSel={() => setPreSelMonth(null)} />}
        {view === "calendar"     && <CalendarView computed={computed} calMonth={calMonth} setCalMonth={setCalMonth} color={color} />}
        {view === "admin"        && <AdminPage />}
        {view === "integrations" && (
          <IntegrationsPage
            oauthResult={oauthResult}
            onClearOAuthResult={() => setOAuthResult(null)}
            onInvoicesRefresh={() => { refreshInvoices(); refreshPlan(); }}
            onNotificationsRefresh={refreshNotifications}
            onStartSync={startSync}
            onCancelSync={cancelSync}
            syncJobs={syncJobs}
            isAtLimit={isAtLimit}
            onUpgrade={openUpgrade}
          />
        )}
        </div>
      </div>

      {editInvoice   && <EditInvoiceModal editInvoice={editInvoice} setEditInvoice={setEditInvoice} suppliers={suppliers} addInvoice={addInvoice} updateInvoice={updateInvoice} getSupplier={getSupplier} onViewAttachment={handleViewAttachment} />}
      {showSuppliers && <SuppliersModal suppliers={suppliers} addSupplier={addSupplier} updateSupplier={updateSupplier} deleteSupplier={deleteSupplier} editSupplier={editSupplier} setEditSupplier={setEditSupplier} onClose={() => setShowSuppliers(false)} />}

      {/* Global sync status bar — visible from any tab while Drive sync is in progress */}
      {activeSyncJob && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60,
          background: "var(--surf)", borderTop: "1px solid var(--bdr)",
          padding: "0 24px",
        }}>
          <div style={{ maxWidth: 1140, margin: "0 auto", display: "flex", alignItems: "center", gap: 14, height: 44 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--cyan)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "var(--t2)" }}>
                  Syncing Drive… file {Math.min(activeSyncJob.cursor, activeSyncJob.totalFiles)} / {activeSyncJob.totalFiles}
                  {activeSyncJob.added > 0 && <span style={{ color: "var(--green)", marginLeft: 8 }}>· {activeSyncJob.added} invoice{activeSyncJob.added !== 1 ? "s" : ""} added</span>}
                </span>
              </div>
              <div style={{ height: 3, background: "var(--surf2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2, background: "var(--cyan)",
                  width: `${activeSyncJob.totalFiles ? Math.round(activeSyncJob.cursor / activeSyncJob.totalFiles * 100) : 0}%`,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
            <button onClick={() => cancelSync(activeSyncJob.integrationId)}
              style={{ padding: "4px 12px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "var(--red)", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>
              Stop
            </button>
          </div>
        </div>
      )}

      {loadingPreview && (
        <div style={{ position:"fixed", inset:0, background:"#00000060", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
          <div style={{ color:"#94a3b8", fontSize:14 }}>Loading preview…</div>
        </div>
      )}
      {previewUrl && (
        <AttachmentPreviewModal
          url={previewUrl}
          filename={previewFilename}
          onClose={() => { setPreviewUrl(null); setPreviewFilename(null); }}
        />
      )}
    </div>
      } />
    </Routes>
  );
}
