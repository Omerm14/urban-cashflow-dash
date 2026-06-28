import { useState } from 'react';
import { supabase } from '../lib/supabase';

const SANS = "'IBM Plex Sans', system-ui, sans-serif";

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
  const [loading, setLoading] = useState(null);
  const [error, setError]   = useState(null);

  const pct = limit === Infinity ? 0 : used / limit;
  const barPct = Math.min(100, Math.round((used / limit) * 100));

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
      if (!res.ok) throw new Error(data.error || 'Payment connection error');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 540,
        background: 'var(--surf)',
        border: '1px solid var(--bdr2)', borderRadius: 22,
        padding: '36px 32px',
        boxShadow: '0 50px 100px -30px rgba(0,0,0,.7)',
        fontFamily: SANS,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🚀</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', margin: 0, color: 'var(--t1)', fontFamily: SANS }}>
            {pct >= 1 ? 'Monthly invoice limit reached' : 'Upgrade your plan'}
          </h2>
          <p style={{ color: 'var(--t2)', marginTop: 8, fontSize: 15, fontFamily: SANS }}>
            Your plan allows {limit} invoices/month. You've used {used}.
          </p>
        </div>

        {/* Usage bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--t3)', marginBottom: 6, fontFamily: SANS }}>
            <span>{used} used</span>
            <span>{limit} limit</span>
          </div>
          <div style={{ height: 8, background: 'var(--surf2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${barPct}%`,
              background: barPct >= 100 ? 'var(--red)' : barPct >= 80 ? 'var(--amber)' : 'var(--indigo)',
              borderRadius: 4, transition: 'width .4s',
            }} />
          </div>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          {/* Basic */}
          <div style={{
            background: 'var(--surf2)', border: '1px solid var(--bdr)',
            borderRadius: 16, padding: '20px 18px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t3)', marginBottom: 8, fontFamily: SANS }}>BASIC</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-.03em', marginBottom: 2, color: 'var(--t1)', fontFamily: SANS }}>
              ₪99 <small style={{ fontSize: 13, fontWeight: 500, color: 'var(--t3)' }}>/mo</small>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PLAN_FEATURES.basic.map(f => (
                <li key={f} style={{ fontSize: 12, color: 'var(--t2)', display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: SANS }}>
                  <span style={{ color: 'var(--green)', flexShrink: 0 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => checkout('basic')}
              disabled={!!loading}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 10,
                background: 'var(--surf)', border: '1px solid var(--bdr2)',
                color: 'var(--t1)', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading === 'basic' ? .7 : 1, fontFamily: SANS,
              }}
            >
              {loading === 'basic' ? '…' : 'Get Basic'}
            </button>
          </div>

          {/* Pro */}
          <div style={{
            background: 'var(--indigo-tint)',
            border: '1px solid var(--indigo-bdr)',
            borderRadius: 16, padding: '20px 18px',
            boxShadow: '0 0 0 1px rgba(99,102,241,.1)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--indigo)',
              color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
              padding: '4px 12px', borderRadius: 100, whiteSpace: 'nowrap', fontFamily: SANS,
            }}>Most Popular</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#A5B4FC', marginBottom: 8, fontFamily: SANS }}>PRO</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-.03em', marginBottom: 2, color: 'var(--t1)', fontFamily: SANS }}>
              ₪199 <small style={{ fontSize: 13, fontWeight: 500, color: 'var(--t3)' }}>/mo</small>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PLAN_FEATURES.pro.map(f => (
                <li key={f} style={{ fontSize: 12, color: 'var(--t2)', display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: SANS }}>
                  <span style={{ color: 'var(--indigo)', flexShrink: 0 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => checkout('pro')}
              disabled={!!loading}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 10,
                background: 'var(--indigo)',
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', fontFamily: SANS,
                boxShadow: '0 8px 20px -8px rgba(99,102,241,.5)',
                opacity: loading === 'pro' ? .7 : 1,
              }}
            >
              {loading === 'pro' ? '…' : 'Get Pro'}
            </button>
          </div>
        </div>

        {error && (
          <p style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center', marginBottom: 14, fontFamily: SANS }}>{error}</p>
        )}

        <button
          onClick={onContinueReadonly}
          style={{
            display: 'block', width: '100%', background: 'none', border: 'none',
            color: 'var(--t3)', fontSize: 13, cursor: 'pointer', padding: '8px 0',
            textDecoration: 'underline', textDecorationStyle: 'dotted', fontFamily: SANS,
          }}
        >
          Continue viewing existing invoices (no new uploads)
        </button>
      </div>
    </div>
  );
}
