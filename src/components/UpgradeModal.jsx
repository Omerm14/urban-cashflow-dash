import { useState } from 'react';
import { supabase } from '../lib/supabase';

const PLAN_FEATURES = {
  basic: [
    'Up to 50 invoices/month',
    '2 sync sources',
    'Manual upload + OCR',
    'Dashboard & calendar',
  ],
  pro: [
    'Up to 150 invoices/month',
    'All 4 sources (Gmail, Drive, WhatsApp, Green Invoice)',
    'Auto-sync',
    'Full audit trail',
    'Priority support',
  ],
};

export default function UpgradeModal({ plan, used, limit, onContinueReadonly }) {
  const [loading, setLoading] = useState(null); // 'basic' | 'pro'
  const [error, setError]   = useState(null);

  const pct = limit === Infinity ? 0 : used / limit;
  if (pct < 1) return null;

  const checkout = async (targetPlan) => {
    setLoading(targetPlan);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ plan: targetPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה בהתחברות לתשלום');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  };

  const barPct = Math.min(100, Math.round((used / limit) * 100));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(6,8,12,.85)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 540,
        background: 'linear-gradient(180deg,#171b25,#13161e)',
        border: '1px solid #2a3142', borderRadius: 22,
        padding: '36px 32px',
        boxShadow: '0 50px 100px -30px rgba(0,0,0,.9)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🚀</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', margin: 0 }}>
            הגעת למגבלת החשבוניות החודשית
          </h2>
          <p style={{ color: '#94a3b8', marginTop: 8, fontSize: 15 }}>
            הפלאן שלך מאפשר {limit} חשבוניות בחודש. השתמשת ב-{used}.
          </p>
        </div>

        {/* Usage bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 6 }}>
            <span>{used} בשימוש</span>
            <span>{limit} מגבלה</span>
          </div>
          <div style={{ height: 8, background: '#1e2330', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${barPct}%`,
              background: 'linear-gradient(90deg,#ef4444,#f97316)',
              borderRadius: 4, transition: 'width .4s',
            }} />
          </div>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          {/* Basic */}
          <div style={{
            background: '#0d0f14', border: '1px solid #1e2330',
            borderRadius: 16, padding: '20px 18px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>BASIC</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-.03em', marginBottom: 2 }}>
              ₪99 <small style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>/חודש</small>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PLAN_FEATURES.basic.map(f => (
                <li key={f} style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: '#10b981', flexShrink: 0 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => checkout('basic')}
              disabled={!!loading}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 10,
                background: '#1e2330', border: '1px solid #2a3142',
                color: '#f1f5f9', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading === 'basic' ? .7 : 1,
              }}
            >
              {loading === 'basic' ? '...' : 'בחר Basic'}
            </button>
          </div>

          {/* Pro */}
          <div style={{
            background: 'linear-gradient(180deg,rgba(59,130,246,.08),#0d0f14)',
            border: '1px solid rgba(59,130,246,.5)',
            borderRadius: 16, padding: '20px 18px',
            boxShadow: '0 0 0 1px rgba(59,130,246,.2)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
              color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
              padding: '4px 12px', borderRadius: 100, whiteSpace: 'nowrap',
            }}>הכי פופולרי</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 8 }}>PRO</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-.03em', marginBottom: 2 }}>
              ₪199 <small style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>/חודש</small>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PLAN_FEATURES.pro.map(f => (
                <li key={f} style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: '#3b82f6', flexShrink: 0 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => checkout('pro')}
              disabled={!!loading}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 10,
                background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 20px -8px rgba(59,130,246,.6)',
                opacity: loading === 'pro' ? .7 : 1,
              }}
            >
              {loading === 'pro' ? '...' : 'בחר Pro'}
            </button>
          </div>
        </div>

        {error && (
          <p style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', marginBottom: 14 }}>{error}</p>
        )}

        {/* Continue readonly */}
        <button
          onClick={onContinueReadonly}
          style={{
            display: 'block', width: '100%', background: 'none', border: 'none',
            color: '#64748b', fontSize: 13, cursor: 'pointer', padding: '8px 0',
            textDecoration: 'underline', textDecorationStyle: 'dotted',
          }}
        >
          המשך לצפות בחשבוניות קיימות (ללא הוספה)
        </button>
      </div>
    </div>
  );
}
