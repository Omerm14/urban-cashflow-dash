import { useState } from 'react';
import { supabase } from '../lib/supabase';

const FEATURES = [
  { label: 'Invoices/month',        basic: '50',    pro: '150' },
  { label: 'Sync sources',          basic: '2',     pro: 'All 4' },
  { label: 'Manual upload + OCR',   basic: true,    pro: true },
  { label: 'Auto-sync',             basic: false,   pro: true },
  { label: 'Full audit trail',      basic: false,   pro: true },
  { label: 'Priority support',      basic: false,   pro: true },
];

export default function UpgradeModal({ plan, used, limit, onContinueReadonly }) {
  const [loading, setLoading] = useState(null);
  const [error, setError]   = useState(null);
  const [billing, setBilling] = useState('monthly');

  const isAnnual = billing === 'annual';
  const prices = { basic: isAnnual ? 990 : 99, pro: isAnnual ? 1990 : 199 };

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
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,.6)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:560, background:'var(--surf)', border:'1px solid var(--bdr)', borderRadius:'var(--r)', padding:'32px', boxShadow:'0 40px 80px rgba(0,0,0,.4)' }}>

        {/* Header */}
        <div style={{ marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <div style={{ width:36, height:36, borderRadius:8, background:'var(--indigo-tint)', border:'1px solid var(--indigo-border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--indigo)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M5 21h14"/>
              </svg>
            </div>
            <h2 style={{ fontSize:20, fontWeight:800, letterSpacing:'-.02em', margin:0, color:'var(--t1)' }}>
              {pct >= 1 ? 'Invoice limit reached' : "You're growing. Your plan should too."}
            </h2>
          </div>
          <p style={{ color:'var(--t2)', fontSize:13, margin:0 }}>
            You've processed {used} of your {limit} monthly invoices — great progress.
          </p>
        </div>

        {/* Usage bar */}
        <div style={{ marginBottom:24, padding:'14px 16px', background:'var(--surf2)', border:'1px solid var(--bdr)', borderRadius:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--t2)', marginBottom:8 }}>
            <span style={{ fontWeight:600, color:'var(--t1)' }}>{used} invoices processed</span>
            <span>{limit} limit</span>
          </div>
          <div style={{ height:6, background:'var(--bdr)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${barPct}%`, background: barPct >= 90 ? 'var(--red)' : 'var(--indigo)', borderRadius:3, transition:'width .4s' }}/>
          </div>
        </div>

        {/* Billing toggle */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}>
          <div style={{ display:'inline-flex', background:'var(--surf2)', border:'1px solid var(--bdr)', borderRadius:100, padding:3, gap:2 }}>
            {['monthly','annual'].map(opt => (
              <button key={opt} onClick={() => setBilling(opt)}
                style={{ padding:'6px 16px', borderRadius:100, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, transition:'all .15s',
                  background: billing === opt ? 'var(--indigo)' : 'transparent',
                  color: billing === opt ? '#fff' : 'var(--t3)' }}>
                {opt === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
          {isAnnual && (
            <span style={{ marginLeft:10, fontSize:11, fontWeight:700, color:'var(--green)', background:'rgba(16,185,129,.12)', padding:'3px 8px', borderRadius:100 }}>
              Save 17%
            </span>
          )}
        </div>

        {/* Plan cards */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          {/* Basic */}
          <div style={{ background:'var(--surf2)', border:'1px solid var(--bdr)', borderRadius:8, padding:'18px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', letterSpacing:'.06em', marginBottom:8 }}>BASIC</div>
            <div style={{ fontSize:26, fontWeight:900, letterSpacing:'-.03em', color:'var(--t1)', marginBottom:12 }}>
              ₪{prices.basic} <small style={{ fontSize:13, fontWeight:500, color:'var(--t3)' }}>{isAnnual ? '/yr' : '/mo'}</small>
            </div>
            <button
              onClick={() => checkout('basic')}
              disabled={!!loading}
              className="btn btn-secondary"
              style={{ width:'100%', justifyContent:'center', opacity: loading === 'basic' ? .6 : 1 }}
            >
              {loading === 'basic' ? 'Redirecting…' : 'Get Basic'}
            </button>
          </div>

          {/* Pro */}
          <div style={{ background:'var(--indigo-tint)', border:'1px solid var(--indigo-border)', borderRadius:8, padding:'18px 16px', position:'relative' }}>
            <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'var(--indigo)', color:'#fff', fontSize:10, fontWeight:700, letterSpacing:'.06em', padding:'3px 10px', borderRadius:100, whiteSpace:'nowrap' }}>
              Most Popular
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--indigo)', letterSpacing:'.06em', marginBottom:8 }}>PRO</div>
            <div style={{ fontSize:26, fontWeight:900, letterSpacing:'-.03em', color:'var(--t1)', marginBottom:12 }}>
              ₪{prices.pro} <small style={{ fontSize:13, fontWeight:500, color:'var(--t3)' }}>{isAnnual ? '/yr' : '/mo'}</small>
            </div>
            <button
              onClick={() => checkout('pro')}
              disabled={!!loading}
              className="btn btn-primary"
              style={{ width:'100%', justifyContent:'center', opacity: loading === 'pro' ? .6 : 1 }}
            >
              {loading === 'pro' ? 'Redirecting…' : 'Get Pro'}
            </button>
          </div>
        </div>

        {/* Feature comparison table */}
        <div style={{ border:'1px solid var(--bdr)', borderRadius:8, overflow:'hidden', marginBottom:20 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'var(--surf2)' }}>
                <th style={{ padding:'8px 14px', textAlign:'left', color:'var(--t3)', fontWeight:600, borderBottom:'1px solid var(--bdr)' }}>Feature</th>
                <th style={{ padding:'8px 14px', textAlign:'center', color:'var(--t2)', fontWeight:700, borderBottom:'1px solid var(--bdr)' }}>Basic</th>
                <th style={{ padding:'8px 14px', textAlign:'center', color:'var(--indigo)', fontWeight:700, borderBottom:'1px solid var(--bdr)' }}>Pro</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f, i) => (
                <tr key={f.label} style={{ borderTop: i > 0 ? '1px solid var(--bdr)' : 'none' }}>
                  <td style={{ padding:'8px 14px', color:'var(--t2)' }}>{f.label}</td>
                  <td style={{ padding:'8px 14px', textAlign:'center', color:'var(--t1)', fontWeight:600 }}>
                    {typeof f.basic === 'boolean'
                      ? (f.basic ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : <span style={{ color:'var(--bdr2)', fontSize:16 }}>—</span>)
                      : f.basic}
                  </td>
                  <td style={{ padding:'8px 14px', textAlign:'center', color:'var(--t1)', fontWeight:600 }}>
                    {typeof f.pro === 'boolean'
                      ? (f.pro ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : <span style={{ color:'var(--bdr2)', fontSize:16 }}>—</span>)
                      : f.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <p style={{ color:'var(--red)', fontSize:13, textAlign:'center', marginBottom:12 }}>{error}</p>}

        <button
          onClick={onContinueReadonly}
          style={{ display:'block', width:'100%', background:'none', border:'none', color:'var(--t3)', fontSize:13, cursor:'pointer', padding:'6px 0', textDecoration:'underline', textDecorationStyle:'dotted' }}
        >
          Continue viewing existing invoices
        </button>
      </div>
    </div>
  );
}
