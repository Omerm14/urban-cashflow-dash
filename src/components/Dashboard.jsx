import { useState, useEffect } from "react";
import { currency, fmtMonth, fmtMonthShort } from "../utils/dates";

function CountUp({ to, duration = 1100 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const steps = 50;
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

const KpiIcon = ({ type }) => {
  const icons = {
    outstanding: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>,
    overdue:     <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    nextMonth:   <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    paid:        <><polyline points="20 6 9 17 4 12"/></>,
  };
  const colors = {
    outstanding: 'var(--indigo)',
    overdue:     'var(--red)',
    nextMonth:   'var(--amber)',
    paid:        'var(--green)',
  };
  return (
    <div style={{ width: 34, height: 34, borderRadius: 8, background: `${colors[type]}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors[type]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icons[type]}
      </svg>
    </div>
  );
};

function TrendPill({ curr, prev }) {
  if (!prev) return null;
  const diff = curr - prev;
  const pct = Math.round(Math.abs(diff / prev) * 100);
  if (pct === 0) return null;
  const up = diff > 0;
  return (
    <span className={`stat-trend ${up ? 'up' : 'down'}`}>
      {up ? '↑' : '↓'} {pct}%
    </span>
  );
}

export default function Dashboard({ kpis, prevKpis, monthlyData, allNames, color, maxTotal, onPayMonth }) {
  const [tooltip, setTooltip] = useState(null);

  const stats = [
    { label: 'Outstanding', key: 'outstanding', cls: 'stat-outstanding', type: 'outstanding' },
    { label: 'Overdue',     key: 'overdue',     cls: 'stat-overdue',     type: 'overdue', pulse: true },
    { label: 'Next Month',  key: 'nextMonth',   cls: 'stat-nextmonth',   type: 'nextMonth' },
    { label: 'Total Paid',  key: 'paid',        cls: 'stat-paid',        type: 'paid' },
  ];

  const ctaMonth = monthlyData[0] || null;

  return (
    <div style={{ animation: 'slideUp .4s cubic-bezier(.16,1,.3,1)' }}>

      {/* KPI Cards */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {stats.map(s => (
          <div
            key={s.key}
            className={`card stat-card ${s.cls}`}
            style={s.pulse && kpis[s.key] > 0 ? { animationName: 'redPulse', animationDuration: '2.4s', animationIterationCount: 'infinite' } : {}}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <span className="stat-lbl">{s.label}</span>
              <KpiIcon type={s.type} />
            </div>
            <div className="stat-val"><CountUp to={kpis[s.key]} /></div>
            {prevKpis && <TrendPill curr={kpis[s.key]} prev={prevKpis[s.key]} />}
          </div>
        ))}
      </div>

      {/* Pay-month CTA — prominent action card */}
      {ctaMonth && onPayMonth && (
        <div className="card" style={{ marginBottom: 20, padding: '24px 28px', cursor: 'pointer', borderColor: 'var(--indigo-border)', background: 'linear-gradient(135deg,rgba(99,102,241,.06),rgba(129,140,248,.03))' }}
          onClick={() => onPayMonth(ctaMonth.ym)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  <path d="M5 21h14"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--t1)', marginBottom: 4, letterSpacing: '-.02em' }}>
                  Pay {fmtMonth(ctaMonth.ym)} — ready to go
                </div>
                <div style={{ color: 'var(--t2)', fontSize: 13 }}>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: 'var(--indigo)', fontSize: 15 }}>{currency(ctaMonth.total)}</span>
                  {' '}across{' '}
                  <strong style={{ color: 'var(--t1)' }}>{Object.keys(ctaMonth.sups).length}</strong> supplier{Object.keys(ctaMonth.sups).length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ padding: '10px 24px', fontSize: 14, flexShrink: 0 }}
              onClick={e => { e.stopPropagation(); onPayMonth(ctaMonth.ym); }}
            >
              Pay All Now →
            </button>
          </div>
        </div>
      )}

      {/* Two-column layout: chart + monthly breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: monthlyData.length > 0 ? '1fr 280px' : '1fr', gap: 16, alignItems: 'start' }}>

        {/* Chart card */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t1)', marginBottom: 2 }}>Monthly Payment Schedule</div>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>Unpaid invoices grouped by due month</div>
            </div>
          </div>

          {monthlyData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--t3)' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12, opacity: .4 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <div style={{ fontSize: 14 }}>No upcoming payments</div>
            </div>
          ) : (
            <div style={{ position: 'relative', minWidth: 0, overflow: 'hidden' }}>
              <ChartBars data={monthlyData} color={color} maxTotal={maxTotal} tooltip={tooltip} setTooltip={setTooltip} />
              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--bdr)' }}>
                {allNames.map(n => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t2)' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color(n), flexShrink: 0 }} />
                    <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Monthly breakdown panel */}
        {monthlyData.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {monthlyData.map(({ ym, sups, total }) => (
              <div
                key={ym}
                className="card"
                style={{ cursor: 'pointer', padding: 16 }}
                onClick={() => onPayMonth && onPayMonth(ym)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{fmtMonth(ym)}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--indigo)', fontFamily: "'DM Mono', monospace" }}>{currency(total)}</span>
                </div>
                {Object.entries(sups).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([sup, amt]) => (
                  <div key={sup} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderTop: '1px solid var(--bdr)', fontSize: 12 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color(sup), flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sup}</span>
                    <span style={{ fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap', fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{currency(amt)}</span>
                  </div>
                ))}
                {Object.keys(sups).length > 4 && (
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--bdr)' }}>
                    +{Object.keys(sups).length - 4} more
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div className="chart-tip" style={{ left: tooltip.x + 14, top: tooltip.y - 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color(tooltip.supplier), flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: color(tooltip.supplier), maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tooltip.supplier}</span>
          </div>
          <div style={{ color: '#F1F5F9', fontWeight: 800, fontSize: 14, fontFamily: "'DM Mono', monospace" }}>{currency(tooltip.amount)}</div>
          <div style={{ color: '#94A3B8', marginTop: 2, fontSize: 11 }}>{fmtMonth(tooltip.ym)} · {Math.round((tooltip.amount / tooltip.total) * 100)}%</div>
        </div>
      )}
    </div>
  );
}

function ChartBars({ data, color, maxTotal, tooltip, setTooltip }) {
  if (!data.length) return null;
  const H = 180, W = 72, GAP = 80, PX = 36;
  const maxV = maxTotal * 1.2;
  const totalW = data.length * (W + GAP) + PX * 2 - GAP;
  const yTicks = 4;

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg width="100%" viewBox={`0 0 ${totalW} ${H + 52}`} style={{ display: 'block', minWidth: 280, overflow: 'visible' }}>
        {/* Y-axis grid lines */}
        {Array.from({ length: yTicks }, (_, i) => {
          const y = H - (H / yTicks) * (i + 1);
          const val = (maxV / yTicks) * (i + 1);
          return (
            <g key={i}>
              <line x1={0} y1={y} x2={totalW} y2={y} style={{ stroke: 'var(--bdr2)' }} strokeWidth="1" strokeDasharray="4 3" />
              <text x={0} y={y - 3} textAnchor="start" fill="#94A3B8" fontSize="9" fontFamily="'DM Mono',monospace">
                {val >= 1000 ? `₪${(val / 1000).toFixed(0)}k` : `₪${Math.round(val)}`}
              </text>
            </g>
          );
        })}

        {/* Bars */}
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
              <defs><clipPath id={`cp${mi}`}><rect x={bx} y={by} width={W} height={bh} rx="5" /></clipPath></defs>
              <text x={bx + W / 2} y={by - 6} textAnchor="middle" fill="var(--t2)" fontSize="10" fontWeight="700" fontFamily="'DM Mono',monospace">
                {currency(total)}
              </text>
              <g clipPath={`url(#cp${mi})`}>
                {segs.map(({ sup, amt, y, h }, si) => (
                  <rect
                    key={si} x={bx} y={y} width={W} height={h + .5} fill={color(sup)}
                    style={{ cursor: 'crosshair' }}
                    onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, supplier: sup, amount: amt, total, ym })}
                    onMouseMove={e  => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </g>
              <text x={bx + W / 2} y={H + 22} textAnchor="middle" fill="#64748B" fontSize="11" fontFamily="'Plus Jakarta Sans',sans-serif" fontWeight="500">
                {fmtMonthShort(ym)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
