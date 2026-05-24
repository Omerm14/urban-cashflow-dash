import { useState, useRef } from 'react';
import { useWizard } from 'react-use-wizard';
import { useAuth } from '../../contexts/AuthContext';
import WizardShell, { StepNav, ReviewRow } from './WizardShell';

const STEP_LABELS = ['Verify', 'Configure', 'Activate'];

const APP_WA_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || '+1 415 523 8886';

function VerifyStep({ phone, setPhone, onVerified }) {
  const { session } = useAuth();
  const { nextStep } = useWizard();
  const [step, setStep] = useState('phone'); // 'phone' | 'otp'
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const otpRef = useRef();

  const handleSendCode = async () => {
    if (!phone.trim()) { setError('Enter your phone number first.'); return; }
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/integrations/whatsapp/request-otp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to send code');
      setStep('otp');
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/integrations/whatsapp/verify-otp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Verification failed');

      // Fetch the newly created integration so we have its ID for later
      const listResp = await fetch('/api/integrations', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const { integrations } = await listResp.json();
      const wa = integrations?.find(i => i.type === 'whatsapp');
      onVerified(wa || null);
      nextStep();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p style={{ color:'#94a3b8', fontSize:13, lineHeight:1.7, marginBottom:24 }}>
        Enter your WhatsApp number. We'll send a verification code to confirm it's yours.
      </p>

      {step === 'phone' ? (
        <>
          <label style={{ fontSize:12, color:'#94a3b8', fontWeight:500, display:'block', marginBottom:6 }}>WhatsApp number</label>
          <input
            className="input"
            placeholder="+972 50 123 4567"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendCode()}
            style={{ marginBottom:16 }}
          />
          {error && <div style={{ color:'#f87171', fontSize:12, marginBottom:12, padding:'10px 14px', background:'#2d0a0a', borderRadius:8 }}>{error}</div>}
          <StepNav onNext={handleSendCode} nextLabel={loading ? 'Sending…' : 'Send verification code'} loading={loading} />
        </>
      ) : (
        <>
          <div style={{ padding:'12px 16px', background:'#052e16', borderRadius:10, border:'1px solid #166534', marginBottom:20, fontSize:13, color:'#4ade80' }}>
            ✓ Code sent to {phone} via WhatsApp
          </div>
          <label style={{ fontSize:12, color:'#94a3b8', fontWeight:500, display:'block', marginBottom:6 }}>Verification code</label>
          <input
            ref={otpRef}
            className="input"
            placeholder="123456"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
            maxLength={6}
            style={{ letterSpacing:'0.3em', fontSize:18, textAlign:'center', marginBottom:8 }}
          />
          <button
            style={{ background:'none', border:'none', color:'#64748b', fontSize:12, cursor:'pointer', padding:'4px 0', fontFamily:'inherit' }}
            onClick={() => { setStep('phone'); setOtp(''); setError(null); }}
          >
            ← Change number
          </button>
          {error && <div style={{ color:'#f87171', fontSize:12, margin:'12px 0', padding:'10px 14px', background:'#2d0a0a', borderRadius:8 }}>{error}</div>}
          <StepNav onNext={handleVerify} nextLabel={loading ? 'Verifying…' : 'Verify →'} loading={loading} nextDisabled={otp.length !== 6} />
        </>
      )}
    </div>
  );
}

function ConfigureStep({ config, setConfig }) {
  const { nextStep, previousStep } = useWizard();
  return (
    <div>
      <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
        <div>
          <label style={{ fontSize:12, color:'#94a3b8', fontWeight:500, display:'block', marginBottom:6 }}>Keyword filter <span style={{ color:'#475569' }}>(optional)</span></label>
          <input
            className="input"
            placeholder="Only process messages containing this word"
            value={config.keyword}
            onChange={e => setConfig(c => ({ ...c, keyword: e.target.value }))}
          />
          <div style={{ fontSize:11, color:'#334155', marginTop:5 }}>
            Leave blank to process all invoice photos you send
          </div>
        </div>
        <div style={{ padding:'14px 16px', background:'#0f172a', borderRadius:10, border:'1px solid #1e2d45' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0', marginBottom:4 }}>Always-on auto-sync</div>
          <div style={{ fontSize:12, color:'#64748b', lineHeight:1.5 }}>
            Every invoice image or PDF you send to the app's WhatsApp number is processed instantly — no manual sync needed.
          </div>
        </div>
      </div>
      <StepNav onBack={previousStep} onNext={nextStep} />
    </div>
  );
}

function ActivateStep({ phone, config, integration, onClose }) {
  const { session } = useAuth();
  const { previousStep } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleActivate = async () => {
    if (!integration) { setError('Integration not found — please restart the wizard.'); return; }
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/integrations/${integration.id}/config`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { ...integration.config, ...config } }),
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
      <div style={{ padding:'14px 16px', background:'#0d1f3c', borderRadius:10, border:'1px solid #1e3a5f', marginBottom:20 }}>
        <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>Save this number as a contact</div>
        <div style={{ fontSize:20, fontWeight:700, color:'#a78bfa', letterSpacing:'0.05em' }}>{APP_WA_NUMBER}</div>
        <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>Send your invoices here and they'll be imported automatically</div>
      </div>
      <div style={{ background:'#0f172a', border:'1px solid #1e2d45', borderRadius:12, padding:'4px 20px', marginBottom:20 }}>
        <ReviewRow label="Your number" value={phone} />
        <ReviewRow label="Keyword filter" value={config.keyword || 'None'} />
        <ReviewRow label="Auto-sync" value="Always on" />
      </div>
      {error && <div style={{ color:'#f87171', fontSize:12, marginBottom:12, padding:'10px 14px', background:'#2d0a0a', borderRadius:8 }}>{error}</div>}
      <StepNav onBack={previousStep} onNext={handleActivate} nextLabel="Activate ✓" loading={loading} />
    </div>
  );
}

export default function WhatsAppWizard({ mode, integration: initialIntegration, initialStep, onClose }) {
  const [phone, setPhone] = useState(initialIntegration?.config?.phone_number || '');
  const [integration, setIntegration] = useState(initialIntegration);
  const [config, setConfig] = useState({
    keyword: initialIntegration?.config?.keyword || '',
  });

  return (
    <WizardShell stepLabels={STEP_LABELS} title="WhatsApp" onClose={onClose} startIndex={initialStep || 0}>
      <VerifyStep phone={phone} setPhone={setPhone} onVerified={setIntegration} />
      <ConfigureStep config={config} setConfig={setConfig} />
      <ActivateStep phone={phone} config={config} integration={integration} onClose={onClose} />
    </WizardShell>
  );
}
