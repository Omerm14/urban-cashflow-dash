import { Wizard, useWizard } from 'react-use-wizard';

function StepHeader({ stepLabels, title, onClose }) {
  const { activeStep } = useWizard();
  return (
    <>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h3 style={{ fontSize:18, fontWeight:700, color:'#f1f5f9', margin:0 }}>{title}</h3>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:22, lineHeight:1, padding:'0 4px', fontFamily:'inherit' }}>×</button>
      </div>
      <div style={{ display:'flex', alignItems:'flex-start', marginBottom:28 }}>
        {stepLabels.map((label, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', flex: i < stepLabels.length - 1 ? 1 : 'none' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div className={`step-dot ${i < activeStep ? 'done' : i === activeStep ? 'active' : 'pending'}`}>
                {i < activeStep ? '✓' : i + 1}
              </div>
              <span style={{ fontSize:10, color: i === activeStep ? '#a78bfa' : i < activeStep ? '#6366f1' : '#334155', letterSpacing:'.3px', whiteSpace:'nowrap' }}>
                {label}
              </span>
            </div>
            {i < stepLabels.length - 1 && (
              <div style={{ flex:1, height:2, background: i < activeStep ? '#6366f1' : '#1e2d45', margin:'14px 6px 0', minWidth:16 }} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function WizardShell({ stepLabels, title, onClose, startIndex, children }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width:540, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto' }}>
        <Wizard
          startIndex={startIndex || 0}
          header={<StepHeader stepLabels={stepLabels} title={title} onClose={onClose} />}
        >
          {children}
        </Wizard>
      </div>
    </div>
  );
}

export function StepNav({ onBack, onNext, nextLabel = 'Next →', nextDisabled = false, loading = false }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', marginTop:28, gap:10 }}>
      {onBack ? (
        <button className="upload-btn" style={{ background:'#1e2d45', color:'#94a3b8', border:'1px solid #253d5b' }} onClick={onBack}>
          ← Back
        </button>
      ) : <div />}
      <button
        className="upload-btn"
        style={{ background: nextDisabled ? '#1e2d45' : 'linear-gradient(135deg,#6366f1,#a78bfa)', color: nextDisabled ? '#475569' : '#fff', cursor: nextDisabled ? 'not-allowed' : 'pointer' }}
        onClick={onNext}
        disabled={nextDisabled || loading}
      >
        {loading ? 'Saving…' : nextLabel}
      </button>
    </div>
  );
}

export function SegmentedPicker({ options, value, onChange }) {
  return (
    <div style={{ display:'flex', gap:8 }}>
      {options.map(([val, label]) => (
        <button
          key={val}
          className="action-btn"
          style={{
            flex:1, padding:'9px 12px',
            background: value === val ? '#a78bfa22' : '#1e2d45',
            color:      value === val ? '#a78bfa'   : '#64748b',
            border:     `1px solid ${value === val ? '#a78bfa' : '#1e2d45'}`,
          }}
          onClick={() => onChange(val)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ value, onChange }) {
  return (
    <button
      className="toggle-track"
      style={{ background: value ? '#6366f1' : '#1e2d45' }}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    >
      <div className="toggle-thumb" style={{ left: value ? 21 : 3 }} />
    </button>
  );
}

export function ReviewRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #1a2538' }}>
      <span style={{ fontSize:12, color:'#64748b' }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:500, color:'#e2e8f0', textTransform: typeof value === 'string' ? 'capitalize' : undefined }}>{String(value)}</span>
    </div>
  );
}
