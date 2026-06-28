import { useState, useEffect } from "react";
import { currency, fmtMonth, fmtMonthShort } from "../utils/dates";

const FONT = "'IBM Plex Sans', system-ui, sans-serif";

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

const KPI_META = {
  outstanding: { label: 'Outstanding', iconBg: 'rgba(99,102,241,.13)', iconStroke: '#818CF8',
    icon: <path d="M1 4h22v16a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4z"/> },
  overdue: { label: 'Overdue', iconBg: 'rgba(239,68,68,.12)', iconStroke: '#F87171',
    icon: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></> },
  nextMonth: { label: 'Next Month', iconBg: 'rgba(245,158,11,.12)', iconStroke: '#F59E0B',
    icon: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
  paid: { label: 'Total Paid', iconBg: 'rgba(34,197,94,.12)', iconStroke: '#22C55E',
    icon: <polyline points="20 6 9 17 4 12"/> },
};

function TrendPill({ curr, prev }) {
  if (!prev || prev === 0) return null;
  const diff = curr - prev;
  const pct = Math.round(Math.abs(diff / prev) * 100);
  if (pct === 0) return null;
  const up = diff > 0;
  return (
    <div className="stat-trend">
      <span className={`stat-trend-pill ${up ? 'up' : 'down'}`}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          {up ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
        </svg>
        {up ? '+' : '-'}{pct}%
      </span>
      <span className="stat-trend-lbl">vs last month</span>
    </div>
  );
}

export default function Dashboard({ kpis, prevKpis, monthlyData, allNames, color, maxTotal, onPayMonth }) {
  const [tooltip, setTooltip] = useState(null);

  const stats = [
    { key: 'outstanding', cls: '' },
    { key: 'overdue',     cls: 'stat-overdue', pulse: true },
    { key: 'nextMonth',   cls: '' },
    { key: 'paid',        cls: '' },
  ];

  const ctaMonth = monthlyData[0] || null;

  return (
    <div style={{ animation: 'slideUp .4s cubic-bezier(.16,1,.3,1)' }}>

      {/* KPI Cards */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {stats.map(s => {
          const meta = KPI_META[s.key];
          return (
            <div
              key={s.key}
              className={`card stat-card ${s.cls}`}
              style={{
                display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 12,
                animationName: s.pulse && kpis[s.key] > 0 ? 'redPulse' : undefined,
                animationDuration: '2.4s', animationIterationCount: 'infinite',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="stat-lbl">{meta.label}</span>
                <div style={{ width: 32, height: 32, background: meta.iconBg, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={meta.iconStroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    {meta.icon}
                  </svg>
                </div>
              </div>
              <div className="stat-val"><CountUp to={kpis[s.key]} /></div>
              {prevKpis && <TrendPill curr={kpis[s.key]} prev={prevKpis[s.key]} />}
            </div>
          );
        })}
      </div>

      {/* Pay CTA card */}
      {ctaMonth && onPayMonth && (
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px', borderColor: 'rgba(99,102,241,.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: 'rgba(99,102,241,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--t1)', marginBottom: 4, letterSpacing: '-.02em' }}>
                  Pay {fmtMonth(ctaMonth.ym)} — you're ready
                </div>
                <div style={{ fontSize: 13, color: 'var(--t2)' }}>
                  <strong style={{ color: 'var(--t1)' }}>{Object.keys(ctaMonth.sups).length}</strong> suppliers ·{' '}
                  <span style={{ fontWeight: 500, color: '#A5B4FC' }}>{currency(ctaMonth.total)}</span> total due
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: 13 }}>
                View invoices
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: '8px 20px', fontSize: 13, letterSpacing: '-.01em', boxShadow: '0 4px 18px rgba(99,102,241,.35)', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={e => { e.stopPropagation(); onPayMonth(ctaMonth.ym); }}
              >
                Pay All
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column: chart + monthly breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: monthlyData.length > 0 ? '1fr 268px' : '1fr', gap: 14, alignItems: 'start' }}>

        {/* Chart card */}
        <div className="card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#CBD6E6', letterSpacing: '-.02em' }}>Payment Schedule</div>
              <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 3 }}>Upcoming payments by month</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, fontWeight: 600 }}>{monthlyData.length} months</button>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                {allNames.map(n => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color(n), flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--t2)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Monthly breakdown panel */}
        {monthlyData.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {monthlyData.map(({ ym, sups, total }, mi) => (
              <div
                key={ym}
                className="card"
                style={{ cursor: 'pointer', padding: '14px 16px' }}
                onClick={() => onPayMonth && onPayMonth(ym)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#CBD6E6', letterSpacing: '-.02em' }}>{fmtMonth(ym)}</span>
                    {mi === 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.07em', color: '#818CF8', background: 'rgba(99,102,241,.14)', padding: '2px 7px', borderRadius: 20 }}>DUE NEXT</span>
                    )}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#CBD6E6', fontVariantNumeric: 'tabular-nums' }}>{currency(total)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(sups).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([sup, amt]) => (
                    <div key={sup} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: color(sup), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {sup.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ flex: 1, fontSize: 11, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sup}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#9AAFCA', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{currency(amt)}</span>
                    </div>
                  ))}
                  {Object.keys(sups).length > 4 && (
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>+{Object.keys(sups).length - 4} more</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 16, top: tooltip.y - 80,
          background: '#131D2E', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 10, padding: '12px 16px', pointerEvents: 'none', zIndex: 200,
          boxShadow: '0 16px 48px rgba(0,0,0,.6)', minWidth: 152,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color(tooltip.supplier), flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: '#7A8FA6' }}>{tooltip.supplier}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#E2E8F0', letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{currency(tooltip.amount)}</div>
          <div style={{ fontSize: 11, color: '#627488', marginTop: 5 }}>
            {fmtMonthShort(tooltip.ym)} · {Math.round((tooltip.amount / tooltip.total) * 100)}% of total
          </div>
        </div>
      )}
    </div>
  );
}

function ChartBars({ data, color, maxTotal, tooltip, setTooltip }) {
  if (!data.length) return null;
  const H = 172, BW = 54, GAP = 60, PX = 44, topPad = 28;
  const maxV = maxTotal * 1.16;
  const totalW = data.length * (BW + GAP) - GAP + PX * 2;
  const svgH = H + topPad + 44;

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${totalW} ${svgH}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible', minWidth: 280 }}>
        <defs>
          <filter id="barGlow" x="-60%" y="-40%" width="220%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur"/>
          </filter>
          {data.map((_, mi) => {
            const bx = PX + mi * (BW + GAP);
            const barH = (data[mi].total / maxV) * H;
            return (
              <clipPath key={'cp' + mi} id={'cp' + mi}>
                <rect x={bx} y={topPad + H - barH} width={BW} height={barH + 2} rx="7"/>
              </clipPath>
            );
          })}
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1.0].map((p, i) => (
          <line key={'g' + i}
            x1={0} y1={topPad + H - H * p + 0.5} x2={totalW} y2={topPad + H - H * p + 0.5}
            stroke={p >= 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)'}
            strokeWidth={1}
          />
        ))}

        {/* Y-axis labels */}
        {[0.5, 1.0].map(p => (
          <text key={'yl' + p}
            x={PX - 8} y={topPad + H - H * p - 6}
            textAnchor="end" fill="#4A6278" fontSize="10"
            fontFamily={FONT} fontWeight="500"
          >
            {'₪' + Math.round(maxTotal * p / 1000) + 'k'}
          </text>
        ))}

        {/* Baseline */}
        <line x1={0} y1={topPad + H + 0.5} x2={totalW} y2={topPad + H + 0.5} stroke="rgba(255,255,255,0.08)" strokeWidth={1}/>

        {/* Bars */}
        {data.map(({ ym, sups, total }, mi) => {
          const bx = PX + mi * (BW + GAP);
          const barH = (total / maxV) * H;
          const isFirst = mi === 0;
          const dimmed = tooltip && tooltip.ym !== ym;
          let yOff = topPad + H;
          const segs = Object.entries(sups).map(([sup, amt]) => {
            const h = Math.max(2, (amt / maxV) * H);
            yOff -= h;
            return { sup, amt, y: yOff, h };
          });

          return (
            <g key={ym}>
              {isFirst && (
                <rect x={bx} y={topPad + H - barH} width={BW} height={barH}
                  rx="7" fill="#6366F1" filter="url(#barGlow)" opacity={0.22}
                />
              )}
              <text x={bx + BW / 2} y={topPad + H - barH - 9}
                textAnchor="middle" fill={isFirst ? '#818CF8' : '#4A6278'}
                fontSize="11" fontFamily={FONT} fontWeight="700"
                opacity={dimmed ? 0.4 : 1}
              >
                {'₪' + Math.round(total / 1000) + 'k'}
              </text>
              <g clipPath={`url(#cp${mi})`}>
                {segs.map(({ sup, amt, y, h }, si) => (
                  <rect
                    key={si} x={bx} y={y} width={BW} height={h + 1.5}
                    fill={color(sup)}
                    opacity={dimmed ? 0.18 : (tooltip && tooltip.supplier !== sup && tooltip.ym === ym ? 0.5 : 1)}
                    style={{ cursor: 'crosshair', transition: 'opacity .18s' }}
                    onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, supplier: sup, amount: amt, total, ym })}
                    onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
                {segs.slice(0, -1).map(({ y }, si) => (
                  <line key={'div' + si}
                    x1={bx} y1={Math.round(y) + 0.5} x2={bx + BW} y2={Math.round(y) + 0.5}
                    stroke="rgba(7,9,15,0.5)" strokeWidth={1.5}
                    style={{ pointerEvents: 'none' }}
                  />
                ))}
              </g>
              <text x={bx + BW / 2} y={topPad + H + 19}
                textAnchor="middle" fill={isFirst ? '#818CF8' : '#5A7090'}
                fontSize="13" fontFamily={FONT} fontWeight={isFirst ? '600' : '400'}
              >
                {fmtMonthShort(ym)}
              </text>
              {isFirst && (
                <text x={bx + BW / 2} y={topPad + H + 34}
                  textAnchor="middle" fill="#4A4FA0"
                  fontSize="8" fontFamily={FONT} fontWeight="700" letterSpacing=".12em"
                >
                  DUE NOW
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
