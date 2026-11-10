import { useMemo, useState } from "react";
import { currency, toYM } from "../utils/dates";
import { useLang } from "../contexts/AppContexts";
import { receivableStatus, todayISO, COLLECTION_STATUS as CS } from "../utils/collections";

const MODES = ["invoices", "collections", "both"];

// Month grid of supplier payments (money out, by due date) and, optionally, expected
// collections (money in, by expected date). Incoming items use a dashed outline + "↓" so
// direction never depends on color alone.
export default function CalendarView({ computed, receivables = [], customers = [], calMonth, setCalMonth, color, onOpenCustomer }) {
  const { t, lang } = useLang();
  const locale = lang === "he" ? "he-IL" : "en-GB";
  const [mode, setMode] = useState("both");
  const showOut = mode !== "collections";
  const showIn = mode !== "invoices";
  const today = todayISO();
  const names = useMemo(() => new Map(customers.map(c => [c.id, c.name])), [customers]);

  const { calY, calM, daysInMonth, firstDay, calByDay, inByDay } = useMemo(() => {
    const [y, m] = calMonth.split("-").map(Number);
    const calY = y, calM = m - 1;
    const byDay = {}, inBy = {};
    computed
      .filter(i => i.dueDate && toYM(i.dueDate) === calMonth)
      .forEach(i => { const d = new Date(i.dueDate).getDate(); (byDay[d] = byDay[d] || []).push(i); });
    receivables
      .filter(r => r.expected_date?.startsWith(calMonth))
      .forEach(r => { const d = Number(r.expected_date.slice(8, 10)); (inBy[d] = inBy[d] || []).push(r); });
    return {
      calY, calM,
      daysInMonth: new Date(calY, calM + 1, 0).getDate(),
      firstDay:    new Date(calY, calM, 1).getDay(),
      calByDay:    byDay,
      inByDay:     inBy,
    };
  }, [computed, receivables, calMonth]);

  const allInMonth  = Object.values(calByDay).flat();
  const monthTotal  = allInMonth.reduce((s, i) => s + Number(i.amount), 0);
  const incoming    = Object.values(inByDay).flat();
  const inTotal     = incoming.reduce((s, r) => s + Number(r.amount), 0);
  const prevMonth   = () => setCalMonth(toYM(new Date(calY, calM - 1)));
  const nextMonth   = () => setCalMonth(toYM(new Date(calY, calM + 1)));
  const now         = new Date();

  const navBtn = { width:36, height:36, borderRadius:10, background:"var(--surf)", border:"1px solid var(--bdr)", color:"var(--t2)", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" };
  const inChip = st => ({
    display: "block", width: "100%", textAlign: "start", cursor: onOpenCustomer ? "pointer" : "default",
    fontSize: 10, fontWeight: 600, borderRadius: 5, padding: "2px 5px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    border: `1px dashed ${st === CS.OVERDUE ? "var(--red-bdr)" : "var(--green-bdr)"}`,
    background: st === CS.OVERDUE ? "var(--red-tint)" : "var(--green-tint)",
    color: st === CS.OVERDUE ? "var(--red)" : "var(--green)",
    opacity: st === CS.COLLECTED ? 0.6 : 1,
  });

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16, flexWrap:"wrap" }}>
        <button onClick={prevMonth} style={navBtn} aria-label={t("inv_month_prev")}>‹</button>
        <div>
          <div style={{ fontWeight:700, fontSize:20, color:"var(--t1)", fontFamily:"var(--font-display)", letterSpacing:"-0.5px" }}>
            {new Date(calY, calM).toLocaleString(locale, { month:"long", year:"numeric" })}
          </div>
          <div style={{ fontSize:12, color:"var(--t3)", marginTop:2 }}>
            {showOut && <>↑ {allInMonth.length} {t("cal_out_label")} · {currency(monthTotal)}</>}
            {showOut && showIn && "  ·  "}
            {showIn && <>↓ {incoming.length} {t("cal_in_label")} · {currency(inTotal)}</>}
          </div>
        </div>
        <button onClick={nextMonth} style={navBtn} aria-label={t("inv_month_next")}>›</button>
        <div role="group" aria-label={t("cal_show")} style={{ marginInlineStart:"auto", display:"flex", background:"var(--surf)", border:"1px solid var(--bdr)", borderRadius:8, padding:2, gap:2 }}>
          {MODES.map(m => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}
              style={{ padding:"5px 12px", borderRadius:6, border:"none", cursor:"pointer", fontSize:12, fontWeight: mode === m ? 700 : 400, background: mode === m ? "var(--accent-tint)" : "transparent", color: mode === m ? "var(--accent)" : "var(--t2)" }}>
              {t(`cal_mode_${m}`)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, overflowX:"auto", minWidth:0 }}>
        {Array.from({ length: 7 }, (_, i) => new Date(2023, 0, i + 1).toLocaleDateString(locale, { weekday: "short" })).map(d => (
          <div key={d} style={{ padding:"8px 4px", textAlign:"center", fontSize:11, color:"var(--t3)", fontWeight:700, letterSpacing:".5px", textTransform:"uppercase" }}>{d}</div>
        ))}
        {Array.from({ length:firstDay }).map((_, i) => <div key={`e${i}`} style={{ minHeight:88 }} />)}
        {Array.from({ length:daysInMonth }, (_, i) => i + 1).map(day => {
          const dayInvs = showOut ? (calByDay[day] || []) : [];
          const dayIns = showIn ? (inByDay[day] || []) : [];
          const items = [...dayIns.map(r => ({ kind: "in", r })), ...dayInvs.map(inv => ({ kind: "out", inv }))];
          const isToday = now.getDate()===day && now.getMonth()===calM && now.getFullYear()===calY;
          return (
            <div key={day} className={`cal-day${isToday?" today":""}`}>
              <div style={{ fontSize:12, fontWeight:600, color:isToday?"var(--accent)":"var(--t3)", marginBottom:5 }}>{day}</div>
              {items.slice(0, 3).map(it => it.kind === "in" ? (
                <button key={`in-${it.r.id}`} onClick={() => onOpenCustomer?.(it.r.customer_id, calMonth)} style={inChip(receivableStatus(it.r, today))}
                  title={`↓ ${names.get(it.r.customer_id) || ""} · ${currency(it.r.amount)}`}>
                  ↓ {(names.get(it.r.customer_id) || "").split(" ")[0]} · {currency(it.r.amount)}
                </button>
              ) : (
                <div key={it.inv.id} className="chip" style={{ background:color(it.inv.supplier) }} title={`${it.inv.supplier} · ${currency(it.inv.amount)}`}>
                  {it.inv.supplier.split(" ")[0]} · {currency(it.inv.amount)}
                </div>
              ))}
              {items.length > 3 && <div style={{ fontSize:9, color:"var(--t3)", fontWeight:600 }}>{t("cal_more", { n: items.length - 3 })}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
