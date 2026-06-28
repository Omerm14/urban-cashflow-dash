import { useState } from 'react';
import { supabase } from '../lib/supabase';

const SANS = "'IBM Plex Sans', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', monospace";

const FEATURES = [
  { label: "Manual upload + OCR",   basic: true,  pro: true  },
  { label: "Dashboard & calendar",  basic: true,  pro: true  },
  { label: "50 invoices/month",     basic: true,  pro: false },
  { label: "150 invoices/month",    basic: false, pro: true  },
  { label: "Auto-sync",             basic: false, pro: true  },
  { label: "Priority support",      basic: false, pro: true  },
];

const PLANS = { basic: { monthly: 99, annual: 79 }, pro: { monthly: 199, annual: 159 } };

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function Cross() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

export default function UpgradeModal({ used = 18, limit = 20, onClose, onContinueReadonly }) {
  const [billing, setBilling] = useState('monthly');
  const [loading, setLoading] = useState(null);
  const [error, setError]   = useState(null);
  const pct = Math.round((used / limit) * 100);

  const close = onClose || onContinueReadonly;

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
      position:'fixed', inset:0, zIndex:500,
      background:'rgba(5,8,16,.9)', backdropFilter:'blur(6px)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:20, animation:'fadeIn 0.2s',
    }}>
      <div style={{
        width:'100%', maxWidth:560,
        background:'var(--surf)', border:'1px solid var(--bdr2)', borderRadius:16,
        padding:'30px 26px', boxShadow:'0 20px 60px rgba(0,0,0,.5)',
        position:'relative', maxHeight:'90vh', overflowY:'auto',
        fontFamily:SANS,
      }}>
        {/* Close */}
        <button onClick={close} style={{ position:'absolute', top:14, right:16, background:'none', border:'none', color:'var(--t3)', cursor:'pointer', display:'flex', padding:4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Title */}
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:21, letterSpacing:'-0.03em', color:'var(--t1)', marginBottom:6 }}>
            You're growing. Your plan should too.
          </div>
          <p style={{ color:'var(--t2)', fontSize:13, lineHeight:1.6 }}>
            You've processed <strong style={{ color:'var(--indigo)' }}>{used} invoices</strong> this month — great work.
          </p>
        </div>

        {/* Usage bar */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--t3)', marginBottom:6 }}>
            <span>{used} processed</span><span>{limit} on Free</span>
          </div>
          <div style={{ height:5, background:'var(--surf2)', borderRadius:3 }}>
            <div style={{ height:'100%', width:`${pct}%`, background: pct >= 90 ? 'var(--red)' : 'var(--indigo)', borderRadius:3, transition:'width .4s' }} />
          </div>
        </div>

        {/* Billing toggle */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:16 }}>
          <div style={{ display:'flex', background:'var(--surf2)', border:'1px solid var(--bdr)', borderRadius:6, padding:2 }}>
            {['monthly','annual'].map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{ padding:'5px 12px', borderRadius:4, border:'none', cursor:'pointer', fontFamily:SANS, fontSize:12, fontWeight: billing === b ? 600 : 400, background: billing === b ? 'var(--surf)' : 'transparent', color: billing === b ? 'var(--t1)' : 'var(--t2)', textTransform:'capitalize' }}>{b}</button>
            ))}
          </div>
          {billing === 'annual' && (
            <span style={{ fontFamily:SANS, fontSize:12, fontWeight:700, color:'#22C55E', background:'rgba(34,197,94,.12)', border:'1px solid rgba(34,197,94,.25)', borderRadius:3, padding:'2px 8px' }}>Save 20%</span>
          )}
        </div>

        {/* Plan cards */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          {/* Basic */}
          <div style={{ background:'var(--surf2)', border:'1px solid var(--bdr)', borderRadius:10, padding:14 }}>
            <div style={{ fontFamily:SANS, fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'var(--t3)', marginBottom:5 }}>BASIC</div>
            <div style={{ marginBottom:10 }}>
              <span style={{ fontFamily:MONO, fontSize:22, fontWeight:500, color:'var(--t1)' }}>₪{PLANS.basic[billing]}</span>
              <span style={{ fontFamily:SANS, fontSize:11, color:'var(--t3)' }}>/mo</span>
            </div>
            <button onClick={() => checkout('basic')} disabled={!!loading} style={{ width:'100%', padding:'9px 0', borderRadius:6, background:'var(--surf)', border:'1px solid var(--bdr)', color:'var(--t1)', fontFamily:SANS, fontSize:13, fontWeight:600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading === 'basic' ? 0.7 : 1 }}>
              {loading === 'basic' ? '…' : 'Get Basic'}
            </button>
          </div>
          {/* Pro */}
          <div style={{ background:'var(--indigo-tint)', border:'2px solid var(--indigo)', borderRadius:10, padding:14, position:'relative' }}>
            <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:'var(--indigo)', color:'#fff', fontFamily:SANS, fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:100, whiteSpace:'nowrap' }}>Popular</div>
            <div style={{ fontFamily:SANS, fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'var(--indigo)', marginBottom:5 }}>PRO</div>
            <div style={{ marginBottom:10 }}>
              <span style={{ fontFamily:MONO, fontSize:22, fontWeight:500, color:'var(--t1)' }}>₪{PLANS.pro[billing]}</span>
              <span style={{ fontFamily:SANS, fontSize:11, color:'var(--t3)' }}>/mo</span>
            </div>
            <button onClick={() => checkout('pro')} disabled={!!loading} style={{ width:'100%', padding:'9px 0', borderRadius:6, background:'var(--indigo)', border:'none', color:'#fff', fontFamily:SANS, fontSize:13, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading === 'pro' ? 0.7 : 1 }}>
              {loading === 'pro' ? '…' : 'Get Pro'}
            </button>
          </div>
        </div>

        {/* Feature table */}
        <div style={{ background:'var(--surf2)', border:'1px solid var(--bdr)', borderRadius:8, overflow:'hidden', marginBottom:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 50px 50px', padding:'6px 12px', borderBottom:'1px solid var(--bdr)' }}>
            {['', 'Basic', 'Pro'].map((h, i) => (
              <span key={h} style={{ fontFamily:SANS, fontSize:10, fontWeight:700, textTransform:'uppercase', color: i === 2 ? 'var(--indigo)' : 'var(--t3)', textAlign: i > 0 ? 'center' : 'left' }}>{h}</span>
            ))}
          </div>
          {FEATURES.map(f => (
            <div key={f.label} style={{ display:'grid', gridTemplateColumns:'1fr 50px 50px', padding:'5px 12px', borderTop:'1px solid var(--bdr)' }}>
              <span style={{ fontFamily:SANS, fontSize:12, color:'var(--t2)' }}>{f.label}</span>
              <span style={{ display:'flex', justifyContent:'center' }}>{f.basic ? <Check /> : <Cross />}</span>
              <span style={{ display:'flex', justifyContent:'center' }}>{f.pro ? <Check /> : <Cross />}</span>
            </div>
          ))}
        </div>

        {error && <p style={{ color:'var(--red)', fontSize:13, textAlign:'center', marginBottom:12 }}>{error}</p>}

        <button onClick={close} style={{ display:'block', width:'100%', background:'none', border:'none', color:'var(--t3)', fontFamily:SANS, fontSize:13, cursor:'pointer', padding:'6px 0', textDecoration:'underline', textDecorationStyle:'dotted' }}>
          Continue viewing (read-only)
        </button>
      </div>
    </div>
  );
}
