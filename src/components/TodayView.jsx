import { useState, useMemo } from 'react';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const TNUM = { fontFeatureSettings: '"tnum" 1, "ss01" 1' };

function fmtIls(n, compact = false) {
  const abs = Math.abs(n);
  if (compact && abs >= 1000) return '₪' + (abs / 1000).toFixed(1) + 'k';
  return '₪' + abs.toLocaleString('en-US');
}

/* Derive a synthetic daily balance from invoice data */
function buildDailyBalance(invoices, kpis) {
  const today = new Date();
  const year  = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Estimate starting balance
  const startBal = Math.max(20000, (kpis.incomeMTD || 80000) - (kpis.paidMTD || 40000) + 15000);

  // Compute projected daily cash position
  const dailyInflow  = (kpis.incomeMTD || 80000) / dayOfMonth;

  // Map unpaid invoices by due day within this month
  const outflowByDay = {};
  (invoices || []).forEach(inv => {
    if (inv.status !== 'unpaid') return;
    const d = new Date(inv.due_date || inv.dueDate || '');
    if (isNaN(d)) return;
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      outflowByDay[day] = (outflowByDay[day] || 0) + (inv.amount || 0);
    }
  });

  const points = [];
  let bal = startBal;
  for (let d = 1; d <= daysInMonth; d++) {
    const inflow  = d <= dayOfMonth ? dailyInflow * (0.9 + Math.random() * 0.2) : dailyInflow * 0.95;
    const outflow = outflowByDay[d] || (d <= dayOfMonth ? dailyInflow * 0.45 : dailyInflow * 0.4);
    bal += inflow - outflow;
    points.push({ day: d, balance: Math.max(0, Math.round(bal)) });
  }
  return points;
}

/* Build planner queue from upcoming unpaid invoices */
function buildQueue(invoices, suppliers, color) {
  const today = new Date();
  const upcoming = (invoices || [])
    .filter(inv => {
      if (inv.status !== 'unpaid') return false;
      const d = new Date(inv.due_date || inv.dueDate || '');
      if (isNaN(d)) return false;
      return d >= today;
    })
    .sort((a, b) => {
      const da = new Date(a.due_date || a.dueDate || '');
      const db = new Date(b.due_date || b.dueDate || '');
      return da - db;
    })
    .slice(0, 12);

  return upcoming.map(inv => {
    const due = new Date(inv.due_date || inv.dueDate || '');
    const supplier = (suppliers || []).find(s => s.name === inv.supplier) || {};
    const terms = supplier.terms || 'shotef';
    const flexible = !['immediate', 'rent'].includes(terms) && inv.amount < 20000;
    const daysUntil = Math.round((due - today) / 86400000);
    const dueLabel = daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return {
      id:         inv.id,
      due:        dueLabel,
      supplier:   inv.supplier || '—',
      amount:     inv.amount || 0,
      flexible,
      recommend:  flexible && daysUntil > 7 ? 'hold' : 'pay',
      why:        flexible ? `${terms} — can push without penalty` : 'Fixed due date',
      postponeTo: flexible ? formatPostpone(due, 30) : null,
      priority:   daysUntil < 0 ? 'flag' : daysUntil <= 3 ? 'high' : 'mid',
      color:      color(inv.supplier || ''),
    };
  });
}

function formatPostpone(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Hero ── */
function Hero({ kpis, onAlertClick }) {
  const today = new Date();
  const monthName = today.toLocaleDateString('en-US', { month: 'long' });
  const owner = 'Omer';
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const net   = kpis.netMTD    || kpis.incomeMTD - kpis.paidMTD || 0;
  const rent  = kpis.rent      || 14500;
  const head  = kpis.headroomAfterRent || Math.max(0, net - rent);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--ink-soft)', letterSpacing: '0.14em', fontWeight: 500 }}>
          {greeting.toUpperCase()}, {owner.toUpperCase()} · {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
        </div>
      </div>
      <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, maxWidth: 860 }}>
        You're up{' '}
        <span style={{ ...TNUM, color: 'var(--green)' }}>{fmtIls(net, true)}</span>
        {' '}in {monthName}.
      </div>
      <div style={{ fontSize: 18, color: 'var(--ink-soft)', lineHeight: 1.55, marginTop: 14, maxWidth: 780 }}>
        After every queued payment through month-end — including{' '}
        <strong style={{ color: 'var(--ink)' }}>rent ({fmtIls(rent)})</strong> — you'll land at{' '}
        <strong style={{ color: 'var(--green)' }}>+{fmtIls(head)} net</strong>.
        {onAlertClick && (
          <>
            {' '}
            <button
              onClick={onAlertClick}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--red)', fontWeight: 600, fontSize: 'inherit', fontFamily: 'inherit',
                borderBottom: '2px solid var(--red)', paddingBottom: 1,
              }}
            >
              One invoice worth a look →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Tide Chart ── */
function TideChart({ dailyBalance, heldAmount, invoices }) {
  const today = new Date().getDate();
  const monthName = new Date().toLocaleDateString('en-US', { month: 'short' });

  const series = dailyBalance;
  const W = 1100, H = 300, padT = 12, padB = 36, padL = 64, padR = 24;

  const adjusted = series.map((d, i) => {
    const lift = i >= today - 1 ? heldAmount * Math.min(1, (i - today + 1) / 6) : 0;
    return { ...d, balance: d.balance + lift };
  });

  const maxV = Math.max(...adjusted.map(d => d.balance)) * 1.15;
  const xAt  = (i) => padL + (i / (series.length - 1)) * (W - padL - padR);
  const yAt  = (v) => padT + (1 - v / maxV) * (H - padT - padB);

  const pastPts   = adjusted.slice(0, today).map((d, i) => `${xAt(i)},${yAt(d.balance)}`).join(' ');
  const futurePts = adjusted.slice(today - 1).map((d, i) => `${xAt(i + today - 1)},${yAt(d.balance)}`).join(' ');

  const todayBal = adjusted[today - 1]?.balance || 0;
  const endBal   = adjusted[adjusted.length - 1]?.balance || 0;

  // Find upcoming invoice flags
  const flagDays = (invoices || []).filter(inv => {
    const d = new Date(inv.due_date || inv.dueDate || '');
    return inv.status === 'unpaid' && d.getMonth() === new Date().getMonth() && d.getDate() > today;
  }).map(inv => new Date(inv.due_date || inv.dueDate).getDate()).slice(0, 2);

  const dayLabels = [1, 5, 10, 15, 20, 25, series.length].filter(Boolean);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-xl)',
      padding: '22px 26px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Bank balance · the tide</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
            {monthName} 1 → end · today:{' '}
            <span style={{ ...TNUM, color: 'var(--green)', fontFamily: MONO }}>{fmtIls(todayBal, true)}</span>
            {' '}· projected end:{' '}
            <span style={{ ...TNUM, color: 'var(--green)', fontFamily: MONO }}>{fmtIls(endBal, true)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-soft)', fontFamily: MONO }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 16, height: 8, background: 'linear-gradient(90deg, var(--teal-mid), var(--teal-deep))', borderRadius: 2, display: 'inline-block' }} />
            actual
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 16, height: 8, background: 'var(--peach)', borderRadius: 2, opacity: 0.7, display: 'inline-block' }} />
            projected
          </span>
          {heldAmount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--peach)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--peach)', display: 'inline-block' }} />
              lift from holds
            </span>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 260 }}>
        <defs>
          <linearGradient id="cf-past" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--teal)"     stopOpacity="0.5" />
            <stop offset="1" stopColor="var(--teal-deep)" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="cf-future" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--peach)" stopOpacity="0.3" />
            <stop offset="1" stopColor="#8C3818"      stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <g key={i}>
            <line
              x1={padL} x2={W - padR}
              y1={padT + p * (H - padT - padB)} y2={padT + p * (H - padT - padB)}
              stroke="#E5E2D9" strokeWidth="1"
              strokeDasharray={p === 1 ? '0' : '2 4'}
            />
            <text
              x={padL - 8}
              y={padT + p * (H - padT - padB) + 4}
              fontSize="10" fontFamily={MONO} fill="var(--ink-dim)" textAnchor="end"
            >
              {fmtIls(Math.round(maxV * (1 - p)), true)}
            </text>
          </g>
        ))}

        {/* Past area */}
        <polygon
          points={`${xAt(0)},${yAt(0)} ${pastPts} ${xAt(today - 1)},${yAt(0)}`}
          fill="url(#cf-past)"
        />
        <polyline points={pastPts} fill="none" stroke="var(--teal)" strokeWidth="2" />

        {/* Future area */}
        <polygon
          points={`${xAt(today - 1)},${yAt(0)} ${futurePts} ${xAt(adjusted.length - 1)},${yAt(0)}`}
          fill="url(#cf-future)"
        />
        <polyline
          points={futurePts} fill="none"
          stroke="var(--peach)" strokeWidth="2" strokeDasharray="4 6"
        />

        {/* Today line */}
        <line
          x1={xAt(today - 1)} x2={xAt(today - 1)}
          y1={padT - 4}       y2={H - padB + 4}
          stroke="var(--teal)" strokeWidth="1.5"
        />
        <circle
          cx={xAt(today - 1)} cy={yAt(todayBal)}
          r="6" fill="var(--teal)" stroke="var(--bg)" strokeWidth="2"
        />

        {/* Flag dots for upcoming large invoices */}
        {flagDays.map(d => {
          const i = d - 1;
          if (!adjusted[i]) return null;
          return (
            <g key={d}>
              <circle cx={xAt(i)} cy={yAt(adjusted[i].balance)} r="4" fill="var(--red)" stroke="var(--bg)" strokeWidth="1.5" />
              <text x={xAt(i)} y={yAt(adjusted[i].balance) + 18} fontSize="9" fontFamily={MONO} fill="var(--red)" textAnchor="middle" fontWeight="600">
                DUE
              </text>
            </g>
          );
        })}

        {/* End annotation */}
        <line
          x1={xAt(adjusted.length - 1)} x2={xAt(adjusted.length - 1)}
          y1={padT} y2={H - padB}
          stroke="#E5E2D9" strokeDasharray="2 4"
        />
        <text
          x={xAt(adjusted.length - 1) - 8}
          y={yAt(endBal) - 8}
          fontSize="11" fontFamily={MONO} fill="var(--green)"
          textAnchor="end" fontWeight="600"
        >
          END · {fmtIls(endBal, true)}
        </text>

        {/* Day labels */}
        {dayLabels.map(d => (
          <text
            key={d}
            x={xAt(d - 1)} y={H - padB + 18}
            fontSize="10" fontFamily={MONO} textAnchor="middle"
            fill={d === today ? 'var(--teal)' : 'var(--ink-dim)'}
            fontWeight={d === today ? 600 : 400}
          >
            {d === today ? 'TODAY' : d === series.length ? `${monthName.toUpperCase()} END` : `${d}`}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ── Planner ── */
function Planner({ queue, plan, setPlan, onDrill }) {
  const payCount  = queue.filter(q => plan[q.id] === 'pay').length;
  const holdCount = queue.filter(q => plan[q.id] === 'hold').length;
  const payTotal  = queue.filter(q => plan[q.id] === 'pay').reduce((s, q) => s + q.amount, 0);
  const holdTotal = queue.filter(q => plan[q.id] === 'hold').reduce((s, q) => s + q.amount, 0);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-xl)',
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Pay {payCount} now. Hold {holdCount} until later.
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>
            Toggle any invoice between Pay / Hold. Defaults are based on payment terms.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: 'var(--green)', ...TNUM }}>PAY NOW</div>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, ...TNUM }}>{fmtIls(payTotal)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: 'var(--amber)', ...TNUM }}>HOLD</div>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: 'var(--amber)', ...TNUM }}>{fmtIls(holdTotal)}</div>
          </div>
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr 90px 110px 1.4fr 140px',
        padding: '10px 4px',
        fontFamily: MONO, fontSize: 10,
        letterSpacing: '0.1em', color: 'var(--ink-dim)', fontWeight: 600,
        borderBottom: '1px solid var(--line)',
      }}>
        <div>DUE</div>
        <div>SUPPLIER</div>
        <div style={{ textAlign: 'right' }}>AMOUNT</div>
        <div>FLEX</div>
        <div>WHY</div>
        <div style={{ textAlign: 'right' }}>ACTION</div>
      </div>

      {queue.length === 0 && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-dim)', fontSize: 13 }}>
          No upcoming payments scheduled.
        </div>
      )}

      {queue.map((q) => {
        const choice = plan[q.id];
        return (
          <div
            key={q.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 90px 110px 1.4fr 140px',
              padding: '12px 4px',
              borderBottom: '1px solid var(--line)',
              alignItems: 'center',
              fontSize: 13,
            }}
          >
            <div style={{ fontFamily: MONO, color: 'var(--ink-soft)', fontSize: 12 }}>{q.due}</div>

            <button
              onClick={() => onDrill && onDrill(q.id)}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: onDrill ? 'pointer' : 'default',
                color: 'var(--ink)', fontFamily: 'inherit',
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 1, background: q.color || 'var(--ink-dim)', flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>{q.supplier}</span>
              {q.priority === 'flag' && (
                <span style={{
                  fontFamily: MONO, fontSize: 9,
                  color: 'var(--red)', background: 'var(--red-soft)',
                  padding: '2px 6px', borderRadius: 3, fontWeight: 600,
                }}>FLAG</span>
              )}
            </button>

            <div style={{ fontFamily: MONO, ...TNUM, textAlign: 'right', fontWeight: 500 }}>{fmtIls(q.amount)}</div>

            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', color: q.flexible ? 'var(--green)' : 'var(--ink-dim)' }}>
              {q.flexible ? '● FLEX' : '○ FIXED'}
            </div>

            <div style={{ fontSize: 11, color: 'var(--ink-soft)', lineHeight: 1.4 }}>{q.why}</div>

            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button
                className={`toggle-btn${choice === 'pay' ? ' active-pay' : ''}`}
                onClick={() => setPlan({ ...plan, [q.id]: 'pay' })}
              >Pay</button>
              <button
                className={`toggle-btn${choice === 'hold' ? ' active-hold' : ''}`}
                disabled={!q.flexible}
                onClick={() => q.flexible && setPlan({ ...plan, [q.id]: 'hold' })}
                title={q.flexible ? `Hold until ${q.postponeTo}` : 'Cannot postpone'}
              >
                {choice === 'hold' && q.postponeTo ? `→ ${q.postponeTo}` : 'Hold'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── TodayView (main export) ── */
export default function TodayView({ kpis, invoices, suppliers, color, onDrill }) {
  const dailyBalance = useMemo(() => buildDailyBalance(invoices, kpis), [invoices, kpis]);
  const queue = useMemo(() => buildQueue(invoices, suppliers, color), [invoices, suppliers, color]);

  const [plan, setPlan] = useState(() =>
    Object.fromEntries(queue.map(q => [q.id, q.recommend]))
  );

  // Keep plan in sync when queue changes (new invoices loaded)
  const [lastQueueLen, setLastQueueLen] = useState(queue.length);
  if (queue.length !== lastQueueLen) {
    setLastQueueLen(queue.length);
    const newPlan = { ...plan };
    queue.forEach(q => { if (!(q.id in newPlan)) newPlan[q.id] = q.recommend; });
    setPlan(newPlan);
  }

  const heldAmount = queue
    .filter(q => plan[q.id] === 'hold')
    .reduce((s, q) => s + q.amount, 0);

  const hasAnomaly = invoices?.some(inv => inv.amount > 10000 && inv.status === 'unpaid');

  return (
    <div style={{
      flex: 1,
      padding: '36px 64px 40px',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 24,
    }}>
      <Hero kpis={kpis} onAlertClick={hasAnomaly ? () => {} : null} />
      <TideChart dailyBalance={dailyBalance} heldAmount={heldAmount} invoices={invoices} />
      <Planner queue={queue} plan={plan} setPlan={setPlan} onDrill={onDrill} />
    </div>
  );
}
