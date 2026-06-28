import { useState, useEffect } from "react";
import { currency, fmtMonth, fmtMonthShort } from "../utils/dates";

const SANS = "'IBM Plex Sans', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', monospace";

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

function GreenPill({ children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(34,197,94,.12)", color: "#22C55E", border: "1px solid rgba(34,197,94,.25)", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, fontFamily: SANS }}>
      {children}
    </span>
  );
}

function RedPill({ children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(239,68,68,.12)", color: "#EF4444", border: "1px solid rgba(239,68,68,.25)", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, fontFamily: SANS }}>
      {children}
    </span>
  );
}

function AmberPill({ children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(245,158,11,.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,.25)", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, fontFamily: SANS }}>
      {children}
    </span>
  );
}

function KPICard({ label, value, valueColor, iconBg, iconColor, iconPath, pill, context, delay }) {
  return (
    <div style={{
      background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 12,
      padding: "18px 20px", opacity: 0,
      animation: "kpiIn 0.38s ease forwards",
      animationDelay: `${delay}s`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            {iconPath}
          </svg>
        </div>
        {pill}
      </div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 22, color: valueColor || "var(--t1)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", marginBottom: 4 }}>
        <CountUp to={value} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
        <span style={{ fontFamily: SANS, fontSize: 12, color: "var(--t3)", fontWeight: 500 }}>{label}</span>
        {context && <span style={{ fontFamily: SANS, fontSize: 11, color: "var(--t3)" }}>{context}</span>}
      </div>
    </div>
  );
}

export default function Dashboard({ kpis, monthlyData, allNames, color, maxTotal, onPayMonth }) {
  const [tooltip, setTooltip] = useState(null);
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = winW <= 640;
  const isTablet = winW <= 900;
  const isCompact = isMobile || isTablet;

  const overdueCount = kpis.overdueCount ?? 0;

  const CARDS = [
    {
      label: "Outstanding", value: kpis.outstanding, delay: 0,
      iconBg: "rgba(99,102,241,.13)", iconColor: "#818CF8",
      iconPath: <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
      pill: <GreenPill>↑ Active</GreenPill>, context: "unpaid total",
    },
    {
      label: "Overdue", value: kpis.overdue, valueColor: "#F87171", delay: 0.06,
      iconBg: "rgba(239,68,68,.12)", iconColor: "#F87171",
      iconPath: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
      pill: overdueCount > 0 ? <RedPill>{overdueCount} invoices</RedPill> : <GreenPill>None</GreenPill>,
      context: "need action",
    },
    {
      label: "Next Month", value: kpis.nextMonth, delay: 0.12,
      iconBg: "rgba(245,158,11,.12)", iconColor: "#F59E0B",
      iconPath: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
      pill: <AmberPill>Upcoming</AmberPill>, context: "due next month",
    },
    {
      label: "Total Paid", value: kpis.paid, delay: 0.18,
      iconBg: "rgba(34,197,94,.12)", iconColor: "#22C55E",
      iconPath: <><polyline points="20 6 9 17 4 12"/></>,
      pill: <GreenPill>↑ Paid</GreenPill>, context: "this period",
    },
  ];

  const ctaMonth = monthlyData[0] || null;

  return (
    <div style={{ animation: "slideUp .4s cubic-bezier(.16,1,.3,1)" }}>
      {/* KPI Cards */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        {CARDS.map(c => <KPICard key={c.label} {...c} />)}
      </div>

      {/* Pay-month CTA banner */}
      {ctaMonth && onPayMonth && (
        <div style={{
          background: "var(--surf)", border: "1px solid rgba(99,102,241,.30)", borderRadius: 12,
          padding: isMobile ? "14px 16px" : "20px 24px",
          display: "flex", alignItems: isMobile ? "flex-start" : "center",
          flexDirection: isMobile ? "column" : "row", justifyContent: "space-between",
          gap: 12, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: "rgba(99,102,241,.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 15, color: "var(--t1)", letterSpacing: "-0.02em", marginBottom: 4 }}>
                Pay {fmtMonth(ctaMonth.ym)} — ready to go
              </div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: "var(--t2)" }}>
                {Object.keys(ctaMonth.sups).length} suppliers ·{" "}
                <span style={{ color: "#A5B4FC", fontWeight: 500, fontFamily: MONO }}>{currency(ctaMonth.total)}</span> total due
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignSelf: isMobile ? "stretch" : "auto" }}>
            <button
              onClick={() => onPayMonth(ctaMonth.ym)}
              style={{ background: "#6366F1", border: "none", borderRadius: 8, padding: "8px 20px", fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 18px rgba(99,102,241,.35)", letterSpacing: "-0.01em", flex: isMobile ? 1 : "none", justifyContent: "center" }}
            >
              Pay All Now →
            </button>
          </div>
        </div>
      )}

      {/* Chart + breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 310px", gap: 14 }}>
        {/* Chart Card */}
        <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 12, padding: "22px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, color: "var(--t1)", letterSpacing: "-0.02em" }}>Payment Schedule</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: "var(--t2)", marginTop: 3 }}>Upcoming payments by month</div>
            </div>
          </div>

          {monthlyData.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--t3)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div style={{ fontFamily: SANS, fontSize: 14 }}>No upcoming payments</div>
            </div>
          ) : (
            <div style={{ position: "relative", minWidth: 0, overflow: "hidden" }}>
              <ChartBars data={monthlyData} color={color} maxTotal={maxTotal} tooltip={tooltip} setTooltip={setTooltip} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px 14px", marginTop: 18, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.06)" }}>
                {allNames.map(n => (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--t2)", fontFamily: SANS }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: color(n), flexShrink: 0 }} />
                    <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Breakdown cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr", gap: 10 }}>
          {monthlyData.map(({ ym, sups, total }) => (
            <div key={ym}
              style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "border-color 0.18s" }}
              onClick={() => onPayMonth && onPayMonth(ym)}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(255,255,255,.12)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bdr)"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "var(--t1)", letterSpacing: "-0.02em" }}>{fmtMonth(ym)}</span>
                <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13, color: "var(--t1)", fontVariantNumeric: "tabular-nums" }}>{currency(total)}</span>
              </div>
              {!isMobile && Object.entries(sups).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sup, amt]) => (
                <div key={sup} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: color(sup), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 8, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {sup.charAt(0)}
                  </div>
                  <span style={{ flex: 1, fontFamily: SANS, fontSize: 11, color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sup}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: "var(--t1)", fontVariantNumeric: "tabular-nums" }}>{currency(amt)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div className="chart-tip" style={{ left: tooltip.x + 14, top: tooltip.y - 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color(tooltip.supplier), flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: color(tooltip.supplier), maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tooltip.supplier}</span>
          </div>
          <div style={{ color: "var(--t1)", fontWeight: 800, fontSize: 14 }}>{currency(tooltip.amount)}</div>
          <div style={{ color: "var(--t3)", marginTop: 2, fontSize: 11 }}>{fmtMonth(tooltip.ym)} · {Math.round((tooltip.amount / tooltip.total) * 100)}%</div>
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
    <div style={{ position: "relative", overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${totalW} ${H + 50}`} style={{ display: "block", minWidth: 280, overflow: "visible" }}>
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
              <text x={bx + W / 2} y={by - 8} textAnchor="middle" fill="#CBD6E6" fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono,monospace">{currency(total)}</text>
              <g clipPath={`url(#cp${mi})`}>
                {segs.map(({ sup, amt, y, h }, si) => (
                  <rect key={si} x={bx} y={y} width={W} height={h + .5} fill={color(sup)}
                    style={{ cursor: "crosshair" }}
                    onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, supplier: sup, amount: amt, total, ym })}
                    onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </g>
              <text x={bx + W / 2} y={H + 26} textAnchor="middle" fill="#4A6278" fontSize="12" fontFamily="IBM Plex Sans,sans-serif" fontWeight="500">{fmtMonthShort(ym)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
