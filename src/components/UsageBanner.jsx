import { useState } from 'react';

export default function UsageBanner({ plan, used, limit, remaining, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (!plan || plan === 'enterprise') return null;

  const pct = limit === Infinity ? 0 : used / limit;
  const isWarning = pct >= 0.8;

  const bg     = isWarning ? 'rgba(239,68,68,.10)' : 'var(--surf2)';
  const border = isWarning ? '1px solid rgba(239,68,68,.25)' : '1px solid var(--bdr)';
  const color  = isWarning ? '#F87171' : 'var(--t2)';

  return (
    <div style={{
      position: 'sticky', top: 72, zIndex: 110,
      background: bg, borderBottom: border,
      padding: '8px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
      fontSize: 13, fontWeight: 500, color,
    }}>
      {isWarning && <span>⚠️</span>}
      <span>
        <strong>{used}</strong> / {limit} invoices used this month
        {remaining > 0
          ? <span style={{ color: isWarning ? '#fcd34d' : 'var(--t3)', marginLeft: 6 }}>· {remaining} remaining</span>
          : <span style={{ color: '#f87171', marginLeft: 6, fontWeight: 700 }}>· Limit reached</span>
        }
      </span>
      {plan !== 'pro' && (
        <button
          onClick={onUpgrade}
          style={{
            background: isWarning ? '#EF4444' : '#6366F1',
            border: 'none', borderRadius: 8,
            padding: '5px 12px', fontSize: 12, fontWeight: 700,
            color: isWarning ? '#1c1917' : '#fff', cursor: 'pointer',
          }}
        >
          Upgrade Now
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'transparent', border: 'none',
          color: isWarning ? '#fbbf24' : 'var(--t3)', cursor: 'pointer',
          fontSize: 16, lineHeight: 1, padding: '0 4px',
        }}
        aria-label="Dismiss"
      >×</button>
    </div>
  );
}
