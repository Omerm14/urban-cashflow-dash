import { useState, useMemo } from "react";
import { useT, useLayout, useLang } from "../../contexts/AppContexts";
import { FONT_UI as SANS } from "../../theme";
import { fmt } from "../../utils/format";
import { statsFor, sortCustomers, filterCustomers, CUSTOMER_SORTS } from "../../utils/collections";
import { normalizeName } from "../../utils/collectionsImport";
import { Avatar, PaymentMethodLabel, ReliabilityBadge, dmy } from "./shared";
import CustomerForm from "./CustomerForm";
import { Plus, Search, ChevronRight } from "lucide-react";

// Customers list: totals strip, search + sort, one clickable row per customer that opens
// the side panel. All figures are derived from receivables (customerStats), not stored.
export default function CustomersTab({ customers, statsMap, colorOf, onAdd, onOpenCustomer, notify }) {
  const T = useT();
  const { t, lang } = useLang();
  const { isMobile } = useLayout();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("owed");
  const [adding, setAdding] = useState(false);

  const totals = useMemo(() => {
    let collected = 0, open = 0, overdue = 0, lateSum = 0, lateN = 0;
    for (const c of customers) {
      const s = statsFor(statsMap, c.id);
      collected += s.collectedTotal; open += s.open; overdue += s.overdue;
      if (s.avgDaysLate !== null) { lateSum += s.avgDaysLate * s.collectedCount; lateN += s.collectedCount; }
    }
    return { collected, open, overdue, avgLate: lateN ? Math.round(lateSum / lateN) : null };
  }, [customers, statsMap]);
  const list = useMemo(
    () => sortCustomers(filterCustomers(customers, query, normalizeName), statsMap, sort, lang),
    [customers, query, sort, statsMap, lang]
  );

  const tile = (label, value, color) => (
    <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T.t3 }}>{label}</span>
      <span className="num" style={{ fontSize: 17, color: color || T.t1 }}>{value}</span>
    </div>
  );
  const fig = (label, value, color, sub) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontFamily: SANS, fontSize: 10, color: T.t3 }}>{label}</span>
      <span className="num" style={{ fontSize: 13, color: color || T.t1 }}>{value}</span>
      {sub}
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
        {tile(t("cst_collected_ever"), fmt(totals.collected), T.green)}
        {tile(t("cst_still_owed"), fmt(totals.open))}
        {tile(t("cst_of_overdue"), fmt(totals.overdue), totals.overdue ? T.red : T.t3)}
        {tile(t("cst_avg_late"), totals.avgLate === null ? "—" : t("cst_days", { n: totals.avgLate }))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
          <Search size={13} color={T.t3} aria-hidden="true" style={{ position: "absolute", insetInlineStart: 10, top: 10 }} />
          <input id="cust-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("cst_search")} aria-label={t("cst_search")}
            style={{ width: "100%", height: 32, paddingInlineStart: 30, paddingInlineEnd: 10, background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 7, fontFamily: SANS, fontSize: 12, color: T.t1, outline: "none" }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12, color: T.t3 }}>
          {t("cst_sort")}
          <select id="cust-sort" value={sort} onChange={e => setSort(e.target.value)} style={{ height: 32, padding: "0 8px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 7, fontFamily: SANS, fontSize: 12, color: T.t1 }}>
            {CUSTOMER_SORTS.map(k => <option key={k} value={k}>{t(`cst_sort_${k}`)}</option>)}
          </select>
        </label>
        {!adding && <button className="btn btn-ghost" style={{ marginInlineStart: "auto", height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => setAdding(true)}><Plus size={13} aria-hidden="true" />{t("cust_add")}</button>}
      </div>

      {adding && (
        <div className="card" style={{ padding: "12px 14px", marginBottom: 10 }}>
          <CustomerForm idPrefix="cust-new" onCancel={() => setAdding(false)}
            onSave={async data => { await onAdd(data); setAdding(false); notify(t("cust_saved_ok"), true); }} />
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        {customers.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", fontFamily: SANS, fontSize: 13, color: T.t3 }}>{t("cust_none")}</div>}
        {customers.length > 0 && list.length === 0 && <div style={{ textAlign: "center", padding: "32px 20px", fontFamily: SANS, fontSize: 13, color: T.t3 }}>{t("sup_no_results")}</div>}
        {list.map((c, idx) => {
          const s = statsFor(statsMap, c.id);
          return (
            <button key={c.id} onClick={() => onOpenCustomer(c.id)} aria-label={t("cst_open", { name: c.name })}
              style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) auto" : "minmax(200px,1.6fr) 120px 140px 100px 16px", gap: 12, alignItems: "center", width: "100%", padding: "11px 14px", background: "transparent", border: "none", borderTop: idx ? `1px solid ${T.bdr}` : "none", cursor: "pointer", textAlign: "start", color: T.t1 }}
              onMouseEnter={e => { e.currentTarget.style.background = T.surf2; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Avatar name={c.name} color={colorOf(c.id)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                    <ReliabilityBadge value={s.reliability} />
                    <PaymentMethodLabel method={s.usualMethod} />
                  </div>
                </div>
              </div>
              {!isMobile && fig(t("cst_collected_ever"), fmt(s.collectedTotal), T.green)}
              {fig(t("cst_still_owed"), fmt(s.open), s.open ? T.t1 : T.t3,
                s.overdue > 0 && <span className="num" style={{ fontSize: 10.5, color: T.red }}>{t("cst_overdue_part", { amount: fmt(s.overdue) })}</span>)}
              {!isMobile && fig(t("cst_last_payment"), dmy(s.lastPaymentDate), s.lastPaymentDate ? T.t1 : T.t3)}
              {!isMobile && <ChevronRight size={14} color={T.t3} aria-hidden="true" style={{ transform: lang === "he" ? "scaleX(-1)" : "none" }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
