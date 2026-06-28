import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SANS = "'IBM Plex Sans', system-ui, sans-serif";

const PLAN_BADGE = {
  free:       { label: 'FREE',       color: '#94a3b8', bg: 'rgba(100,116,139,.15)', border: 'rgba(100,116,139,.3)'  },
  basic:      { label: 'BASIC',      color: '#22C55E', bg: 'rgba(34,197,94,.12)',   border: 'rgba(34,197,94,.3)'    },
  pro:        { label: 'PRO',        color: '#818CF8', bg: 'rgba(99,102,241,.12)',   border: 'rgba(99,102,241,.35)'  },
  enterprise: { label: 'ENTERPRISE', color: '#818CF8', bg: 'rgba(99,102,241,.12)',   border: 'rgba(99,102,241,.35)'  },
};

const NAV_ITEMS = [
  { id: 'profile',  label: 'Profile' },
  { id: 'billing',  label: 'Plan & Billing' },
  { id: 'security', label: 'Security' },
  { id: 'danger',   label: 'Danger Zone', red: true },
];

function Alert({ msg }) {
  if (!msg) return null;
  const ok = msg.type === 'ok';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 16px', borderRadius: 8, fontSize: 13, fontFamily: SANS,
      background: ok ? 'rgba(34,197,94,.10)' : 'rgba(239,68,68,.12)',
      color: ok ? '#22C55E' : '#F87171',
      border: `1px solid ${ok ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
      marginBottom: 16,
    }}>
      {msg.text}
    </div>
  );
}

function SaveBtn({ onClick, saving, label = 'Save Changes' }) {
  return (
    <button onClick={onClick} disabled={saving} style={{
      background: '#6366F1', border: 'none', borderRadius: 8, padding: '10px 22px',
      fontSize: 13, fontWeight: 600, color: '#fff', cursor: saving ? 'default' : 'pointer',
      fontFamily: SANS, opacity: saving ? .65 : 1,
      boxShadow: saving ? 'none' : '0 4px 14px rgba(99,102,241,.35)',
    }}>{saving ? 'Saving…' : label}</button>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7, fontFamily: SANS }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5, lineHeight: 1.5, fontFamily: SANS }}>{hint}</div>}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 12,
      padding: '20px 24px', ...style,
    }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, desc, red }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: red ? '#F87171' : 'var(--t1)', fontFamily: SANS, letterSpacing: '-0.02em' }}>{title}</h2>
      <div style={{ fontSize: 13, color: 'var(--t3)', fontFamily: SANS }}>{desc}</div>
    </div>
  );
}

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

export default function SettingsPage({ user, plan, used, limit, remaining, onUpgrade, onBack, invoices, session }) {
  const [tab, setTab] = useState('profile');
  const isMobile = window.innerWidth <= 640;

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', fontFamily: SANS }}>
      {/* Two-column layout */}
      <div style={{ display: 'flex', maxWidth: 960, margin: '0 auto', padding: isMobile ? '20px 16px' : '32px 24px', gap: 24, alignItems: 'flex-start' }}>

        {/* Left nav */}
        {!isMobile ? (
          <div style={{ width: 200, flexShrink: 0, position: 'sticky', top: 72 }}>
            <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 12, padding: '16px 12px', marginBottom: 8, textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#6366F1,#818CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 auto 10px', boxShadow: '0 4px 16px rgba(99,102,241,.35)', fontFamily: SANS }}>{getInitials(user)}</div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: SANS }}>
                {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, fontFamily: SANS }}>{user?.email}</div>
              {plan && (() => {
                const b = PLAN_BADGE[plan] || PLAN_BADGE.free;
                return <span style={{ display: 'inline-block', marginTop: 8, fontSize: 10, fontWeight: 700, letterSpacing: '.08em', padding: '3px 9px', borderRadius: 20, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontFamily: SANS }}>{b.label}</span>;
              })()}
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {NAV_ITEMS.map(item => (
                <button key={item.id} onClick={() => setTab(item.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none',
                  background: tab === item.id ? (item.red ? 'rgba(239,68,68,.10)' : 'rgba(99,102,241,.10)') : 'transparent',
                  color: tab === item.id ? (item.red ? '#F87171' : '#A5B4FC') : (item.red ? 'rgba(239,68,68,.7)' : 'var(--t2)'),
                  fontWeight: tab === item.id ? 600 : 400,
                  fontSize: 13, cursor: 'pointer', fontFamily: SANS, textAlign: 'left',
                  boxShadow: tab === item.id ? `inset 3px 0 0 ${item.red ? '#EF4444' : '#6366F1'}` : 'none',
                }}>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', marginBottom: 16, width: '100%', display: 'flex', gap: 6, paddingBottom: 4 }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setTab(item.id)} style={{
                display: 'inline-flex', padding: '6px 14px', borderRadius: 20, border: `1px solid ${tab === item.id ? (item.red ? 'rgba(239,68,68,.4)' : 'rgba(99,102,241,.4)') : 'var(--bdr)'}`,
                background: tab === item.id ? (item.red ? 'rgba(239,68,68,.10)' : 'rgba(99,102,241,.10)') : 'transparent',
                color: tab === item.id ? (item.red ? '#F87171' : '#A5B4FC') : 'var(--t2)',
                fontSize: 13, fontWeight: tab === item.id ? 600 : 400, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {tab === 'profile'  && <ProfileTab user={user} />}
          {tab === 'billing'  && <BillingTab plan={plan} used={used} limit={limit} remaining={remaining} onUpgrade={onUpgrade} invoices={invoices} />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'danger'   && <DangerTab user={user} session={session} />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ user }) {
  const [name,   setName]   = useState(user?.user_metadata?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState(null);

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setMsg(error ? { type: 'error', text: error.message } : { type: 'ok', text: 'Profile updated.' });
    setSaving(false);
  };

  return (
    <div>
      <SectionHeader title="Profile Information" desc="Manage your display name and account details." />
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--bdr)' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#6366F1,#818CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,.35)', fontFamily: SANS }}>{getInitials(user)}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--t1)', marginBottom: 3, fontFamily: SANS }}>{name || user?.email?.split('@')[0]}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', fontFamily: SANS }}>{user?.email}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6, padding: '2px 8px', background: 'var(--surf2)', borderRadius: 6, display: 'inline-block', fontFamily: SANS }}>
              Member since {new Date(user?.created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        <Field label="Display Name" hint="This name appears in your account and reports.">
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
        </Field>

        <Field label="Email Address" hint="To change your email address, contact support.">
          <div style={{ position: 'relative' }}>
            <input className="input" value={user?.email || ''} readOnly style={{ opacity: .55, cursor: 'not-allowed', paddingRight: 80 }} />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 600, color: '#22C55E', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.20)', padding: '2px 8px', borderRadius: 20, fontFamily: SANS }}>Verified</span>
          </div>
        </Field>

        <Alert msg={msg} />
        <SaveBtn onClick={save} saving={saving} />
      </Card>
    </div>
  );
}

function BillingTab({ plan, used, limit, remaining, onUpgrade, invoices }) {
  const badge = PLAN_BADGE[plan] || PLAN_BADGE.free;
  const pct   = limit === Infinity ? 0 : used / limit;
  const barW  = Math.min(100, Math.round(pct * 100));
  const [sub,  setSub] = useState(null);

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

  const planFeatures = {
    free:       ['20 invoices / month', '1 sync source', 'Manual upload + OCR'],
    basic:      ['50 invoices / month', '2 sync sources', 'Email support'],
    pro:        ['150 invoices / month', 'All 4 sources', 'Auto-sync', 'Priority support'],
    enterprise: ['Unlimited invoices', 'All 4 sources', 'Dedicated onboarding', 'Custom SLA'],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionHeader title="Plan & Billing" desc="Manage your subscription, usage, and data." />

      {/* Plan card */}
      <div style={{ background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 12, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', padding: '3px 10px', borderRadius: 20, background: 'rgba(0,0,0,.2)', color: badge.color, border: `1px solid ${badge.border}`, fontFamily: SANS }}>{badge.label} PLAN</span>
              {sub?.status === 'active' && <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600, fontFamily: SANS }}>● Active</span>}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(planFeatures[plan] || planFeatures.free).map(f => (
                <li key={f} style={{ fontSize: 13, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS }}>
                  <span style={{ color: badge.color }}>✓</span>{f}
                </li>
              ))}
            </ul>
            {sub?.current_period_end && (
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 14, fontFamily: SANS }}>
                Renews on <strong style={{ color: 'var(--t2)' }}>{new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
              </div>
            )}
          </div>
          {plan !== 'enterprise' && (
            <button onClick={onUpgrade} style={{ background: '#6366F1', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 4px 14px rgba(99,102,241,.35)' }}>Upgrade ↑</button>
          )}
        </div>
      </div>

      {/* Usage */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)', fontFamily: SANS }}>Monthly usage</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: SANS }}>
            <span style={{ color: barW >= 100 ? '#EF4444' : barW >= 80 ? '#F59E0B' : 'var(--t1)' }}>{used}</span>
            <span style={{ color: 'var(--t3)' }}> / {limit === Infinity ? '∞' : limit}</span>
          </span>
        </div>
        {limit !== Infinity ? (
          <>
            <div style={{ height: 6, background: 'var(--surf2)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${barW}%`, borderRadius: 4, transition: 'width .5s', background: barW >= 100 ? '#EF4444' : barW >= 80 ? '#F59E0B' : '#6366F1' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', fontFamily: SANS }}>
              {remaining > 0 ? `${remaining} invoices remaining this month` : 'Monthly limit reached — upgrade to continue'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#22C55E', fontFamily: SANS }}>Unlimited invoices on your plan ✓</div>
        )}
      </Card>

      {/* Billing history */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 14, fontFamily: SANS }}>Billing History</div>
        {sub ? (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--bdr)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', background: 'var(--surf2)', padding: '9px 16px' }}>
              {['Plan', 'Status', 'Start', 'End'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: SANS }}>{h}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '12px 16px', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize', fontFamily: SANS }}>{sub.plan}</span>
              <span style={{ fontSize: 12, color: sub.status === 'active' ? '#22C55E' : '#F59E0B', fontWeight: 600, textTransform: 'capitalize', fontFamily: SANS }}>● {sub.status}</span>
              <span style={{ fontSize: 12, color: 'var(--t2)', fontFamily: SANS }}>{sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : '—'}</span>
              <span style={{ fontSize: 12, color: 'var(--t2)', fontFamily: SANS }}>{sub.current_period_end   ? new Date(sub.current_period_end).toLocaleDateString()   : '—'}</span>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--t3)', fontSize: 13, fontFamily: SANS }}>No active subscription found.</div>
        )}
      </Card>

      {/* Export */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3, fontFamily: SANS, color: 'var(--t1)' }}>Export Your Data</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', fontFamily: SANS }}>{(invoices || []).length} invoices ready to export</div>
          </div>
          <button onClick={exportCSV} style={{ background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, color: 'var(--t1)', cursor: 'pointer', fontFamily: SANS, display: 'flex', alignItems: 'center', gap: 7 }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#6366F1'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--bdr2)'}
          >
            ↓ Download CSV
          </button>
        </div>
      </Card>
    </div>
  );
}

function SecurityTab() {
  const [pwd,     setPwd]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);
  const [showPwd, setShowPwd] = useState(false);

  const strength = pwd.length === 0 ? 0 : pwd.length < 8 ? 1 : pwd.length < 12 ? 2 : 3;
  const strengthLabel = ['', 'Weak', 'Good', 'Strong'];
  const strengthColor = ['', '#EF4444', '#F59E0B', '#22C55E'];

  const save = async () => {
    setMsg(null);
    if (pwd.length < 8)  return setMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
    if (pwd !== confirm) return setMsg({ type: 'error', text: 'Passwords do not match.' });
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) setMsg({ type: 'error', text: error.message });
    else { setMsg({ type: 'ok', text: 'Password updated successfully.' }); setPwd(''); setConfirm(''); }
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionHeader title="Security" desc="Keep your account safe with a strong password." />
      <Card>
        <Field label="New Password">
          <div style={{ position: 'relative' }}>
            <input type={showPwd ? 'text' : 'password'} className="input" value={pwd}
              onChange={e => setPwd(e.target.value)} placeholder="Min. 8 characters"
              autoComplete="new-password" style={{ paddingRight: 44 }} />
            <button onClick={() => setShowPwd(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 14 }}>
              {showPwd ? '🙈' : '👁'}
            </button>
          </div>
          {strength > 0 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= strength ? strengthColor[strength] : 'var(--surf2)' }} />
              ))}
              <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor[strength], marginLeft: 6, minWidth: 40, fontFamily: SANS }}>{strengthLabel[strength]}</span>
            </div>
          )}
        </Field>

        <Field label="Confirm New Password">
          <div style={{ position: 'relative' }}>
            <input type={showPwd ? 'text' : 'password'} className="input" value={confirm}
              onChange={e => setConfirm(e.target.value)} placeholder="Repeat password"
              autoComplete="new-password"
              style={{ paddingRight: 44, borderColor: confirm && confirm !== pwd ? 'rgba(239,68,68,.5)' : '' }} />
            {confirm && (
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>
                {confirm === pwd ? '✅' : '❌'}
              </span>
            )}
          </div>
        </Field>

        <Alert msg={msg} />
        <SaveBtn onClick={save} saving={saving} label="Update Password" />
      </Card>

      <Card>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, fontFamily: SANS, color: 'var(--t1)' }}>Login method</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: SANS }}>
          ✉️ Email &amp; Password
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#22C55E', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.20)', padding: '2px 8px', borderRadius: 20, fontFamily: SANS }}>Active</span>
        </div>
      </Card>
    </div>
  );
}

function DangerTab({ user, session }) {
  const [open,     setOpen]     = useState(false);
  const [typed,    setTyped]    = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState(null);

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
    <div>
      <SectionHeader title="Danger Zone" desc="Irreversible actions — proceed with caution." red />

      <div style={{ background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.20)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 4, fontFamily: SANS }}>Delete Account</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.5, fontFamily: SANS }}>
              Permanently removes your account, all invoices, suppliers, integrations, and billing data. This cannot be undone.
            </div>
          </div>
          {!open && (
            <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,.5)', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: '#EF4444', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.10)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >Delete Account</button>
          )}
        </div>

        {open && (
          <div style={{ padding: '0 24px 24px', borderTop: '1px solid rgba(239,68,68,.15)' }}>
            <div style={{ paddingTop: 20, fontSize: 13, color: '#fca5a5', lineHeight: 1.6, marginBottom: 14, fontFamily: SANS }}>
              Type <strong style={{ color: '#F87171', background: 'rgba(239,68,68,.10)', padding: '1px 6px', borderRadius: 4 }}>{user?.email}</strong> to confirm:
            </div>
            <input className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder={user?.email}
              style={{ marginBottom: 14, borderColor: typed && !confirmed ? 'rgba(239,68,68,.4)' : '' }} />
            {error && <div style={{ color: '#EF4444', fontSize: 13, marginBottom: 12, fontFamily: SANS }}>⚠ {error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={deleteAccount} disabled={!confirmed || deleting} style={{ background: confirmed ? '#EF4444' : 'rgba(239,68,68,.2)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, color: confirmed ? '#fff' : 'rgba(239,68,68,.5)', cursor: confirmed && !deleting ? 'pointer' : 'not-allowed', fontFamily: SANS, boxShadow: confirmed ? '0 4px 14px rgba(239,68,68,.3)' : 'none' }}>
                {deleting ? 'Deleting…' : 'Permanently Delete'}
              </button>
              <button onClick={() => { setOpen(false); setTyped(''); }} style={{ background: 'transparent', border: '1px solid var(--bdr)', borderRadius: 8, padding: '10px 18px', fontSize: 13, color: 'var(--t2)', cursor: 'pointer', fontFamily: SANS }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { getInitials };
