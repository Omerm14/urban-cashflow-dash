import { calcDueDate, currency } from "../utils/dates";
import { STATUS } from "../constants";
import { useT, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO } from "../theme";
import { X, Paperclip } from "lucide-react";

const SOURCE_LABELS = { google_drive: "📁 Google Drive", gmail: "✉️ Gmail", whatsapp: "💬 WhatsApp", green_invoice: "🧾 Green Invoice" };
const STATUS_LABEL_KEYS = { [STATUS.UNPAID]: "inv_unpaid", [STATUS.PAID]: "inv_paid", [STATUS.OVERDUE]: "inv_overdue", [STATUS.CREDIT]: "inv_credit" };

export default function EditInvoiceModal({ editInvoice, setEditInvoice, suppliers, addInvoice, updateInvoice, getSupplier, onViewAttachment, anomaly }) {
  const T = useT();
  const { t, lang } = useLang();
  const locale = lang === "he" ? "he-IL" : "en-GB";
  const close = () => setEditInvoice(null);
  const save = async () => {
    const { id, ...fields } = editInvoice;
    const patch = {
      supplier:     fields.supplier,
      invoice_no:   fields.invoiceNo   ?? fields.invoice_no   ?? "",
      invoice_date: fields.invoiceDate ?? fields.invoice_date ?? "",
      amount:       Number(fields.amount) || 0,
      due_date:     fields.dueDate     ?? fields.due_date     ?? "",
      status:       fields.status,
      notes:        fields.notes       ?? "",
    };
    if (id) await updateInvoice(id, patch);
    else    await addInvoice(patch);
    close();
  };

  const onFieldChange = (key, value) => {
    const u = { ...editInvoice, [key]: value };
    if ((key === "invoiceDate" || key === "supplier") && u.invoiceDate && u.supplier) {
      const sup = getSupplier(u.supplier);
      if (sup && sup.terms !== "custom") {
        const d = calcDueDate(u.invoiceDate, sup);
        if (d) u.dueDate = d.toISOString().split("T")[0];
      }
    }
    setEditInvoice(u);
  };

  const label = { fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };
  const FIELDS = [
    ["invoiceNo", "text", t("inv_col_invoice")],
    ["invoiceDate", "date", t("inv_col_issued")],
    ["amount", "number", t("inv_col_amount")],
    ["dueDate", "date", t("inv_field_due_override")],
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={editInvoice.id ? t("inv_edit_title") : t("inv_add")}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: T.t1 }}>{editInvoice.id ? t("inv_edit_title") : t("inv_add")}</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, marginTop: 2 }}>{t("inv_edit_sub")}</div>
          </div>
          <button onClick={close} aria-label={t("close")}
            style={{ width: 32, height: 32, borderRadius: 8, background: T.surf2, border: `1px solid ${T.bdr}`, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        {anomaly && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: T.amberTint, borderRadius: 10, border: `1px solid ${T.amberBdr}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden="true">📊</span>
            <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, lineHeight: 1.6 }}>
              <strong style={{ color: T.amber }}>{t("inv_anomaly_label")}: </strong>
              {anomaly.direction === "higher" ? t("inv_anomaly_higher") : t("inv_anomaly_lower")} {anomaly.deviationPct}% {t("inv_anomaly_from_avg")} ({currency(anomaly.average)})
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          {FIELDS.map(([key, type, fieldLabel]) => (
            <div key={key}>
              <div style={label}>{fieldLabel}</div>
              <input type={type} value={editInvoice[key] ?? editInvoice[key.replace(/([A-Z])/g, "_$1").toLowerCase()] ?? ""} className="input"
                aria-label={fieldLabel} onChange={e => onFieldChange(key, e.target.value)} />
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={label}>{t("inv_col_supplier")}</div>
          <select value={editInvoice.supplier} className="input" aria-label={t("inv_col_supplier")}
            onChange={e => {
              const sup = getSupplier(e.target.value);
              const due = editInvoice.invoiceDate && sup ? calcDueDate(editInvoice.invoiceDate, sup) : null;
              setEditInvoice({ ...editInvoice, supplier: e.target.value, dueDate: due ? due.toISOString().split("T")[0] : (editInvoice.dueDate || editInvoice.due_date || "") });
            }}>
            <option value="">— {t("inv_select_supplier")} —</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name} · {s.terms}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={label}>{t("inv_col_status")}</div>
          <select value={editInvoice.status} className="input" aria-label={t("inv_col_status")}
            onChange={e => setEditInvoice({ ...editInvoice, status: e.target.value })}>
            {Object.values(STATUS).map(s => <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s] || s)}</option>)}
          </select>
        </div>

        {editInvoice.sync_source && (
          <div style={{ marginBottom: 20, padding: "10px 14px", background: T.surf2, borderRadius: 10, border: `1px solid ${T.bdr}` }}>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: T.t3, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{t("inv_sync_audit")}</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, display: "flex", flexDirection: "column", gap: 3 }}>
              <span>{t("inv_source_label")}: <strong style={{ color: T.t2 }}>{SOURCE_LABELS[editInvoice.sync_source] || editInvoice.sync_source}</strong></span>
              {editInvoice.sync_timestamp && (
                <span>{t("inv_synced_label")}: <strong className="num" style={{ color: T.t2, fontFamily: MONO }}>{new Date(editInvoice.sync_timestamp).toLocaleString(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong></span>
              )}
              {editInvoice.sync_source_meta?.filename && (
                <span>{t("inv_file_label")}: <strong style={{ color: T.t2 }}>{editInvoice.sync_source_meta.filename}</strong></span>
              )}
              {editInvoice.attachment_path && onViewAttachment && (
                <span style={{ marginTop: 2 }}>
                  <button
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: SANS, fontSize: 12, color: T.accent, textDecoration: "underline" }}
                    onClick={() => { close(); onViewAttachment(editInvoice); }}>
                    <Paperclip size={11} aria-hidden="true" />{t("inv_view_original")}
                  </button>
                </span>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" style={{ padding: "10px 20px" }} onClick={close}>{t("cancel")}</button>
          <button className="btn btn-accent" style={{ padding: "10px 24px", fontWeight: 700 }} onClick={save}>{t("inv_save_invoice")}</button>
        </div>
      </div>
    </div>
  );
}
