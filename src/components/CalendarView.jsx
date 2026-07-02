import { useMemo } from "react";
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

  const navBtn = { width:36, height:36, borderRadius:10, background:"var(--surf)", border:"1px solid var(--bdr)", color:"var(--t2)", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
        <button onClick={prevMonth} style={navBtn}>‹</button>
        <div>
          <div style={{ fontWeight:700, fontSize:20, color:"var(--t1)", fontFamily:"var(--font-display)", letterSpacing:"-0.5px" }}>
            {new Date(calY, calM).toLocaleString("en-GB", { month:"long", year:"numeric" })}
          </div>
          <div style={{ fontSize:12, color:"var(--t3)", marginTop:2 }}>
            {allInMonth.length} invoices · {currency(monthTotal)}
          </div>
        </div>
        <button onClick={nextMonth} style={navBtn}>›</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, overflowX:"auto", minWidth:0 }}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} style={{ padding:"8px 4px", textAlign:"center", fontSize:11, color:"var(--t3)", fontWeight:700, letterSpacing:".5px", textTransform:"uppercase" }}>{d}</div>
        ))}
        {Array.from({ length:firstDay }).map((_, i) => <div key={`e${i}`} style={{ minHeight:88 }} />)}
        {Array.from({ length:daysInMonth }, (_, i) => i + 1).map(day => {
          const dayInvs = calByDay[day] || [];
          const isToday = today.getDate()===day && today.getMonth()===calM && today.getFullYear()===calY;
          return (
            <div key={day} className={`cal-day${isToday?" today":""}`}>
              <div style={{ fontSize:12, fontWeight:600, color:isToday?"var(--accent)":"var(--t3)", marginBottom:5 }}>{day}</div>
              {dayInvs.slice(0, 3).map(inv => (
                <div key={inv.id} className="chip" style={{ background:color(inv.supplier) }} title={`${inv.supplier} · ${currency(inv.amount)}`}>
                  {inv.supplier.split(" ")[0]} · {currency(inv.amount)}
                </div>
              ))}
              {dayInvs.length > 3 && <div style={{ fontSize:9, color:"var(--t3)", fontWeight:600 }}>+{dayInvs.length-3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
