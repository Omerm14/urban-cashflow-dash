import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useT, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, chartPalette } from "../theme";
import { fmt, nextMonthYM } from "../utils/format";
import { downloadCSV } from "../utils/csv";
import { customerStats, todayISO, toCsvRows, CSV_COLUMNS } from "../utils/collections";
import ListSkeleton from "../components/ListSkeleton";
import ReceivableModal from "../components/ReceivableModal";
import ImportCollectionsModal from "../components/ImportCollectionsModal";
import CollectDialog from "../components/CollectDialog";
import BulkBar from "../components/BulkBar";
import SuccessOverlay from "../components/SuccessOverlay";
import ReceivablesTab from "../components/collections/ReceivablesTab";
import CustomersTab from "../components/collections/CustomersTab";
import CustomerPanel from "../components/collections/CustomerPanel";
import AnalysisTab from "../components/collections/AnalysisTab";
import { monthLong } from "../components/collections/shared";
import { Plus, Sparkles, Download, Check, Undo2 } from "lucide-react";

export default function CollectionsView({
  customers, receivables, loading, selectedMonth, onMonthChange,
  addCustomer, updateCustomer, deleteCustomer, addReceivable, updateReceivable, deleteReceivable,
  markCollected, markOpen, bulkMarkCollected, bulkMarkOpen, importCollections,
  deepLink, // { customerId, nonce } from global search → open that customer's panel
}) {
  const T = useT();
  const { t, lang } = useLang();
  const [tab, setTab] = useState("receivables");
  const [modal, setModal] = useState(null);          // receivable row (edit) or partial (new)
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState(new Set()); // receivable ids (Receivables tab)
  const [collectIds, setCollectIds] = useState(null);  // ids shown in CollectDialog
  const [success, setSuccess] = useState(null);        // { count, total }
  const [panelId, setPanelId] = useState(null);        // customer id for the side panel
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const notify = useCallback((text, ok) => { setToast({ text, ok }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), ok ? 3000 : 4500); }, []);
  const guard = fn => async (...a) => { try { await fn(...a); } catch { notify(t("coll_save_error"), false); } };

  // Selection is per month: switching month clears it (same as Invoices).
  useEffect(() => { setSelected(new Set()); }, [selectedMonth]);
  // Drop ids that no longer exist (deleted elsewhere).
  useEffect(() => {
    setSelected(prev => { const ids = new Set(receivables.map(r => r.id)); const n = new Set([...prev].filter(id => ids.has(id))); return n.size === prev.size ? prev : n; });
  }, [receivables]);

  useEffect(() => { if (deepLink?.customerId) setPanelId(deepLink.customerId); }, [deepLink]);

  const statsMap = useMemo(() => customerStats(receivables), [receivables]);
  // Colors by stable customer order (created order), same palette slots as suppliers.
  const palette = chartPalette(T.isDark);
  const colorOf = id => { const i = customers.findIndex(c => c.id === id); return i < 0 ? T.t3 : palette[i % palette.length]; };

  if (loading) return <ListSkeleton rows={6} label={t("nav_collections")} />;

  const openNew = () => {
    const today = todayISO();
    setModal({ expected_date: selectedMonth === today.slice(0, 7) ? today : `${selectedMonth}-01` });
  };
  const openCollect = ids => {
    const open = ids.filter(id => receivables.find(r => r.id === id && !r.collected_date));
    if (open.length) setCollectIds(open);
  };
  const confirmCollect = async (rows, total) => {
    if (rows.length === 1) await markCollected(rows[0].id, { date: rows[0].date, method: rows[0].method });
    else await bulkMarkCollected(rows);
    setSelected(prev => { const n = new Set(prev); rows.forEach(r => n.delete(r.id)); return n; });
    setCollectIds(null);
    if (rows.length > 1) setSuccess({ count: rows.length, total });
    else notify(t("coll_collected_ok"), true);
  };

  const selectedRows = receivables.filter(r => selected.has(r.id));
  const selectedOpen = selectedRows.filter(r => !r.collected_date);
  const selectedDone = selectedRows.filter(r => r.collected_date);
  const reopenSelected = async () => {
    try {
      const n = await bulkMarkOpen(selectedDone.map(r => r.id));
      setSelected(new Set());
      notify(t("coll_reopened_ok", { n }), true);
    } catch { notify(t("coll_save_error"), false); }
  };
  const selTotal = selectedRows.reduce((s, r) => s + Number(r.amount), 0);
  const exportCsv = () => {
    const rows = selectedRows.length ? selectedRows : receivables.filter(r => r.expected_date?.startsWith(selectedMonth));
    downloadCSV(`collections-${selectedMonth}.csv`, toCsvRows(rows, customers), CSV_COLUMNS, { bom: true });
  };
  const panelCustomer = panelId ? customers.find(c => c.id === panelId) : null;

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      {toast && (
        <div role="status" style={{ marginBottom: 10, padding: "8px 14px", borderRadius: 7, fontFamily: SANS, fontSize: 13, animation: "fadeIn 0.2s", background: toast.ok ? T.greenTint : T.redTint, border: `1px solid ${toast.ok ? T.greenBdr : T.redBdr}`, color: toast.ok ? T.green : T.red }}>
          {toast.text}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: 2, gap: 2 }} role="tablist">
          {[["receivables", t("coll_tab_receivables")], ["customers", t("coll_tab_customers")], ["analysis", t("coll_tab_analysis")]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setSelected(new Set()); }}
              style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: tab === id ? 600 : 400, background: tab === id ? T.accentTint : "transparent", color: tab === id ? T.accent : T.t2 }}>
              {label}{id === "customers" ? ` (${customers.length})` : ""}
            </button>
          ))}
        </div>
        <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{t("coll_sub")}</span>
        {tab === "receivables" && (
          <div style={{ marginInlineStart: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={exportCsv} disabled={!receivables.length}>
              <Download size={13} aria-hidden="true" />{t("coll_export_month")}
            </button>
            <button className="btn btn-ghost" style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => setImporting(true)}>
              <Sparkles size={13} aria-hidden="true" />{t("imp_btn")}
            </button>
            <button className="btn btn-accent" style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={openNew}>
              <Plus size={13} aria-hidden="true" />{t("coll_add")}
            </button>
          </div>
        )}
      </div>

      {tab === "receivables" ? (
        <ReceivablesTab customers={customers} receivables={receivables} colorOf={colorOf} month={selectedMonth} setMonth={onMonthChange}
          selected={selected} setSelected={setSelected}
          onAdd={openNew} onImport={() => setImporting(true)} onEdit={setModal} onOpenCustomer={setPanelId}
          onCollect={openCollect} onUndo={guard(markOpen)} />
      ) : tab === "customers" ? (
        <CustomersTab customers={customers} statsMap={statsMap} colorOf={colorOf}
          onAdd={addCustomer} onOpenCustomer={setPanelId} notify={notify} />
      ) : (
        <AnalysisTab customers={customers} receivables={receivables} />
      )}

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}
        label={<>{t("coll_selected", { n: selected.size })} · <span className="num" style={{ color: T.t1 }}>{fmt(selTotal)}</span></>}>
        <button className="btn btn-ghost btn-pill" style={{ padding: "7px 14px" }} onClick={exportCsv}><Download size={12} aria-hidden="true" />{t("inv_export")}</button>
        {selectedDone.length > 0 && (
          <button className="btn btn-ghost btn-pill" style={{ padding: "7px 14px" }} onClick={reopenSelected}>
            <Undo2 size={12} aria-hidden="true" />{t("coll_mark_open", { n: selectedDone.length })}
          </button>
        )}
        {selectedOpen.length > 0 && (
          <button className="btn btn-accent btn-pill" style={{ padding: "7px 18px" }} onClick={() => openCollect(selectedOpen.map(r => r.id))}>
            <Check size={13} aria-hidden="true" />{t("coll_mark_collected", { n: selectedOpen.length })} →
          </button>
        )}
      </BulkBar>

      {panelCustomer && (
        <CustomerPanel customer={panelCustomer} receivables={receivables} statsMap={statsMap} color={colorOf(panelCustomer.id)}
          onClose={() => setPanelId(null)} onCollect={openCollect} onUndo={guard(markOpen)} onEditReceivable={setModal}
          onUpdate={updateCustomer} onDelete={deleteCustomer} notify={notify} />
      )}

      {collectIds && (
        <CollectDialog receivables={receivables.filter(r => collectIds.includes(r.id))} customers={customers} statsMap={statsMap} colorOf={colorOf}
          onConfirm={confirmCollect} onClose={() => setCollectIds(null)} />
      )}

      {success && (
        <SuccessOverlay title={t("coll_success_title")} sub={t("coll_success_sub", { n: success.count })} total={success.total}
          onBack={() => setSuccess(null)}
          nextLabel={t("coll_next_month", { month: monthLong(nextMonthYM(selectedMonth), lang) })}
          onNext={() => { setSuccess(null); onMonthChange(nextMonthYM(selectedMonth)); }} />
      )}

      {importing && (
        <ImportCollectionsModal customers={customers} receivables={receivables} onImport={importCollections}
          onClose={() => setImporting(false)}
          onDone={(res, latestDate) => {
            notify(t("imp_done", { n: res.receivables, c: res.customers }), true);
            if (latestDate) onMonthChange(latestDate.slice(0, 7));
          }} />
      )}

      {modal && (
        <ReceivableModal initial={modal} customers={customers} onClose={() => setModal(null)}
          onAddCustomer={addCustomer} onDelete={deleteReceivable}
          onSave={async data => {
            if (modal.id) await updateReceivable(modal.id, data);
            else {
              await addReceivable(data);
              onMonthChange(data.expected_date.slice(0, 7));
            }
          }} />
      )}
    </div>
  );
}
