import { useState, useEffect, useRef, useMemo } from "react";
import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO, chartPalette } from "../theme";
import { fmt } from "../utils/format";
import {
  receivableStatus, receivablesInMonth, monthSummary, monthPills, groupByCustomer, openBalanceByCustomer, todayISO,
  COLLECTION_STATUS as CS,
} from "../utils/collections";
import ListSkeleton from "../components/ListSkeleton";
import ReceivableModal from "../components/ReceivableModal";
import ImportCollectionsModal from "../components/ImportCollectionsModal";
import { Plus, Pencil, Trash2, Check, X, ChevronLeft, ChevronRight, Calendar, HandCoins, Undo2, Sparkles } from "lucide-react";

const PILL_WIDTH = 104;
const PILLS_VISIBLE = 6;
const ROW_COLS = "minmax(140px,1.4fr) 110px 96px 104px 130px 150px";
const ROW_MIN = 680;
// Phones: reference + expected date stacked, amount, status, actions — no sideways scroll
// needed to collect. The collected-on date is edited from the receivable form instead.
const ROW_COLS_MOBILE = "minmax(0,1fr) 86px 78px 92px";

const locOf = lang => (lang === "he" ? "he-IL" : "en-US");
const monthLong  = (ym, lang) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locOf(lang), { month: "long", year: "numeric" }); };
const monthShort = (ym, lang) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locOf(lang), { month: "short" }) + " '" + String(y).slice(2); };
const dm = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");

function CollectionPill({ status }) {
  const { t } = useLang();
  const cls = status === CS.COLLECTED ? "pill-paid" : status === CS.OVERDUE ? "pill-overdue" : "pill-pending";
  const key = status === CS.COLLECTED ? "coll_collected" : status === CS.OVERDUE ? "coll_overdue" : "coll_open";
  return <span className={`pill ${cls}`}><i aria-hidden="true" />{t(key)}</span>;
}

function Avatar({ name, color, size = 28 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: size * 0.42, color: "#fff", flexShrink: 0 }}>
      {(name || "?").charAt(0)}
    </span>
  );
}

function CustomerCard({ customer, receivables, color, today, onCollect, onUndo, onSetCollectedDate, onEdit }) {
  const T = useT();
  const { t } = useLang();
  const { isMobile } = useLayout();
  const cols = isMobile ? ROW_COLS_MOBILE : ROW_COLS;
  const minW = isMobile ? 0 : ROW_MIN;
  const total = receivables.reduce((s, r) => s + Number(r.amount), 0);
  const hasOverdue = receivables.some(r => receivableStatus(r, today) === CS.OVERDUE);
  const name = customer?.name || t("cust_unknown");
  const head = isMobile
    ? [t("coll_col_ref"), t("coll_col_amount"), t("coll_col_status"), ""]
    : [t("coll_col_ref"), t("coll_col_amount"), t("coll_col_expected"), t("coll_col_status"), t("coll_col_collected_on"), ""];

  return (
    <div className="card" style={{ borderColor: hasOverdue ? T.redBdr : T.bdr, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${T.bdr}` }}>
        <Avatar name={name} color={color} />
        <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t1, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: T.t3, background: T.surf2, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>{receivables.length}</span>
        <span className="num" style={{ fontWeight: 500, fontSize: 13, color: T.t1 }}>{fmt(total)}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: isMobile ? "0 10px" : "0 14px", height: 28, background: T.surf2, minWidth: minW }}>
          {head.map((h, i) => (
            <div key={i} style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.t3, textAlign: i === 0 ? "start" : "center" }}>{h}</div>
          ))}
        </div>
        {receivables.map(r => {
          const st = receivableStatus(r, today);
          const done = st === CS.COLLECTED;
          return (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: isMobile ? "9px 10px" : "9px 14px", borderTop: `1px solid ${T.bdr}`, minWidth: minW, opacity: done ? 0.75 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div className="num" style={{ fontSize: 12, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reference || "—"}</div>
                {r.description && <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>}
                {isMobile && <div className="num" style={{ fontSize: 11, whiteSpace: "nowrap", color: st === CS.OVERDUE ? T.red : T.t3, fontWeight: st === CS.OVERDUE ? 600 : 400 }}>{done ? `✓ ${dm(r.collected_date)}` : dm(r.expected_date)}</div>}
              </div>
              <span className="num" style={{ fontWeight: 600, fontSize: 13, color: T.t1, textAlign: "center" }}>{fmt(Number(r.amount))}</span>
              {!isMobile && <span className="num" style={{ fontSize: 11, textAlign: "center", color: st === CS.OVERDUE ? T.red : T.t3, fontWeight: st === CS.OVERDUE ? 600 : 400 }}>{dm(r.expected_date)}</span>}
              <div style={{ display: "flex", justifyContent: "center" }}><CollectionPill status={st} /></div>
              {!isMobile && <div style={{ display: "flex", justifyContent: "center" }}>
                {done
                  ? <input type="date" className="input" id={`coll-date-${r.id}`} value={r.collected_date} max={today} aria-label={t("coll_col_collected_on")}
                      onChange={e => e.target.value && onSetCollectedDate(r.id, e.target.value)}
                      style={{ height: 28, padding: "0 6px", fontSize: 11, fontFamily: MONO, width: 124 }} />
                  : <span style={{ color: T.t3, fontSize: 12 }}>—</span>}
              </div>}
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                {done ? (
                  <button onClick={() => onUndo(r.id)} aria-label={t("coll_undo")} style={{ height: 28, padding: "0 9px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, color: T.t3, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                    <Undo2 size={11} aria-hidden="true" />{!isMobile && t("coll_undo")}
                  </button>
                ) : (
                  <button onClick={() => onCollect(r.id)} aria-label={t("coll_collect")} style={{ height: 28, padding: "0 9px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 6, color: T.green, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                    <Check size={11} aria-hidden="true" />{!isMobile && t("coll_collect")}
                  </button>
                )}
                <button onClick={() => onEdit(r)} title={t("coll_edit")} aria-label={t("coll_edit")}
                  style={{ width: 28, height: 28, background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Pencil size={12} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "6px 14px", borderTop: `1px solid ${T.bdr}`, display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, color: T.t3 }}>
        <span>{t("coll_count", { n: receivables.length })}</span>
        <span>{t("coll_total")}: <span className="num" style={{ color: T.t2 }}>{fmt(total)}</span></span>
      </div>
    </div>
  );
}

function MonthScroller({ pills, selected, onSelect, receivables }) {
  const T = useT();
  const { t, lang } = useLang();
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector(`[data-ym="${selected}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected]);
  const page = dir => { const el = ref.current; if (el) el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.6, 120), behavior: "smooth" }); };
  const arrow = { display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, flexShrink: 0, borderRadius: "50%", background: "transparent", border: `1px solid ${T.bdr}`, color: T.t2, cursor: "pointer" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
      <button onClick={() => page(-1)} aria-label={t("inv_month_prev")} style={arrow}><ChevronLeft size={14} aria-hidden="true" /></button>
      <div ref={ref} className="scroll-hidden" style={{ display: "flex", gap: 6, overflowX: "auto", flex: "1 1 auto", maxWidth: PILLS_VISIBLE * (PILL_WIDTH + 6) - 6, minWidth: 0, scrollBehavior: "smooth" }}>
        {pills.map(ym => {
          const active = ym === selected;
          const total = receivablesInMonth(receivables, ym).reduce((s, r) => s + Number(r.amount), 0);
          return (
            <button key={ym} data-ym={ym} onClick={() => onSelect(ym)} aria-pressed={active}
              style={{ minWidth: PILL_WIDTH, padding: "7px 8px", display: "flex", alignItems: "center", justifyContent: "center", background: active ? T.accent : T.surf2, border: `1px solid ${active ? "transparent" : T.bdr}`, borderRadius: 24, fontFamily: SANS, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? T.accentInk : T.t2, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              {monthShort(ym, lang)}
              {total > 0 && <span className="num" style={{ opacity: 0.72, fontWeight: 400, marginInlineStart: 4 }}>₪{Math.round(total / 1000)}k</span>}
            </button>
          );
        })}
      </div>
      <button onClick={() => page(1)} aria-label={t("inv_month_next")} style={arrow}><ChevronRight size={14} aria-hidden="true" /></button>
    </div>
  );
}

function ReceivablesTab({ customers, receivables, colorOf, onCollect, onUndo, onSetCollectedDate, onEdit, onAdd, onImport, month, setMonth }) {
  const T = useT();
  const { t, lang } = useLang();
  const today = todayISO();
  const pills = useMemo(() => monthPills(receivables, month, today), [receivables, month, today]);
  const inMonth = receivablesInMonth(receivables, month);
  const s = monthSummary(inMonth, today);
  const pct = s.count ? Math.round((s.collectedCount / s.count) * 100) : 0;
  const allDone = s.count > 0 && s.collectedCount === s.count;
  const groups = groupByCustomer(inMonth, customers, lang);

  if (receivables.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "56px 16px", color: T.t3 }}>
        <HandCoins size={30} strokeWidth={1.25} style={{ margin: "0 auto 12px", display: "block" }} aria-hidden="true" />
        <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: T.t1, marginBottom: 4 }}>{t("coll_empty_title")}</div>
        <div style={{ fontFamily: SANS, fontSize: 13, marginBottom: 16 }}>{customers.length ? t("coll_empty_sub") : t("coll_no_customers")}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-accent" onClick={onImport}><Sparkles size={13} aria-hidden="true" />{t("imp_btn")}</button>
          <button className="btn btn-ghost" onClick={onAdd}><Plus size={13} aria-hidden="true" />{t("coll_add")}</button>
        </div>
      </div>
    );
  }

  const chip = (color, label, value) => (
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12, color: T.t2, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} aria-hidden="true" />
      {label}&nbsp;<span className="num" style={{ color: T.t1, fontWeight: 600 }}>{fmt(value)}</span>
    </span>
  );

  return (
    <div>
      <MonthScroller pills={pills} selected={month} onSelect={setMonth} receivables={receivables} />
      {s.count > 0 && (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{t("coll_collected_of", { done: s.collectedCount, total: s.count })}</span>
              <span className="num" style={{ fontSize: 12, color: allDone ? T.green : T.accent, fontWeight: 500 }}>{pct}%</span>
            </div>
            <div style={{ height: 3, background: T.surf3, borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: allDone ? T.green : T.accent, borderRadius: 2, transition: "width 0.6s cubic-bezier(.16,1,.3,1)" }} />
            </div>
          </div>
          <div style={{ padding: "10px 14px", background: T.accentTint, border: `1px solid ${T.accentBdr}`, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.accent }}>{t("coll_to_collect")} · {monthLong(month, lang)}</span>
              <span className="num" style={{ fontWeight: 500, fontSize: 18, color: T.t1 }}>{fmt(s.total)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.accentBdr}` }}>
              {s.collected > 0 && chip(T.green, t("coll_collected"), s.collected)}
              {s.open > 0 && chip(T.amber, t("coll_open"), s.open)}
              {s.overdue > 0 && chip(T.red, t("coll_overdue"), s.overdue)}
            </div>
          </div>
        </>
      )}
      {groups.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: T.t3 }}>
          <Calendar size={28} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block" }} aria-hidden="true" />
          <div style={{ fontFamily: SANS, fontSize: 13 }}>{t("coll_none_month", { month: monthLong(month, lang) })}</div>
        </div>
      )}
      {groups.map(g => (
        <CustomerCard key={g.customer?.id ?? "unknown"} customer={g.customer} receivables={g.receivables} color={colorOf(g.customer?.id)} today={today}
          onCollect={onCollect} onUndo={onUndo} onSetCollectedDate={onSetCollectedDate} onEdit={onEdit} />
      ))}
    </div>
  );
}

function CustomersTab({ customers, receivables, colorOf, onAdd, onUpdate, onDelete, notify }) {
  const T = useT();
  const { t, lang } = useLang();
  const { isMobile } = useLayout();
  const [editId, setEditId] = useState(null); // customer id, "new", or null
  const [data, setData] = useState({});
  const balances = useMemo(() => openBalanceByCustomer(receivables), [receivables]);
  const sorted = useMemo(() => [...customers].sort((a, b) => a.name.localeCompare(b.name, lang)), [customers, lang]);
  const inp = { flex: "1 1 140px", height: 32, padding: "0 10px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 12, color: T.t1, minWidth: 0, outline: "none" };

  const startEdit = c => { setEditId(c ? c.id : "new"); setData(c ? { name: c.name, phone: c.phone || "", email: c.email || "", notes: c.notes || "" } : { name: "", phone: "", email: "", notes: "" }); };
  const save = async () => {
    if (!data.name?.trim()) return notify(t("coll_err_name"), false);
    const clean = { name: data.name.trim(), phone: data.phone.trim() || null, email: data.email.trim() || null, notes: data.notes.trim() || null };
    try {
      if (editId === "new") await onAdd(clean); else await onUpdate(editId, clean);
      setEditId(null);
      notify(t("cust_saved_ok"), true);
    } catch { notify(t("coll_save_error"), false); }
  };
  const remove = async c => {
    if (!window.confirm(t("cust_delete_confirm", { name: c.name }))) return;
    try { await onDelete(c.id); notify(t("cust_deleted_ok"), true); }
    catch (e) { notify(e.code === "has_receivables" ? t("cust_has_receivables", { name: c.name }) : t("coll_save_error"), false); }
  };

  const form = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <input id="cust-name" autoFocus value={data.name ?? ""} placeholder={t("cust_name")} aria-label={t("cust_name")} onChange={e => setData(d => ({ ...d, name: e.target.value }))} style={inp} />
        <input id="cust-phone" value={data.phone ?? ""} placeholder={t("cust_phone")} aria-label={t("cust_phone")} inputMode="tel" dir="ltr" onChange={e => setData(d => ({ ...d, phone: e.target.value }))} style={inp} />
        <input id="cust-email" value={data.email ?? ""} placeholder={t("cust_email")} aria-label={t("cust_email")} type="email" dir="ltr" onChange={e => setData(d => ({ ...d, email: e.target.value }))} style={inp} />
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <input id="cust-notes" value={data.notes ?? ""} placeholder={t("cust_notes")} aria-label={t("cust_notes")} onChange={e => setData(d => ({ ...d, notes: e.target.value }))} style={inp} />
        <button onClick={save} style={{ height: 32, padding: "0 12px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 6, color: T.green, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}><Check size={11} aria-hidden="true" />{t("sup_save")}</button>
        <button onClick={() => setEditId(null)} aria-label={t("cancel")} style={{ height: 32, padding: "0 10px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 6, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center" }}><X size={11} /></button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="card" style={{ overflow: "hidden" }}>
        {customers.length === 0 && editId !== "new" && (
          <div style={{ textAlign: "center", padding: "40px 20px", fontFamily: SANS, fontSize: 13, color: T.t3 }}>{t("cust_none")}</div>
        )}
        {sorted.map((c, idx) => {
          const owed = balances.get(c.id) || 0;
          return (
            <div key={c.id} style={{ padding: "11px 14px", borderTop: idx > 0 ? `1px solid ${T.bdr}` : "none" }}>
              {editId === c.id ? form : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={c.name} color={colorOf(c.id)} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[c.phone && <span key="p" className="num" dir="ltr">{c.phone}</span>, c.notes].filter(Boolean).reduce((acc, x, i) => (i ? [...acc, " · ", x] : [x]), [])}
                    </div>
                  </div>
                  <div style={{ textAlign: "end", flexShrink: 0 }}>
                    {!isMobile && <div style={{ fontFamily: SANS, fontSize: 10, color: T.t3 }}>{t("coll_open_balance")}</div>}
                    <div className="num" style={{ fontSize: 13, fontWeight: 600, color: owed ? T.t1 : T.t3 }}>{fmt(owed)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    <button onClick={() => startEdit(c)} aria-label={t("cust_edit")} style={{ padding: "3px 8px", height: 26, background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 4, color: T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><Pencil size={10} aria-hidden="true" />{!isMobile && t("cust_edit")}</button>
                    <button onClick={() => remove(c)} aria-label={t("coll_delete")} style={{ padding: "3px 7px", height: 26, background: "transparent", border: `1px solid ${T.redBdr}`, borderRadius: 4, color: T.red, cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={10} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {editId === "new" && <div style={{ padding: "11px 14px", borderTop: customers.length ? `1px solid ${T.bdr}` : "none" }}>{form}</div>}
      </div>
      {editId !== "new" && (
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={() => startEdit(null)}><Plus size={13} aria-hidden="true" />{t("cust_add")}</button>
        </div>
      )}
    </div>
  );
}

export default function CollectionsView({
  customers, receivables, loading, selectedMonth, onMonthChange,
  addCustomer, updateCustomer, deleteCustomer, addReceivable, updateReceivable, deleteReceivable, markCollected, markOpen,
  importCollections,
}) {
  const T = useT();
  const { t } = useLang();
  const [tab, setTab] = useState("receivables");
  const [modal, setModal] = useState(null); // receivable row (edit) or partial (new)
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const notify = (text, ok) => { setToast({ text, ok }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), ok ? 3000 : 4500); };
  const guard = fn => async (...a) => { try { await fn(...a); } catch { notify(t("coll_save_error"), false); } };

  // Colors by stable customer order (created order), same palette slots as suppliers.
  const palette = chartPalette(T.isDark);
  const colorOf = id => { const i = customers.findIndex(c => c.id === id); return i < 0 ? T.t3 : palette[i % palette.length]; };

  if (loading) return <ListSkeleton rows={6} label={t("nav_collections")} />;

  const openNew = () => {
    const today = todayISO();
    const expected = selectedMonth === today.slice(0, 7) ? today : `${selectedMonth}-01`;
    setModal({ expected_date: expected });
  };

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      {toast && (
        <div role="status" style={{ marginBottom: 10, padding: "8px 14px", borderRadius: 7, fontFamily: SANS, fontSize: 13, animation: "fadeIn 0.2s", background: toast.ok ? T.greenTint : T.redTint, border: `1px solid ${toast.ok ? T.greenBdr : T.redBdr}`, color: toast.ok ? T.green : T.red }}>
          {toast.text}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: 2, gap: 2 }} role="tablist">
          {[["receivables", t("coll_tab_receivables")], ["customers", t("coll_tab_customers")]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              style={{ padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: tab === id ? 600 : 400, background: tab === id ? T.accentTint : "transparent", color: tab === id ? T.accent : T.t2 }}>
              {label}{id === "customers" ? ` (${customers.length})` : ""}
            </button>
          ))}
        </div>
        <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{t("coll_sub")}</span>
        {tab === "receivables" && (
          <div style={{ marginInlineStart: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          onAdd={openNew} onImport={() => setImporting(true)} onEdit={setModal}
          onCollect={guard(id => markCollected(id))} onUndo={guard(markOpen)}
          onSetCollectedDate={guard((id, d) => updateReceivable(id, { collected_date: d }))} />
      ) : (
        <CustomersTab customers={customers} receivables={receivables} colorOf={colorOf}
          onAdd={addCustomer} onUpdate={updateCustomer} onDelete={deleteCustomer} notify={notify} />
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
