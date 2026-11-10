// Small presentational pieces shared by the Collections tab, its dialogs and panels.
import { useT, useLang } from "../../contexts/AppContexts";
import { FONT_UI as SANS } from "../../theme";
import { COLLECTION_STATUS as CS } from "../../utils/collections";
import { Landmark, CreditCard, Banknote, ScrollText, Smartphone, MoreHorizontal } from "lucide-react";

export const PM_ICONS = {
  bank_transfer: Landmark,
  credit_card: CreditCard,
  cash: Banknote,
  cheque: ScrollText,
  bit_paybox: Smartphone,
  other: MoreHorizontal,
};

const locOf = lang => (lang === "he" ? "he-IL" : "en-US");
export const monthLong = (ym, lang) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locOf(lang), { month: "long", year: "numeric" }); };
export const monthShortName = (ym, lang) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locOf(lang), { month: "short" }); };
export const dm = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—");
export const dmy = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "—");

export function Avatar({ name, color, size = 28 }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: size * 0.42, color: "#fff", flexShrink: 0 }}>
      {(name || "?").charAt(0)}
    </span>
  );
}

export function CollectionPill({ status }) {
  const { t } = useLang();
  const cls = status === CS.COLLECTED ? "pill-paid" : status === CS.OVERDUE ? "pill-overdue" : "pill-pending";
  const key = status === CS.COLLECTED ? "coll_collected" : status === CS.OVERDUE ? "coll_overdue" : "coll_open";
  return <span className={`pill ${cls}`}><i aria-hidden="true" />{t(key)}</span>;
}

// Icon + label; renders nothing when the method is unknown (old rows, not collected).
export function PaymentMethodLabel({ method, size = 11 }) {
  const T = useT();
  const { t } = useLang();
  if (!method) return null;
  const Icon = PM_ICONS[method] || MoreHorizontal;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: SANS, fontSize: size - 0.5, color: T.t3, whiteSpace: "nowrap" }}>
      <Icon size={size} aria-hidden="true" />{t(`pm_${method}`)}
    </span>
  );
}

const REL_STYLE = { on_time: ["green", "greenTint"], sometimes_late: ["amber", "amberTint"], usually_late: ["red", "redTint"] };
export function ReliabilityBadge({ value }) {
  const T = useT();
  const { t } = useLang();
  if (!value) return <span style={{ fontFamily: SANS, fontSize: 10.5, color: T.t3 }}>{t("rel_none")}</span>;
  const [fg, bg] = REL_STYLE[value];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontFamily: SANS, fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, color: T[fg], background: T[bg], whiteSpace: "nowrap" }}>
      {t(`rel_${value}`)}
    </span>
  );
}
