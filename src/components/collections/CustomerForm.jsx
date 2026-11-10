import { useState } from "react";
import { useT, useLang } from "../../contexts/AppContexts";
import { FONT_UI as SANS } from "../../theme";
import { Check, X } from "lucide-react";

// Inline add/edit form for a customer (Customers tab "Add customer" and the side panel's Edit).
export default function CustomerForm({ initial, onSave, onCancel, idPrefix = "cust" }) {
  const T = useT();
  const { t } = useLang();
  const [data, setData] = useState({ name: initial?.name || "", phone: initial?.phone || "", email: initial?.email || "", notes: initial?.notes || "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const inp = { flex: "1 1 140px", height: 32, padding: "0 10px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 12, color: T.t1, minWidth: 0, outline: "none" };
  const set = k => e => { setData(d => ({ ...d, [k]: e.target.value })); setError(null); };

  const save = async e => {
    e.preventDefault();
    if (!data.name.trim()) return setError(t("coll_err_name"));
    setSaving(true);
    try {
      await onSave({ name: data.name.trim(), phone: data.phone.trim() || null, email: data.email.trim() || null, notes: data.notes.trim() || null });
    } catch { setError(t("coll_save_error")); setSaving(false); }
  };

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <input id={`${idPrefix}-name`} autoFocus value={data.name} placeholder={t("cust_name")} aria-label={t("cust_name")} onChange={set("name")} style={inp} />
        <input id={`${idPrefix}-phone`} value={data.phone} placeholder={t("cust_phone")} aria-label={t("cust_phone")} inputMode="tel" dir="ltr" onChange={set("phone")} style={inp} />
        <input id={`${idPrefix}-email`} value={data.email} placeholder={t("cust_email")} aria-label={t("cust_email")} type="email" dir="ltr" onChange={set("email")} style={inp} />
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <input id={`${idPrefix}-notes`} value={data.notes} placeholder={t("cust_notes")} aria-label={t("cust_notes")} onChange={set("notes")} style={inp} />
        <button type="submit" disabled={saving} style={{ height: 32, padding: "0 12px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 6, color: T.green, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}><Check size={11} aria-hidden="true" />{t("sup_save")}</button>
        <button type="button" onClick={onCancel} aria-label={t("cancel")} style={{ height: 32, padding: "0 10px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 6, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center" }}><X size={11} /></button>
      </div>
      {error && <div role="alert" style={{ fontFamily: SANS, fontSize: 12, color: T.red }}>{error}</div>}
    </form>
  );
}
