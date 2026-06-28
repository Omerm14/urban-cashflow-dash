import { useMemo, useState, useEffect } from "react";
import { currency, toYM, fmtMonth } from "../utils/dates";

export default function CalendarView({ computed, calMonth, setCalMonth, color }) {
  const { calY, calM, daysInMonth, firstDay, calByDay } = useMemo(() => {
    const [y, m] = calMonth.split("-").map(Number);
    const calY = y, calM = m - 1;
    const byDay = {};
    computed
      .filter(i => i.dueDate && toYM(i.dueDate) === calMonth)
      .forEach(i => { const d = new Date(i.dueDate).getDate(); (byDay[d] = byDay[d] || []).push(i); });
    return {
      calY, calM,
      daysInMonth: new Date(calY, calM + 1, 0).getDate(),
      firstDay:    new Date(calY, calM, 1).getDay(),
      calByDay:    byDay,
    };
  }, [computed, calMonth]);

  const allInMonth  = Object.values(calByDay).flat();
  const monthTotal  = allInMonth.reduce((s, i) => s + Number(i.amount), 0);
  const prevMonth   = () => setCalMonth(toYM(new Date(calY, calM - 1)));
  const nextMonth   = () => setCalMonth(toYM(new Date(calY, calM + 1)));
  const today       = new Date();

  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isMobile = winW <= 640;

  const navBtn = { width:36, height:36, borderRadius:8, background:"var(--surf)", border:"1px solid var(--bdr)", color:"var(--t2)", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
        <button onClick={prevMonth} style={navBtn}>‹</button>
        <div>
          <div style={{ fontWeight:600, fontSize:18, color:"var(--t1)", letterSpacing:"-0.03em" }}>
            {new Date(calY, calM).toLocaleString("en-GB", { month:"long", year:"numeric" })}
          </div>
          <div style={{ fontSize:12, color:"var(--t2)", marginTop:2 }}>
            {allInMonth.length} invoices · {currency(monthTotal)}
          </div>
        </div>
        <button onClick={nextMonth} style={navBtn}>›</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap: isMobile ? 2 : 4, overflowX:"auto", minWidth:0 }}>
        {(isMobile ? ["S","M","T","W","T","F","S"] : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]).map((d, i) => (
          <div key={i} style={{ padding: isMobile ? "5px 2px" : "8px 4px", textAlign:"center", fontSize: isMobile ? 9 : 11, color:"var(--t2)", fontWeight:600, letterSpacing:".5px", textTransform:"uppercase" }}>{d}</div>
        ))}
        {Array.from({ length:firstDay }).map((_, i) => <div key={`e${i}`} style={{ minHeight: isMobile ? 48 : 88 }} />)}
        {Array.from({ length:daysInMonth }, (_, i) => i + 1).map(day => {
          const dayInvs = calByDay[day] || [];
          const isToday = today.getDate()===day && today.getMonth()===calM && today.getFullYear()===calY;
          return (
            <div key={day} className={`cal-day${isToday?" today":""}`} style={isMobile ? { minHeight:48, padding:"4px 3px" } : {}}>
              <div style={{ fontSize: isMobile ? 10 : 12, fontWeight:600, color:isToday?"#818CF8":"var(--t2)", marginBottom: isMobile ? 2 : 5 }}>{day}</div>
              {dayInvs.slice(0, isMobile ? 1 : 3).map(inv => (
                <div key={inv.id} className="chip" style={{ background:color(inv.supplier), fontSize: isMobile ? 8 : undefined, padding: isMobile ? "1px 3px" : undefined }} title={`${inv.supplier} · ${currency(inv.amount)}`}>
                  {isMobile ? inv.supplier.charAt(0) : `${inv.supplier.split(" ")[0]} · ${currency(inv.amount)}`}
                </div>
              ))}
              {dayInvs.length > (isMobile ? 1 : 3) && <div style={{ fontSize: isMobile ? 8 : 9, color:"var(--t3)", fontWeight:600 }}>+{dayInvs.length-(isMobile ? 1 : 3)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
