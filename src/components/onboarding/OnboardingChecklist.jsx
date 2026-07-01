import { useEffect, useState } from 'react';
import { BarChart3, Zap, Link2, Building2, Check, CheckCircle2, X } from 'lucide-react';
import './onboarding.css';

const SANS = "'IBM Plex Sans', system-ui, sans-serif";

const T = {
  surf: "#111827", surf2: "#0E1520",
  bdr: "rgba(255,255,255,0.07)", bdr2: "rgba(255,255,255,0.12)",
  t1: "#E8EFF8", t2: "#627488", t3: "#4A6278",
  indigo: "#6366F1", green: "#22C55E",
};

const ITEMS = [
  { key: 'dashboard',    Icon: BarChart3,  label: 'Explore the dashboard' },
  { key: 'upload',       Icon: Zap,        label: 'Upload your first invoice' },
  { key: 'integrations', Icon: Link2,      label: 'Connect an integration' },
  { key: 'suppliers',    Icon: Building2,  label: 'Add a supplier' },
];

export default function OnboardingChecklist({ tasks, onDismiss, onRestartTour }) {
  const done  = ITEMS.filter(i => tasks[i.key]).length;
  const total = ITEMS.length;
  const pct   = Math.round((done / total) * 100);
  const allDone = done === total;

  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  useEffect(() => {
    if (!allDone) return;
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [allDone, onDismiss]);

  const base = {
    position: 'fixed', bottom: 24, right: 24, zIndex: 1500,
    width: 292,
    background: T.surf,
    border: '1px solid rgba(99,102,241,.2)',
    borderRadius: 16,
    boxShadow: '0 20px 48px rgba(0,0,0,.55), 0 0 0 1px rgba(99,102,241,.08)',
    overflow: 'hidden',
    transition: 'opacity .35s ease, transform .35s cubic-bezier(.16,1,.3,1)',
    opacity: visible ? 1 : 0,
    transform: visible ? 'none' : 'translateX(20px) scale(.97)',
  };

  if (allDone) {
    return (
      <div style={base}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#22C55E,#10B981)' }} />
        <div style={{ padding: '20px 18px', textAlign: 'center' }}>
          <CheckCircle2 size={32} color="#22C55E" strokeWidth={1.75} style={{ marginBottom: 10 }} />
          <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, color: T.t1, letterSpacing: '-0.02em', marginBottom: 4 }}>
            All done!
          </div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>Closing in a moment…</div>
        </div>
        <div style={{ borderTop: `1px solid ${T.bdr}`, padding: '4px 6px 6px' }}>
          {ITEMS.map(({ key, Icon, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Check size={10} strokeWidth={3} color="#fff" />
              </div>
              <Icon size={13} strokeWidth={1.75} color="#22C55E" style={{ flexShrink: 0 }} />
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3, textDecoration: 'line-through', textDecorationColor: 'rgba(255,255,255,.15)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={base}>
      {/* Indigo accent */}
      <div style={{ height: 3, background: 'linear-gradient(90deg,#6366F1,#818CF8)' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 12px' }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="4" rx="1"/><path d="M7 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>
            <line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: T.t1, letterSpacing: '-0.02em' }}>Getting started</div>
          <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{done} of {total} complete</div>
        </div>
        <button onClick={onDismiss} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6,
          color: T.t3, display: 'flex', transition: 'color .15s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = T.t2}
          onMouseLeave={e => e.currentTarget.style.color = T.t3}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,.06)', margin: '0 14px 4px' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: 'linear-gradient(90deg,#6366F1,#818CF8)',
          width: `${pct}%`, transition: 'width .6s cubic-bezier(.16,1,.3,1)',
        }} />
      </div>

      {/* Items */}
      <div style={{ padding: '4px 6px 6px' }}>
        {ITEMS.map(({ key, Icon, label }) => {
          const isDone = tasks[key];
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, transition: 'background .12s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? '#6366F1' : 'transparent',
                border: isDone ? 'none' : '1.5px solid rgba(255,255,255,.15)',
                boxShadow: isDone ? '0 2px 8px rgba(99,102,241,.35)' : 'none',
                transition: 'all .3s cubic-bezier(.16,1,.3,1)',
              }}>
                {isDone && <Check size={10} strokeWidth={3} color="#fff" />}
              </div>
              <Icon size={13} strokeWidth={1.75} color={isDone ? '#818CF8' : T.t3} style={{ flexShrink: 0, transition: 'color .2s' }} />
              <span style={{
                fontFamily: SANS, fontSize: 12, fontWeight: isDone ? 400 : 500,
                color: isDone ? T.t3 : T.t1, flex: 1,
                textDecoration: isDone ? 'line-through' : 'none',
                textDecorationColor: 'rgba(255,255,255,.15)',
                transition: 'all .2s',
              }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 14px 12px', borderTop: `1px solid ${T.bdr}` }}>
        <button onClick={onRestartTour} style={{
          width: '100%', padding: '8px 0',
          background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.18)',
          borderRadius: 8, cursor: 'pointer',
          fontFamily: SANS, fontSize: 12, fontWeight: 600, color: '#818CF8',
          transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,.12)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,.06)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,.18)'; }}
        >
          ↺ Replay tour
        </button>
      </div>
    </div>
  );
}
