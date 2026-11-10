import { useState, useEffect, useMemo } from "react";
import { useT, useLayout, useLang } from "../../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY } from "../../theme";
import { fmt, shiftMonthYM } from "../../utils/format";
import { statsFor, receivableStatus, todayISO, COLLECTION_STATUS as CS } from "../../utils/collections";
import { Avatar, PaymentMethodLabel, ReliabilityBadge, CollectionPill, monthLong, monthShortName, dmy } from "./shared";
import CustomerForm from "./CustomerForm";
import { X, Pencil, Trash2, Check, Undo2 } from "lucide-react";

// Slide-in panel (inline-end edge; full-width sheet on phones) with one customer's
// stats and complete receivables history across all months.
export default function CustomerPanel({ customer, receivables, statsMap, color, onClose, onCollect, onUndo, onEditReceivable, onUpdate, onDelete, notify }) {
  const T = useT();
  const { t, lang } = useLang();
  const { isMobile } = useLayout();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const today = todayISO();
  const s = statsFor(statsMap, customer.id);
  const rows = useMemo(() => receivables.filter(r => r.customer_id === customer.id).sort((a, b) => b.expected_date.localeCompare(a.expected_date)), [receivables, customer.id]);

  // Collected per month over the last 12 months (by collection date).
  const last12 = useMemo(() => {
    const thisYM = today.slice(0, 7);
    return Array.from({ length: 12 }, (_, i) => {
      const ym = shiftMonthYM(thisYM, i - 11);
      return { ym, v: rows.filter(r => r.collected_date?.startsWith(ym)).reduce((a, r) => a + Number(r.amount), 0) };
    });
  }, [rows, today]);
  const max = Math.max(1, ...last12.map(x => x.v));

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remove = async () => {
    try { await onDelete(customer.id); notify(t("cust_deleted_ok"), true); onClose(); }
    catch (e) { setConfirmDelete(false); notify(e.code === "has_receivables" ? t("cust_has_receivables", { name: customer.name }) : t("coll_save_error"), false); }
  };

  const stat = (label, value, color) => (
    <div style={{ background: T.surf2, borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.t3 }}>{label}</span>
      <span className="num" style={{ fontSize: 14, fontWeight: 600, color: color || T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
  const lbl = { fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T.t3, marginBottom: 6 };
  const smallBtn = { height: 28, padding: "0 9px", borderRadius: 6, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 };

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: "fixed", inset: 0, background: "rgba(4,8,6,0.6)", zIndex: 240, animation: "fadeIn 0.2s" }} />
      <aside role="dialog" aria-modal="true" aria-label={customer.name}
        style={{ position: "fixed", top: 0, bottom: 0, insetInlineEnd: 0, width: isMobile ? "100%" : 460, background: T.surf, borderInlineStart: `1px solid ${T.bdr2}`, boxShadow: "var(--shadow-modal)", zIndex: 250, display: "flex", flexDirection: "column", animation: "slideUp 0.25s cubic-bezier(.16,1,.3,1)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 16, borderBottom: `1px solid ${T.bdr}` }}>
          <Avatar name={customer.name} color={color} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer.name}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              {customer.phone && <span className="num" dir="ltr" style={{ fontSize: 12, color: T.t3 }}>{customer.phone}</span>}
              {customer.email && <span dir="ltr" style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{customer.email}</span>}
              <ReliabilityBadge value={s.reliability} />
            </div>
            {customer.notes && <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, marginTop: 4 }}>{customer.notes}</div>}
          </div>
          <button onClick={onClose} aria-label={t("close")} style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>

        <div style={{ padding: "14px 16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          {editing ? (
            <CustomerForm idPrefix="cust-edit" initial={customer} onCancel={() => setEditing(false)}
              onSave={async data => { await onUpdate(customer.id, data); setEditing(false); notify(t("cust_saved_ok"), true); }} />
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-ghost" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => setEditing(true)}><Pencil size={12} aria-hidden="true" />{t("cust_edit")}</button>
              {confirmDelete ? (
                <>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: T.red }}>{t("cust_delete_confirm", { name: customer.name })}</span>
                  <button className="btn" style={{ height: 30, padding: "0 10px", fontSize: 12, background: T.redTint, border: `1px solid ${T.redBdr}`, color: T.red }} onClick={remove}>{t("coll_delete_yes")}</button>
                  <button className="btn btn-ghost" style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => setConfirmDelete(false)}>{t("cancel")}</button>
                </>
              ) : (
                <button className="btn btn-ghost" style={{ height: 30, padding: "0 10px", fontSize: 12, color: T.red }} onClick={() => setConfirmDelete(true)}><Trash2 size={12} aria-hidden="true" />{t("coll_delete")}</button>
              )}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(3, minmax(0,1fr))", gap: 8 }}>
            {stat(t("cst_collected_ever"), fmt(s.collectedTotal), T.green)}
            {stat(t("cst_payments"), s.collectedCount)}
            {stat(t("cst_last_payment"), dmy(s.lastPaymentDate))}
            {stat(t("cst_avg_late"), s.avgDaysLate === null ? "—" : t("cst_days", { n: s.avgDaysLate }))}
            {stat(t("cst_still_owed"), fmt(s.open))}
            {stat(t("coll_overdue"), fmt(s.overdue), s.overdue ? T.red : T.t3)}
            {stat(t("cst_oldest_overdue"), s.oldestOverdueDays ? t("cst_days", { n: s.oldestOverdueDays }) : "—", s.oldestOverdueDays ? T.red : T.t3)}
            {stat(t("cst_usual_method"), s.usualMethod ? t(`pm_${s.usualMethod}`) : "—")}
            {stat(t("cst_since"), s.firstExpected ? monthLong(s.firstExpected.slice(0, 7), lang) : "—")}
          </div>

          <div>
            <div style={lbl}>{t("cst_last12")}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 52 }} dir="ltr">
              {last12.map(({ ym, v }) => (
                <div key={ym} title={`${monthShortName(ym, lang)} · ${fmt(v)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{ width: "100%", height: Math.max(v ? 3 : 1, (v / max) * 38), background: v ? color : T.surf3, borderRadius: 2 }} />
                  <span style={{ fontFamily: SANS, fontSize: 8.5, color: T.t3 }}>{monthShortName(ym, lang).slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={lbl}>{t("cst_history")} · {rows.length}</div>
            {rows.map((r, i) => {
              const st = receivableStatus(r, today);
              return (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 8, alignItems: "center", padding: "8px 0", borderTop: i ? `1px solid ${T.bdr}` : "none" }}>
                  <button onClick={() => onEditReceivable(r)} style={{ background: "none", border: "none", padding: 0, textAlign: "start", cursor: "pointer", minWidth: 0, color: T.t1 }}>
                    <div style={{ fontFamily: SANS, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span className="num" style={{ color: st === CS.OVERDUE ? T.red : T.t1 }}>{dmy(r.expected_date)}</span>{r.description ? ` · ${r.description}` : r.reference ? ` · ${r.reference}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 2 }}>
                      {r.collected_date ? <>{t("coll_collected")} <span className="num">{dmy(r.collected_date)}</span><PaymentMethodLabel method={r.payment_method} /></> : <CollectionPill status={st} />}
                    </div>
                  </button>
                  <span className="num" style={{ fontWeight: 600, fontSize: 13 }}>{fmt(Number(r.amount))}</span>
                  {r.collected_date ? (
                    <button onClick={() => onUndo(r.id)} aria-label={t("coll_undo")} title={t("coll_undo")} style={{ ...smallBtn, background: T.surf2, border: `1px solid ${T.bdr}`, color: T.t3 }}><Undo2 size={11} aria-hidden="true" /></button>
                  ) : (
                    <button onClick={() => onCollect([r.id])} style={{ ...smallBtn, background: st === CS.OVERDUE ? T.redTint : T.greenTint, border: `1px solid ${st === CS.OVERDUE ? T.redBdr : T.greenBdr}`, color: st === CS.OVERDUE ? T.red : T.green }}>
                      <Check size={11} aria-hidden="true" />{t("coll_collect")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
