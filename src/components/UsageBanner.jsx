import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function UsageBanner({ plan, used, limit, remaining, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const pct = limit === Infinity ? 0 : used / limit;
  if (pct < 0.8 || pct >= 1) return null;

  return (
    <div style={{
      position: 'sticky', top: 72, zIndex: 110,
      background: 'linear-gradient(90deg,#78350f,#92400e)',
      borderBottom: '1px solid #b45309',
      padding: '10px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
      fontSize: 14, fontWeight: 500, color: '#fef3c7',
    }}>
      <span>⚠️</span>
      <span>
        נותרו לך <strong>{remaining}</strong> חשבוניות החודש מתוך {limit}.{' '}
        <span dir="rtl">שדרג כדי לא לפספס אף חשבונית.</span>
      </span>
      <button
        onClick={onUpgrade}
        style={{
          background: '#f59e0b', border: 'none', borderRadius: 8,
          padding: '6px 14px', fontSize: 13, fontWeight: 700,
          color: '#1c1917', cursor: 'pointer',
        }}
      >
        שדרג עכשיו
      </button>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'transparent', border: 'none',
          color: '#fbbf24', cursor: 'pointer', fontSize: 18,
          lineHeight: 1, padding: '0 4px',
        }}
        aria-label="Dismiss"
      >×</button>
    </div>
  );
}
