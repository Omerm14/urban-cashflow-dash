import { useState, useEffect, useRef, useMemo } from "react";
import { useT, useLayout, useLang } from "../../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO } from "../../theme";
import { fmt } from "../../utils/format";
import {
  receivableStatus, receivablesInMonth, monthSummary, monthPills, groupByCustomer, filterReceivables, todayISO,
  COLLECTION_STATUS as CS,
} from "../../utils/collections";
import { Avatar, CollectionPill, PaymentMethodLabel, monthLong, monthShortName, dm, dmy } from "./shared";
import { Plus, Pencil, Check, ChevronLeft, ChevronRight, Calendar, HandCoins, Undo2, Sparkles, Filter, X, Clock } from "lucide-react";

const PILL_WIDTH = 104;
const PILLS_VISIBLE = 6;
const ROW_COLS = "30px minmax(140px,1.4fr) 110px 90px 104px 150px 150px";
const ROW_MIN = 760;
// Phones: checkbox, reference (+ expected / collected date stacked), amount, status, actions.
const ROW_COLS_MOBILE = "24px minmax(0,1fr) 84px 76px 64px";

function Checkbox({ id, checked, indeterminate, onChange, label }) {
  const T = useT();
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return <input ref={ref} id={id} type="checkbox" checked={checked} onChange={onChange} aria-label={label} style={{ accentColor: T.accent, width: 14, height: 14, cursor: "pointer", flexShrink: 0 }} />;
}

function CustomerCard({ customer, receivables, color, today, selected, onToggle, onToggleMany, onCollect, onUndo, onEdit, onOpenCustomer }) {
  const T = useT();
  const { t } = useLang();
  const { isMobile } = useLayout();
  const cols = isMobile ? ROW_COLS_MOBILE : ROW_COLS;
  const minW = isMobile ? 0 : ROW_MIN;
  const total = receivables.reduce((s, r) => s + Number(r.amount), 0);
  const hasOverdue = receivables.some(r => receivableStatus(r, today) === CS.OVERDUE);
  const name = customer?.name || t("cust_unknown");
  const ids = receivables.map(r => r.id);
  const nSel = ids.filter(id => selected.has(id)).length;
  const head = isMobile
    ? ["", t("coll_col_ref"), t("coll_col_amount"), t("coll_col_status"), ""]
    : ["", t("coll_col_ref"), t("coll_col_amount"), t("coll_col_expected"), t("coll_col_status"), t("coll_col_collected_on"), ""];
  const btn = { height: 28, padding: "0 9px", borderRadius: 6, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 };

  return (
    <div className="card" style={{ borderColor: hasOverdue ? T.redBdr : T.bdr, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${T.bdr}` }}>
        <Checkbox id={`coll-g-${customer?.id ?? "x"}`} checked={nSel === ids.length} indeterminate={nSel > 0 && nSel < ids.length}
          onChange={() => onToggleMany(ids, nSel !== ids.length)} label={t("coll_select_customer", { name })} />
        <Avatar name={name} color={color} />
        <button onClick={() => customer && onOpenCustomer(customer.id)} style={{ background: "none", border: "none", padding: 0, cursor: customer ? "pointer" : "default", textAlign: "start", fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t1, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</button>
        <span style={{ fontFamily: MONO, fontSize: 11, color: T.t3, background: T.surf2, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>{receivables.length}</span>
        <span className="num" style={{ fontWeight: 500, fontSize: 13, color: T.t1 }}>{fmt(total)}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: isMobile ? "0 10px" : "0 14px", height: 28, background: T.surf2, minWidth: minW }}>
          {head.map((h, i) => (
            <div key={i} style={{ fontFamily: SANS, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.t3, textAlign: i <= 1 ? "start" : "center" }}>{h}</div>
          ))}
        </div>
        {receivables.map(r => {
          const st = receivableStatus(r, today);
          const done = st === CS.COLLECTED;
          const isSel = selected.has(r.id);
          return (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: isMobile ? "9px 10px" : "9px 14px", borderTop: `1px solid ${T.bdr}`, minWidth: minW, background: isSel ? T.accentTint : "transparent", opacity: done && !isSel ? 0.75 : 1 }}>
              <Checkbox id={`coll-s-${r.id}`} checked={isSel} onChange={() => onToggle(r.id)} label={t("coll_select_row", { ref: r.reference || fmt(Number(r.amount)) })} />
              <div style={{ minWidth: 0 }}>
                <div className="num" style={{ fontSize: 12, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reference || "—"}</div>
                {r.description && <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>}
                {isMobile && <div className="num" style={{ fontSize: 11, whiteSpace: "nowrap", color: st === CS.OVERDUE ? T.red : T.t3, fontWeight: st === CS.OVERDUE ? 600 : 400 }}>{done ? `✓ ${dm(r.collected_date)}` : dm(r.expected_date)}</div>}
              </div>
              <span className="num" style={{ fontWeight: 600, fontSize: 13, color: T.t1, textAlign: "center" }}>{fmt(Number(r.amount))}</span>
              {!isMobile && <span className="num" style={{ fontSize: 11, textAlign: "center", color: st === CS.OVERDUE ? T.red : T.t3, fontWeight: st === CS.OVERDUE ? 600 : 400 }}>{dm(r.expected_date)}</span>}
              <div style={{ display: "flex", justifyContent: "center" }}><CollectionPill status={st} /></div>
              {!isMobile && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  {done ? <><span className="num" style={{ fontSize: 11, color: T.t2 }}>{dmy(r.collected_date)}</span><PaymentMethodLabel method={r.payment_method} /></> : <span style={{ color: T.t3, fontSize: 12 }}>—</span>}
                </div>
              )}
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                {done ? (
                  <button onClick={() => onUndo(r.id)} aria-label={t("coll_undo")} title={t("coll_undo")} style={{ ...btn, background: T.surf2, border: `1px solid ${T.bdr}`, color: T.t3 }}>
                    <Undo2 size={11} aria-hidden="true" />{!isMobile && t("coll_undo")}
                  </button>
                ) : (
                  <button onClick={() => onCollect([r.id])} aria-label={t("coll_collect")} title={t("coll_collect")} style={{ ...btn, background: T.greenTint, border: `1px solid ${T.greenBdr}`, color: T.green }}>
                    <Check size={11} aria-hidden="true" />{!isMobile && t("coll_collect")}
                  </button>
                )}
                {!isMobile && (
                  <button onClick={() => onEdit(r)} title={t("coll_edit")} aria-label={t("coll_edit")}
                    style={{ width: 28, height: 28, background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Pencil size={12} aria-hidden="true" />
                  </button>
                )}
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
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 320px", minWidth: 0 }}>
      <button onClick={() => page(-1)} aria-label={t("inv_month_prev")} style={arrow}><ChevronLeft size={14} aria-hidden="true" /></button>
      <div ref={ref} className="scroll-hidden" style={{ display: "flex", gap: 6, overflowX: "auto", flex: "1 1 auto", maxWidth: PILLS_VISIBLE * (PILL_WIDTH + 6) - 6, minWidth: 0, scrollBehavior: "smooth" }}>
        {pills.map(ym => {
          const active = ym === selected;
          const total = receivablesInMonth(receivables, ym).reduce((s, r) => s + Number(r.amount), 0);
          return (
            <button key={ym} data-ym={ym} onClick={() => onSelect(ym)} aria-pressed={active}
              style={{ minWidth: PILL_WIDTH, padding: "7px 8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: active ? T.accent : T.surf2, border: `1px solid ${active ? "transparent" : T.bdr}`, borderRadius: 24, fontFamily: SANS, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? T.accentInk : T.t2, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
              <bdi>{monthShortName(ym, lang)}</bdi> <bdi className="num">{ym.slice(2, 4)}</bdi>
              {total > 0 && <bdi className="num" style={{ opacity: 0.72, fontWeight: 400, marginInlineStart: 2 }}>₪{Math.round(total / 1000)}k</bdi>}
            </button>
          );
        })}
      </div>
      <button onClick={() => page(1)} aria-label={t("inv_month_next")} style={arrow}><ChevronRight size={14} aria-hidden="true" /></button>
    </div>
  );
}

function FilterPopover({ statuses, customerIds, customers, onToggleStatus, onToggleCustomer, onClear }) {
  const T = useT();
  const { t } = useLang();
  const row = active => ({ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: active ? T.accentTint : "transparent", border: "none", borderRadius: 5, cursor: "pointer", textAlign: "start", fontFamily: SANS, fontSize: 12, color: active ? T.accent : T.t1 });
  const box = active => ({ width: 14, height: 14, border: `1.5px solid ${active ? T.accent : T.bdr2}`, borderRadius: 3, background: active ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 });
  const head = { fontFamily: SANS, fontSize: 11, fontWeight: 700, color: T.t2, textTransform: "uppercase", letterSpacing: "0.06em" };
  return (
    <div style={{ position: "absolute", top: 36, insetInlineStart: 0, width: 240, background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 10, boxShadow: "var(--shadow-pop)", zIndex: 200, overflow: "hidden", animation: "scaleIn 0.15s cubic-bezier(.16,1,.3,1)" }}>
      <div style={{ padding: "10px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.bdr}` }}>
        <span style={head}>{t("coll_col_status")}</span>
        {(statuses.size + customerIds.size) > 0 && <button onClick={onClear} style={{ fontFamily: SANS, fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{t("notif_clear")}</button>}
      </div>
      <div style={{ padding: "6px 8px" }}>
        {[CS.OPEN, CS.OVERDUE, CS.COLLECTED].map(s => (
          <button key={s} onClick={() => onToggleStatus(s)} aria-pressed={statuses.has(s)} style={row(statuses.has(s))}>
            <span style={box(statuses.has(s))}>{statuses.has(s) && <Check size={9} color={T.accentInk} strokeWidth={3.5} aria-hidden="true" />}</span>{t(`coll_${s}`)}
          </button>
        ))}
      </div>
      {customers.length > 0 && (
        <>
          <div style={{ padding: "6px 12px", borderTop: `1px solid ${T.bdr}` }}><span style={head}>{t("coll_tab_customers")}</span></div>
          <div style={{ padding: "6px 8px", maxHeight: 180, overflowY: "auto" }}>
            {customers.map(c => (
              <button key={c.id} onClick={() => onToggleCustomer(c.id)} aria-pressed={customerIds.has(c.id)} style={row(customerIds.has(c.id))}>
                <span style={box(customerIds.has(c.id))}>{customerIds.has(c.id) && <Check size={9} color={T.accentInk} strokeWidth={3.5} aria-hidden="true" />}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ReceivablesTab({
  customers, receivables, colorOf, month, setMonth, selected, setSelected,
  onCollect, onUndo, onEdit, onAdd, onImport, onOpenCustomer,
}) {
  const T = useT();
  const { t, lang } = useLang();
  const today = todayISO();
  const [statuses, setStatuses] = useState(new Set());
  const [customerIds, setCustomerIds] = useState(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  useEffect(() => {
    if (!filterOpen) return;
    const h = e => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [filterOpen]);

  const pills = useMemo(() => monthPills(receivables, month, today), [receivables, month, today]);
  const inMonth = receivablesInMonth(receivables, month);
  const shown = filterReceivables(inMonth, { statuses, customerIds }, today);
  const s = monthSummary(inMonth, today);
  const pct = s.count ? Math.round((s.collectedCount / s.count) * 100) : 0;
  const allDone = s.count > 0 && s.collectedCount === s.count;
  const groups = groupByCustomer(shown, customers, lang);
  const overdueAll = receivables.filter(r => receivableStatus(r, today) === CS.OVERDUE);
  const openInMonth = inMonth.filter(r => !r.collected_date);
  const monthCustomers = useMemo(() => {
    const ids = new Set(inMonth.map(r => r.customer_id));
    return customers.filter(c => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, lang));
  }, [inMonth, customers, lang]);
  const nFilters = statuses.size + customerIds.size;

  const toggleIn = (set, setter) => v => setter(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggle = id => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleMany = (ids, on) => setSelected(prev => { const n = new Set(prev); ids.forEach(id => on ? n.add(id) : n.delete(id)); return n; });
  const showOverdue = () => {
    setStatuses(new Set([CS.OVERDUE])); setCustomerIds(new Set());
    if (!inMonth.some(r => receivableStatus(r, today) === CS.OVERDUE) && overdueAll.length) {
      setMonth(overdueAll.map(r => r.expected_date.slice(0, 7)).sort().pop());
    }
  };

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
    <div style={{ paddingBottom: selected.size ? 80 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div ref={filterRef} style={{ position: "relative" }}>
          <button onClick={() => setFilterOpen(v => !v)} aria-expanded={filterOpen} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, background: nFilters ? T.accentTint : "transparent", border: `1px solid ${nFilters ? T.accentBdr : T.bdr}`, color: nFilters ? T.accent : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: nFilters ? 600 : 400 }}>
            <Filter size={12} strokeWidth={1.75} aria-hidden="true" />{t("inv_filter")}{nFilters ? ` (${nFilters})` : ""}
          </button>
          {filterOpen && <FilterPopover statuses={statuses} customerIds={customerIds} customers={monthCustomers}
            onToggleStatus={toggleIn(statuses, setStatuses)} onToggleCustomer={toggleIn(customerIds, setCustomerIds)}
            onClear={() => { setStatuses(new Set()); setCustomerIds(new Set()); }} />}
        </div>
        {nFilters > 0 && (
          <button onClick={() => { setStatuses(new Set()); setCustomerIds(new Set()); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, background: "transparent", border: `1px solid ${T.bdr}`, color: T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}>
            <X size={12} aria-hidden="true" />{t("notif_clear")}
          </button>
        )}
        <MonthScroller pills={pills} selected={month} onSelect={setMonth} receivables={receivables} />
        {overdueAll.length > 0 && (
          <button onClick={showOverdue} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: T.redTint, border: `1px solid ${T.redBdr}`, color: T.red, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", marginInlineStart: "auto" }}>
            <Clock size={12} aria-hidden="true" />{t("coll_overdue_n", { n: overdueAll.length })}
          </button>
        )}
      </div>

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
              {openInMonth.length > 0 && (
                <button onClick={() => toggleMany(openInMonth.map(r => r.id), true)} style={{ marginInlineStart: "auto", padding: "4px 9px", background: "transparent", border: `1px solid ${T.accentBdr}`, borderRadius: 5, color: T.accent, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {t("coll_select_open", { n: openInMonth.length })}
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {groups.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: T.t3 }}>
          <Calendar size={28} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block" }} aria-hidden="true" />
          <div style={{ fontFamily: SANS, fontSize: 13 }}>{nFilters ? t("coll_none_filtered") : t("coll_none_month", { month: monthLong(month, lang) })}</div>
        </div>
      )}
      {groups.map(g => (
        <CustomerCard key={g.customer?.id ?? "unknown"} customer={g.customer} receivables={g.receivables} color={colorOf(g.customer?.id)} today={today}
          selected={selected} onToggle={toggle} onToggleMany={toggleMany}
          onCollect={onCollect} onUndo={onUndo} onEdit={onEdit} onOpenCustomer={onOpenCustomer} />
      ))}
    </div>
  );
}
