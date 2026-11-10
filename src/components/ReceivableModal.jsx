import { useState, useEffect } from "react";
import { useT, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY } from "../theme";
import { X } from "lucide-react";
import { PAYMENT_METHODS } from "../utils/collections";

const NEW = "__new__";

// Add / edit a receivable. `initial` is either an existing receivables row (edit)
// or a partial { customer_id?, expected_date? } (new). Validation happens here so
// the DB CHECK constraints are never the user's first error message.
export default function ReceivableModal({ initial, customers, onSave, onDelete, onAddCustomer, onClose }) {
  const T = useT();
  const { t } = useLang();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    customer_id: initial?.customer_id ?? (customers.length ? customers[0].id : NEW),
    amount: initial?.amount != null ? String(Number(initial.amount)) : "",
    expected_date: initial?.expected_date ?? "",
    collected_date: initial?.collected_date ?? "",
    payment_method: initial?.payment_method ?? "",
    reference: initial?.reference ?? "",
    description: initial?.description ?? "",
  });
  const [newName, setNewName] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(null); };

  const submit = async e => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!(amount > 0)) return setError(t("coll_err_amount"));
    if (!form.expected_date) return setError(t("coll_err_date"));
    if (form.customer_id === NEW && !newName.trim()) return setError(t("coll_err_name"));
    if (!form.customer_id) return setError(t("coll_err_customer"));
    setSaving(true);
    try {
      let customerId = form.customer_id;
      if (customerId === NEW) customerId = (await onAddCustomer({ name: newName.trim() })).id;
      await onSave({
        customer_id: customerId,
        amount: Math.round(amount * 100) / 100,
        expected_date: form.expected_date,
        collected_date: isEdit ? (form.collected_date || null) : null,
        // Clearing the date reopens the receivable, so the method goes with it.
        ...(isEdit && initial.collected_date ? { payment_method: form.collected_date ? (form.payment_method || null) : null } : {}),
        reference: form.reference.trim() || null,
        description: form.description.trim() || null,
      });
      onClose();
    } catch {
      setError(t("coll_save_error"));
      setSaving(false);
    }
  };

  const label = { fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em", display: "block" };
  const title = isEdit ? t("coll_edit") : t("coll_add");

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit} noValidate>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: T.t1 }}>{title}</div>
          <button type="button" onClick={onClose} aria-label={t("close")}
            style={{ width: 32, height: 32, borderRadius: 8, background: T.surf2, border: `1px solid ${T.bdr}`, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label htmlFor="rcv-customer" style={label}>{t("coll_field_customer")}</label>
            <select id="rcv-customer" className="input" value={form.customer_id} onChange={e => set("customer_id", e.target.value)}>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value={NEW}>+ {t("coll_new_customer")}</option>
            </select>
            {form.customer_id === NEW && (
              <input id="rcv-new-customer" className="input" style={{ marginTop: 8 }} autoFocus value={newName}
                placeholder={t("cust_name")} aria-label={t("coll_new_customer")} onChange={e => { setNewName(e.target.value); setError(null); }} />
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            <div>
              <label htmlFor="rcv-amount" style={label}>{t("coll_field_amount")}</label>
              <input id="rcv-amount" className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} />
            </div>
            <div>
              <label htmlFor="rcv-expected" style={label}>{t("coll_field_expected")}</label>
              <input id="rcv-expected" className="input" type="date" value={form.expected_date} onChange={e => set("expected_date", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
            <div>
              <label htmlFor="rcv-ref" style={label}>{t("coll_field_ref")}</label>
              <input id="rcv-ref" className="input" value={form.reference} onChange={e => set("reference", e.target.value)} />
            </div>
            <div>
              <label htmlFor="rcv-desc" style={label}>{t("coll_field_desc")}</label>
              <input id="rcv-desc" className="input" value={form.description} onChange={e => set("description", e.target.value)} />
            </div>
          </div>
          {isEdit && initial.collected_date && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
              <div>
                <label htmlFor="rcv-collected" style={label}>{t("coll_field_collected")}</label>
                <input id="rcv-collected" className="input" type="date" value={form.collected_date} onChange={e => set("collected_date", e.target.value)} />
              </div>
              <div>
                <label htmlFor="rcv-method" style={label}>{t("pm_label")}</label>
                <select id="rcv-method" className="input" value={form.payment_method} disabled={!form.collected_date} onChange={e => set("payment_method", e.target.value)}>
                  {!form.payment_method && <option value="">—</option>}
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`pm_${m}`)}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 14, padding: "8px 12px", background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 7, fontFamily: SANS, fontSize: 12, color: T.red }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          {isEdit && onDelete && (confirmDelete ? (
            <>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.red }}>{t("coll_delete_confirm")}</span>
              <button type="button" className="btn" style={{ height: 32, padding: "0 10px", fontSize: 12, background: T.redTint, border: `1px solid ${T.redBdr}`, color: T.red }}
                onClick={async () => { try { await onDelete(initial.id); onClose(); } catch { setError(t("coll_save_error")); } }}>{t("coll_delete_yes")}</button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" style={{ height: 32, padding: "0 10px", fontSize: 12, color: T.red }} onClick={() => setConfirmDelete(true)}>{t("coll_delete")}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t("cancel")}</button>
          <button type="submit" className="btn btn-accent" disabled={saving}>{t("sup_save")}</button>
        </div>
      </form>
    </div>
  );
}
