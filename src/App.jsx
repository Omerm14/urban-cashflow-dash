import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth }            from "./contexts/AuthContext";
import { useInvoiceData }     from "./hooks/useInvoiceData";
import { useNotifications }   from "./hooks/useNotifications";
import { useSyncJob }         from "./hooks/useSyncJob";
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
import { processPdf, fileToBase64, extractInvoice, translateSupplierName } from "./utils/image";
import { findDuplicates, parseCSV, isLatinOnly }                           from "./utils/invoice";
import { calcDueDate, toYM, correctSwappedDate }                           from "./utils/dates";
import { STATUS }                                    from "./constants";
import { supabase }                                  from "./lib/supabase";

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
        const due = calcDueDate(invoiceDate, sup);
        return {
          file,
          candidate: {
            supplier:     sup?.name || ex.supplier || "",
            invoice_no:   ex.invoiceNo   || "",
            invoice_date: invoiceDate,
            amount:       Number(ex.amount) || 0,
            due_date:     due ? due.toISOString().split("T")[0] : "",
            status:       STATUS.UNPAID,
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

    // Add non-duplicate candidates (upload original file to storage first)
    let added = 0;
    await Promise.allSettled(
      toAdd.map(async ({ file, candidate }) => {
        try {
          // Upload original file to Supabase Storage for later preview
          let attachmentPath = null;
          try {
            const ext = file.name.split('.').pop().toLowerCase() || 'bin';
            const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const { error: storErr } = await supabase.storage
              .from('invoice-attachments')
              .upload(storagePath, file, { contentType: file.type, upsert: false });
            if (!storErr) attachmentPath = storagePath;
          } catch { /* storage upload is best-effort */ }

          await addInvoice({ ...candidate, ...(attachmentPath ? { attachment_path: attachmentPath } : {}) });
          added++;
        } catch (err) {
          errors.push(`${file.name}: ${err.message}`);
        }
      })
    );

    setExtracting(false);
    const parts = [];
    if (added) parts.push(`${added} added`);
    if (fileSkipped.length) parts.push(`${fileSkipped.length} already uploaded`);
    if (contentDupeCount) parts.push(`${contentDupeCount} already exist`);
    if (errors.length) parts.push(`${errors.length} failed: ${errors[0]}`);
    const hasIssue = fileSkipped.length || contentDupeCount || errors.length;
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

  if (authLoading) return (
    <div style={{ background:"#080e1a", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#64748b", fontSize:14 }}>Loading…</div>
    </div>
  );

  if (!user) return <LoginPage />;

  if (loading) return (
    <div style={{ background:"#080e1a", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:"#64748b", fontSize:14 }}>Loading…</div>
    </div>
  );

  return (
    <div style={{ background:"#080e1a", minHeight:"100vh", color:"#e2e8f0", fontFamily:"Inter,system-ui,sans-serif" }}>
      <NavBar view={view} setView={setView} suppliersCount={suppliers.length}
        onSuppliersClick={() => setShowSuppliers(true)} user={user} onSignOut={signOut}
        integrationError={false}
        unreadCount={unreadCount}
        onBellClick={() => { setShowNotifPanel(v => !v); if (!showNotifPanel) markAllRead(); }}
      />

      {/* Notification panel — slides in from top-right below navbar */}
      {showNotifPanel && (
        <div style={{ position:"fixed", top:57, right:28, zIndex:50, width:320,
          background:"#0d1626", border:"1px solid #1e2d45", borderRadius:12,
          boxShadow:"0 16px 40px #00000080", overflow:"hidden", animation:"fadeIn .2s" }}
          onMouseLeave={() => {}}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid #111d2e" }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#f1f5f9" }}>Notifications</span>
            <button onClick={() => setShowNotifPanel(false)}
              style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:14 }}>✕</button>
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
            <button className="upload-btn" style={{ background:"linear-gradient(135deg,#6366f1,#a78bfa)", color:"#fff", boxShadow:"0 4px 20px #6366f133" }}
              onClick={() => fileRef.current.click()} disabled={extracting || loading}>
              <span style={{ fontSize:16 }}>+</span>{extracting ? "Extracting…" : loading ? "Loading…" : "Upload Invoices"}
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={handleUpload} style={{ display:"none" }} />

            <button className="upload-btn" style={{ background:"#131c2e", color:"#94a3b8", border:"1px solid #1e2d45" }} onClick={() => csvRef.current.click()}>
              <span>📋</span> Load Supplier Sheet
            </button>
            <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={handleCSV} style={{ display:"none" }} />

            {extractMsg && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:8,
                background: extractMsg.ok===false?"#2d0a0a":extractMsg.ok?"#052e16":"#131c2e",
                border:`1px solid ${extractMsg.ok===false?"#7f1d1d":extractMsg.ok?"#166534":"#1e2d45"}`,
                color: extractMsg.ok===false?"#f87171":extractMsg.ok?"#4ade80":"#94a3b8", fontSize:13, animation:"fadeIn .3s" }}>
                {extractMsg.text}
              </div>
            )}
            <div style={{ marginLeft:"auto", fontSize:12, color:"#334155", fontWeight:500 }}>{invoices.length} invoices</div>
          </div>
        )}

        {view === "dashboard"    && <Dashboard  kpis={kpis} monthlyData={monthlyData} allNames={allNames} color={color} maxTotal={maxTotal} />}
        {view === "invoices"     && <InvoicesView computed={computed} dupeIds={dupeIds} updateInvoice={updateInvoice} deleteInvoice={deleteInvoice} bulkMarkPaid={bulkMarkPaid} bulkMarkUnpaid={bulkMarkUnpaid} bulkDelete={bulkDelete} setEditInvoice={setEditInvoice} color={color} onViewAttachment={handleViewAttachment} />}
        {view === "calendar"     && <CalendarView computed={computed} calMonth={calMonth} setCalMonth={setCalMonth} color={color} />}
        {view === "admin"        && <AdminPage />}
        {view === "integrations" && (
          <IntegrationsPage
            oauthResult={oauthResult}
            onClearOAuthResult={() => setOAuthResult(null)}
            onInvoicesRefresh={refreshInvoices}
            onNotificationsRefresh={refreshNotifications}
            onStartSync={startSync}
            onCancelSync={cancelSync}
            syncJobs={syncJobs}
          />
        )}
      </div>

      {editInvoice   && <EditInvoiceModal editInvoice={editInvoice} setEditInvoice={setEditInvoice} suppliers={suppliers} addInvoice={addInvoice} updateInvoice={updateInvoice} getSupplier={getSupplier} onViewAttachment={handleViewAttachment} />}
      {showSuppliers && <SuppliersModal suppliers={suppliers} addSupplier={addSupplier} updateSupplier={updateSupplier} deleteSupplier={deleteSupplier} editSupplier={editSupplier} setEditSupplier={setEditSupplier} onClose={() => setShowSuppliers(false)} />}

      {/* Global sync status bar — visible from any tab while Drive sync is in progress */}
      {activeSyncJob && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60,
          background: "#0d1626", borderTop: "1px solid #1e2d45",
          padding: "0 24px",
        }}>
          <div style={{ maxWidth: 1140, margin: "0 auto", display: "flex", alignItems: "center", gap: 14, height: 44 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #6366f1", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  Syncing Drive… file {Math.min(activeSyncJob.cursor, activeSyncJob.totalFiles)} / {activeSyncJob.totalFiles}
                  {activeSyncJob.added > 0 && <span style={{ color: "#4ade80", marginLeft: 8 }}>· {activeSyncJob.added} invoice{activeSyncJob.added !== 1 ? "s" : ""} added</span>}
                </span>
              </div>
              <div style={{ height: 3, background: "#131c2e", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 2, background: "#6366f1",
                  width: `${activeSyncJob.totalFiles ? Math.round(activeSyncJob.cursor / activeSyncJob.totalFiles * 100) : 0}%`,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
            <button onClick={() => cancelSync(activeSyncJob.integrationId)}
              style={{ padding: "4px 12px", background: "#2d0a0a", border: "1px solid #7f1d1d", color: "#f87171", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit", flexShrink: 0 }}>
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
  );
}
