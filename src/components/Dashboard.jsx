import { useState, useEffect } from "react";
import { currency, fmtMonth, fmtMonthShort } from "../utils/dates";

function CountUp({ to, duration = 1200 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const steps = 55;
    const ms = duration / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      const p = i / steps;
      const e = 1 - Math.pow(1 - p, 3);
      setV(to * e);
      if (i >= steps) { setV(to); clearInterval(id); }
    }, ms);
    return () => clearInterval(id);
  }, [to, duration]);
  return <>{currency(v)}</>;
}

export default function Dashboard({ kpis, monthlyData, allNames, color, maxTotal, onPayMonth, missingSuppliers, anomalyMap, onOpenMissing, onOpenAnomalies }) {
  const [tooltip, setTooltip] = useState(null);

  const stats = [
    { label:"Outstanding", key:"outstanding", cls:"stat-outstanding", ico:"💳" },
    { label:"Overdue",     key:"overdue",     cls:"stat-overdue",     ico:"⚠️", pulse:true },
    { label:"Next Month",  key:"nextMonth",   cls:"stat-nextmonth",   ico:"📅" },
    { label:"Total Paid",  key:"paid",        cls:"stat-paid",        ico:"✅" },
  ];

  const ctaMonth = monthlyData[0] || null;
  const anomalousCount = anomalyMap ? anomalyMap.size : 0;

  return (
    <div style={{ animation:"slideUp .4s cubic-bezier(.16,1,.3,1)" }}>

      {/* Alert cards row */}
      {(missingSuppliers?.length > 0 || anomalousCount > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: missingSuppliers?.length > 0 && anomalousCount > 0 ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 20 }}>

          {missingSuppliers?.length > 0 && (
            <button
              onClick={onOpenMissing}
              style={{ padding: '20px 22px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(249,115,22,.13) 0%, rgba(249,115,22,.05) 100%)', border: '1px solid rgba(249,115,22,.35)', display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .18s', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(249,115,22,.2) 0%, rgba(249,115,22,.09) 100%)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,.55)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(249,115,22,.13) 0%, rgba(249,115,22,.05) 100%)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,.35)'; }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontWeight: 900, fontSize: 26, color: '#fb923c', lineHeight: 1 }}>{missingSuppliers.length}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#fb923c', marginBottom: 3, direction: 'rtl' }}>חשבוניות חסרות</div>
                <div style={{ fontSize: 12, color: '#fdba74', direction: 'rtl' }}>
                  ספקים קבועים לא שלחו החודש
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span style={{ fontSize: 10, color: 'rgba(251,146,60,.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>לפרטים ←</span>
              </div>
            </button>
          )}

          {anomalousCount > 0 && (
            <button
              onClick={onOpenAnomalies}
              style={{ padding: '20px 22px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(234,179,8,.11) 0%, rgba(234,179,8,.04) 100%)', border: '1px solid rgba(234,179,8,.32)', display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .18s', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(234,179,8,.18) 0%, rgba(234,179,8,.08) 100%)'; e.currentTarget.style.borderColor = 'rgba(234,179,8,.52)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(234,179,8,.11) 0%, rgba(234,179,8,.04) 100%)'; e.currentTarget.style.borderColor = 'rgba(234,179,8,.32)'; }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(234,179,8,.15)', border: '1px solid rgba(234,179,8,.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontWeight: 900, fontSize: 26, color: '#fbbf24', lineHeight: 1 }}>{anomalousCount}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#fbbf24', marginBottom: 3, direction: 'rtl' }}>חשבוניות חריגות</div>
                <div style={{ fontSize: 12, color: '#fde68a', direction: 'rtl' }}>
                  סכום חריג מהממוצע החודשי
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>📊</span>
                <span style={{ fontSize: 10, color: 'rgba(251,191,36,.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>לפרטים ←</span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="stat-grid" style={{ marginBottom:20 }}>
        {stats.map(s => (
          <div key={s.key}
            className={`card stat-card ${s.cls}`}
            style={s.pulse ? { animationName:"redPulse", animationDuration:"2.2s", animationIterationCount:"infinite" } : {}}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <span className="stat-lbl">{s.label}</span>
              <span style={{ fontSize:18, opacity:.45 }}>{s.ico}</span>
            </div>
            <div className="stat-val"><CountUp to={kpis[s.key]}/></div>
          </div>
        ))}
      </div>

      {/* Pay-month CTA banner */}
      {ctaMonth && onPayMonth && (
        <div className="pay-banner" onClick={() => onPayMonth(ctaMonth.ym)}>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ width:46, height:46, borderRadius:12, background:"var(--grad)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>⚡</div>
            <div>
              <div style={{ fontWeight:800, fontSize:16, marginBottom:3 }}>
                Pay {fmtMonth(ctaMonth.ym)} — ready to go
              </div>
              <div style={{ color:"var(--t2)", fontSize:13 }}>
                {Object.keys(ctaMonth.sups).length} suppliers · <strong style={{ color:"var(--t1)" }}>{currency(ctaMonth.total)}</strong> total
              </div>
            </div>
          </div>
          <button className="btn btn-primary" style={{ padding:"11px 22px", fontSize:14, flexShrink:0 }}
            onClick={e => { e.stopPropagation(); onPayMonth(ctaMonth.ym); }}>
            Pay All Now →
          </button>
        </div>
      )}

      {/* Chart Card */}
      <div className="card" style={{ padding:28, marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:22 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:18, marginBottom:3 }}>Monthly Payment Schedule</div>
            <div style={{ fontSize:13, color:"var(--t2)" }}>Unpaid invoices grouped by due month</div>
          </div>
        </div>

        {monthlyData.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--t3)" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
            <div style={{ fontSize:14 }}>No upcoming payments</div>
          </div>
        ) : (
          <div style={{ position:"relative", minWidth:0, overflow:"hidden" }}>
            <ChartBars data={monthlyData} color={color} maxTotal={maxTotal} tooltip={tooltip} setTooltip={setTooltip}/>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"7px 14px", marginTop:18, paddingTop:18, borderTop:"1px solid rgba(255,255,255,.05)" }}>
              {allNames.map(n => (
                <div key={n} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--t2)" }}>
                  <div style={{ width:7, height:7, borderRadius:"50%", background:color(n), flexShrink:0 }}/>
                  <span style={{ maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Monthly breakdown cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
        {monthlyData.map(({ ym, sups, total }) => (
          <div key={ym} className="card" style={{ cursor:"pointer" }} onClick={() => onPayMonth && onPayMonth(ym)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontWeight:700, fontSize:14 }}>{fmtMonth(ym)}</span>
              <span style={{ fontWeight:800, fontSize:14, color:"var(--t2)" }}>{currency(total)}</span>
            </div>
            {Object.entries(sups).sort((a,b) => b[1]-a[1]).map(([sup, amt]) => (
              <div key={sup} style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 0", borderTop:"1px solid rgba(255,255,255,.04)", fontSize:12 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:color(sup), flexShrink:0 }}/>
                <span style={{ flex:1, color:"var(--t2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sup}</span>
                <span style={{ fontWeight:600, whiteSpace:"nowrap" }}>{currency(amt)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div className="chart-tip" style={{ left:tooltip.x+14, top:tooltip.y-64 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:color(tooltip.supplier), flexShrink:0 }}/>
            <span style={{ fontWeight:700, color:color(tooltip.supplier), maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tooltip.supplier}</span>
          </div>
          <div style={{ color:"var(--t1)", fontWeight:800, fontSize:14 }}>{currency(tooltip.amount)}</div>
          <div style={{ color:"var(--t3)", marginTop:2, fontSize:11 }}>{fmtMonth(tooltip.ym)} · {Math.round((tooltip.amount/tooltip.total)*100)}%</div>
        </div>
      )}
    </div>
  );
}

function ChartBars({ data, color, maxTotal, tooltip, setTooltip }) {
  if (!data.length) return null;
  const H = 200, W = 80, GAP = 90, PX = 30;
  const maxV = maxTotal * 1.18;
  const totalW = data.length * (W + GAP) + PX * 2 - GAP;

  return (
    <div style={{ position:"relative", overflowX:"auto" }}>
      <svg width="100%" viewBox={`0 0 ${totalW} ${H + 50}`} style={{ display:"block", minWidth:280, overflow:"visible" }}>
        {data.map(({ ym, sups, total }, mi) => {
          const bx = PX + mi * (W + GAP);
          const bh = (total / maxV) * H;
          const by = H - bh;
          let yoff = H;
          const segs = Object.entries(sups).map(([sup, amt]) => {
            const h = Math.max(1, (amt / maxV) * H);
            yoff -= h;
            return { sup, amt, y: yoff, h };
          });
          return (
            <g key={ym}>
              <defs><clipPath id={`cp${mi}`}><rect x={bx} y={by} width={W} height={bh} rx="6"/></clipPath></defs>
              <text x={bx+W/2} y={by-8} textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans,sans-serif">{currency(total)}</text>
              <g clipPath={`url(#cp${mi})`}>
                {segs.map(({ sup, amt, y, h }, si) => (
                  <rect key={si} x={bx} y={y} width={W} height={h+.5} fill={color(sup)}
                    style={{ cursor:"crosshair" }}
                    onMouseEnter={e => setTooltip({ x:e.clientX, y:e.clientY, supplier:sup, amount:amt, total, ym })}
                    onMouseMove={e  => setTooltip(t => t ? { ...t, x:e.clientX, y:e.clientY } : t)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </g>
              <text x={bx+W/2} y={H+26} textAnchor="middle" fill="#64748b" fontSize="12" fontFamily="Plus Jakarta Sans,sans-serif" fontWeight="500">{fmtMonthShort(ym)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
