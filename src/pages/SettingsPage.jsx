import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const PLAN_BADGE = {
  free:       { label: 'FREE',       color: '#94a3b8', bg: 'rgba(100,116,139,.15)', border: 'rgba(100,116,139,.3)' },
  basic:      { label: 'BASIC',      color: '#10b981', bg: 'rgba(16,185,129,.12)',  border: 'rgba(16,185,129,.3)' },
  pro:        { label: 'PRO',        color: '#60a5fa', bg: 'rgba(59,130,246,.12)',  border: 'rgba(59,130,246,.35)' },
  enterprise: { label: 'ENTERPRISE', color: '#818cf8', bg: 'rgba(99,102,241,.12)',  border: 'rgba(99,102,241,.35)' },
};

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 14, padding: '24px 28px', marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 18 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

export default function SettingsPage({ user, plan, used, limit, remaining, onUpgrade, onBack, invoices, session }) {
  const [tab, setTab] = useState('profile');

  const tabs = ['profile', 'billing', 'security', 'danger'];
  const tabLabel = { profile: 'Profile', billing: 'Plan & Billing', security: 'Security', danger: 'Danger Zone' };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid var(--bdr)', borderRadius: 8, color: 'var(--t3)', cursor: 'pointer', padding: '6px 12px', fontSize: 13, fontFamily: 'inherit' }}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Account Settings</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surf2)', borderRadius: 10, padding: 4 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
            background: tab === t ? 'var(--surf)' : 'transparent',
            color: tab === t ? 'var(--t1)' : 'var(--t3)',
            fontWeight: tab === t ? 700 : 500, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit', transition: 'all .15s',
            boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.2)' : 'none',
          }}>{tabLabel[t]}</button>
        ))}
      </div>

      {tab === 'profile'  && <ProfileTab user={user} />}
      {tab === 'billing'  && <BillingTab plan={plan} used={used} limit={limit} remaining={remaining} onUpgrade={onUpgrade} invoices={invoices} session={session} />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'danger'   && <DangerTab user={user} session={session} />}
    </div>
  );
}

/* ─── Profile ─────────────────────────────────────────────── */
function ProfileTab({ user }) {
  const initials = getInitials(user);
  const [name,    setName]    = useState(user?.user_metadata?.full_name || '');
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setMsg(error ? { type: 'error', text: error.message } : { type: 'ok', text: 'Saved!' });
    setSaving(false);
  };

  return (
    <Section title="Profile">
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg,#6366f1,#3b82f6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>{initials}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{name || user?.email}</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{user?.email}</div>
        </div>
      </div>

      <Field label="Display Name">
        <input
          className="input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
        />
      </Field>

      <Field label="Email">
        <input className="input" value={user?.email || ''} readOnly style={{ opacity: .6, cursor: 'not-allowed' }} />
        <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>To change your email, contact support.</div>
      </Field>

      {msg && (
        <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 8, fontSize: 13,
          background: msg.type === 'ok' ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
          color: msg.type === 'ok' ? '#10b981' : '#ef4444',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)'}`,
        }}>{msg.text}</div>
      )}

      <button onClick={save} disabled={saving} style={{
        background: 'linear-gradient(135deg,var(--purple),var(--primary))',
        border: 'none', borderRadius: 8, padding: '9px 20px',
        fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer',
        fontFamily: 'inherit', opacity: saving ? .7 : 1,
      }}>{saving ? 'Saving…' : 'Save Changes'}</button>
    </Section>
  );
}

/* ─── Billing ──────────────────────────────────────────────── */
function BillingTab({ plan, used, limit, remaining, onUpgrade, invoices, session }) {
  const badge = PLAN_BADGE[plan] || PLAN_BADGE.free;
  const pct   = limit === Infinity ? 0 : used / limit;
  const barW  = Math.min(100, Math.round(pct * 100));

  const [sub, setSub] = useState(null);

  useEffect(() => {
    supabase.from('subscriptions').select('*').single().then(({ data }) => setSub(data));
  }, []);

  const exportCSV = () => {
    const header = 'Supplier,Invoice No,Date,Due Date,Amount,Status\n';
    const rows = (invoices || []).map(inv =>
      [inv.supplier, inv.invoice_no, inv.invoice_date, inv.due_date, inv.amount, inv.status]
        .map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = 'invoices.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Section title="Current Plan">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', padding: '4px 10px', borderRadius: 6, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>
            {sub?.status === 'active' && <span style={{ fontSize: 12, color: '#10b981' }}>● Active</span>}
            {sub?.current_period_end && (
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                Renews {new Date(sub.current_period_end).toLocaleDateString()}
              </span>
            )}
          </div>
          {plan !== 'enterprise' && (
            <button onClick={onUpgrade} style={{
              background: 'linear-gradient(135deg,var(--purple),var(--primary))',
              border: 'none', borderRadius: 8, padding: '7px 16px',
              fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            }}>Upgrade ↑</button>
          )}
        </div>

        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 8 }}>
          <strong>{used}</strong> / {limit === Infinity ? '∞' : limit} invoices used this month
          {remaining !== Infinity && remaining > 0 && <span style={{ color: 'var(--t3)', marginLeft: 8 }}>· {remaining} remaining</span>}
        </div>
        {limit !== Infinity && (
          <div style={{ height: 6, background: 'var(--surf2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${barW}%`, borderRadius: 3, transition: 'width .4s',
              background: barW >= 100 ? '#ef4444' : barW >= 80 ? '#f59e0b' : 'var(--primary)' }} />
          </div>
        )}
      </Section>

      <Section title="Billing History">
        {sub ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--t3)', borderBottom: '1px solid var(--bdr)' }}>
                <th style={{ textAlign: 'left', padding: '0 0 10px', fontWeight: 600 }}>Plan</th>
                <th style={{ textAlign: 'left', padding: '0 0 10px', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0 0 10px', fontWeight: 600 }}>Period Start</th>
                <th style={{ textAlign: 'left', padding: '0 0 10px', fontWeight: 600 }}>Period End</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '10px 0', textTransform: 'capitalize' }}>{sub.plan}</td>
                <td style={{ padding: '10px 0', color: sub.status === 'active' ? '#10b981' : '#f59e0b', textTransform: 'capitalize' }}>{sub.status}</td>
                <td style={{ padding: '10px 0', color: 'var(--t2)' }}>{sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '10px 0', color: 'var(--t2)' }}>{sub.current_period_end   ? new Date(sub.current_period_end).toLocaleDateString()   : '—'}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading…</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 12 }}>Full payment history will appear here after your first transaction.</div>
      </Section>

      <Section title="Data Export">
        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14 }}>Download all your invoices as a CSV file.</div>
        <button onClick={exportCSV} style={{
          background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8,
          padding: '9px 18px', fontSize: 13, fontWeight: 600, color: 'var(--t1)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>⬇ Export Invoices CSV</button>
      </Section>
    </>
  );
}

/* ─── Security ─────────────────────────────────────────────── */
function SecurityTab() {
  const [pwd,     setPwd]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);

  const save = async () => {
    setMsg(null);
    if (pwd.length < 8)         return setMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
    if (pwd !== confirm)        return setMsg({ type: 'error', text: 'Passwords do not match.' });
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) setMsg({ type: 'error', text: error.message });
    else { setMsg({ type: 'ok', text: 'Password updated.' }); setPwd(''); setConfirm(''); }
    setSaving(false);
  };

  return (
    <Section title="Change Password">
      <Field label="New Password">
        <input type="password" className="input" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" />
      </Field>
      <Field label="Confirm New Password">
        <input type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password" />
      </Field>

      {msg && (
        <div style={{ marginBottom: 12, padding: '9px 14px', borderRadius: 8, fontSize: 13,
          background: msg.type === 'ok' ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
          color: msg.type === 'ok' ? '#10b981' : '#ef4444',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)'}`,
        }}>{msg.text}</div>
      )}

      <button onClick={save} disabled={saving} style={{
        background: 'linear-gradient(135deg,var(--purple),var(--primary))',
        border: 'none', borderRadius: 8, padding: '9px 20px',
        fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer',
        fontFamily: 'inherit', opacity: saving ? .7 : 1,
      }}>{saving ? 'Saving…' : 'Update Password'}</button>
    </Section>
  );
}

/* ─── Danger Zone ─────────────────────────────────────────── */
function DangerTab({ user, session }) {
  const [open,    setOpen]    = useState(false);
  const [typed,   setTyped]   = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error,   setError]   = useState(null);

  const confirmed = typed.trim().toLowerCase() === user?.email?.toLowerCase();

  const deleteAccount = async () => {
    setDeleting(true); setError(null);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed'); }
      await supabase.auth.signOut();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <Section title="Danger Zone">
      <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>
        Permanently delete your account and all associated data — invoices, suppliers, integrations, and billing info. This cannot be undone.
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} style={{
          background: 'transparent', border: '1px solid #ef4444', borderRadius: 8,
          padding: '9px 20px', fontSize: 13, fontWeight: 700, color: '#ef4444',
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Delete My Account</button>
      ) : (
        <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#fca5a5', marginBottom: 14 }}>
            Type <strong style={{ color: '#f87171' }}>{user?.email}</strong> to confirm deletion:
          </div>
          <input
            className="input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={user?.email}
            style={{ marginBottom: 14 }}
          />
          {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={deleteAccount} disabled={!confirmed || deleting} style={{
              background: confirmed ? '#ef4444' : 'rgba(239,68,68,.3)',
              border: 'none', borderRadius: 8, padding: '9px 18px',
              fontSize: 13, fontWeight: 700, color: '#fff',
              cursor: confirmed ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}>{deleting ? 'Deleting…' : 'Permanently Delete'}</button>
            <button onClick={() => { setOpen(false); setTyped(''); }} style={{
              background: 'transparent', border: '1px solid var(--bdr)', borderRadius: 8,
              padding: '9px 18px', fontSize: 13, color: 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
          </div>
        </div>
      )}
    </Section>
  );
}

/* ─── Utility ─────────────────────────────────────────────── */
function getInitials(user) {
  const name = user?.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return (user?.email || '?').slice(0, 2).toUpperCase();
}

export { getInitials };
