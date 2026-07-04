import { useLang } from "../contexts/AppContexts";

// Status → pill class + i18n key. Dot + label so state never reads by color alone.
const MAP = {
  paid:    { cls: "pill-paid",    key: "inv_paid" },
  unpaid:  { cls: "pill-pending", key: "inv_unpaid" },
  overdue: { cls: "pill-overdue", key: "inv_overdue" },
  credit:  { cls: "pill-credit",  key: "inv_credit" },
};

export default function StatusPill({ status }) {
  const { t } = useLang();
  const c = MAP[String(status || "unpaid").toLowerCase()] || MAP.unpaid;
  return (
    <span className={`pill ${c.cls}`}>
      <i aria-hidden="true" />
      {t(c.key)}
    </span>
  );
}
