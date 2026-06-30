import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PLAN_FEATURES } from '../constants/plans';

const PLAN_BADGE = {
  free:       { label: 'FREE',       color: '#94a3b8', bg: 'rgba(100,116,139,.15)', border: 'rgba(100,116,139,.3)',  glow: 'none' },
  basic:      { label: 'BASIC',      color: '#10b981', bg: 'rgba(16,185,129,.12)',  border: 'rgba(16,185,129,.3)',   glow: '0 0 20px rgba(16,185,129,.15)' },
  pro:        { label: 'PRO',        color: '#60a5fa', bg: 'rgba(59,130,246,.12)',  border: 'rgba(59,130,246,.35)',  glow: '0 0 20px rgba(59,130,246,.15)' },
  enterprise: { label: 'ENTERPRISE', color: '#818cf8', bg: 'rgba(99,102,241,.12)',  border: 'rgba(99,102,241,.35)', glow: '0 0 20px rgba(99,102,241,.15)' },
};

const NAV_ITEMS = [
  { id: 'profile',  icon: '👤', label: 'Profile' },
  { id: 'billing',  icon: '💳', label: 'Plan & Billing' },
  { id: 'security', icon: '🔐', label: 'Security' },
  { id: 'danger',   icon: '⚠️', label: 'Danger Zone', red: true },
];

/* ─── Alert box ─────────────────────────────────────────────── */
function Alert({ msg }) {
  if (!msg) return null;
  const ok = msg.type === 'ok';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 16px', borderRadius: 10, fontSize: 13,
      background: ok ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)',
      color: ok ? '#10b981' : '#f87171',
      border: `1px solid ${ok ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'}`,
      marginBottom: 16,
    }}>
      <span>{ok ? '✓' : '✕'}</span>
      {msg.text}
    </div>
  );
}

/* ─── Save button ───────────────────────────────────────────── */
function SaveBtn({ onClick, saving, label = 'Save Changes' }) {
  return (
    <button onClick={onClick} disabled={saving} style={{
      background: 'linear-gradient(135deg,#6366f1,#3b82f6)',
      border: 'none', borderRadius: 10, padding: '10px 22px',
      fontSize: 13, fontWeight: 700, color: '#fff', cursor: saving ? 'default' : 'pointer',
      fontFamily: 'inherit', opacity: saving ? .65 : 1,
      boxShadow: saving ? 'none' : '0 4px 14px rgba(99,102,241,.35)',
      transition: 'all .2s',
    }}>{saving ? 'Saving…' : label}</button>
  );
}

/* ─── Field wrapper ─────────────────────────────────────────── */
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */
export default function SettingsPage({ user, plan, used, limit, remaining, onUpgrade, onBack, invoices, session }) {
  const [tab, setTab] = useState('profile');

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: 'var(--bg)' }}>
      {/* Page header */}
      <div style={{
        borderBottom: '1px solid var(--bdr)',
        background: 'rgba(10,14,26,.6)',
        padding: '20px 32px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: '1px solid var(--bdr)', borderRadius: 8,
          color: 'var(--t3)', cursor: 'pointer', padding: '6px 13px',
          fontSize: 13, fontFamily: 'inherit', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bdr2)'; e.currentTarget.style.color = 'var(--t1)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bdr)';  e.currentTarget.style.color = 'var(--t3)'; }}
        >
          ← Back
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>Account Settings</h1>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{user?.email}</div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', maxWidth: 960, margin: '0 auto', padding: '32px 24px', gap: 28, alignItems: 'flex-start' }}>

        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0, position: 'sticky', top: 88 }}>
          {/* Avatar card */}
          <div style={{
            background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 14,
            padding: '20px 16px', marginBottom: 8, textAlign: 'center',
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'linear-gradient(135deg,#6366f1,#3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 auto 10px',
              boxShadow: '0 4px 16px rgba(99,102,241,.4)',
            }}>{getInitials(user)}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email}
            </div>
            {plan && (() => {
              const b = PLAN_BADGE[plan] || PLAN_BADGE.free;
              return (
                <span style={{
                  display: 'inline-block', marginTop: 10,
                  fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
                  padding: '3px 9px', borderRadius: 20,
                  background: b.bg, color: b.color, border: `1px solid ${b.border}`,
                }}>{b.label}</span>
              );
            })()}
          </div>

          {/* Nav */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setTab(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 9, border: 'none',
                background: tab === item.id ? (item.red ? 'rgba(239,68,68,.1)' : 'rgba(99,102,241,.12)') : 'transparent',
                color: tab === item.id ? (item.red ? '#f87171' : '#a78bfa') : (item.red ? '#ef4444' : 'var(--t2)'),
                fontWeight: tab === item.id ? 700 : 500,
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left', transition: 'all .15s',
                borderLeft: tab === item.id ? `2px solid ${item.red ? '#ef4444' : '#6366f1'}` : '2px solid transparent',
              }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

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

/* ─── Profile ─────────────────────────────────────────────── */
function ProfileTab({ user }) {
  const [name,   setName]   = useState(user?.user_metadata?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState(null);

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setMsg(error ? { type: 'error', text: error.message } : { type: 'ok', text: 'Profile updated successfully.' });
    setSaving(false);
  };

  return (
    <div>
      <SectionHeader icon="👤" title="Profile Information" desc="Manage your display name and account details." />

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--bdr)' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg,#6366f1,#3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 800, color: '#fff',
            boxShadow: '0 8px 24px rgba(99,102,241,.4)',
          }}>{getInitials(user)}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--t1)', marginBottom: 3 }}>
              {name || user?.email?.split('@')[0]}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>{user?.email}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 6, padding: '3px 8px', background: 'var(--surf2)', borderRadius: 6, display: 'inline-block' }}>
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
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.2)', padding: '2px 8px', borderRadius: 20 }}>Verified</span>
          </div>
        </Field>

        <Alert msg={msg} />
        <SaveBtn onClick={save} saving={saving} />
      </Card>
    </div>
  );
}

/* ─── Billing ──────────────────────────────────────────────── */
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

  const planFeatures = PLAN_FEATURES;

  return (
    <div>
      <SectionHeader icon="💳" title="Plan & Billing" desc="Manage your subscription, usage, and data." />

      {/* Plan card */}
      <div style={{
        background: `linear-gradient(135deg, ${badge.bg}, rgba(0,0,0,0))`,
        border: `1px solid ${badge.border}`,
        borderRadius: 16, padding: '24px 24px', marginBottom: 16,
        boxShadow: badge.glow,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 120, height: 120, borderRadius: '50%',
          background: badge.bg, filter: 'blur(30px)', pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', padding: '4px 10px', borderRadius: 20, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>
              {sub?.status === 'active' && <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />Active</span>}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(planFeatures[plan] || planFeatures.free).map(f => (
                <li key={f} style={{ fontSize: 13, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: badge.color, fontSize: 12 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            {sub?.current_period_end && (
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 14 }}>
                Renews on <strong style={{ color: 'var(--t2)' }}>{new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
              </div>
            )}
          </div>
          {plan !== 'enterprise' && (
            <button onClick={onUpgrade} style={{
              background: 'linear-gradient(135deg,#6366f1,#3b82f6)',
              border: 'none', borderRadius: 10, padding: '9px 18px',
              fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
              boxShadow: '0 4px 14px rgba(99,102,241,.35)',
            }}>Upgrade ↑</button>
          )}
        </div>
      </div>

      {/* Usage */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>Monthly usage</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: barW >= 100 ? '#ef4444' : barW >= 80 ? '#f59e0b' : 'var(--t1)' }}>{used}</span>
            <span style={{ color: 'var(--t3)' }}> / {limit === Infinity ? '∞' : limit}</span>
          </span>
        </div>
        {limit !== Infinity ? (
          <>
            <div style={{ height: 8, background: 'var(--surf2)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{
                height: '100%', width: `${barW}%`, borderRadius: 4, transition: 'width .5s',
                background: barW >= 100 ? 'linear-gradient(90deg,#dc2626,#ef4444)' : barW >= 80 ? 'linear-gradient(90deg,#d97706,#f59e0b)' : 'linear-gradient(90deg,#6366f1,#3b82f6)',
              }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>
              {remaining > 0 ? `${remaining} invoices remaining this month` : 'Monthly limit reached — upgrade to continue uploading'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#10b981' }}>Unlimited invoices on your plan ✓</div>
        )}
      </Card>

      {/* Billing history */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 14 }}>Billing History</div>
        {sub ? (
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--bdr)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', background: 'var(--surf2)', padding: '9px 16px' }}>
              {['Plan', 'Status', 'Start', 'End'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '12px 16px', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{sub.plan}</span>
              <span style={{ fontSize: 12, color: sub.status === 'active' ? '#10b981' : '#f59e0b', fontWeight: 600, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sub.status === 'active' ? '#10b981' : '#f59e0b', display: 'inline-block' }} />{sub.status}
              </span>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>{sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : '—'}</span>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>{sub.current_period_end   ? new Date(sub.current_period_end).toLocaleDateString()   : '—'}</span>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--t3)', fontSize: 13, padding: '8px 0' }}>Loading…</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ℹ</span> Full payment receipts will appear here after your first transaction.
        </div>
      </Card>

      {/* Export */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>Export Your Data</div>
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>{(invoices || []).length} invoices ready to export</div>
          </div>
          <button onClick={exportCSV} style={{
            background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 10,
            padding: '9px 18px', fontSize: 13, fontWeight: 600, color: 'var(--t1)',
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7,
            transition: 'all .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--bdr2)'}
          >
            ⬇ Download CSV
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ─── Security ─────────────────────────────────────────────── */
function SecurityTab() {
  const [pwd,     setPwd]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState(null);
  const [showPwd, setShowPwd] = useState(false);

  const strength = pwd.length === 0 ? 0 : pwd.length < 8 ? 1 : pwd.length < 12 ? 2 : 3;
  const strengthLabel = ['', 'Weak', 'Good', 'Strong'];
  const strengthColor = ['', '#ef4444', '#f59e0b', '#10b981'];

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
    <div>
      <SectionHeader icon="🔐" title="Security" desc="Keep your account safe with a strong password." />
      <Card>
        <Field label="New Password">
          <div style={{ position: 'relative' }}>
            <input type={showPwd ? 'text' : 'password'} className="input" value={pwd}
              onChange={e => setPwd(e.target.value)} placeholder="Min. 8 characters"
              autoComplete="new-password" style={{ paddingRight: 44 }} />
            <button onClick={() => setShowPwd(v => !v)} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 14,
            }}>{showPwd ? '🙈' : '👁'}</button>
          </div>
          {strength > 0 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 8 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, transition: 'background .3s',
                  background: i <= strength ? strengthColor[strength] : 'var(--surf2)' }} />
              ))}
              <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor[strength], marginLeft: 6, minWidth: 40 }}>{strengthLabel[strength]}</span>
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

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Login method</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>✉️</span> Email & Password
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.2)', padding: '2px 8px', borderRadius: 20 }}>Active</span>
        </div>
      </Card>
    </div>
  );
}

/* ─── Danger Zone ─────────────────────────────────────────── */
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
      <SectionHeader icon="⚠️" title="Danger Zone" desc="Irreversible actions — proceed with caution." red />

      <div style={{ background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>Delete Account</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.5 }}>
              Permanently removes your account, all invoices, suppliers, integrations, and billing data. This cannot be undone.
            </div>
          </div>
          {!open && (
            <button onClick={() => setOpen(true)} style={{
              background: 'transparent', border: '1px solid rgba(239,68,68,.5)', borderRadius: 9,
              padding: '9px 18px', fontSize: 13, fontWeight: 700, color: '#ef4444',
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'all .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >Delete Account</button>
          )}
        </div>

        {open && (
          <div style={{ padding: '0 24px 24px', borderTop: '1px solid rgba(239,68,68,.15)' }}>
            <div style={{ paddingTop: 20, fontSize: 13, color: '#fca5a5', lineHeight: 1.6, marginBottom: 14 }}>
              This will permanently delete everything. Type <strong style={{ color: '#f87171', background: 'rgba(239,68,68,.1)', padding: '1px 6px', borderRadius: 4 }}>{user?.email}</strong> to confirm:
            </div>
            <input
              className="input" value={typed} onChange={e => setTyped(e.target.value)}
              placeholder={user?.email}
              style={{ marginBottom: 14, borderColor: typed && !confirmed ? 'rgba(239,68,68,.4)' : '' }}
            />
            {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>⚠ {error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={deleteAccount} disabled={!confirmed || deleting} style={{
                background: confirmed ? 'linear-gradient(135deg,#dc2626,#ef4444)' : 'rgba(239,68,68,.2)',
                border: 'none', borderRadius: 9, padding: '10px 20px',
                fontSize: 13, fontWeight: 700, color: confirmed ? '#fff' : 'rgba(239,68,68,.5)',
                cursor: confirmed && !deleting ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                boxShadow: confirmed ? '0 4px 14px rgba(239,68,68,.3)' : 'none',
                transition: 'all .2s',
              }}>{deleting ? 'Deleting…' : 'Permanently Delete'}</button>
              <button onClick={() => { setOpen(false); setTyped(''); }} style={{
                background: 'transparent', border: '1px solid var(--bdr)', borderRadius: 9,
                padding: '10px 18px', fontSize: 13, color: 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Shared layout components ──────────────────────────────── */
function SectionHeader({ icon, title, desc, red }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: red ? '#f87171' : 'var(--t1)' }}>{title}</h2>
      </div>
      <div style={{ fontSize: 13, color: 'var(--t3)', paddingLeft: 28 }}>{desc}</div>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 14,
      padding: '20px 24px', marginBottom: 0, ...style,
    }}>
      {children}
    </div>
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
