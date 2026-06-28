import { useState, useRef, useCallback, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth }            from "./contexts/AuthContext";
import { ThemeProvider }      from "./contexts/ThemeContext";
import { useInvoiceData }     from "./hooks/useInvoiceData";
import { useNotifications }   from "./hooks/useNotifications";
import { useSyncJob }         from "./hooks/useSyncJob";
import { usePlan }            from "./hooks/usePlan";
import LoginPage              from "./pages/LoginPage";
import AdminPage              from "./pages/AdminPage";
import SettingsPage           from "./pages/SettingsPage";
import Sidebar                from "./components/Sidebar";
import GlobalHeader           from "./components/GlobalHeader";
import Dashboard              from "./components/Dashboard";
import InvoicesView           from "./components/InvoicesView";
import CalendarView           from "./components/CalendarView";
import IntegrationsPage       from "./components/IntegrationsPage";
import EditInvoiceModal       from "./components/EditInvoiceModal";
import SuppliersModal         from "./components/SuppliersModal";
import AttachmentPreviewModal from "./components/AttachmentPreviewModal";
import UpgradeModal           from "./components/UpgradeModal";
import { processPdf, fileToBase64, extractInvoice, translateSupplierName } from "./utils/image";
import { findDuplicates, parseCSV, isLatinOnly }                           from "./utils/invoice";
import { calcDueDate, toYM, correctSwappedDate }                           from "./utils/dates";
import { STATUS }             from "./constants";
import { supabase }           from "./lib/supabase";

const sha256Hex = async file => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const uploadOriginal = async (file, userId, accessToken) => {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  let fileHash = null;
  try { fileHash = await sha256Hex(file); } catch {}

  let presign = { backend: 'supabase' };
  try {
    const res = await fetch('/api/attachments/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ filename: file.name, contentType: file.type, fileHash }),
    });
    if (res.ok) presign = await res.json();
  } catch {}

  if (presign.backend === 'r2' && presign.uploadUrl) {
    const put = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!put.ok) throw new Error(`upload failed (${put.status})`);
    return { attachment_path: presign.key, attachment_backend: 'r2', file_hash: fileHash, attachment_status: 'present' };
  }

  const key = `${userId}/${fileHash || `${Date.now()}-${Math.random().toString(36).slice(2)}`}.${ext}`;
  const { error } = await supabase.storage.from('invoice-attachments').upload(key, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  return { attachment_path: key, attachment_backend: 'supabase', file_hash: fileHash, attachment_status: 'present' };
};

function AppShell() {
  const { user, session, loading: authLoading, signOut } = useAuth();

  const [view,            setView]            = useState("dashboard");
  const [mobileOpen,      setMobileOpen]      = useState(false);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get("view");
    if (viewParam === "integrations") {
      setView("integrations");
      const oauthConnected = params.get("oauth_connected");
      const oauthError     = params.get("oauth_error");
      if (oauthConnected) setOAuthResult({ connected: oauthConnected });
      if (oauthError)     setOAuthResult({ error: decodeURIComponent(oauthError) });
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
      const res  = await fetch(`/api/invoices/${inv.id}/attachment-url`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load attachment");
      setPreviewFilename(inv.source_file || "Invoice");
      setPreviewUrl(json.url);
    } catch (err) { alert(err.message); }
    finally { setLoadingPreview(false); }
  }, []);

  const handleUpload = useCallback(async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setExtracting(true);
    setExtractMsg({ text: `Processing ${files.length} file${files.length > 1 ? "s" : ""}…`, ok: null });

    const existingFileNames = new Set(invoices.map(i => i.source_file).filter(Boolean).map(n => n.toLowerCase()));
    const [toExtract, fileSkipped] = files.reduce(([ok, skip], f) =>
      existingFileNames.has(f.name.toLowerCase()) ? [ok, [...skip, f]] : [[...ok, f], skip], [[], []]
    );

    const imageResults = await Promise.allSettled(
      toExtract.map(f => f.type === "application/pdf" ? processPdf(f) : fileToBase64(f).then(img => [img]))
    );
    const pageUnits = [];
    imageResults.forEach((r, i) => {
      if (r.status === "rejected") { pageUnits.push({ file: toExtract[i], error: r.reason }); }
      else { r.value.forEach(pageImage => pageUnits.push({ file: toExtract[i], pageImage })); }
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
        return { file, candidate: { supplier: sup?.name || ex.supplier || "", invoice_no: ex.invoiceNo || "", invoice_date: invoiceDate, amount: isCredit ? -rawAmount : rawAmount, due_date: isCredit ? "" : (due ? due.toISOString().split("T")[0] : ""), status: isCredit ? STATUS.CREDIT : STATUS.UNPAID, invoice_type: isCredit ? "credit" : "invoice", notes: "", source_file: file.name } };
      })
    );

    const candidates = [], errors = [];
    candidateResults.forEach((r, i) => {
      if (r.status === "rejected") { errors.push(r.reason?.message || `${pageUnits[i].file.name}: failed`); return; }
      candidates.push(r.value);
    });

    const computedForDedup = computed.map(inv => ({ ...inv, supplier: getSupplier(inv.supplier)?.name || inv.supplier }));
    const withTempIds = candidates.map((c, i) => ({ ...c.candidate, id: `__new_${i}`, invoiceNo: c.candidate.invoice_no, invoiceDate: c.candidate.invoice_date }));
    const dupeSet = findDuplicates([...computedForDedup, ...withTempIds]);
    const toAdd = candidates.filter((_, i) => !dupeSet.has(`__new_${i}`));
    const contentDupeCount = candidates.length - toAdd.length;

    const { data: { session: uploadSession } } = await supabase.auth.getSession();
    let added = 0, attachmentIssues = 0;
    await Promise.allSettled(toAdd.map(async ({ file, candidate }) => {
      try {
        let attachment;
        try { attachment = await uploadOriginal(file, user.id, uploadSession?.access_token); }
        catch (upErr) { console.warn(`attachment upload failed:`, upErr.message); attachment = { attachment_status: 'missing' }; attachmentIssues++; }
        await addInvoice({ ...candidate, ...attachment });
        added++;
      } catch (err) { errors.push(`${file.name}: ${err.message}`); }
    }));

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
      setExtractMsg(failed.length
        ? { text: `${parsed.length - failed.length} added · ${failed.length} failed`, ok: false }
        : { text: `✓ ${parsed.length} suppliers loaded`, ok: true }
      );
    } else {
      setExtractMsg({ text: "Could not parse CSV", ok: false });
    }
    setTimeout(() => setExtractMsg(null), 5000);
    e.target.value = "";
  }, [addSupplier]);

  const payMonth = useCallback(ym => {
    setFading(true);
    setTimeout(() => { setPreSelMonth(ym); setView("invoices"); setFading(false); }, 160);
  }, []);

  if (authLoading) return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--t3)", fontSize: 14 }}>Loading…</div>
    </div>
  );

  if (!user) return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*"      element={<Navigate to="/login" replace />} />
    </Routes>
  );

  if (loading) return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--t3)", fontSize: 14 }}>Loading…</div>
    </div>
  );

  const planObj = { tier: plan, invoiceCount: used, invoiceLimit: limit };

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/app" replace />} />
      <Route path="*" element={
        <div className="app-shell">
          {/* Sidebar */}
          <Sidebar
            view={view} setView={setView}
            suppliersCount={suppliers.length}
            onUpgrade={openUpgrade}
            onUpload={() => isAtLimit ? openUpgrade() : fileRef.current.click()}
            mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
            plan={planObj} user={user}
            onSignOut={signOut}
          />

          {/* Main column */}
          <div className="app-main">
            <GlobalHeader
              view={view}
              onMenuOpen={() => setMobileOpen(true)}
              unreadCount={unreadCount}
              showNotifPanel={showNotifPanel}
              onBellClick={() => { setShowNotifPanel(v => !v); if (!showNotifPanel) markAllRead(); }}
              notifications={notifications}
              markAllRead={markAllRead}
            />

            <div className="app-content" style={{ opacity: fading ? 0 : 1, transition: "opacity .16s ease" }}>
              {/* Upload action row (hidden on settings/admin/integrations) */}
              {view !== 'settings' && view !== 'admin' && view !== 'integrations' && (
                <div style={{ display: "flex", gap: 10, marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="btn btn-primary" style={{ fontSize: 13 }}
                    onClick={isAtLimit ? openUpgrade : () => fileRef.current.click()}
                    disabled={extracting || loading}>
                    <span>+</span>
                    {extracting ? "Extracting…" : isAtLimit ? "🔒 Upload Invoices" : "Upload Invoices"}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleUpload} style={{ display: "none" }} />

                  <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => csvRef.current.click()}>
                    📋 Load Supplier Sheet
                  </button>
                  <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleCSV} style={{ display: "none" }} />

                  {extractMsg && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, animation: "fadeIn .3s",
                      background: extractMsg.ok === false ? "var(--red-tint)" : extractMsg.ok ? "var(--green-tint)" : "var(--surf2)",
                      border: `1px solid ${extractMsg.ok === false ? "var(--red-bdr)" : extractMsg.ok ? "var(--green-bdr)" : "var(--bdr2)"}`,
                      color: extractMsg.ok === false ? "var(--red)" : extractMsg.ok ? "var(--green)" : "var(--t2)", fontSize: 13 }}>
                      {extractMsg.text}
                    </div>
                  )}
                  <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--t3)", fontWeight: 500 }}>{invoices.length} invoices</div>
                </div>
              )}

              {/* Views */}
              {view === "dashboard"    && <Dashboard kpis={kpis} monthlyData={monthlyData} allNames={allNames} color={color} maxTotal={maxTotal} onPayMonth={payMonth} />}
              {view === "invoices"     && <InvoicesView computed={computed} dupeIds={dupeIds} updateInvoice={updateInvoice} deleteInvoice={deleteInvoice} bulkMarkPaid={bulkMarkPaid} bulkMarkUnpaid={bulkMarkUnpaid} bulkDelete={bulkDelete} setEditInvoice={setEditInvoice} color={color} onViewAttachment={handleViewAttachment} preSelMonth={preSelMonth} onClearPreSel={() => setPreSelMonth(null)} />}
              {view === "calendar"     && <CalendarView computed={computed} calMonth={calMonth} setCalMonth={setCalMonth} color={color} />}
              {view === "admin"        && <AdminPage />}
              {view === "settings"     && <SettingsPage user={user} plan={plan} used={used} limit={limit} remaining={remaining} onUpgrade={openUpgrade} invoices={invoices} session={session} />}
              {view === "integrations" && (
                <IntegrationsPage
                  oauthResult={oauthResult} onClearOAuthResult={() => setOAuthResult(null)}
                  onInvoicesRefresh={() => { refreshInvoices(); refreshPlan(); }}
                  onNotificationsRefresh={refreshNotifications}
                  onStartSync={startSync} onCancelSync={cancelSync}
                  syncJobs={syncJobs} isAtLimit={isAtLimit} onUpgrade={openUpgrade}
                />
              )}
              {view === "suppliers" && (
                <div style={{ animation: "slideUp .35s cubic-bezier(.16,1,.3,1)" }}>
                  <SuppliersModal
                    suppliers={suppliers} addSupplier={addSupplier}
                    updateSupplier={updateSupplier} deleteSupplier={deleteSupplier}
                    editSupplier={editSupplier} setEditSupplier={setEditSupplier}
                    onClose={() => setView("dashboard")} inline
                  />
                </div>
              )}
            </div>
          </div>

          {/* Modals */}
          {showUpgradeModal && <UpgradeModal plan={plan} used={used} limit={limit} onContinueReadonly={closeUpgrade} />}
          {editInvoice   && <EditInvoiceModal editInvoice={editInvoice} setEditInvoice={setEditInvoice} suppliers={suppliers} addInvoice={addInvoice} updateInvoice={updateInvoice} getSupplier={getSupplier} onViewAttachment={handleViewAttachment} />}
          {showSuppliers && <SuppliersModal suppliers={suppliers} addSupplier={addSupplier} updateSupplier={updateSupplier} deleteSupplier={deleteSupplier} editSupplier={editSupplier} setEditSupplier={setEditSupplier} onClose={() => setShowSuppliers(false)} />}

          {/* Sync progress bar */}
          {activeSyncJob && (
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60, background: "var(--surf)", borderTop: "1px solid var(--bdr)", padding: "0 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, height: 44 }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--indigo)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--t2)" }}>
                      Syncing… {Math.min(activeSyncJob.cursor, activeSyncJob.totalFiles)} / {activeSyncJob.totalFiles}
                      {activeSyncJob.added > 0 && <span style={{ color: "var(--green)", marginLeft: 8 }}>· {activeSyncJob.added} added</span>}
                    </span>
                  </div>
                  <div style={{ height: 3, background: "var(--surf2)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: "var(--indigo)", width: `${activeSyncJob.totalFiles ? Math.round(activeSyncJob.cursor / activeSyncJob.totalFiles * 100) : 0}%`, transition: "width 0.5s ease" }} />
                  </div>
                </div>
                <button onClick={() => cancelSync(activeSyncJob.integrationId)} style={{ padding: "4px 12px", background: "var(--red-tint)", border: "1px solid var(--red-bdr)", color: "var(--red)", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                  Stop
                </button>
              </div>
            </div>
          )}

          {loadingPreview && (
            <div style={{ position: "fixed", inset: 0, background: "#00000060", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
              <div style={{ color: "var(--t3)", fontSize: 14 }}>Loading preview…</div>
            </div>
          )}
          {previewUrl && (
            <AttachmentPreviewModal url={previewUrl} filename={previewFilename} onClose={() => { setPreviewUrl(null); setPreviewFilename(null); }} />
          )}
        </div>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
