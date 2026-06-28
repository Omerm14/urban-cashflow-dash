import { useState, useEffect } from "react";
import { currency, fmtMonth, fmtMonthShort } from "../utils/dates";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const SANS = "'IBM Plex Sans', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', monospace";

const SUPPLIER_COLORS = {
  "Acme Corp":  "#6366F1",
  "BuildRight": "#10B981",
  "TechParts":  "#F59E0B",
  "MediaPro":   "#EF4444",
};
const DEFAULT_COLORS = ["#6366F1","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#F97316"];
function getColor(name) {
  return SUPPLIER_COLORS[name] || DEFAULT_COLORS[
    Math.abs([...name].reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)) % DEFAULT_COLORS.length
  ];
}

function CountUp({ to, duration = 1200 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const steps = 55, ms = duration / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      const e = 1 - Math.pow(1 - i / steps, 3);
      setV(to * e);
      if (i >= steps) { setV(to); clearInterval(id); }
    }, ms);
    return () => clearInterval(id);
  }, [to, duration]);
  return <>{currency(v)}</>;
}

function Pill({ color, bg, border, children }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3, background:bg, color, border:`1px solid ${border}`, borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:600, fontFamily:SANS }}>
      {children}
    </span>
  );
}

function KPICard({ label, value, valueColor, iconBg, iconColor, iconPath, pill, delay }) {
  return (
    <div style={{
      background:"var(--surf)", border:"1px solid var(--bdr)", borderRadius:12,
      padding:"18px 20px", opacity:0,
      animation:"kpiIn 0.38s ease forwards", animationDelay:`${delay}s`,
    }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
        <span style={{ fontFamily:SANS, fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</span>
        <div style={{ width:34, height:34, borderRadius:9, background:iconBg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            {iconPath}
          </svg>
        </div>
      </div>
      <div style={{ fontFamily:MONO, fontWeight:600, fontSize:28, color:valueColor || "var(--t1)", letterSpacing:"-0.03em", fontVariantNumeric:"tabular-nums", marginBottom:10 }}>
        <CountUp to={value} />
      </div>
      {pill}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"var(--surf)", border:"1px solid var(--bdr2)", borderRadius:8, padding:"10px 14px", boxShadow:"0 8px 24px rgba(0,0,0,.4)", fontFamily:SANS, fontSize:12, minWidth:140 }}>
      <div style={{ fontWeight:700, color:"var(--t1)", marginBottom:6 }}>{label}</div>
      {[...payload].reverse().map(p => (
        <div key={p.dataKey} style={{ display:"flex", justifyContent:"space-between", gap:20, color:"var(--t2)", marginBottom:2 }}>
          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:p.fill, display:"inline-block" }} />
            {p.dataKey}
          </span>
          <span style={{ fontFamily:MONO, fontWeight:600, color:"var(--t1)" }}>{currency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ kpis, monthlyData, allNames, color, maxTotal, onPayMonth, onViewInvoices }) {
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setWinW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const isMobile = winW <= 640;
  const isCompact = winW <= 900;

  const overdueCount = kpis.overdueCount ?? 0;
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" });
  const monthPill = today.toLocaleDateString("en-GB", { month:"short", year:"numeric" });

  const CARDS = [
    {
      label:"Outstanding", value:kpis.outstanding, delay:0,
      iconBg:"rgba(99,102,241,.13)", iconColor:"#818CF8",
      iconPath:<><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
      pill:<Pill color="#22C55E" bg="rgba(34,197,94,.12)" border="rgba(34,197,94,.25)">↑ Active</Pill>,
    },
    {
      label:"Overdue", value:kpis.overdue, valueColor:"#F87171", delay:0.06,
      iconBg:"rgba(239,68,68,.12)", iconColor:"#F87171",
      iconPath:<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
      pill: overdueCount > 0
        ? <Pill color="#EF4444" bg="rgba(239,68,68,.12)" border="rgba(239,68,68,.25)">{overdueCount} invoices</Pill>
        : <Pill color="#22C55E" bg="rgba(34,197,94,.12)" border="rgba(34,197,94,.25)">None</Pill>,
    },
    {
      label:"Next Month", value:kpis.nextMonth, delay:0.12,
      iconBg:"rgba(245,158,11,.12)", iconColor:"#F59E0B",
      iconPath:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
      pill:<Pill color="#F59E0B" bg="rgba(245,158,11,.12)" border="rgba(245,158,11,.25)">Upcoming</Pill>,
    },
    {
      label:"Total Paid", value:kpis.paid, delay:0.18,
      iconBg:"rgba(34,197,94,.12)", iconColor:"#22C55E",
      iconPath:<><polyline points="20 6 9 17 4 12"/></>,
      pill:<Pill color="#22C55E" bg="rgba(34,197,94,.12)" border="rgba(34,197,94,.25)">↑ Paid</Pill>,
    },
  ];

  const ctaMonth = monthlyData[0] || null;

  // Build recharts data: array of { month, Supplier1: amt, Supplier2: amt, ... }
  const chartData = monthlyData.map(({ ym, sups }) => ({
    month: fmtMonthShort(ym),
    ym,
    ...sups,
  }));

  const colorFn = color || getColor;

  return (
    <div style={{ animation:"slideUp .4s cubic-bezier(.16,1,.3,1)" }}>
      {/* Page header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontFamily:SANS, fontWeight:700, fontSize:22, color:"var(--t1)", letterSpacing:"-0.03em", marginBottom:3 }}>Dashboard</div>
          <div style={{ fontFamily:SANS, fontSize:13, color:"var(--t2)" }}>
            {dateLabel} · Here's where you stand today
          </div>
        </div>
        <span style={{ fontFamily:MONO, fontSize:12, fontWeight:600, color:"var(--t3)", background:"var(--surf2)", border:"1px solid var(--bdr)", borderRadius:6, padding:"4px 10px", flexShrink:0 }}>
          {monthPill}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid" style={{ marginBottom:16 }}>
        {CARDS.map(c => <KPICard key={c.label} {...c} />)}
      </div>

      {/* Pay-month CTA banner */}
      {ctaMonth && onPayMonth && (
        <div style={{
          background:"var(--surf)", border:"1px solid rgba(99,102,241,.30)", borderRadius:12,
          padding: isMobile ? "14px 16px" : "20px 24px",
          display:"flex", alignItems: isMobile ? "flex-start" : "center",
          flexDirection: isMobile ? "column" : "row", justifyContent:"space-between",
          gap:12, marginBottom:16,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ width:44, height:44, borderRadius:11, background:"rgba(99,102,241,.14)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily:SANS, fontWeight:600, fontSize:15, color:"var(--t1)", letterSpacing:"-0.02em", marginBottom:4 }}>
                Pay {fmtMonth(ctaMonth.ym)} — ready to go
              </div>
              <div style={{ fontFamily:SANS, fontSize:13, color:"var(--t2)" }}>
                {Object.keys(ctaMonth.sups).length} suppliers ·{" "}
                <span style={{ color:"#A5B4FC", fontWeight:500, fontFamily:MONO }}>{currency(ctaMonth.total)}</span> total due
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexShrink:0, alignSelf: isMobile ? "stretch" : "auto" }}>
            {onViewInvoices && (
              <button
                onClick={() => onViewInvoices(ctaMonth.ym)}
                style={{ background:"transparent", border:"1px solid var(--bdr2)", borderRadius:8, padding:"8px 16px", fontFamily:SANS, fontSize:13, fontWeight:600, color:"var(--t2)", cursor:"pointer", flex: isMobile ? 1 : "none", justifyContent:"center" }}
              >
                View invoices
              </button>
            )}
            <button
              onClick={() => onPayMonth(ctaMonth.ym)}
              style={{ background:"#6366F1", border:"none", borderRadius:8, padding:"8px 20px", fontFamily:SANS, fontSize:13, fontWeight:600, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:6, boxShadow:"0 4px 18px rgba(99,102,241,.35)", flex: isMobile ? 1 : "none", justifyContent:"center" }}
            >
              Pay All &rsaquo;
            </button>
          </div>
        </div>
      )}

      {/* Chart + breakdown */}
      <div style={{ display:"grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 310px", gap:14 }}>
        {/* Recharts Card */}
        <div style={{ background:"var(--surf)", border:"1px solid var(--bdr)", borderRadius:12, padding:"22px 24px", minWidth:0 }}>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontFamily:SANS, fontWeight:600, fontSize:14, color:"var(--t1)", letterSpacing:"-0.02em" }}>Payment Schedule</div>
            <div style={{ fontFamily:SANS, fontSize:12, color:"var(--t2)", marginTop:3 }}>Upcoming payments by month</div>
          </div>

          {chartData.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"var(--t3)" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
              <div style={{ fontFamily:SANS, fontSize:14 }}>No upcoming payments</div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barSize={28} margin={{ top:14, right:4, left:0, bottom:0 }}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,.05)" />
                  <XAxis
                    dataKey="month"
                    axisLine={false} tickLine={false}
                    tick={{ fontFamily:SANS, fontSize:11, fill:"#4A6278" }}
                  />
                  <YAxis
                    axisLine={false} tickLine={false}
                    tick={{ fontFamily:MONO, fontSize:10, fill:"#4A6278" }}
                    tickFormatter={v => v === 0 ? "" : `₪${Math.round(v/1000)}k`}
                    width={44}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill:"rgba(255,255,255,.03)" }} />
                  {allNames.map(name => (
                    <Bar key={name} dataKey={name} stackId="a" fill={colorFn(name)} radius={allNames.indexOf(name) === allNames.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display:"flex", flexWrap:"wrap", gap:"7px 14px", marginTop:16, paddingTop:16, borderTop:"1px solid rgba(255,255,255,.06)" }}>
                {allNames.map(n => (
                  <div key={n} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--t2)", fontFamily:SANS }}>
                    <div style={{ width:7, height:7, borderRadius:"50%", background:colorFn(n), flexShrink:0 }} />
                    <span style={{ maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Breakdown cards */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr", gap:10 }}>
          {monthlyData.map(({ ym, sups, total }) => (
            <div key={ym}
              style={{ background:"var(--surf)", border:"1px solid var(--bdr)", borderRadius:12, padding:"14px 16px", cursor:"pointer", transition:"border-color 0.18s" }}
              onClick={() => onPayMonth && onPayMonth(ym)}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.12)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
            >
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <span style={{ fontFamily:SANS, fontWeight:600, fontSize:13, color:"var(--t1)", letterSpacing:"-0.02em" }}>{fmtMonth(ym)}</span>
                <span style={{ fontFamily:MONO, fontWeight:600, fontSize:13, color:"var(--t1)", fontVariantNumeric:"tabular-nums" }}>{currency(total)}</span>
              </div>
              {!isMobile && Object.entries(sups).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sup, amt]) => (
                <div key={sup} style={{ display:"flex", alignItems:"center", gap:8, padding:"2px 0" }}>
                  <div style={{ width:18, height:18, borderRadius:"50%", background:colorFn(sup), display:"flex", alignItems:"center", justifyContent:"center", fontFamily:SANS, fontSize:8, fontWeight:700, color:"#fff", flexShrink:0 }}>
                    {sup.charAt(0)}
                  </div>
                  <span style={{ flex:1, fontFamily:SANS, fontSize:11, color:"var(--t2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sup}</span>
                  <span style={{ fontFamily:MONO, fontSize:12, fontWeight:600, color:"var(--t1)", fontVariantNumeric:"tabular-nums" }}>{currency(amt)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
