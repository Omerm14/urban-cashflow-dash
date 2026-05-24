import { useState } from 'react';
import { useWizard } from 'react-use-wizard';
import { useAuth } from '../../contexts/AuthContext';
import WizardShell, { StepNav, SegmentedPicker, Toggle, ReviewRow } from './WizardShell';

const STEP_LABELS = ['Connect', 'Configure', 'Schedule', 'Activate'];

function ConnectStep() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/integrations/google/auth-url?type=gmail&returnUrl=${encodeURIComponent(window.location.origin)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const { url, error: err } = await resp.json();
      if (err) throw new Error(err);
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div>
      <p style={{ color:'#94a3b8', fontSize:13, lineHeight:1.7, marginBottom:24 }}>
        Connect your Gmail account to let Cashflow scan incoming emails for invoice attachments (PDFs and images) and import them automatically.
      </p>
      {error && <div style={{ color:'#f87171', fontSize:12, marginBottom:16, padding:'10px 14px', background:'#2d0a0a', borderRadius:8 }}>{error}</div>}
      <button
        className="upload-btn"
        style={{ background:'linear-gradient(135deg,#6366f1,#a78bfa)', color:'#fff', width:'100%', justifyContent:'center', padding:'12px 20px' }}
        onClick={handleConnect}
        disabled={loading}
      >
        {loading ? 'Redirecting to Google…' : '🔗 Connect with Google'}
      </button>
    </div>
  );
}

function ConfigureStep({ config, setConfig }) {
  const { nextStep, previousStep, isFirstStep } = useWizard();
  return (
    <div>
      <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
        <div>
          <label style={{ fontSize:12, color:'#94a3b8', fontWeight:500, display:'block', marginBottom:6 }}>Gmail label <span style={{ color:'#475569' }}>(optional)</span></label>
          <input
            className="input"
            placeholder="e.g. invoices — leave blank for all mail"
            value={config.label}
            onChange={e => setConfig(c => ({ ...c, label: e.target.value }))}
          />
        </div>
        <div>
          <label style={{ fontSize:12, color:'#94a3b8', fontWeight:500, display:'block', marginBottom:6 }}>Subject keyword <span style={{ color:'#475569' }}>(optional)</span></label>
          <input
            className="input"
            placeholder="e.g. invoice, חשבונית"
            value={config.keyword}
            onChange={e => setConfig(c => ({ ...c, keyword: e.target.value }))}
          />
        </div>
        <div>
          <label style={{ fontSize:12, color:'#94a3b8', fontWeight:500, display:'block', marginBottom:8 }}>Attachment types to import</label>
          <SegmentedPicker
            options={[['pdf','PDFs only'],['images','Images only'],['both','Both']]}
            value={config.file_types}
            onChange={v => setConfig(c => ({ ...c, file_types: v }))}
          />
        </div>
      </div>
      <StepNav onBack={!isFirstStep ? previousStep : null} onNext={nextStep} />
    </div>
  );
}

function ScheduleStep({ config, setConfig }) {
  const { nextStep, previousStep } = useWizard();
  return (
    <div>
      <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
        <div>
          <label style={{ fontSize:12, color:'#94a3b8', fontWeight:500, display:'block', marginBottom:8 }}>Sync frequency</label>
          <SegmentedPicker
            options={[['hourly','Every hour'],['daily','Daily'],['weekly','Weekly']]}
            value={config.cadence}
            onChange={v => setConfig(c => ({ ...c, cadence: v }))}
          />
        </div>
        <div>
          <label style={{ fontSize:12, color:'#94a3b8', fontWeight:500, display:'block', marginBottom:8 }}>Look-back window <span style={{ color:'#475569' }}>(first sync)</span></label>
          <SegmentedPicker
            options={[['7','7 days'],['14','14 days'],['30','30 days']]}
            value={String(config.look_back_days)}
            onChange={v => setConfig(c => ({ ...c, look_back_days: Number(v) }))}
          />
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'#0f172a', borderRadius:10, border:'1px solid #1e2d45' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0' }}>Auto-sync</div>
            <div style={{ fontSize:11, color:'#64748b', marginTop:3 }}>Automatically import new invoice attachments on schedule</div>
          </div>
          <Toggle value={config.auto_sync} onChange={v => setConfig(c => ({ ...c, auto_sync: v }))} />
        </div>
      </div>
      <StepNav onBack={previousStep} onNext={nextStep} />
    </div>
  );
}

function ActivateStep({ config, integration, onClose }) {
  const { session } = useAuth();
  const { previousStep } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleActivate = async () => {
    if (!integration) { setError('Integration not found — please reconnect.'); return; }
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/integrations/${integration.id}/config`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      if (!resp.ok) throw new Error('Failed to save configuration');
      onClose();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ background:'#0f172a', border:'1px solid #1e2d45', borderRadius:12, padding:'4px 20px', marginBottom:20 }}>
        <ReviewRow label="Label filter" value={config.label || 'All mail'} />
        <ReviewRow label="Keyword" value={config.keyword || 'None'} />
        <ReviewRow label="File types" value={config.file_types} />
        <ReviewRow label="Frequency" value={config.cadence} />
        <ReviewRow label="Look-back" value={`${config.look_back_days} days`} />
        <ReviewRow label="Auto-sync" value={config.auto_sync ? 'Enabled' : 'Disabled'} />
      </div>
      {error && <div style={{ color:'#f87171', fontSize:12, marginBottom:12, padding:'10px 14px', background:'#2d0a0a', borderRadius:8 }}>{error}</div>}
      <StepNav onBack={previousStep} onNext={handleActivate} nextLabel="Activate ✓" loading={loading} />
    </div>
  );
}

export default function GmailWizard({ mode, integration: initialIntegration, initialStep, onClose }) {
  const [integration] = useState(initialIntegration);
  const [config, setConfig] = useState({
    label:          initialIntegration?.config?.label          || '',
    keyword:        initialIntegration?.config?.keyword        || '',
    file_types:     initialIntegration?.config?.file_types     || 'both',
    look_back_days: initialIntegration?.config?.look_back_days || 14,
    auto_sync:      initialIntegration?.config?.auto_sync      ?? true,
    cadence:        initialIntegration?.config?.cadence        || 'daily',
  });

  return (
    <WizardShell stepLabels={STEP_LABELS} title="Gmail" onClose={onClose} startIndex={initialStep || 0}>
      <ConnectStep />
      <ConfigureStep config={config} setConfig={setConfig} />
      <ScheduleStep config={config} setConfig={setConfig} />
      <ActivateStep config={config} integration={integration} onClose={onClose} />
    </WizardShell>
  );
}
