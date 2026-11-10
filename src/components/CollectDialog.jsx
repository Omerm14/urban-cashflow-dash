import { useState, useEffect } from "react";
import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO } from "../theme";
import { fmt } from "../utils/format";
import { PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD, todayISO, statsFor } from "../utils/collections";
import { Avatar, PM_ICONS } from "./collections/shared";
import { X, Check } from "lucide-react";

// Confirms collecting one or more receivables. Every row keeps its own date and
// payment method (they often differ); the "Apply to all" strip fills every row at once.
// Used by the row Collect button (1 row), the floating bulk bar and the customer panel.
export default function CollectDialog({ receivables, customers, statsMap, colorOf, onConfirm, onClose }) {
  const T = useT();
  const { t } = useLang();
  const { isMobile } = useLayout();
  const today = todayISO();
  const byId = new Map(customers.map(c => [c.id, c]));
  const [rows, setRows] = useState(() => receivables.map(r => ({
    id: r.id, date: today, method: statsFor(statsMap, r.customer_id).usualMethod || DEFAULT_PAYMENT_METHOD,
  })));
  const [allDate, setAllDate] = useState(today);
  const [allMethod, setAllMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const recById = new Map(receivables.map(r => [r.id, r]));
  const live = rows.filter(r => recById.has(r.id));
  const total = live.reduce((s, r) => s + Number(recById.get(r.id).amount), 0);
  const invalid = live.some(r => !r.date || r.date > today);
  const setRow = (id, patch) => { setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r)); setError(null); };
  const applyDate = v => { setAllDate(v); if (v) setRows(rs => rs.map(r => ({ ...r, date: v }))); };
  const applyMethod = v => { setAllMethod(v); if (v) setRows(rs => rs.map(r => ({ ...r, method: v }))); };

  const confirm = async () => {
    if (!live.length || invalid) return;
    setSaving(true);
    try { await onConfirm(live, total); }
    catch { setError(t("cd_error")); setSaving(false); }
  };

  const ctl = { height: 32, padding: "0 8px", background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 7, fontFamily: SANS, fontSize: 12, color: T.t1, outline: "none", minWidth: 0 };
  const lbl = { fontFamily: SANS, fontSize: 10, fontWeight: 700, color: T.t3, textTransform: "uppercase", letterSpacing: "0.06em" };
  // Plain render helper (not a component) so React doesn't remount the select on every keystroke.
  const methodSelect = ({ id, value, onChange, placeholder }) => (
    <select id={id} value={value} onChange={e => onChange(e.target.value)} aria-label={t("pm_label")} style={{ ...ctl, width: "100%" }}>
      {placeholder && <option value="">{placeholder}</option>}
      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`pm_${m}`)}</option>)}
    </select>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(4,8,6,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20, animation: "fadeIn 0.2s" }}
      onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t("cd_title")} style={{ background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: isMobile ? "16px 16px 0 0" : 14, padding: isMobile ? 18 : 24, width: "100%", maxWidth: isMobile ? "100%" : 640, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-modal)", animation: isMobile ? "slideUp 0.25s ease" : "scaleIn 0.2s cubic-bezier(.16,1,.3,1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: T.t1 }}>{t("cd_title")}</div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: T.t3, marginTop: 2 }}>{t("cd_sub", { n: live.length })}</div>
          </div>
          <button onClick={onClose} disabled={saving} aria-label={t("close")} style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>

        {live.length > 1 && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap", padding: "10px 12px", background: T.accentTint, border: `1px solid ${T.accentBdr}`, borderRadius: 9, marginBottom: 10 }}>
            <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: T.accent, alignSelf: "center", flex: "0 0 auto" }}>{t("cd_apply_all")}</span>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 130px" }}>
              <span style={lbl}>{t("cd_date")}</span>
              <input id="cd-all-date" type="date" value={allDate} max={today} onChange={e => applyDate(e.target.value)} style={{ ...ctl, fontFamily: MONO }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 150px" }}>
              <span style={lbl}>{t("pm_label")}</span>
              {methodSelect({ id: "cd-all-method", value: allMethod, onChange: applyMethod, placeholder: t("cd_keep_each") })}
            </label>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", minHeight: 0, flex: "1 1 auto", marginBottom: 12 }}>
          {live.map(row => {
            const r = recById.get(row.id);
            const c = byId.get(r.customer_id);
            const MIcon = PM_ICONS[row.method];
            return (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) auto" : "minmax(0,1fr) 92px 140px 150px 24px", gap: 8, alignItems: "center", padding: "8px 10px", background: T.surf2, borderRadius: 8, border: `1px solid ${T.bdr}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <Avatar name={c?.name} color={colorOf(r.customer_id)} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c?.name || t("cust_unknown")}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span className="num">{r.reference || "—"}</span>{r.description ? ` · ${r.description}` : ""}
                    </div>
                  </div>
                </div>
                <span className="num" style={{ fontWeight: 600, fontSize: 13, color: T.t1, textAlign: "end" }}>{fmt(Number(r.amount))}</span>
                <div style={isMobile ? { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 } : { display: "contents" }}>
                  <input id={`cd-date-${row.id}`} type="date" value={row.date} max={today} aria-label={t("cd_date")}
                    onChange={e => setRow(row.id, { date: e.target.value })}
                    style={{ ...ctl, fontFamily: MONO, borderColor: !row.date || row.date > today ? T.red : T.bdr2 }} />
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    {MIcon && <MIcon size={13} color={T.t3} aria-hidden="true" style={{ position: "absolute", insetInlineStart: 8, pointerEvents: "none" }} />}
                    <select id={`cd-pm-${row.id}`} value={row.method} aria-label={t("pm_label")} onChange={e => setRow(row.id, { method: e.target.value })}
                      style={{ ...ctl, width: "100%", paddingInlineStart: 28 }}>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`pm_${m}`)}</option>)}
                    </select>
                  </div>
                  <button onClick={() => setRows(rs => rs.filter(x => x.id !== row.id))} disabled={live.length === 1} title={t("cd_remove")} aria-label={t("cd_remove")}
                    style={{ width: 24, height: 24, background: "none", border: "none", color: T.t3, cursor: live.length === 1 ? "default" : "pointer", opacity: live.length === 1 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "11px 14px", background: T.accentTint, border: `1px solid ${T.accentBdr}`, borderRadius: 8, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: SANS, color: T.accent, fontSize: 13, fontWeight: 500 }}>{t("coll_total")}</span>
          <span className="num" style={{ fontWeight: 500, fontSize: 20, color: T.accent }}>{fmt(total)}</span>
        </div>
        {error && <div role="alert" style={{ marginBottom: 10, padding: "8px 12px", background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 7, fontFamily: SANS, fontSize: 12, color: T.red }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1, padding: "11px 0" }} onClick={onClose} disabled={saving}>{t("cancel")}</button>
          <button className="btn btn-accent" style={{ flex: 2, padding: "11px 0", fontSize: 14, fontWeight: 700 }} onClick={confirm} disabled={saving || invalid || !live.length}>
            <Check size={15} strokeWidth={2.5} aria-hidden="true" />{t("cd_confirm", { n: live.length, total: fmt(total) })}
          </button>
        </div>
      </div>
    </div>
  );
}
