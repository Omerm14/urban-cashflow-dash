import { useState } from 'react';
import { useLang } from '../contexts/AppContexts';

export default function UsageBanner({ plan, used, limit, remaining, onUpgrade }) {
  const { t } = useLang();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (!plan || plan === 'enterprise') return null;

  const pct = limit === Infinity ? 0 : used / limit;
  const isWarning = pct >= 0.8;

  const bg     = isWarning ? 'linear-gradient(90deg,#78350f,#92400e)' : 'var(--surf2)';
  const border = isWarning ? '1px solid #b45309' : '1px solid var(--bdr)';
  const color  = isWarning ? '#fef3c7' : 'var(--t2)';

  return (
    <div style={{
      position: 'sticky', top: 54, zIndex: 110,
      background: bg, borderBottom: border,
      padding: '8px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
      fontSize: 13, fontWeight: 500, color,
    }}>
      {isWarning && <span>⚠️</span>}
      <span>
        <strong>{used}</strong> {t('usage_summary_suffix', { limit })}
        {remaining > 0
          ? <span style={{ color: isWarning ? '#fcd34d' : 'var(--t3)', marginLeft: 6 }}>{t('usage_remaining', { remaining })}</span>
          : <span style={{ color: '#f87171', marginLeft: 6, fontWeight: 700 }}>{t('usage_limit_reached')}</span>
        }
      </span>
      {plan !== 'pro' && (
        <button
          onClick={onUpgrade}
          style={{
            background: isWarning ? '#f59e0b' : 'var(--primary)',
            border: 'none', borderRadius: 8,
            padding: '5px 12px', fontSize: 12, fontWeight: 700,
            color: isWarning ? '#1c1917' : 'var(--accent-ink)', cursor: 'pointer',
          }}
        >
          {t('usage_upgrade_now')}
        </button>
      )}
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'transparent', border: 'none',
          color: isWarning ? '#fbbf24' : 'var(--t3)', cursor: 'pointer',
          fontSize: 16, lineHeight: 1, padding: '0 4px',
        }}
        aria-label={t('usage_dismiss')}
      >×</button>
    </div>
  );
}
