import './onboarding.css';

const ITEMS = [
  { key: 'dashboard',    label: 'Explore the Dashboard' },
  { key: 'upload',       label: 'Upload your first invoice' },
  { key: 'integrations', label: 'Connect an integration' },
  { key: 'suppliers',    label: 'Add a supplier' },
];

export default function OnboardingChecklist({ tasks, onDismiss, onRestartTour }) {
  const done  = Object.values(tasks).filter(Boolean).length;
  const total = ITEMS.length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div className="ob-checklist">
      <div className="ob-checklist-header">
        <span className="ob-checklist-title">Getting started ({done}/{total})</span>
        <button className="ob-checklist-dismiss" onClick={onDismiss} title="Dismiss">✕</button>
      </div>

      <div className="ob-checklist-progress">
        <div className="ob-checklist-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="ob-checklist-items">
        {ITEMS.map(item => (
          <div key={item.key} className="ob-checklist-item">
            <div className={`ob-check-icon ${tasks[item.key] ? 'done' : 'pending'}`}>
              {tasks[item.key] ? '✓' : ''}
            </div>
            <span className={`ob-check-label ${tasks[item.key] ? 'done' : ''}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <div className="ob-checklist-footer">
        <button className="ob-retour-btn" onClick={onRestartTour}>
          ↺ Replay tour
        </button>
      </div>
    </div>
  );
}
