import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "./contexts/AuthContext";
import { supabase } from "./lib/supabase";
import { useInvoiceData } from "./hooks/useInvoiceData";
import { usePlan } from "./hooks/usePlan";
import { useSyncJob } from "./hooks/useSyncJob";
import { useUpload } from "./hooks/useUpload";
import { useNotifications } from "./hooks/useNotifications";
import { useIntegrationErrors } from "./hooks/useIntegrationErrors";
import { useIsAdmin } from "./hooks/useIsAdmin";
import { ThemeCtx, LayoutCtx, LangCtx } from "./contexts/AppContexts";
import { NIGHT, DAY, FONT_UI as SANS, chartPalette } from "./theme";
import { MONTHS_SHORT } from "./utils/format";
import enStrings from "./i18n/en";
import heStrings from "./i18n/he";

import Sidebar from "./components/layout/Sidebar";
import GlobalHeader from "./components/layout/GlobalHeader";
import SearchOverlay from "./components/SearchOverlay";
import UpgradeModal from "./components/UpgradeModal";
import CalendarView from "./components/CalendarView";
import EditInvoiceModal from "./components/EditInvoiceModal";
import AttachmentPreviewModal from "./components/AttachmentPreviewModal";
import IntegrationsPage from "./components/IntegrationsPage";
import UsageBanner from "./components/UsageBanner";
import AdminPage from "./pages/AdminPage";
import { MissingSuppliersModal, AnomalyModal } from "./components/AlertModals";

import LoginView from "./views/LoginView";
import DashboardView from "./views/DashboardView";
import InvoicesView from "./views/InvoicesView";
import SuppliersView from "./views/SuppliersView";
import SettingsView from "./views/SettingsView";
import OnboardingView from "./views/OnboardingView";
import ActivityView from "./views/ActivityView";

const currentYM = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export default function App() {
  const { user, signOut, loading: authLoading } = useAuth();
  const isLoggedIn = !!user;

  const [isDark, setIsDark] = useState(() => localStorage.getItem("cashflow_theme") !== "day");
  const [lang, setLang] = useState(() => localStorage.getItem("cashflow_lang") || "en");
  const t = useCallback((key, vars) => {
    const strings = lang === "he" ? heStrings : enStrings;
    let s = strings[key] || enStrings[key] || key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replaceAll(`{${k}}`, v); });
    return s;
  }, [lang]);

  const [view, setView] = useState("dashboard");
  const [selectedMonth, setSelectedMonth] = useState(currentYM);
  const [calMonth, setCalMonth] = useState(currentYM);
  const [preSelectAll, setPreSelectAll] = useState(false);
  const [initialFilterStatus, setInitialFilterStatus] = useState(null);
  const [deepLinkInvoiceId, setDeepLinkInvoiceId] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [editInvoice, setEditInvoice] = useState(null);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [showAnomalyModal, setShowAnomalyModal] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  // Manual-upload feedback only — sync/integration events are persisted server-side
  // and surfaced via useNotifications() instead (uploads have no integration to attach to).
  const [appNotifs, setAppNotifs] = useState([]);
  const [oauthResult, setOauthResult] = useState(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [wasEmpty, setWasEmpty] = useState(false);
  const notifiedJobsRef = useRef(new Set());

  // Sync theme + direction to the document so CSS custom properties follow.
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "night" : "day";
    localStorage.setItem("cashflow_theme", isDark ? "night" : "day");
  }, [isDark]);
  useEffect(() => {
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    localStorage.setItem("cashflow_lang", lang);
  }, [lang]);

  // Real invoice data
  const {
    suppliers, computed: invoices, allNames, loading: invoicesLoading, loadError, retryLoad,
    missingSuppliers, anomalyMap,
    addInvoice, updateInvoice, deleteInvoice, bulkDelete,
    addSupplier, updateSupplier, deleteSupplier, getSupplier,
    refreshInvoices,
  } = useInvoiceData();

  const { plan, used: planUsed, limit: planLimit, pct: planPct, isAtLimit, isNearLimit, maxSources, entitlements, isPro, refresh: refreshPlan } = usePlan();
  // Pro/Enterprise have no self-serve upgrade — route straight to Enterprise contact.
  const handleUpgradeClick = useCallback(() => {
    if (isPro) window.location.href = 'mailto:hello@gocashflow.co?subject=' + encodeURIComponent('Cashflow Enterprise');
    else setShowUpgrade(true);
  }, [isPro]);
  const { jobs: syncJobs, startSync, cancelSync, activeJob } = useSyncJob({ onBatchDone: refreshInvoices });
  const { notifications: persistedNotifs, unreadCount, markAllRead, refresh: refreshNotifications } = useNotifications();
  const { hasError: hasIntegrationError, refresh: refreshIntegrationErrors } = useIntegrationErrors();
  const isAdmin = useIsAdmin();

  const addAppNotif = useCallback((notif) => {
    setAppNotifs(prev => [{ ...notif, id: Date.now() + Math.random() }, ...prev].slice(0, 20));
  }, []);

  const { extracting, extractMsg, uploadProgress, fileRef, handleUpload, showTransientError } = useUpload({
    invoices, addInvoice, getSupplier, refreshPlan, onNotify: addAppNotif, t,
  });

  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  useEffect(() => { if (windowWidth >= 1024) setMobileMenuOpen(false); }, [windowWidth]);

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowSearch(true); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
    const code = params.get("code") || hashParams.get("code");
    const error = params.get("error") || hashParams.get("error");
    if (code || error) {
      setOauthResult({ code, error });
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    const oauthConnected = params.get("oauth_connected");
    const oauthError = params.get("oauth_error");
    const viewParam = params.get("view");
    if (oauthConnected || oauthError || viewParam) {
      if (oauthConnected) setOauthResult({ connected: oauthConnected });
      if (oauthError) setOauthResult({ error: oauthError });
      if (viewParam) setView(viewParam);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Sync-job completion — refresh the persisted notification list (sync_events already
  // has this recorded server-side; no need to also push an ephemeral duplicate).
  useEffect(() => {
    Object.values(syncJobs).forEach(job => {
      const key = job.jobId || job.integrationId;
      if (!key || notifiedJobsRef.current.has(key)) return;
      if (job.done || job.error) {
        notifiedJobsRef.current.add(key);
        refreshNotifications();
      }
    });
  }, [syncJobs, refreshNotifications]);

  // Integration errors surface on the sidebar — refresh whenever the user leaves that
  // page (e.g. after fixing/reconnecting), without a general-purpose polling loop.
  useEffect(() => {
    if (view !== "integrations") refreshIntegrationErrors();
  }, [view, refreshIntegrationErrors]);

  // First-run detection: account had zero invoices when data first loaded
  useEffect(() => {
    if (!invoicesLoading && invoices.length === 0) setWasEmpty(true);
  }, [invoicesLoading, invoices.length]);

  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 1024;
  const T = isDark ? NIGHT : DAY;

  const palette = chartPalette(isDark);
  const getSupplierColor = useCallback((name) => {
    const idx = allNames.indexOf(name);
    return palette[idx >= 0 ? idx % palette.length : 0];
  }, [allNames, palette]);

  const chartData = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      if (!inv.dueDate) return;
      // dueDate is "YYYY-MM-DD" — slice instead of constructing a Date per invoice
      const year = Number(inv.dueDate.slice(0, 4));
      const mon = Number(inv.dueDate.slice(5, 7)) - 1;
      const key = `${MONTHS_SHORT[mon]} '${String(year).slice(2)}`;
      if (!map[key]) map[key] = { month: key, _year: year, _mon: mon };
      map[key][inv.supplier] = (map[key][inv.supplier] || 0) + Number(inv.amount || 0);
    });
    return Object.values(map)
      .sort((a, b) => a._year !== b._year ? a._year - b._year : a._mon - b._mon)
      .map(m => {
        const { _year, _mon, ...rest } = m;
        const total = Object.entries(rest).filter(([k]) => k !== "month").reduce((s, [, v]) => s + v, 0);
        return { ...rest, total };
      });
  }, [invoices]);

  const handlePayAll = () => { setPreSelectAll(true); setView("invoices"); };
  const handleViewMonth = (monthLabel) => {
    if (monthLabel) {
      const m = monthLabel.match(/^(\w{3})\s+'(\d{2})$/);
      if (m) {
        const mi = MONTHS_SHORT.indexOf(m[1]);
        if (mi >= 0) setSelectedMonth(`20${m[2]}-${String(mi + 1).padStart(2, "0")}`);
      }
    }
    setView("invoices");
  };
  const handleMarkPaid = useCallback((id) => {
    const inv = invoices.find(i => i.id === id);
    const isPaid = inv?.status === "Paid" || inv?.status === "paid";
    updateInvoice(id, { status: isPaid ? "Unpaid" : "Paid" });
  }, [updateInvoice, invoices]);
  const handleBulkPaid = useCallback((ids) => { ids.forEach(id => updateInvoice(id, { status: "Paid" })); }, [updateInvoice]);
  const handleBulkUnpaid = useCallback((ids) => { ids.forEach(id => updateInvoice(id, { status: "Unpaid" })); }, [updateInvoice]);
  useEffect(() => { if (preSelectAll) { const timer = setTimeout(() => setPreSelectAll(false), 100); return () => clearTimeout(timer); } }, [preSelectAll]);
  useEffect(() => { if (view !== "invoices") { setInitialFilterStatus(null); setDeepLinkInvoiceId(null); } }, [view]);

  const handleViewAttachment = async (inv) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/invoices/${inv.id}/attachment-url`, { headers: { Authorization: `Bearer ${session?.access_token}` } });
      if (res.ok) {
        const { url } = await res.json();
        setPreviewAttachment({ url, filename: inv.source_file || inv.attachment_path?.split("/").pop() || "invoice" });
      } else {
        showTransientError(t("attachment_error"));
      }
    } catch (e) {
      console.error("attachment-url:", e);
      showTransientError(t("attachment_error"));
    }
  };

  if (authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)", color: "var(--t3)", fontFamily: SANS, fontSize: 14 }}>
        <span className="shimmer" style={{ width: 180, height: 16, display: "block" }} aria-label={t("loading")} />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <LayoutCtx.Provider value={{ isMobile, isTablet }}>
        <LoginView />
      </LayoutCtx.Provider>
    );
  }

  const showOnboarding = view === "dashboard" && !invoicesLoading && !loadError && wasEmpty && !onboardingDismissed;

  return (
    <ThemeCtx.Provider value={T}>
      <LayoutCtx.Provider value={{ isMobile, isTablet }}>
        <LangCtx.Provider value={{ lang, t }}>
          <div className="app-shell">
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display: "none" }} onChange={handleUpload} />

            {/* Upload / sync progress toasts */}
            {extractMsg && (
              <div role="status" style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: extractMsg.ok === null ? T.surf : extractMsg.ok ? T.greenTint : T.redTint, border: `1px solid ${extractMsg.ok === null ? T.bdr : extractMsg.ok ? T.greenBdr : T.redBdr}`, color: extractMsg.ok === null ? T.t1 : extractMsg.ok ? T.green : T.red, padding: "10px 20px 12px", borderRadius: 8, fontFamily: SANS, fontSize: 13, boxShadow: "var(--shadow-pop)", minWidth: 220, maxWidth: 400 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {extracting && <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }} aria-hidden="true">⟳</span>}
                  <span>{extractMsg.text}</span>
                  {extracting && uploadProgress.total > 0 && (
                    <span className="num" style={{ marginInlineStart: "auto", fontSize: 11, opacity: 0.7 }}>{uploadProgress.done}/{uploadProgress.total}</span>
                  )}
                </div>
                {extracting && uploadProgress.total > 0 && (
                  <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: T.surf3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: T.accent, width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%`, transition: "width 0.3s ease" }} />
                  </div>
                )}
              </div>
            )}
            {!extractMsg && activeJob && !activeJob.done && (
              <div role="status" style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: T.surf, border: `1px solid ${T.bdr}`, color: T.t1, padding: "10px 20px 12px", borderRadius: 8, fontFamily: SANS, fontSize: 13, boxShadow: "var(--shadow-pop)", minWidth: 220, maxWidth: 400 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }} aria-hidden="true">⟳</span>
                  <span>{t("syncing")}</span>
                  {activeJob.totalFiles > 0 && (
                    <span className="num" style={{ marginInlineStart: "auto", fontSize: 11, opacity: 0.7 }}>{activeJob.cursor || 0}/{activeJob.totalFiles}</span>
                  )}
                </div>
                {activeJob.totalFiles > 0 && (
                  <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: T.surf3, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: T.accent, width: `${Math.round(((activeJob.cursor || 0) / activeJob.totalFiles) * 100)}%`, transition: "width 0.3s ease" }} />
                  </div>
                )}
              </div>
            )}

            <Sidebar view={view} setView={setView} suppliersCount={suppliers.length}
              onUpgrade={handleUpgradeClick} onUpload={() => fileRef.current?.click()}
              mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen}
              plan={plan} planUsed={planUsed} planLimit={planLimit} planPct={planPct} user={user} onSignOut={signOut}
              integrationError={hasIntegrationError} isAdmin={isAdmin} />

            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <GlobalHeader view={view} isDark={isDark} onToggleTheme={() => setIsDark(v => !v)} onToggleLang={() => setLang(l => l === "he" ? "en" : "he")} lang={lang} onMenuOpen={() => setMobileMenuOpen(true)} onMissingAlert={() => setShowMissingModal(true)} onAnomalyAlert={() => setShowAnomalyModal(true)} missingCount={missingSuppliers?.length || 0} anomalyCount={anomalyMap?.size || 0} appNotifs={appNotifs} onClearAppNotifs={() => setAppNotifs([])} onSearchOpen={() => setShowSearch(true)} notifications={persistedNotifs} unreadCount={unreadCount} onOpenNotifications={refreshNotifications} onMarkAllRead={markAllRead} onViewActivity={() => setView("activity")} />
              {(isAtLimit || isNearLimit) && (
                <UsageBanner plan={plan} used={planUsed} limit={planLimit} remaining={planLimit - planUsed} onUpgrade={handleUpgradeClick} />
              )}
              {loadError && (
                <div role="alert" style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px clamp(20px,3vw,36px) 0", padding: "12px 16px", background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 10, fontFamily: SANS, fontSize: 13, color: T.t1 }}>
                  <span style={{ flex: 1 }}>{t("data_load_error")}</span>
                  <button className="btn btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }} onClick={retryLoad}>{t("retry")}</button>
                </div>
              )}
              <main className="app-main" style={{ padding: isMobile ? "20px 16px 100px" : "28px clamp(20px,3vw,36px) 80px" }}>
                <div style={{ width: "100%" }}>
                  {view === "dashboard" && (showOnboarding
                    ? <OnboardingView onUploadClick={() => fileRef.current?.click()} onNavigate={setView}
                        extracting={extracting} uploadProgress={uploadProgress}
                        invoices={invoices} onContinue={() => setOnboardingDismissed(true)} />
                    : <DashboardView invoices={invoices} suppliers={suppliers} loading={invoicesLoading} onPayAll={handlePayAll} chartData={chartData} supplierNames={allNames} supplierColor={getSupplierColor} user={user} onMissingAlert={() => setShowMissingModal(true)} onAnomalyAlert={() => setShowAnomalyModal(true)} missingSuppliers={missingSuppliers} anomalyMap={anomalyMap} onViewMonth={handleViewMonth} onNavigateFiltered={(status) => { setView("invoices"); setInitialFilterStatus(status); }} />)}
                  {view === "invoices" && <InvoicesView invoices={invoices} loading={invoicesLoading} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} onMarkPaid={handleMarkPaid} onAddSupplier={addSupplier} onDeleteInvoice={deleteInvoice} onBulkPaid={handleBulkPaid} onBulkUnpaid={handleBulkUnpaid} onBulkDelete={bulkDelete} preSelectAll={preSelectAll} onEditInvoice={setEditInvoice} anomalyMap={anomalyMap} missingSuppliers={missingSuppliers} onMissingAlert={() => setShowMissingModal(true)} initialFilterStatus={initialFilterStatus} initialSelectedId={deepLinkInvoiceId} onViewAttachment={handleViewAttachment} supplierColor={getSupplierColor} entitlements={entitlements} onUpgrade={handleUpgradeClick} />}
                  {view === "calendar" && <CalendarView computed={invoices} calMonth={calMonth} setCalMonth={setCalMonth} color={getSupplierColor} />}
                  {view === "integrations" && <IntegrationsPage
                    syncJobs={syncJobs} onStartSync={startSync} onCancelSync={cancelSync}
                    onInvoicesRefresh={refreshInvoices} maxSources={maxSources} onUpgrade={handleUpgradeClick}
                    oauthResult={oauthResult} onClearOAuthResult={() => setOauthResult(null)}
                    onNotificationsRefresh={refreshNotifications}
                    onSyncResult={refreshNotifications}
                  />}
                  {view === "activity" && <ActivityView entitlements={entitlements} onUpgrade={handleUpgradeClick} />}
                  {view === "suppliers" && <SuppliersView suppliers={suppliers} loading={invoicesLoading} onAdd={addSupplier} onUpdate={updateSupplier} onDelete={deleteSupplier} />}
                  {view === "settings" && <SettingsView onUpgrade={handleUpgradeClick} onSignOut={signOut} user={user} invoices={invoices} suppliers={suppliers} onNavigateToIntegrations={() => setView("integrations")} />}
                  {view === "admin" && isAdmin && <AdminPage />}
                </div>
              </main>
            </div>

            {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} planUsed={planUsed} planLimit={planLimit} planPct={planPct} />}

            {editInvoice && (
              <EditInvoiceModal
                editInvoice={editInvoice}
                setEditInvoice={setEditInvoice}
                suppliers={suppliers}
                addInvoice={addInvoice}
                updateInvoice={updateInvoice}
                getSupplier={getSupplier}
                onViewAttachment={att => setPreviewAttachment(att)}
                anomaly={anomalyMap?.get(editInvoice?.supplier)}
              />
            )}

            {previewAttachment && (
              <AttachmentPreviewModal
                url={previewAttachment.url}
                filename={previewAttachment.filename}
                onClose={() => setPreviewAttachment(null)}
              />
            )}

            {showSearch && (
              <SearchOverlay
                invoices={invoices}
                suppliers={suppliers}
                onNavigate={(v, month, invId) => { setView(v); if (month) setSelectedMonth(month); if (invId) setDeepLinkInvoiceId(invId); }}
                onClose={() => setShowSearch(false)}
              />
            )}

            {showMissingModal && missingSuppliers?.length > 0 && (
              <MissingSuppliersModal
                missingSuppliers={missingSuppliers}
                invoices={invoices}
                suppliers={suppliers}
                onClose={() => setShowMissingModal(false)}
                lang={lang}
              />
            )}

            {showAnomalyModal && anomalyMap?.size > 0 && (
              <AnomalyModal
                anomalyMap={anomalyMap}
                computed={invoices}
                invoices={invoices}
                onClose={() => setShowAnomalyModal(false)}
                onEditInvoice={setEditInvoice}
                lang={lang}
              />
            )}
          </div>
        </LangCtx.Provider>
      </LayoutCtx.Provider>
    </ThemeCtx.Provider>
  );
}
