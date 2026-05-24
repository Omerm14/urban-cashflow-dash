import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import GoogleDriveWizard from './wizards/GoogleDriveWizard';
import GmailWizard from './wizards/GmailWizard';
import WhatsAppWizard from './wizards/WhatsAppWizard';

const DEFS = [
  {
    type: 'google_drive',
    label: 'Google Drive',
    icon: '📁',
    desc: 'Auto-import invoices from your Drive folder',
    canSyncNow: true,
    Wizard: GoogleDriveWizard,
  },
  {
    type: 'gmail',
    label: 'Gmail',
    icon: '✉️',
    desc: 'Pick up invoice attachments from your inbox',
    canSyncNow: true,
    Wizard: GmailWizard,
  },
  {
    type: 'whatsapp',
    label: 'WhatsApp',
    icon: '💬',
    desc: 'Send invoice photos to our WhatsApp number',
    canSyncNow: false,
    Wizard: WhatsAppWizard,
  },
];

function StatusBadge({ status }) {
  const map = {
    connected:    { label: '● Connected',    cls: 'connected' },
    error:        { label: '● Error',        cls: 'error' },
    disconnected: { label: '○ Not connected', cls: 'disconnected' },
  };
  const { label, cls } = map[status] || map.disconnected;
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

export default function IntegrationsPage({ initialOAuthConnected, onOAuthHandled }) {
  const { session } = useAuth();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState(null);
  const [activeWizard, setActiveWizard] = useState(null);
  const oauthHandledRef = useRef(false);

  const fetchIntegrations = useCallback(async () => {
    try {
      const resp = await fetch('/api/integrations', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const { integrations: data } = await resp.json();
      setIntegrations(data || []);
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  // After OAuth redirect: auto-open the Configure step for the just-connected integration
  useEffect(() => {
    if (!initialOAuthConnected || loading || oauthHandledRef.current) return;
    const integration = integrations.find(i => i.type === initialOAuthConnected);
    if (!integration) return;
    oauthHandledRef.current = true;
    onOAuthHandled?.();
    setActiveWizard({ type: initialOAuthConnected, integration, initialStep: 1 });
  }, [initialOAuthConnected, loading, integrations, onOAuthHandled]);

  const handleSyncNow = async (integration) => {
    setSyncingId(integration.id);
    try {
      await fetch(`/api/integrations/${integration.id}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      await fetchIntegrations();
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnect = async (integration) => {
    await fetch(`/api/integrations/${integration.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await fetchIntegrations();
  };

  const getIntegration = type => integrations.find(i => i.type === type) || null;

  const closeWizard = () => {
    setActiveWizard(null);
    fetchIntegrations();
  };

  return (
    <div>
      <div style={{ marginBottom:28 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:'#f1f5f9', marginBottom:6 }}>Integrations</h2>
        <p style={{ fontSize:13, color:'#64748b' }}>Connect your accounts to automatically import invoices</p>
      </div>

      {loading ? (
        <div className="integration-grid">
          {DEFS.map(d => (
            <div key={d.type} className="integration-card">
              <div className="shimmer" style={{ height:24, width:'60%', borderRadius:8 }} />
              <div className="shimmer" style={{ height:16, width:'80%', borderRadius:8 }} />
              <div className="shimmer" style={{ height:36, width:'40%', borderRadius:8 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="integration-grid">
          {DEFS.map(def => {
            const integration = getIntegration(def.type);
            const connected = integration?.status === 'connected';
            const hasError  = integration?.status === 'error';

            return (
              <div key={def.type} className={`integration-card${connected ? ' connected' : ''}`}>
                {/* Header row */}
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ fontSize:28, lineHeight:1 }}>{def.icon}</div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15, color:'#f1f5f9' }}>{def.label}</div>
                      <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{def.desc}</div>
                    </div>
                  </div>
                  <StatusBadge status={integration?.status || 'disconnected'} />
                </div>

                {/* Stats */}
                {integration && (
                  <div style={{ fontSize:12, color:'#64748b', display:'flex', flexDirection:'column', gap:3 }}>
                    {integration.last_sync && (
                      <div>Last sync: <span style={{ color:'#94a3b8' }}>{new Date(integration.last_sync).toLocaleString()}</span></div>
                    )}
                    {integration.sync_count > 0 && (
                      <div><span style={{ color:'#a78bfa', fontWeight:600 }}>{integration.sync_count}</span> invoices imported</div>
                    )}
                    {integration.config?.auto_sync && (
                      <div style={{ color:'#4ade80' }}>● Auto-sync {integration.config.cadence || 'enabled'}</div>
                    )}
                    {hasError && integration.error_message && (
                      <div style={{ color:'#f87171', fontSize:11, marginTop:2 }}>{integration.error_message}</div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:'auto' }}>
                  {!integration ? (
                    <button
                      className="upload-btn"
                      style={{ background:'linear-gradient(135deg,#6366f1,#a78bfa)', color:'#fff', fontSize:12, padding:'8px 18px' }}
                      onClick={() => setActiveWizard({ type: def.type, integration: null, initialStep: 0 })}
                    >
                      Connect →
                    </button>
                  ) : (
                    <>
                      {def.canSyncNow && (
                        <button
                          className="action-btn"
                          style={{ background:'#1e2d45', color:'#94a3b8', padding:'7px 14px' }}
                          onClick={() => handleSyncNow(integration)}
                          disabled={syncingId === integration.id}
                        >
                          {syncingId === integration.id ? 'Syncing…' : '↻ Sync Now'}
                        </button>
                      )}
                      <button
                        className="action-btn"
                        style={{ background:'#1e2d45', color:'#94a3b8', padding:'7px 14px' }}
                        onClick={() => setActiveWizard({ type: def.type, integration, initialStep: 1 })}
                      >
                        Configure
                      </button>
                      <button
                        className="action-btn"
                        style={{ background:'#2d0a0a', color:'#f87171', padding:'7px 14px' }}
                        onClick={() => handleDisconnect(integration)}
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeWizard?.type === 'google_drive' && (
        <GoogleDriveWizard
          integration={activeWizard.integration}
          initialStep={activeWizard.initialStep}
          onClose={closeWizard}
        />
      )}
      {activeWizard?.type === 'gmail' && (
        <GmailWizard
          integration={activeWizard.integration}
          initialStep={activeWizard.initialStep}
          onClose={closeWizard}
        />
      )}
      {activeWizard?.type === 'whatsapp' && (
        <WhatsAppWizard
          integration={activeWizard.integration}
          initialStep={activeWizard.initialStep}
          onClose={closeWizard}
        />
      )}
    </div>
  );
}
