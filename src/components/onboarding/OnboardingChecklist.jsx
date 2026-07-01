import { useEffect, useState } from 'react';
import { ClipboardList, BarChart3, Zap, Link2, Building2, Check, CheckCircle2 } from 'lucide-react';
import './onboarding.css';

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

  const [autoDismissing, setAutoDismissing] = useState(false);
  useEffect(() => {
    if (!allDone) return;
    setAutoDismissing(true);
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [allDone, onDismiss]);

  if (allDone) {
    return (
      <div className="ob-checklist" style={{ animation: autoDismissing ? undefined : 'ob-checklist-in 0.4s cubic-bezier(.16,1,.3,1)' }}>
        <div className="ob-cl-done-header">
          <div className="ob-cl-done-icon">
            <CheckCircle2 size={28} color="#10b981" strokeWidth={1.75} />
          </div>
          <div className="ob-cl-done-title">You're all set!</div>
          <div className="ob-cl-done-sub">Closing in a moment…</div>
        </div>
        <div className="ob-cl-items">
          {ITEMS.map(item => (
            <div key={item.key} className="ob-cl-item">
              <div className="ob-cl-check done">
                <Check size={11} strokeWidth={3} color="#fff" />
              </div>
              <item.Icon size={14} strokeWidth={1.75} color="#06b6d4" style={{ flexShrink: 0 }} />
              <span className="ob-cl-label done">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ob-checklist">
      <div className="ob-cl-header">
        <div className="ob-cl-icon">
          <ClipboardList size={14} strokeWidth={2} color="#fff" />
        </div>
        <div className="ob-cl-title-wrap">
          <div className="ob-cl-title">Getting started</div>
          <div className="ob-cl-count">{done} of {total} complete</div>
        </div>
        <button className="ob-cl-dismiss" onClick={onDismiss} title="Dismiss">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/>
          </svg>
        </button>
      </div>

      <div className="ob-cl-progress-track">
        <div className="ob-cl-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="ob-cl-items">
        {ITEMS.map(item => (
          <div key={item.key} className="ob-cl-item">
            <div className={`ob-cl-check ${tasks[item.key] ? 'done' : 'pending'}`}>
              {tasks[item.key] && <Check size={11} strokeWidth={3} color="#fff" />}
            </div>
            <item.Icon size={14} strokeWidth={1.75} color={tasks[item.key] ? '#06b6d4' : 'var(--t3)'} style={{ flexShrink: 0 }} />
            <span className={`ob-cl-label ${tasks[item.key] ? 'done' : ''}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <div className="ob-cl-footer">
        <button className="ob-cl-replay" onClick={onRestartTour}>
          ↺ Replay tour
        </button>
      </div>
    </div>
  );
}
