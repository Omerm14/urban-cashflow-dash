import React from 'react';

const MOCK_INTEGRATIONS = [
  { id: 'whatsapp', name: 'WhatsApp',      icon: 'whatsapp', status: 'connected', count: 142, lastSync: 'synced 4m ago',  desc: 'Invoices sent as photos are extracted automatically.' },
  { id: 'drive',   name: 'Google Drive',  icon: 'drive',    status: 'connected', count: 87,  lastSync: 'synced 22m ago', desc: 'Watch a folder and pull in new PDFs or images.' },
  { id: 'gmail',   name: 'Gmail',         icon: 'gmail',    status: 'connected', count: 40,  lastSync: 'synced 1h ago',  desc: 'Emails from known suppliers are extracted automatically.' },
  { id: 'green',   name: 'Green Invoice', icon: 'green',    status: 'available', count: 0,   lastSync: null,             desc: 'Israeli e-invoicing platform — pull issued & received invoices.' },
  { id: 'bizzibox',name: 'Bizzibox',      icon: 'bizzibox', status: 'available', count: 0,   lastSync: null,             desc: 'Accounting tool — import all tracked expenses.' },
  { id: 'tabit',   name: 'Tabit POS',     icon: 'tabit',    status: 'available', count: 0,   lastSync: null,             desc: 'Pull daily income automatically from your POS.' },
  { id: 'dropbox', name: 'Dropbox',       icon: 'dropbox',  status: 'available', count: 0,   lastSync: null,             desc: 'Watch a folder for new invoice files.' },
  { id: 'caspit',  name: 'Caspit POS',    icon: 'caspit',   status: 'available', count: 0,   lastSync: null,             desc: 'Sync daily revenue from Caspit.' },
];

const ICON_MAP = {
  whatsapp: { bg: '#25D366', label: '✓' },
  drive:    { bg: '#4285F4', label: '▲' },
  gmail:    { bg: '#EA4335', label: '✉' },
  green:    { bg: '#00875A', label: '₪' },
  bizzibox: { bg: '#7C5CFF', label: 'B' },
  tabit:    { bg: '#F59E0B', label: 'T', fg: '#1a160e' },
  dropbox:  { bg: '#0061FF', label: '◆' },
  caspit:   { bg: '#06B6D4', label: 'C' },
};

function SourceLogo({ icon, size = 40 }) {
  const m = ICON_MAP[icon] || { bg: '#888', label: '?' };
  return (
    <div style={{
      width: size, height: size,
      borderRadius: Math.round(size * 0.28),
      background: m.bg,
      color: m.fg || '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.5),
      fontWeight: 700,
      flexShrink: 0,
    }}>{m.label}</div>
  );
}

function SourceCard({ it, onOpen }) {
  const connected = it.status === 'connected';
  return (
    <button
      onClick={() => onOpen(it)}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${connected ? 'var(--green)' : 'var(--line)'}`,
        borderRadius: 14,
        padding: '18px 20px',
        cursor: 'pointer',
        textAlign: 'left',
        color: 'var(--ink)',
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 140,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SourceLogo icon={it.icon} />
        <div style={{ fontSize: 15, fontWeight: 600 }}>{it.name}</div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.45, flex: 1 }}>{it.desc}</div>
      {connected ? (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, color: 'var(--green)',
          letterSpacing: '0.08em', fontWeight: 600,
        }}>● {it.count} invoices · {it.lastSync}</div>
      ) : (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: 'var(--blue)',
          letterSpacing: '0.08em', fontWeight: 600,
        }}>CONNECT →</div>
      )}
    </button>
  );
}

function IntegrationSheet({ it, onClose }) {
  const connected = it.status === 'connected';
  return (
    <div className="sheet-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet-panel">
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, letterSpacing: '0.14em',
            color: 'var(--ink-soft)', marginBottom: 22, padding: 0, fontWeight: 500,
          }}
        >← CLOSE</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <SourceLogo icon={it.icon} size={52} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.015em' }}>{it.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>{it.desc}</div>
          </div>
        </div>

        {connected ? (
          <>
            <div style={{
              background: 'var(--green-soft)',
              border: '1px solid var(--green)',
              borderRadius: 14, padding: 18, marginBottom: 18,
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, color: 'var(--green)',
                letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8,
              }}>● CONNECTED</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{it.count} invoices imported · {it.lastSync}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>Average extraction confidence: 96%</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary">Sync now</button>
              <button className="btn">Configure</button>
              <button className="btn">Disconnect</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.55, marginBottom: 22 }}>
              Authorise once. Every invoice that lands in {it.name} comes straight into Cashflow — same extraction, same dedupe, zero touch.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
              {[
                'Authorise access',
                it.icon === 'whatsapp' ? 'Pick the WhatsApp number' : 'Pick the folder, inbox, or account',
                'Test the connection and start syncing',
              ].map((text, n) => (
                <div key={n} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'var(--ink)', color: 'var(--bg)',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{n + 1}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{text}</div>
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px 16px', borderRadius: 12 }}
            >
              Connect {it.name} →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function SourcesView({ invoiceCount }) {
  const [open, setOpen] = React.useState(null);
  const connected = MOCK_INTEGRATIONS.filter(i => i.status === 'connected');
  const available = MOCK_INTEGRATIONS.filter(i => i.status !== 'connected');
  const totalImported = connected.reduce((s, c) => s + c.count, 0);

  return (
    <div style={{ flex: 1, padding: '36px 64px 40px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>Sources</div>
        <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4, maxWidth: 560 }}>
          Where your invoices come from. Connect once — invoices flow in on their own.
        </div>
      </div>

      {/* Connected summary banner */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-xl)',
        padding: '20px 28px',
        display: 'flex', alignItems: 'center', gap: 28,
      }}>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, letterSpacing: '0.12em',
            color: 'var(--green)', fontWeight: 600, marginBottom: 6,
          }}>● {connected.length} CONNECTED</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>
            <span style={{ color: 'var(--green)' }}>{totalImported}</span>{' '}
            invoices arrived without you lifting a finger.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          {connected.map(c => <SourceLogo key={c.id} icon={c.icon} size={52} />)}
        </div>
      </div>

      {/* Connected */}
      <div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: '0.12em',
          color: 'var(--ink-dim)', marginBottom: 10, fontWeight: 600,
        }}>CONNECTED</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {connected.map(it => <SourceCard key={it.id} it={it} onOpen={setOpen} />)}
        </div>
      </div>

      {/* Available */}
      <div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, letterSpacing: '0.12em',
          color: 'var(--ink-dim)', marginBottom: 10, fontWeight: 600,
        }}>AVAILABLE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {available.map(it => <SourceCard key={it.id} it={it} onOpen={setOpen} />)}
        </div>
      </div>

      {open && <IntegrationSheet it={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
