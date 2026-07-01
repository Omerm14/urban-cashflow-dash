import { useEffect, useState } from 'react';
import './onboarding.css';

const ITEMS = [
  { key: 'dashboard',    icon: '📊', label: 'Explore the dashboard' },
  { key: 'upload',       icon: '⚡', label: 'Upload your first invoice' },
  { key: 'integrations', icon: '🔗', label: 'Connect an integration' },
  { key: 'suppliers',    icon: '🏢', label: 'Add a supplier' },
];

export default function OnboardingChecklist({ tasks, onDismiss, onRestartTour }) {
  const done  = ITEMS.filter(i => tasks[i.key]).length;
  const total = ITEMS.length;
  const pct   = Math.round((done / total) * 100);
  const allDone = done === total;

  // Auto-dismiss 3s after all tasks done
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
          <div className="ob-cl-done-icon">🎉</div>
          <div className="ob-cl-done-title">You're all set!</div>
          <div className="ob-cl-done-sub">Closing in a moment…</div>
        </div>
        <div className="ob-cl-items">
          {ITEMS.map(item => (
            <div key={item.key} className="ob-cl-item">
              <div className="ob-cl-check done">✓</div>
              <span className="ob-cl-item-icon">{item.icon}</span>
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
        <div className="ob-cl-icon">📋</div>
        <div className="ob-cl-title-wrap">
          <div className="ob-cl-title">Getting started</div>
          <div className="ob-cl-count">{done} of {total} complete</div>
        </div>
        <button className="ob-cl-dismiss" onClick={onDismiss} title="Dismiss">✕</button>
      </div>

      <div className="ob-cl-progress-track">
        <div className="ob-cl-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="ob-cl-items">
        {ITEMS.map(item => (
          <div key={item.key} className="ob-cl-item">
            <div className={`ob-cl-check ${tasks[item.key] ? 'done' : 'pending'}`}>
              {tasks[item.key] ? '✓' : ''}
            </div>
            <span className="ob-cl-item-icon">{item.icon}</span>
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
