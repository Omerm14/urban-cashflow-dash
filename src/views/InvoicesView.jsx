import { useState, useEffect, useRef, useCallback } from "react";
import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO, chartPalette } from "../theme";
import { fmt, fmtMonth, fmtDate, nextMonthYM } from "../utils/format";
import { downloadCSV } from "../utils/csv";
import StatusPill from "../components/StatusPill";
import TermsPicker from "../components/TermsPicker";
import ListSkeleton from "../components/ListSkeleton";
import {
  Calendar, Filter, X, Check, CheckCircle2, AlertTriangle, Zap, Paperclip, Pencil, Download,
} from "lucide-react";

const SOURCE_LABELS = { google_drive: { icon: "📁", label: "Drive" }, gmail: { icon: "✉️", label: "Gmail" }, whatsapp: { icon: "💬", label: "WA" }, green_invoice: { icon: "🧾", label: "GI" } };
const isPaidStatus = (s) => s === "Paid" || s === "paid";

const CONFETTI_COLORS = ["#3DD6A3", "#D9A93F", "#3987E5", "#D55181", "#8FE8C9"];

function TrashIcon({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4h6v2"/></svg>;
}
function PaidToggleLabel({ isPaid, t }) {
  return isPaid
    ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/><path d="m8 12 3 3 5-5"/></svg>{t("inv_unpaid")}</>
    : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>{t("inv_paid")}</>;
}

function SupplierGroup({ supplier, invoices, selectedIds, onToggleSelect, onToggleAll, onMarkPaid, onPayGroup, onEditInvoice, onViewAttachment, anomalyMap, color, onDeleteInvoice, onAddSupplier }) {
  const T = useT();
  const { isMobile } = useLayout();
  const { t } = useLang();
  const [hov, setHov] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newTerms, setNewTerms] = useState("shotef");
  const c = color || T.accentDeep;
  const unpaidIds = invoices.filter(i => !isPaidStatus(i.status)).map(i => i.id);
  const allIds = invoices.map(i => i.id);
  const allSel = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const someSel = !allSel && allIds.some(id => selectedIds.has(id));
  const total = invoices.reduce((s, i) => s + i.amount, 0);
  const checkRef = useRef(null);
  const supplierAnomaly = anomalyMap?.get(supplier);
  const supplierUnmatched = invoices[0] && invoices[0].supplier && invoices[0].supplierMatched === false;
  useEffect(() => { if (checkRef.current) checkRef.current.indeterminate = someSel; }, [someSel]);

  return (
    <div className="card" style={{ borderColor: (supplierUnmatched || supplierAnomaly) ? T.amberBdr : T.bdr, marginBottom: 10, overflow: "hidden" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${T.bdr}`, background: (supplierUnmatched || supplierAnomaly) ? T.amberTint : "transparent" }}>
        <input type="checkbox" ref={checkRef} checked={allSel} onChange={() => onToggleAll(allIds)} aria-label={`Select all ${supplier} invoices`} style={{ accentColor: T.accent, cursor: "pointer", width: 14, height: 14, flexShrink: 0 }} />
        <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", background: c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 12, color: "#fff", flexShrink: 0 }}>{supplier.charAt(0)}</span>
        <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t1, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{supplier}</span>
        {supplierUnmatched && (
          <button onClick={e => { e.stopPropagation(); setAddingSupplier(v => !v); setNewTerms("shotef"); }}
            title={t("sup_add_unrecognized")}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: T.amberTint, border: `1px solid ${T.amberBdr}`, borderRadius: 5, color: T.amber, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            <AlertTriangle size={10} aria-hidden="true" />{t("sup_add_unrecognized")}
          </button>
        )}
        {supplierAnomaly && (
          <span title={`Monthly total is ${supplierAnomaly.deviationPct}% ${supplierAnomaly.direction} than baseline`} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", background: T.amberTint, border: `1px solid ${T.amberBdr}`, borderRadius: 4, color: T.amber, fontFamily: SANS, fontSize: 10, fontWeight: 700, cursor: "help" }}>
            <AlertTriangle size={9} aria-hidden="true" />{supplierAnomaly.direction === "higher" ? "↑" : "↓"}{supplierAnomaly.deviationPct}%
          </span>
        )}
        {hov && unpaidIds.length > 0 && !isMobile && (
          <button onClick={e => { e.stopPropagation(); onPayGroup(unpaidIds); }} style={{ padding: "4px 10px", borderRadius: 999, background: T.accent, border: "none", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 12, color: T.accentInk, display: "flex", alignItems: "center", gap: 4, animation: "fadeIn 0.15s" }}>
            <Zap size={11} aria-hidden="true" />{t("inv_pay_group")}
          </button>
        )}
        <span style={{ fontFamily: MONO, fontSize: 11, color: T.t3, background: T.surf2, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>{invoices.length}</span>
        <span className="num" style={{ fontWeight: 500, fontSize: 13, color: T.t1 }}>{fmt(total)}</span>
      </div>
      {addingSupplier && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", background: T.amberTint, borderBottom: `1px solid ${T.amberBdr}` }}>
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.amber, whiteSpace: "nowrap" }}>{t("sup_add_named", { name: supplier })}</span>
          <TermsPicker value={newTerms} onChange={setNewTerms} />
          <button className="btn btn-accent" style={{ height: 30, padding: "0 12px", fontSize: 12 }}
            onClick={async () => { try { await onAddSupplier?.({ name: supplier, terms: newTerms, notes: "" }); setAddingSupplier(false); } catch (e) { console.error(e); } }}>{t("sup_save")}</button>
          <button className="btn btn-ghost" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => setAddingSupplier(false)}>{t("cancel")}</button>
        </div>
      )}
      <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "32px 1fr 90px 100px 160px" : "36px 1fr 80px 100px 100px 90px 90px 190px", alignItems: "center", padding: isMobile ? "0 10px" : "0 14px", height: 28, background: T.surf2, borderTop: `1px solid ${T.bdr}`, gap: 8, minWidth: isMobile ? 460 : "auto" }}>
          {(isMobile
            ? ["", t("inv_col_invoice"), t("inv_col_amount"), t("inv_col_status"), ""]
            : ["", t("inv_col_invoice"), t("inv_col_source"), t("inv_col_amount"), t("inv_col_status"), t("inv_col_issued"), t("inv_col_due"), ""]
          ).map((h, i, arr) => (
            <div key={i} style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.t3, textAlign: i === arr.length - 1 ? "end" : i >= 3 ? "center" : "start" }}>{h}</div>
          ))}
        </div>
        {invoices.map(inv => {
          const isSel = selectedIds.has(inv.id);
          const isPaid = isPaidStatus(inv.status);
          const isOverdue = inv.status === "Overdue" || inv.status === "overdue";
          const src = SOURCE_LABELS[inv.sync_source];
          const cols = isMobile ? "32px 1fr 90px 100px 160px" : "36px 1fr 80px 100px 100px 90px 90px 190px";
          return (
            <div key={inv.id} onClick={() => onToggleSelect(inv.id)}
              style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 8, padding: isMobile ? "9px 10px" : "9px 14px", borderTop: `1px solid ${T.bdr}`, background: isSel ? T.accentTint : "transparent", cursor: "pointer", transition: "background 0.1s", minWidth: isMobile ? 460 : "auto", opacity: isPaid ? 0.72 : 1 }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.surf2; }}
              onMouseLeave={e => { e.currentTarget.style.background = isSel ? T.accentTint : "transparent"; }}>
              <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(inv.id)} onClick={e => e.stopPropagation()} aria-label={`Select invoice ${inv.invoiceNo || ""}`} style={{ accentColor: T.accent, cursor: "pointer", width: 13, height: 13 }} />
              <span className="num" style={{ fontSize: 12, color: T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.invoiceNo || "—"}</span>
              {!isMobile && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                  <span style={{ fontSize: 12 }} aria-hidden="true">{src ? src.icon : "📤"}</span>
                  <span style={{ fontFamily: SANS, fontSize: 9, color: T.t3 }}>{src ? src.label : "Manual"}</span>
                </div>
              )}
              <span className="num" style={{ fontWeight: 600, fontSize: 13, color: T.t1, textAlign: "center" }}>{fmt(inv.amount)}</span>
              <div style={{ display: "flex", justifyContent: "center" }}><StatusPill status={inv.status} /></div>
              {!isMobile && <span className="num" style={{ fontSize: 11, color: T.t3, textAlign: "center" }}>{fmtDate(inv.invoiceDate)}</span>}
              {!isMobile && <span className="num" style={{ fontSize: 11, color: isOverdue ? T.red : T.t3, fontWeight: isOverdue ? 600 : 400, textAlign: "center" }}>{inv.dueDate ? fmtDate(inv.dueDate) : "—"}</span>}
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                {inv.attachment_path && (
                  <button onClick={e => { e.stopPropagation(); onViewAttachment?.(inv); }} title={t("inv_preview")} aria-label={t("inv_preview")}
                    style={{ width: 28, height: 28, background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Paperclip size={12} aria-hidden="true" />
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); onMarkPaid(inv.id); }}
                  style={{ height: 28, padding: "0 9px", background: isPaid ? T.surf2 : T.greenTint, border: `1px solid ${isPaid ? T.bdr : T.greenBdr}`, borderRadius: 6, color: isPaid ? T.t3 : T.green, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                  <PaidToggleLabel isPaid={isPaid} t={t} />
                </button>
                {!isMobile && (
                  <button onClick={e => { e.stopPropagation(); onEditInvoice?.(inv); }} title={t("inv_edit")} aria-label={t("inv_edit")}
                    style={{ width: 28, height: 28, background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Pencil size={12} aria-hidden="true" />
                  </button>
                )}
                <button onClick={e => { e.stopPropagation(); if (window.confirm(t("inv_delete_confirm"))) onDeleteInvoice?.(inv.id); }} title={t("inv_delete")} aria-label={t("inv_delete")}
                  style={{ width: 28, height: 28, background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 6, color: T.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.85 }}>
                  <TrashIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "6px 14px", borderTop: `1px solid ${T.bdr}`, display: "flex", justifyContent: "space-between" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: SANS, fontSize: 12, color: T.t3 }}>
          <input type="checkbox" checked={allSel} onChange={() => onToggleAll(allIds)} style={{ accentColor: T.accent, width: 12, height: 12 }} />{t("inv_select_all")}
        </label>
        <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{t("inv_total")}: <span className="num" style={{ color: T.t2 }}>{fmt(total)}</span></span>
      </div>
    </div>
  );
}

function GroupedView({ invoices, selectedMonth, onMonthChange, selectedIds, onToggleSelect, onToggleAll, onMarkPaid, onSelectAll, onAllPaid, onEditInvoice, onViewAttachment, anomalyMap, missingSuppliers, onDeleteInvoice, onAddSupplier, supplierColor }) {
  const T = useT();
  const { isMobile } = useLayout();
  const { t } = useLang();
  const monthInvoices = invoices.filter(inv => inv.dueDate?.startsWith(selectedMonth));
  const unpaid = monthInvoices.filter(i => !isPaidStatus(i.status));
  const paidCount = monthInvoices.length - unpaid.length;
  const progress = monthInvoices.length > 0 ? Math.round((paidCount / monthInvoices.length) * 100) : 0;
  const allPaid = monthInvoices.length > 0 && paidCount === monthInvoices.length;
  const monthTotal = monthInvoices.reduce((s, i) => s + Number(i.amount), 0);
  const prevAllPaid = useRef(false);
  useEffect(() => { if (allPaid && !prevAllPaid.current && monthInvoices.length > 0) onAllPaid(); prevAllPaid.current = allPaid; }, [allPaid]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = Object.entries(monthInvoices.reduce((acc, inv) => { (acc[inv.supplier] = acc[inv.supplier] || []).push(inv); return acc; }, {})).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {(() => {
          const yms = [...new Set(invoices.map(i => i.dueDate?.slice(0, 7)).filter(Boolean))].sort();
          if (!yms.includes(selectedMonth)) yms.push(selectedMonth);
          yms.sort();
          return yms.slice(0, 8).map(ym => {
            const active = ym === selectedMonth;
            const mInvoices = invoices.filter(i => i.dueDate?.startsWith(ym));
            const mTotal = mInvoices.reduce((s, i) => s + Number(i.amount), 0);
            const [y, m] = ym.split("-").map(Number);
            const shortLabel = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" }) + " '" + String(y).slice(2);
            return (
              <button key={ym} onClick={() => onMonthChange(ym)} style={{ padding: "7px 16px", background: active ? T.accent : T.surf2, border: `1px solid ${active ? "transparent" : T.bdr}`, borderRadius: 24, fontFamily: SANS, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? T.accentInk : T.t2, cursor: "pointer", whiteSpace: "nowrap" }}>
                {shortLabel}
                {mTotal > 0 && <span className="num" style={{ opacity: active ? 0.75 : 0.7, fontWeight: 400, marginInlineStart: 4 }}>₪{Math.round(mTotal / 1000)}k</span>}
              </button>
            );
          });
        })()}
      </div>
      {monthInvoices.length > 0 && (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{t("inv_paid_of", { paid: paidCount, total: monthInvoices.length })}</span>
              <span className="num" style={{ fontSize: 12, color: allPaid ? T.green : T.accent, fontWeight: 500 }}>{progress}%</span>
            </div>
            <div style={{ height: 3, background: T.surf3, borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: allPaid ? T.green : T.accent, borderRadius: 2, transition: "width 0.6s cubic-bezier(.16,1,.3,1)" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: T.accentTint, border: `1px solid ${T.accentBdr}`, borderRadius: 8, marginBottom: 12, gap: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.accent, flex: 1, minWidth: 0 }}>{isMobile ? fmtMonth(selectedMonth) : `${t("inv_total_due")} · ${fmtMonth(selectedMonth)}`}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {unpaid.length > 0 && <button onClick={() => onSelectAll(unpaid.map(i => i.id))} style={{ padding: "4px 9px", background: "transparent", border: `1px solid ${T.accentBdr}`, borderRadius: 5, color: T.accent, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{isMobile ? `${t("inv_select_all")} (${unpaid.length})` : `${t("inv_select_all")} (${unpaid.length})`}</button>}
              <span className="num" style={{ fontWeight: 500, fontSize: isMobile ? 15 : 18, color: T.t1 }}>{fmt(monthTotal)}</span>
            </div>
          </div>
        </>
      )}
      {groups.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: T.t3 }}>
          <Calendar size={28} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block" }} aria-hidden="true" />
          <div style={{ fontFamily: SANS, fontSize: 13 }}>{t("inv_none_month", { month: fmtMonth(selectedMonth) })}</div>
        </div>
      )}
      {missingSuppliers?.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.amberTint, border: `1px solid ${T.amberBdr}`, borderRadius: 10, marginBottom: 10 }}>
          <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.amber }}>{t("inv_missing_label")} </span>
            <span style={{ fontFamily: SANS, fontSize: 13, color: T.t2 }}>{missingSuppliers.join(", ")}</span>
          </div>
        </div>
      )}
      {groups.map(([supplier, supInvoices]) => (
        <SupplierGroup key={supplier} supplier={supplier} invoices={supInvoices} selectedIds={selectedIds}
          onToggleSelect={onToggleSelect} onToggleAll={onToggleAll} onMarkPaid={onMarkPaid}
          onPayGroup={ids => onSelectAll(ids)} onEditInvoice={onEditInvoice} onViewAttachment={onViewAttachment} anomalyMap={anomalyMap}
          color={supplierColor(supplier)} onDeleteInvoice={onDeleteInvoice} onAddSupplier={onAddSupplier} />
      ))}
    </div>
  );
}

export default function InvoicesView({ invoices, loading, selectedMonth, onMonthChange, onMarkPaid, onAddSupplier, onDeleteInvoice, onBulkPaid, onBulkUnpaid, onBulkDelete, preSelectAll, onEditInvoice, onViewAttachment, anomalyMap, missingSuppliers, initialFilterStatus, initialSelectedId, supplierColor: supplierColorProp }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
  const { t } = useLang();
  const supplierList = [...new Set(invoices.map(i => i.supplier))];
  const palette = chartPalette(T.isDark);
  const supplierColor = supplierColorProp || (name => palette[Math.max(supplierList.indexOf(name), 0) % palette.length]);
  const [viewMode, setViewMode] = useState("grouped");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState(new Set());
  const [filterSuppliers, setFilterSuppliers] = useState(new Set());
  const filterRef = useRef(null);
  useEffect(() => {
    if (!filterOpen) return;
    const h = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [filterOpen]);

  const allStatuses = ["Paid", "Unpaid", "Overdue", "Credit"];
  const statusLabel = (s) => s === "Paid" ? t("inv_paid") : s === "Unpaid" ? t("inv_unpaid") : s === "Overdue" ? t("inv_overdue") : t("inv_credit");
  const toggleStatus = (s) => setFilterStatuses(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const toggleSupplier = (s) => setFilterSuppliers(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const activeFilters = filterStatuses.size + filterSuppliers.size;
  const filteredInvoices = invoices.filter(inv => {
    if (filterStatuses.size > 0 && !filterStatuses.has(inv.status)) return false;
    if (filterSuppliers.size > 0 && !filterSuppliers.has(inv.supplier)) return false;
    return true;
  });

  useEffect(() => {
    if (preSelectAll) {
      const ids = invoices.filter(i => i.dueDate?.startsWith(selectedMonth) && !isPaidStatus(i.status)).map(i => i.id);
      setSelectedIds(new Set(ids));
    }
  }, [preSelectAll, selectedMonth]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (initialFilterStatus) setFilterStatuses(new Set([initialFilterStatus])); }, [initialFilterStatus]);
  useEffect(() => { if (initialSelectedId) setSelectedIds(new Set([initialSelectedId])); }, [initialSelectedId]);

  const [addingSupplierFor, setAddingSupplierFor] = useState(null);
  const [newSupplierTerms, setNewSupplierTerms] = useState("shotef");
  const toggleSelect = useCallback((id) => { setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }, []);
  const toggleAll = useCallback((ids) => { setSelectedIds(prev => { const allSel = ids.every(id => prev.has(id)); const n = new Set(prev); if (allSel) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id)); return n; }); }, []);

  if (loading) return <ListSkeleton rows={6} label={t("inv_title")} />;

  const selInvs = invoices.filter(i => selectedIds.has(i.id));
  const selTotal = selInvs.reduce((s, i) => s + i.amount, 0);
  const handleExportSelected = () => downloadCSV(
    `invoices-${selectedMonth}.csv`, selInvs,
    ["supplier", "invoiceNo", "invoiceDate", "dueDate", "amount", "status"]
  );

  const handleConfirmPay = () => {
    const ids = [...selectedIds], count = ids.length, total = selTotal, nm = nextMonthYM(selectedMonth);
    onBulkPaid(ids); setSelectedIds(new Set()); setShowPayConfirm(false);
    setSuccessData({ count, total, nextMonth: nm }); setShowSuccess(true);
  };
  const modalBg = "rgba(4,8,6,0.8)";

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {!isMobile && (
          <div style={{ display: "flex", background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: 2, gap: 2 }}>
            {["grouped", "table"].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: viewMode === mode ? 600 : 400, background: viewMode === mode ? T.accentTint : "transparent", color: viewMode === mode ? T.accent : T.t2 }}>{mode === "grouped" ? t("inv_grouped") : t("inv_table")}</button>
            ))}
          </div>
        )}
        <div ref={filterRef} style={{ position: "relative" }}>
          <button onClick={() => setFilterOpen(v => !v)} aria-expanded={filterOpen} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, background: activeFilters > 0 ? T.accentTint : "transparent", border: `1px solid ${activeFilters > 0 ? T.accentBdr : T.bdr}`, color: activeFilters > 0 ? T.accent : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: activeFilters > 0 ? 600 : 400 }}>
            <Filter size={12} strokeWidth={1.75} aria-hidden="true" />{t("inv_filter")}{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </button>
          {filterOpen && (
            <div style={{ position: "absolute", top: 36, insetInlineStart: 0, width: 240, background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 10, boxShadow: "var(--shadow-pop)", zIndex: 200, overflow: "hidden", animation: "scaleIn 0.15s cubic-bezier(.16,1,.3,1)" }}>
              <div style={{ padding: "10px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.bdr}` }}>
                <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: T.t2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("inv_col_status")}</span>
                {activeFilters > 0 && <button onClick={() => { setFilterStatuses(new Set()); setFilterSuppliers(new Set()); }} style={{ fontFamily: SANS, fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{t("notif_clear")}</button>}
              </div>
              <div style={{ padding: "6px 8px" }}>
                {allStatuses.map(s => (
                  <button key={s} onClick={() => toggleStatus(s)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: filterStatuses.has(s) ? T.accentTint : "transparent", border: "none", borderRadius: 5, cursor: "pointer", textAlign: "start" }}>
                    <span style={{ width: 14, height: 14, border: `1.5px solid ${filterStatuses.has(s) ? T.accent : T.bdr2}`, borderRadius: 3, background: filterStatuses.has(s) ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {filterStatuses.has(s) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.accentInk} strokeWidth="3.5" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}
                    </span>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: filterStatuses.has(s) ? T.accent : T.t1 }}>{statusLabel(s)}</span>
                  </button>
                ))}
              </div>
              {supplierList.length > 0 && (
                <>
                  <div style={{ padding: "6px 12px", borderTop: `1px solid ${T.bdr}` }}>
                    <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: T.t2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("inv_col_supplier")}</span>
                  </div>
                  <div style={{ padding: "6px 8px", maxHeight: 160, overflowY: "auto" }}>
                    {supplierList.map(s => (
                      <button key={s} onClick={() => toggleSupplier(s)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: filterSuppliers.has(s) ? T.accentTint : "transparent", border: "none", borderRadius: 5, cursor: "pointer", textAlign: "start" }}>
                        <span style={{ width: 14, height: 14, border: `1.5px solid ${filterSuppliers.has(s) ? T.accent : T.bdr2}`, borderRadius: 3, background: filterSuppliers.has(s) ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {filterSuppliers.has(s) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.accentInk} strokeWidth="3.5" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}
                        </span>
                        <span style={{ fontFamily: SANS, fontSize: 12, color: filterSuppliers.has(s) ? T.accent : T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {selectedIds.size > 0 && <button onClick={() => setSelectedIds(new Set())} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, background: "transparent", border: `1px solid ${T.redBdr}`, color: T.red, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}><X size={12} aria-hidden="true" />{t("notif_clear")}</button>}
        <div className="num" style={{ marginInlineStart: "auto", fontSize: 11, color: T.t3 }}>{filteredInvoices.length}{activeFilters > 0 ? ` / ${invoices.length}` : ""} {t("inv_invoices")}</div>
      </div>

      {(isMobile || viewMode === "grouped") ? (
        <GroupedView invoices={filteredInvoices} selectedMonth={selectedMonth} onMonthChange={onMonthChange}
          selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
          onMarkPaid={onMarkPaid} onSelectAll={ids => setSelectedIds(new Set(ids))}
          onAllPaid={() => setShowCelebration(true)} onEditInvoice={onEditInvoice} onViewAttachment={onViewAttachment}
          anomalyMap={anomalyMap} missingSuppliers={missingSuppliers}
          onDeleteInvoice={onDeleteInvoice} onAddSupplier={onAddSupplier} supplierColor={supplierColor} />
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "44px minmax(160px,1.6fr) 120px 96px 96px 120px 80px 100px 200px", alignItems: "center", padding: "0 16px", height: 38, background: T.surf2, borderBottom: `1px solid ${T.bdr}` }}>
            {[
              { label: "", align: "center" },
              { label: t("inv_col_supplier"), align: "start" },
              { label: t("inv_col_invoice"), align: "center" },
              { label: t("inv_col_issued"), align: "center" },
              { label: t("inv_col_due"), align: "center" },
              { label: t("inv_col_amount"), align: "end" },
              { label: t("inv_col_source"), align: "center" },
              { label: t("inv_col_status"), align: "center" },
              { label: "", align: "end" },
            ].map((h, i) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.t3, textAlign: h.align }}>{h.label}</div>
            ))}
          </div>
          {filteredInvoices.map(inv => {
            const isSel = selectedIds.has(inv.id);
            const srcInfo = SOURCE_LABELS[inv.sync_source];
            const isAddingSupplier = addingSupplierFor === inv.id;
            const isPaid = isPaidStatus(inv.status);
            const isOverdueRow = inv.status === "Overdue" || inv.status === "overdue";
            return (
              <div key={inv.id}>
                <div onClick={() => toggleSelect(inv.id)}
                  style={{ display: "grid", gridTemplateColumns: "44px minmax(160px,1.6fr) 120px 96px 96px 120px 80px 100px 200px", alignItems: "center", padding: "0 16px", height: 54, borderBottom: isAddingSupplier ? "none" : `1px solid ${T.bdr}`, background: isSel ? T.accentTint : "transparent", cursor: "pointer", transition: "background 0.1s", opacity: isPaid ? 0.72 : 1 }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.surf2; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSel ? T.accentTint : "transparent"; }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ width: 15, height: 15, border: `1.5px solid ${isSel ? T.accent : T.bdr2}`, borderRadius: 4, background: isSel ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}>
                      {isSel && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.accentInk} strokeWidth="3.5" strokeLinecap="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: supplierColor(inv.supplier), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 11, color: "#fff", flexShrink: 0 }}>{(inv.supplier || "?").charAt(0)}</span>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: 13, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{inv.supplier}</span>
                      {inv.supplier && !inv.supplierMatched && (
                        <button onClick={e => { e.stopPropagation(); setAddingSupplierFor(isAddingSupplier ? null : inv.id); setNewSupplierTerms("shotef"); }} title={t("sup_add_unrecognized")} style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 2, padding: "2px 6px", border: `1px solid ${T.amberBdr}`, borderRadius: 4, background: T.amberTint, cursor: "pointer", fontFamily: SANS, fontSize: 9, fontWeight: 700, color: T.amber, lineHeight: 1.4 }}>
                          <AlertTriangle size={8} aria-hidden="true" />{t("sup_add_unrecognized")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="num" style={{ fontSize: 12, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{inv.invoiceNo || "—"}</div>
                  <div className="num" style={{ fontSize: 12, color: T.t2, textAlign: "center" }}>{fmtDate(inv.invoiceDate)}</div>
                  <div className="num" style={{ fontSize: 12, color: isOverdueRow ? T.red : T.t2, fontWeight: isOverdueRow ? 600 : 400, textAlign: "center" }}>{fmtDate(inv.dueDate)}</div>
                  <div className="num" style={{ fontSize: 14, fontWeight: 600, color: T.t1, textAlign: "end" }}>{fmt(inv.amount)}</div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                    <span style={{ fontSize: 13 }} aria-hidden="true">{srcInfo ? srcInfo.icon : "📤"}</span>
                    <span style={{ fontFamily: SANS, fontSize: 9, color: T.t3, fontWeight: 500 }}>{srcInfo ? srcInfo.label : "Manual"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <StatusPill status={inv.status} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
                    <button onClick={e => { e.stopPropagation(); onMarkPaid?.(inv.id); }}
                      style={{ height: 30, padding: "0 10px", border: `1px solid ${isPaid ? T.bdr : T.greenBdr}`, borderRadius: 7, background: isPaid ? T.surf2 : T.greenTint, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: SANS, fontSize: 11, fontWeight: 600, color: isPaid ? T.t3 : T.green, flexShrink: 0 }}>
                      <PaidToggleLabel isPaid={isPaid} t={t} />
                    </button>
                    {inv.attachment_path && (
                      <button onClick={e => { e.stopPropagation(); onViewAttachment?.(inv); }} title={t("inv_preview")} aria-label={t("inv_preview")}
                        style={{ width: 30, height: 30, border: `1px solid ${T.bdr}`, borderRadius: 7, background: T.surf2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Paperclip size={13} strokeWidth={1.75} color={T.t2} aria-hidden="true" />
                      </button>
                    )}
                    <button onClick={e => { e.stopPropagation(); onEditInvoice?.(inv); }} title={t("inv_edit")} aria-label={t("inv_edit")}
                      style={{ width: 30, height: 30, border: `1px solid ${T.bdr}`, borderRadius: 7, background: T.surf2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Pencil size={13} color={T.t2} aria-hidden="true" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); if (window.confirm(t("inv_delete_confirm"))) onDeleteInvoice?.(inv.id); }} title={t("inv_delete")} aria-label={t("inv_delete")}
                      style={{ width: 30, height: 30, border: `1px solid ${T.redBdr}`, borderRadius: 7, background: T.redTint, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: T.red, opacity: 0.85 }}>
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </div>
                {isAddingSupplier && (
                  <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 18px 10px 76px", borderBottom: `1px solid ${T.bdr}`, background: T.amberTint }}>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: T.amber, fontWeight: 600, whiteSpace: "nowrap" }}>{t("sup_add_named", { name: inv.supplier })}</span>
                    <TermsPicker value={newSupplierTerms} onChange={setNewSupplierTerms} />
                    <button className="btn btn-accent" style={{ height: 30, padding: "0 12px", fontSize: 12 }} onClick={async () => { try { await onAddSupplier?.({ name: inv.supplier, terms: newSupplierTerms, notes: "" }); setAddingSupplierFor(null); } catch (e) { console.error(e); } }}>{t("sup_save")}</button>
                    <button className="btn btn-ghost" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => setAddingSupplierFor(null)}>{t("cancel")}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating batch bar */}
      {selectedIds.size > 0 && (
        <div style={{ position: "fixed", bottom: isMobile ? 0 : 24, insetInlineStart: isMobile || isTablet ? 0 : 232, insetInlineEnd: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 200, animation: "slideUp 0.25s cubic-bezier(.16,1,.3,1)" }}>
          <div style={{ pointerEvents: "auto", background: T.surf3, border: `1px solid ${T.bdr2}`, padding: isMobile ? "14px 20px" : "10px 12px 10px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "var(--shadow-pop)", borderRadius: isMobile ? "14px 14px 0 0" : 999, width: isMobile ? "100%" : "auto", whiteSpace: "nowrap" }}>
            <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: 11, color: T.accentInk }}>{selectedIds.size}</span>
            <span style={{ fontFamily: SANS, fontWeight: 500, color: T.t2, fontSize: 13, flex: 1 }}>
              {t("inv_selected", { n: selectedIds.size })} · <span className="num" style={{ color: T.t1 }}>{fmt(selTotal)}</span>
            </span>
            <button className="btn btn-ghost btn-pill" style={{ padding: "7px 14px" }} onClick={handleExportSelected}><Download size={12} aria-hidden="true" />{t("inv_export")}</button>
            <button className="btn btn-ghost btn-pill" style={{ padding: "7px 14px" }} onClick={() => { onBulkUnpaid?.([...selectedIds]); setSelectedIds(new Set()); }}><X size={12} aria-hidden="true" />{t("inv_unpaid")}</button>
            <button className="btn btn-accent btn-pill" style={{ padding: "7px 18px" }} onClick={() => setShowPayConfirm(true)}>{t("inv_pay_selected")} →</button>
            <button className="btn btn-danger btn-pill" style={{ padding: "7px 14px" }} onClick={() => { if (window.confirm(t("inv_bulk_delete_confirm", { n: selectedIds.size }))) { onBulkDelete?.([...selectedIds]); setSelectedIds(new Set()); } }}>
              <TrashIcon />{t("delete")}
            </button>
            <button onClick={() => setSelectedIds(new Set())} aria-label={t("close")} style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={15} /></button>
          </div>
        </div>
      )}

      {/* Pay confirm */}
      {showPayConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: modalBg, backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20, animation: "fadeIn 0.2s" }}>
          <div role="dialog" aria-modal="true" aria-label={t("inv_confirm_title")} style={{ background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: isMobile ? "16px 16px 0 0" : 14, padding: 24, width: "100%", maxWidth: isMobile ? "100%" : 500, boxShadow: "var(--shadow-modal)", animation: isMobile ? "slideUp 0.25s ease" : "scaleIn 0.2s cubic-bezier(.16,1,.3,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: T.t1 }}>{t("inv_confirm_title")}</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: T.t3, marginTop: 2 }}>{t("inv_confirm_sub", { n: selInvs.length })}</div>
              </div>
              <button onClick={() => setShowPayConfirm(false)} aria-label={t("close")} style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto", marginBottom: 14 }}>
              {selInvs.map(inv => (
                <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.surf2, borderRadius: 7, border: `1px solid ${T.bdr}` }}>
                  <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", background: supplierColor(inv.supplier), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 11, color: "#fff", flexShrink: 0 }}>{inv.supplier.charAt(0)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t1 }}>{inv.supplier}</div>
                    <div className="num" style={{ fontSize: 10, color: T.t3 }}>{inv.invoiceNo}</div>
                  </div>
                  <span className="num" style={{ fontWeight: 500, fontSize: 13, color: T.t1 }}>{fmt(inv.amount)}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "11px 14px", background: T.accentTint, border: `1px solid ${T.accentBdr}`, borderRadius: 8, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: SANS, color: T.accent, fontSize: 13, fontWeight: 500 }}>{t("inv_total")}</span>
              <span className="num" style={{ fontWeight: 500, fontSize: 20, color: T.accent }}>{fmt(selTotal)}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1, padding: "11px 0" }} onClick={() => setShowPayConfirm(false)}>{t("cancel")}</button>
              <button className="btn btn-accent" style={{ flex: 2, padding: "11px 0", fontSize: 14, fontWeight: 700 }} onClick={handleConfirmPay}>
                <Check size={15} strokeWidth={2.5} aria-hidden="true" />{t("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Month cleared celebration */}
      {showCelebration && (
        <div onClick={() => setShowCelebration(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: modalBg, backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20, animation: "fadeIn 0.2s" }}>
          <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: T.surf, border: `1px solid ${T.brassBdr}`, borderRadius: isMobile ? "16px 16px 0 0" : 14, padding: "32px 28px", textAlign: "center", width: "100%", maxWidth: isMobile ? "100%" : 380, position: "relative", animation: isMobile ? "slideUp 0.25s ease" : "scaleIn 0.25s cubic-bezier(.16,1,.3,1)", backgroundImage: `linear-gradient(180deg, ${T.brassTint}, transparent 55%)` }}>
            <button onClick={() => setShowCelebration(false)} aria-label={t("close")} style={{ position: "absolute", top: 14, insetInlineEnd: 16, background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={18} /></button>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: T.brassTint, border: `1px solid ${T.brassBdr}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <CheckCircle2 size={28} color={T.brass} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, color: T.t1, marginBottom: 7 }}>{t("inv_cleared_title", { month: fmtMonth(selectedMonth) })}</div>
            <div style={{ fontFamily: SANS, color: T.t2, fontSize: 14, marginBottom: 20 }}>{t("inv_cleared_sub")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1, padding: "10px 0" }} onClick={() => setShowCelebration(false)}>{t("back")}</button>
              <button className="btn btn-accent" style={{ flex: 2, padding: "10px 0" }} onClick={() => { setShowCelebration(false); onMonthChange(nextMonthYM(selectedMonth)); }}>{t("inv_next_month")} →</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment success overlay with confetti */}
      {showSuccess && successData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(6,11,9,0.95)", backdropFilter: "blur(14px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.3s", padding: 24 }}>
          {[...Array(20)].map((_, i) => (
            <span key={i} aria-hidden="true" style={{ position: "fixed", left: `${5 + i * 4.5}%`, top: `${20 + (i % 5) * 10}%`, width: i % 3 === 0 ? 9 : 6, height: i % 3 === 0 ? 9 : 6, borderRadius: i % 2 === 0 ? 2 : "50%", background: CONFETTI_COLORS[i % CONFETTI_COLORS.length], animation: `confettiFall ${0.5 + (i % 7) * 0.07}s ease-out ${i * 0.05}s both`, pointerEvents: "none" }} />
          ))}
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(61,214,163,0.14)", border: "1px solid rgba(61,214,163,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <CheckCircle2 size={34} color="#3DD6A3" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28, letterSpacing: "-0.02em", color: "#F2F1EA", marginBottom: 7 }}>{t("inv_success_title")}</div>
          <div style={{ fontFamily: SANS, color: "#A8B5AE", fontSize: 15, marginBottom: 5 }}>{t("inv_success_sub", { n: successData.count })}</div>
          <div className="num" style={{ fontWeight: 500, fontSize: 24, color: "#3DD6A3", marginBottom: 24 }}>{fmt(successData.total)}</div>
          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 320 }}>
            <button onClick={() => setShowSuccess(false)} style={{ flex: 1, padding: "10px 0", background: "transparent", border: "1px solid rgba(242,241,234,0.16)", borderRadius: 999, color: "#A8B5AE", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 14 }}>{t("back")}</button>
            <button onClick={() => { setShowSuccess(false); onMonthChange(successData.nextMonth); }} style={{ flex: 2, padding: "10px 0", background: "#3DD6A3", border: "none", borderRadius: 999, color: "#07120E", cursor: "pointer", fontFamily: SANS, fontWeight: 700, fontSize: 14 }}>
              {t("inv_next_label", { month: fmtMonth(successData.nextMonth) })} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
