import { useState } from "react";
import { currency, fmtMonth, fmtMonthShort } from "../utils/dates";

export default function Dashboard({ kpis, monthlyData, allNames, color, maxTotal }) {
  const [hoveredBar, setHoveredBar] = useState(null);
  const [tooltip,    setTooltip]    = useState(null);

  return (
    <div>
      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
        {[
          ["Outstanding","outstanding","#a78bfa","💳"],
          ["Overdue",    "overdue",    "#f87171","🔴"],
          ["Next Month", "nextMonth",  "#fb923c","📅"],
          ["Total Paid", "paid",       "#34d399","✅"],
        ].map(([label, key, col, icon]) => (
          <div key={key} className="kpi-card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <span style={{ fontSize:11, fontWeight:600, color:"#475569", textTransform:"uppercase", letterSpacing:".8px" }}>{label}</span>
              <div style={{ width:32, height:32, borderRadius:8, background:`${col}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>{icon}</div>
            </div>
            <div style={{ fontSize:24, fontWeight:700, color:col, letterSpacing:"-0.5px" }}>{currency(kpis[key])}</div>
            <div style={{ marginTop:12, height:2, background:"#1e2d45", borderRadius:2 }}>
              <div style={{ height:"100%", width: kpis.outstanding ? `${Math.min(100,(kpis[key]/kpis.outstanding)*100)}%` : "0%", background:`linear-gradient(90deg,${col}88,${col})`, borderRadius:2, transition:"width 1s" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card" style={{ padding:28, marginBottom:20 }}>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontWeight:700, fontSize:16, color:"#f1f5f9", letterSpacing:"-0.3px" }}>Monthly Payment Schedule</div>
          <div style={{ fontSize:12, color:"#475569", marginTop:3 }}>Unpaid invoices grouped by due month</div>
        </div>
        {monthlyData.length === 0
          ? <div style={{ textAlign:"center", padding:"60px 0", color:"#334155" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
              <div style={{ fontSize:14 }}>No upcoming payments</div>
            </div>
          : <div style={{ position:"relative" }}>
              <div style={{ display:"flex", gap:12, alignItems:"flex-end", height:240, overflowX:"auto", paddingBottom:8, paddingTop:24, position:"relative" }}>
                {monthlyData.map(({ ym, sups, total }) => {
                  const barH = Math.max(12, (total / maxTotal) * 180);
                  const isHov = hoveredBar === ym;
                  return (
                    <div key={ym} style={{ flex:1, minWidth:90, display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:isHov?"#f1f5f9":"#94a3b8", transition:"color .15s", whiteSpace:"nowrap", marginBottom:2 }}>{currency(total)}</div>
                      <div style={{ width:"100%", height:barH, borderRadius:"6px 6px 0 0", overflow:"hidden", display:"flex", flexDirection:"column-reverse" }}>
                        {Object.entries(sups).map(([sup, amt]) => {
                          const isSegHov = tooltip?.ym === ym && tooltip?.supplier === sup;
                          return (
                            <div key={sup}
                              style={{ width:"100%", height:`${(amt/total)*100}%`, background:color(sup), minHeight:3, transition:"filter .15s, opacity .15s", filter:isSegHov?"brightness(1.3)":"none", opacity:tooltip&&tooltip.ym===ym&&!isSegHov?0.45:1, cursor:"crosshair" }}
                              onMouseEnter={e => { setHoveredBar(ym); setTooltip({ ym, supplier:sup, amount:amt, total, x:e.clientX, y:e.clientY }); }}
                              onMouseMove={e  => setTooltip(t => t ? { ...t, x:e.clientX, y:e.clientY } : t)}
                              onMouseLeave={  () => { setHoveredBar(null); setTooltip(null); }}
                            />
                          );
                        })}
                      </div>
                      <div style={{ fontSize:11, color:isHov?"#94a3b8":"#475569", transition:"color .15s", whiteSpace:"nowrap" }}>{fmtMonthShort(ym)}</div>
                    </div>
                  );
                })}
                {tooltip && (
                  <div style={{ position:"fixed", left:tooltip.x+14, top:tooltip.y-14, transform:tooltip.x>window.innerWidth-240?"translateX(-110%)":"none", background:"#0a1120", border:`1px solid ${color(tooltip.supplier)}44`, borderRadius:12, padding:"12px 16px", minWidth:190, boxShadow:`0 8px 32px rgba(0,0,0,.6),0 0 0 1px ${color(tooltip.supplier)}22`, pointerEvents:"none", zIndex:9999, animation:"fadeIn .1s" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:color(tooltip.supplier), boxShadow:`0 0 6px ${color(tooltip.supplier)}` }} />
                      <span style={{ fontSize:12, fontWeight:600, color:"#e2e8f0" }}>{tooltip.supplier}</span>
                    </div>
                    <div style={{ fontSize:22, fontWeight:800, color:color(tooltip.supplier), letterSpacing:"-0.5px", marginBottom:8 }}>{currency(tooltip.amount)}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#475569" }}>
                      <span>{fmtMonth(tooltip.ym)}</span>
                      <span>{Math.round((tooltip.amount/tooltip.total)*100)}% of month</span>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 20px", marginTop:20, paddingTop:20, borderTop:"1px solid #111d2e" }}>
                {allNames.map(n => (
                  <div key={n} style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color:"#64748b" }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:color(n), boxShadow:`0 0 6px ${color(n)}88` }} />
                    {n}
                  </div>
                ))}
              </div>
            </div>
        }
      </div>

      {/* Monthly breakdown */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16 }}>
        {monthlyData.map(({ ym, sups, total }) => (
          <div key={ym} className="card" style={{ padding:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <span style={{ fontWeight:700, fontSize:14, color:"#e2e8f0" }}>{fmtMonth(ym)}</span>
              <span style={{ fontWeight:800, fontSize:15, color:"#a78bfa" }}>{currency(total)}</span>
            </div>
            {Object.entries(sups).sort((a,b) => b[1]-a[1]).map(([sup, amt]) => (
              <div key={sup} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderTop:"1px solid #0d1626" }}>
                <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:color(sup), flexShrink:0, boxShadow:`0 0 5px ${color(sup)}` }} />
                  <span style={{ fontSize:13, color:"#94a3b8" }}>{sup}</span>
                </div>
                <span style={{ fontSize:13, fontWeight:600, color:"#e2e8f0" }}>{currency(amt)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
