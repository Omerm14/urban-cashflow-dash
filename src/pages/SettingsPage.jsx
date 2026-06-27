import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const PLAN_META = {
  free:       { label: 'FREE',       color: '#94a3b8', bg: 'rgba(100,116,139,.15)', border: 'rgba(100,116,139,.3)',  glow: 'none',                            features: ['20 invoices / month','Manual upload + OCR','1 sync source','Dashboard & calendar'] },
  basic:      { label: 'BASIC',      color: '#10b981', bg: 'rgba(16,185,129,.12)',  border: 'rgba(16,185,129,.3)',   glow: '0 0 28px rgba(16,185,129,.12)',   features: ['50 invoices / month','2 sync sources','Email support','All core features'] },
  pro:        { label: 'PRO',        color: '#60a5fa', bg: 'rgba(59,130,246,.12)',  border: 'rgba(59,130,246,.35)', glow: '0 0 28px rgba(59,130,246,.12)',   features: ['150 invoices / month','All 4 sources','Auto-sync','Full audit trail','Priority support'] },
  enterprise: { label: 'ENTERPRISE', color: '#818cf8', bg: 'rgba(99,102,241,.12)',  border: 'rgba(99,102,241,.35)', glow: '0 0 28px rgba(99,102,241,.12)',   features: ['Unlimited invoices','All 4 sources','Auto-sync','Dedicated onboarding','Custom SLA'] },
};

const NAV = [
  { id: 'profile',  icon: '👤', label: 'Profile' },
  { id: 'billing',  icon: '💳', label: 'Plan & Billing' },
  { id: 'security', icon: '🔐', label: 'Security' },
  { id: 'danger',   icon: '⚠️', label: 'Danger Zone', danger: true },
];

export default function SettingsPage({ user, plan, used, limit, remaining, onUpgrade, onBack, invoices, session }) {
  const [tab,  setTab]  = useState('profile');
  const [name, setName] = useState(user?.user_metadata?.full_name || '');
  const meta = PLAN_META[plan] || PLAN_META.free;

  return (
    <div>
      {/* Full-width header bar */}
      <div style={{
        background: 'rgba(10,14,26,.7)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--bdr)',
        padding: '0 32px', height: 56,
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
          ← Back
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--bdr2)' }} />
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.01em' }}>Account Settings</span>
        <span style={{ fontSize: 13, color: 'var(--t3)', marginLeft: 4 }}>{user?.email}</span>
      </div>

      {/* Shell: sidebar + content */}
      <div className="settings-shell">

        {/* Sidebar */}
        <div className="settings-sidebar">
          {/* Identity card */}
          <div className="card" style={{ padding: '20px 16px', textAlign: 'center', marginBottom: 4 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg,#6366f1,#3b82f6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 800, color: '#fff',
              margin: '0 auto 12px',
              boxShadow: '0 6px 20px rgba(99,102,241,.4)',
            }}>{getInitials(user, name)}</div>

            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name || user?.email?.split('@')[0]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 12 }}>
              {user?.email}
            </div>

            <span style={{
              display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '.09em',
              padding: '3px 10px', borderRadius: 20,
              background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
            }}>{meta.label}</span>

            {plan !== 'enterprise' && (
              <button onClick={onUpgrade} style={{
                display: 'block', width: '100%', marginTop: 10,
                background: 'none', border: 'none', fontSize: 12,
                color: '#818cf8', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              }}>Upgrade plan ↑</button>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--bdr)', margin: '4px 0' }} />

          {/* Nav items */}
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`settings-nav-item${tab === item.id ? ' active' : ''}${item.danger ? ' danger' : ''}`}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          {tab === 'profile'  && <ProfileTab  user={user} name={name} setName={setName} />}
          {tab === 'billing'  && <BillingTab  plan={plan} used={used} limit={limit} remaining={remaining} onUpgrade={onUpgrade} invoices={invoices} meta={meta} />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'danger'   && <DangerTab   user={user} session={session} />}
        </div>
      </div>
    </div>
  );
}

/* ─── Shared helpers ──────────────────────────────────────── */
function SectionTitle({ icon, title, sub }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{title}</h2>
      </div>
      {sub && <div style={{ fontSize: 13, color: 'var(--t3)', marginLeft: 30 }}>{sub}</div>}
    </div>
  );
}

function Lbl({ children }) {
  return <label className="lbl">{children}</label>;
}

function Feedback({ msg }) {
  if (!msg) return null;
  const ok = msg.type === 'ok';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px', borderRadius: 9, fontSize: 13, marginBottom: 16,
      background: ok ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)',
      color: ok ? '#10b981' : '#f87171',
      border: `1px solid ${ok ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'}`,
    }}>
      <span>{ok ? '✓' : '✕'}</span>{msg.text}
    </div>
  );
}

/* ─── Profile ─────────────────────────────────────────────── */
function ProfileTab({ user, name, setName }) {
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState(null);

  const save = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setMsg(error ? { type: 'error', text: error.message } : { type: 'ok', text: 'Profile updated.' });
    setSaving(false);
  };

  return (
    <>
      <SectionTitle icon="👤" title="Profile" sub="Your public name and account information." />

      {/* Hero */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16, padding: '20px 24px' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#6366f1,#3b82f6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 800, color: '#fff',
          boxShadow: '0 8px 24px rgba(99,102,241,.4)',
        }}>{getInitials(user, name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>{name || user?.email?.split('@')[0]}</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 8 }}>{user?.email}</div>
          <div style={{
            display: 'inline-block', fontSize: 11, color: 'var(--t3)',
            background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 6,
            padding: '2px 10px',
          }}>
            Member since {new Date(user?.created_at || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ marginBottom: 18 }}>
          <Lbl>Display Name</Lbl>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>Shown in reports and notifications.</div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <Lbl>Email Address</Lbl>
          <div style={{ position: 'relative' }}>
            <input className="input" value={user?.email || ''} readOnly style={{ opacity: .55, cursor: 'not-allowed', paddingRight: 90 }} />
            <span style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, fontWeight: 700, color: '#10b981',
              background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.2)',
              padding: '2px 9px', borderRadius: 20,
            }}>Verified</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>Contact support to change your email.</div>
        </div>

        <Feedback msg={msg} />
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ opacity: saving ? .65 : 1 }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}

/* ─── Billing ──────────────────────────────────────────────── */
function BillingTab({ plan, used, limit, remaining, onUpgrade, invoices, meta }) {
  const [sub, setSub] = useState(null);
  const pct  = limit === Infinity ? 0 : used / limit;
  const barW = Math.min(100, Math.round(pct * 100));
  const barColor = barW >= 100 ? 'linear-gradient(90deg,#dc2626,#ef4444)' : barW >= 80 ? 'linear-gradient(90deg,#d97706,#f59e0b)' : 'linear-gradient(90deg,#6366f1,#3b82f6)';

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
      <SectionTitle icon="💳" title="Plan & Billing" sub="Your subscription, usage, and data export." />

      {/* Plan hero card */}
      <div style={{
        background: `linear-gradient(135deg, ${meta.bg}, rgba(0,0,0,0))`,
        border: `1px solid ${meta.border}`,
        borderRadius: 'var(--r)', padding: '22px 24px', marginBottom: 14,
        boxShadow: meta.glow, position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative glow blob */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: meta.bg, filter: 'blur(40px)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', padding: '4px 11px', borderRadius: 20, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>{meta.label}</span>
            {sub?.status === 'active' && (
              <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />Active
              </span>
            )}
            {sub?.current_period_end && (
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>
                · Renews {new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
          {plan !== 'enterprise' && (
            <button onClick={onUpgrade} className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>Upgrade ↑</button>
          )}
        </div>

        {/* Feature list */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: 20 }}>
          {meta.features.map(f => (
            <span key={f} style={{ fontSize: 12, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: meta.color, fontSize: 11, fontWeight: 700 }}>✓</span>{f}
            </span>
          ))}
        </div>

        {/* Usage bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 12 }}>
            <span style={{ color: 'var(--t3)', fontWeight: 600 }}>Monthly usage</span>
            <span>
              <strong style={{ color: barW >= 100 ? '#ef4444' : barW >= 80 ? '#f59e0b' : 'var(--t1)' }}>{used}</strong>
              <span style={{ color: 'var(--t3)' }}> / {limit === Infinity ? '∞' : limit} invoices</span>
            </span>
          </div>
          {limit !== Infinity ? (
            <>
              <div className="prog-track" style={{ marginBottom: 6 }}>
                <div className="prog-fill" style={{ width: `${barW}%`, background: barColor }} />
              </div>
              <div style={{ fontSize: 11, color: remaining === 0 ? '#f87171' : 'var(--t3)' }}>
                {remaining > 0 ? `${remaining} invoices remaining this month` : 'Limit reached — upgrade to keep uploading'}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#10b981' }}>✓ Unlimited invoices on your plan</div>
          )}
        </div>
      </div>

      {/* Billing history */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Billing History</div>
        {sub ? (
          <>
            <div style={{ borderRadius: 9, overflow: 'hidden', border: '1px solid var(--bdr)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', background: 'var(--surf2)', padding: '9px 16px' }}>
                {['Plan','Status','Start','End'].map(h => (
                  <span key={h} className="lbl" style={{ margin: 0 }}>{h}</span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', padding: '13px 16px', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{sub.plan}</span>
                <span style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, color: sub.status === 'active' ? '#10b981' : '#f59e0b', textTransform: 'capitalize' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: sub.status === 'active' ? '#10b981' : '#f59e0b', display: 'inline-block' }} />{sub.status}
                </span>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>{sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>{sub.current_period_end   ? new Date(sub.current_period_end).toLocaleDateString()   : '—'}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              ℹ Full payment receipts appear here after your first transaction.
            </div>
          </>
        ) : (
          <div className="shimmer" style={{ height: 60, borderRadius: 9 }} />
        )}
      </div>

      {/* Data export */}
      <div className="card" style={{ padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Export Your Data</div>
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>{(invoices || []).length} invoices ready to download</div>
          </div>
          <button onClick={exportCSV} className="btn btn-ghost" style={{ gap: 6, flexShrink: 0 }}>
            ⬇ Download CSV
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Security ─────────────────────────────────────────────── */
function SecurityTab() {
  const [pwd,     setPwd]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [msg,     setMsg]     = useState(null);

  const strength = pwd.length === 0 ? 0 : pwd.length < 8 ? 1 : pwd.length < 12 ? 2 : 3;
  const sLabel = ['', 'Weak', 'Good', 'Strong'];
  const sColor = ['', '#ef4444', '#f59e0b', '#10b981'];

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
    <>
      <SectionTitle icon="🔐" title="Security" sub="Keep your account protected with a strong password." />

      <div className="card" style={{ padding: '24px', marginBottom: 14 }}>
        <div style={{ marginBottom: 18 }}>
          <Lbl>New Password</Lbl>
          <div style={{ position: 'relative' }}>
            <input type={showPwd ? 'text' : 'password'} className="input" value={pwd}
              onChange={e => setPwd(e.target.value)} placeholder="Min. 8 characters"
              autoComplete="new-password" style={{ paddingRight: 44 }} />
            <button onClick={() => setShowPwd(v => !v)} style={{
              position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 15, lineHeight: 1,
            }}>{showPwd ? '🙈' : '👁'}</button>
          </div>
          {strength > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, transition: 'background .25s', background: i <= strength ? sColor[strength] : 'var(--bdr2)' }} />
              ))}
              <span style={{ fontSize: 11, fontWeight: 700, color: sColor[strength], minWidth: 38, textAlign: 'right' }}>{sLabel[strength]}</span>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <Lbl>Confirm New Password</Lbl>
          <div style={{ position: 'relative' }}>
            <input type={showPwd ? 'text' : 'password'} className="input" value={confirm}
              onChange={e => setConfirm(e.target.value)} placeholder="Repeat password"
              autoComplete="new-password"
              style={{ paddingRight: 44, borderColor: confirm && confirm !== pwd ? 'rgba(239,68,68,.4)' : '' }} />
            {confirm && (
              <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15 }}>
                {confirm === pwd ? '✅' : '❌'}
              </span>
            )}
          </div>
        </div>

        <Feedback msg={msg} />
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ opacity: saving ? .65 : 1 }}>
          {saving ? 'Saving…' : 'Update Password'}
        </button>
      </div>

      <div className="card" style={{ padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>Login Method</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span>✉️</span> Email & Password
            </div>
          </div>
          <span className="badge badge-connected">Active</span>
        </div>
      </div>
    </>
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
    <>
      <SectionTitle icon="⚠️" title="Danger Zone" sub="Permanent, irreversible account actions." red />

      <div style={{
        background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.2)',
        borderRadius: 'var(--r)', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>Delete Account</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.6, maxWidth: 400 }}>
              Permanently deletes your account, all invoices, suppliers, integrations, and billing data. <strong style={{ color: '#f87171' }}>This cannot be undone.</strong>
            </div>
          </div>
          {!open && (
            <button onClick={() => setOpen(true)} className="btn btn-danger" style={{ flexShrink: 0 }}>
              Delete Account
            </button>
          )}
        </div>

        {open && (
          <div style={{ padding: '0 24px 24px', borderTop: '1px solid rgba(239,68,68,.15)' }}>
            <div style={{ paddingTop: 20, fontSize: 13, color: '#fca5a5', lineHeight: 1.7, marginBottom: 14 }}>
              To confirm, type <strong style={{ color: '#f87171', fontFamily: 'monospace', background: 'rgba(239,68,68,.1)', padding: '1px 6px', borderRadius: 4 }}>{user?.email}</strong> below:
            </div>
            <input className="input" value={typed} onChange={e => setTyped(e.target.value)}
              placeholder={user?.email}
              style={{ marginBottom: 14, borderColor: typed && !confirmed ? 'rgba(239,68,68,.5)' : '' }}
            />
            {error && (
              <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>⚠ {error}</div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={deleteAccount} disabled={!confirmed || deleting} style={{
                background: confirmed ? 'linear-gradient(135deg,#dc2626,#ef4444)' : 'rgba(239,68,68,.15)',
                border: 'none', borderRadius: 9, padding: '9px 20px',
                fontSize: 13, fontWeight: 700,
                color: confirmed ? '#fff' : 'rgba(239,68,68,.4)',
                cursor: confirmed && !deleting ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: 'all .2s',
                boxShadow: confirmed ? '0 4px 14px rgba(239,68,68,.3)' : 'none',
              }}>{deleting ? 'Deleting…' : 'Permanently Delete'}</button>
              <button onClick={() => { setOpen(false); setTyped(''); }} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Utility ─────────────────────────────────────────────── */
export function getInitials(user, nameOverride) {
  const name = nameOverride || user?.user_metadata?.full_name;
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return (user?.email || '?').slice(0, 2).toUpperCase();
}
