import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const SANS = "'IBM Plex Sans', system-ui, sans-serif";

const PLAN_BADGE = {
  free:       { label: 'FREE',       color: 'var(--t3)',    bg: 'var(--surf2)',      border: 'var(--bdr)'       },
  basic:      { label: 'BASIC',      color: 'var(--green)', bg: 'var(--green-tint)', border: 'var(--green-bdr)' },
  pro:        { label: 'PRO',        color: '#A5B4FC',      bg: 'var(--indigo-tint)',border: 'var(--indigo-bdr)'},
  enterprise: { label: 'ENTERPRISE', color: '#A5B4FC',      bg: 'var(--indigo-tint)',border: 'var(--indigo-bdr)'},
};

const NAV_ITEMS = [
  { id: 'general',    label: 'General',       icon: '⚙️' },
  { id: 'profile',    label: 'Profile',       icon: '👤' },
  { id: 'billing',    label: 'Plan & Billing', icon: '💳' },
  { id: 'integrations', label: 'Integrations', icon: '🔗' },
  { id: 'team',       label: 'Team',          icon: '👥' },
  { id: 'data',       label: 'Data & Export',  icon: '📦' },
  { id: 'danger',     label: 'Danger Zone',   icon: '🗑', red: true },
];

function Alert({ msg }) {
  if (!msg) return null;
  const ok = msg.type === 'ok';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 16px', borderRadius: 8, fontSize: 13, fontFamily: SANS,
      background: ok ? 'var(--green-tint)' : 'var(--red-tint)',
      color: ok ? 'var(--green)' : '#F87171',
      border: `1px solid ${ok ? 'var(--green-bdr)' : 'var(--red-bdr)'}`,
      marginBottom: 16,
    }}>
      {msg.text}
    </div>
  );
}

function SaveBtn({ onClick, saving, label = 'Save Changes' }) {
  return (
    <button onClick={onClick} disabled={saving} style={{
      background: 'var(--indigo)', border: 'none', borderRadius: 8, padding: '10px 22px',
      fontSize: 13, fontWeight: 600, color: '#fff', cursor: saving ? 'default' : 'pointer',
      fontFamily: SANS, opacity: saving ? .65 : 1,
      boxShadow: saving ? 'none' : '0 4px 14px rgba(99,102,241,.35)',
    }}>{saving ? 'Saving…' : label}</button>
  );
}

function Section({ id, title, desc, sectionRef, children }) {
  return (
    <div ref={sectionRef} id={id} style={{ marginBottom: 40, scrollMarginTop: 20 }}>
      <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid var(--bdr)' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--t1)', fontFamily: SANS, letterSpacing: '-0.02em' }}>{title}</h2>
        {desc && <div style={{ fontSize: 13, color: 'var(--t3)', fontFamily: SANS }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, hint, children, isMobile }) {
  if (isMobile) {
    return (
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7, fontFamily: SANS }}>{label}</label>
        {children}
        {hint && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5, fontFamily: SANS }}>{hint}</div>}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, marginBottom: 20, alignItems: 'flex-start' }}>
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--t2)', fontFamily: SANS, paddingTop: 10 }}>{label}</label>
        {hint && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, lineHeight: 1.5, fontFamily: SANS }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 12, padding: '20px 24px', ...style }}>
      {children}
    </div>
  );
}

function getInitials(user) {
  const name = user?.user_metadata?.full_name;
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
  }
  return (user?.email || '?').slice(0, 2).toUpperCase();
}

export default function SettingsPage({ user, plan, used, limit, remaining, onUpgrade, invoices, session }) {
  const [winW, setWinW] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = winW <= 900;

  const [activeSection, setActiveSection] = useState('general');
  const sectionRefs = Object.fromEntries(NAV_ITEMS.map(n => [n.id, useRef()]));

  const scrollTo = id => {
    sectionRefs[id]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(id);
  };

  // IntersectionObserver to track active section on scroll
  const contentRef = useRef();
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.id); });
    }, { threshold: 0.35 });
    NAV_ITEMS.forEach(n => { if (sectionRefs[n.id]?.current) observer.observe(sectionRefs[n.id].current); });
    return () => observer.disconnect();
  }, []);

  const navBtn = (item) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: 'none', width: '100%', textAlign: 'left',
    background: activeSection === item.id ? (item.red ? 'var(--red-tint)' : 'var(--indigo-tint)') : 'transparent',
    color: activeSection === item.id ? (item.red ? '#F87171' : '#A5B4FC') : (item.red ? 'rgba(239,68,68,.65)' : 'var(--t2)'),
    fontWeight: activeSection === item.id ? 600 : 400,
    fontSize: 13, cursor: 'pointer', fontFamily: SANS,
    boxShadow: activeSection === item.id ? `inset 3px 0 0 ${item.red ? 'var(--red)' : 'var(--indigo)'}` : 'none',
    transition: 'all .15s',
  });

  return (
    <div style={{ minHeight: '100%', fontFamily: SANS }}>
      <div style={{ display: 'flex', maxWidth: 960, margin: '0 auto', gap: 28, alignItems: 'flex-start' }}>

        {/* Left nav — sticky desktop / horizontal pills mobile */}
        {isMobile ? (
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', paddingBottom: 12, marginBottom: 8, width: '100%' }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
              {NAV_ITEMS.map(item => (
                <button key={item.id} onClick={() => scrollTo(item.id)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 20, flexShrink: 0,
                  border: `1px solid ${activeSection === item.id ? (item.red ? 'var(--red-bdr)' : 'var(--indigo-bdr)') : 'var(--bdr)'}`,
                  background: activeSection === item.id ? (item.red ? 'var(--red-tint)' : 'var(--indigo-tint)') : 'transparent',
                  color: activeSection === item.id ? (item.red ? '#F87171' : '#A5B4FC') : 'var(--t2)',
                  fontSize: 12, fontWeight: activeSection === item.id ? 600 : 400, cursor: 'pointer', fontFamily: SANS,
                }}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ width: 192, flexShrink: 0, position: 'sticky', top: 20 }}>
            <div style={{ marginBottom: 16, padding: '16px 12px', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 auto 10px', boxShadow: '0 4px 16px rgba(99,102,241,.35)', fontFamily: SANS }}>
                {getInitials(user)}
              </div>
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
                <button key={item.id} onClick={() => scrollTo(item.id)} style={navBtn(item)}>
                  <span style={{ fontSize: 14 }}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Scrollable content */}
        <div ref={contentRef} style={{ flex: 1, minWidth: 0 }}>

          {/* General */}
          <Section id="general" title="General" desc="Basic account and regional settings." sectionRef={sectionRefs.general}>
            <GeneralSection isMobile={isMobile} />
          </Section>

          {/* Profile */}
          <Section id="profile" title="Profile" desc="Manage your display name and account details." sectionRef={sectionRefs.profile}>
            <ProfileSection user={user} isMobile={isMobile} />
          </Section>

          {/* Billing */}
          <Section id="billing" title="Plan & Billing" desc="Manage your subscription, usage, and data." sectionRef={sectionRefs.billing}>
            <BillingSection plan={plan} used={used} limit={limit} remaining={remaining} onUpgrade={onUpgrade} invoices={invoices} isMobile={isMobile} />
          </Section>

          {/* Integrations */}
          <Section id="integrations" title="Integrations" desc="Connect your invoice sources." sectionRef={sectionRefs.integrations}>
            <IntegrationsSection session={session} />
          </Section>

          {/* Team */}
          <Section id="team" title="Team" desc="Invite teammates to collaborate." sectionRef={sectionRefs.team}>
            <TeamSection />
          </Section>

          {/* Data & Export */}
          <Section id="data" title="Data & Export" desc="Download your data or reset the demo." sectionRef={sectionRefs.data}>
            <DataSection invoices={invoices} session={session} />
          </Section>

          {/* Danger Zone */}
          <Section id="danger" title="Danger Zone" desc="Irreversible actions — proceed with caution." sectionRef={sectionRefs.danger}>
            <DangerSection user={user} session={session} />
          </Section>

        </div>
      </div>
    </div>
  );
}

function GeneralSection({ isMobile }) {
  const [currency, setCurrency] = useState(() => localStorage.getItem('currency') || 'ILS');
  const [timezone, setTimezone] = useState(() => localStorage.getItem('timezone') || 'Asia/Jerusalem');
  const [businessName, setBusinessName] = useState(() => localStorage.getItem('businessName') || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const save = async () => {
    setSaving(true);
    localStorage.setItem('currency', currency);
    localStorage.setItem('timezone', timezone);
    localStorage.setItem('businessName', businessName);
    await new Promise(r => setTimeout(r, 400));
    setMsg({ type: 'ok', text: 'Settings saved.' });
    setSaving(false);
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <Card>
      <Row label="Business Name" hint="Shown in exports and reports." isMobile={isMobile}>
        <input className="input" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Your business name" />
      </Row>
      <Row label="Currency" hint="Used across all financial displays." isMobile={isMobile}>
        <select className="input" value={currency} onChange={e => setCurrency(e.target.value)}>
          {[['ILS','₪ Israeli Shekel'],['USD','$ US Dollar'],['EUR','€ Euro'],['GBP','£ British Pound'],['AUD','A$ Australian Dollar']].map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Row>
      <Row label="Timezone" isMobile={isMobile}>
        <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
          {['Asia/Jerusalem','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','America/Chicago','Australia/Sydney'].map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </Row>
      <Alert msg={msg} />
      <SaveBtn onClick={save} saving={saving} />
    </Card>
  );
}

function ProfileSection({ user, isMobile }) {
  const [name, setName] = useState(user?.user_metadata?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState(null);

  const saveName = async () => {
    setSaving(true); setMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setMsg(error ? { type: 'error', text: error.message } : { type: 'ok', text: 'Profile updated.' });
    setSaving(false);
  };

  const savePwd = async () => {
    setPwdMsg(null);
    if (pwd.length < 8) return setPwdMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
    if (pwd !== confirm) return setPwdMsg({ type: 'error', text: 'Passwords do not match.' });
    setPwdSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) setPwdMsg({ type: 'error', text: error.message });
    else { setPwdMsg({ type: 'ok', text: 'Password updated.' }); setPwd(''); setConfirm(''); setShowPwdForm(false); }
    setPwdSaving(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--bdr)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0, boxShadow: '0 4px 16px rgba(99,102,241,.35)' }}>
            {getInitials(user)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--t1)', marginBottom: 2 }}>{name || user?.email?.split('@')[0]}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>{user?.email}</div>
          </div>
        </div>
        <Row label="Display Name" hint="Shown in your account and reports." isMobile={isMobile}>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
        </Row>
        <Row label="Email Address" hint="Contact support to change your email." isMobile={isMobile}>
          <div style={{ position: 'relative' }}>
            <input className="input" value={user?.email || ''} readOnly style={{ opacity: .55, cursor: 'not-allowed', paddingRight: 80 }} />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 600, color: 'var(--green)', background: 'var(--green-tint)', border: '1px solid var(--green-bdr)', padding: '2px 8px', borderRadius: 20 }}>Verified</span>
          </div>
        </Row>
        <Alert msg={msg} />
        <SaveBtn onClick={saveName} saving={saving} />
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showPwdForm ? 20 : 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>Password</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>Last changed: unknown</div>
          </div>
          {!showPwdForm && (
            <button onClick={() => setShowPwdForm(true)} style={{ background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: 'var(--t1)', cursor: 'pointer', fontFamily: SANS }}>
              Change Password
            </button>
          )}
        </div>
        {showPwdForm && (
          <>
            <Row label="New Password" isMobile={isMobile}>
              <input type="password" className="input" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" />
            </Row>
            <Row label="Confirm Password" isMobile={isMobile}>
              <input type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password"
                style={{ borderColor: confirm && confirm !== pwd ? 'var(--red-bdr)' : '' }} />
            </Row>
            <Alert msg={pwdMsg} />
            <div style={{ display: 'flex', gap: 10 }}>
              <SaveBtn onClick={savePwd} saving={pwdSaving} label="Update Password" />
              <button onClick={() => { setShowPwdForm(false); setPwd(''); setConfirm(''); setPwdMsg(null); }} style={{ background: 'none', border: '1px solid var(--bdr)', borderRadius: 8, padding: '10px 18px', fontSize: 13, color: 'var(--t2)', cursor: 'pointer', fontFamily: SANS }}>Cancel</button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function BillingSection({ plan, used, limit, remaining, onUpgrade, invoices, isMobile }) {
  const badge = PLAN_BADGE[plan] || PLAN_BADGE.free;
  const pct = limit === Infinity ? 0 : used / limit;
  const barW = Math.min(100, Math.round(pct * 100));
  const [sub, setSub] = useState(null);

  useEffect(() => {
    supabase.from('subscriptions').select('*').single().then(({ data }) => setSub(data));
  }, []);

  const planFeatures = {
    free:       ['20 invoices / month', '1 sync source', 'Manual upload + OCR'],
    basic:      ['50 invoices / month', '2 sync sources', 'Email support'],
    pro:        ['150 invoices / month', 'All 4 sources', 'Auto-sync', 'Priority support'],
    enterprise: ['Unlimited invoices', 'All 4 sources', 'Dedicated onboarding', 'Custom SLA'],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Plan card */}
      <div style={{ background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 12, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', padding: '3px 10px', borderRadius: 20, background: 'rgba(0,0,0,.2)', color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label} PLAN</span>
              {sub?.status === 'active' && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>● Active</span>}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(planFeatures[plan] || planFeatures.free).map(f => (
                <li key={f} style={{ fontSize: 13, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: badge.color }}>✓</span>{f}
                </li>
              ))}
            </ul>
          </div>
          {plan !== 'enterprise' && (
            <button onClick={onUpgrade} style={{ background: 'var(--indigo)', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 4px 14px rgba(99,102,241,.35)' }}>Upgrade ↑</button>
          )}
        </div>
      </div>

      {/* Usage bar */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)' }}>Monthly usage</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: barW >= 100 ? 'var(--red)' : barW >= 80 ? 'var(--amber)' : 'var(--t1)' }}>{used}</span>
            <span style={{ color: 'var(--t3)' }}> / {limit === Infinity ? '∞' : limit}</span>
          </span>
        </div>
        {limit !== Infinity ? (
          <>
            <div style={{ height: 6, background: 'var(--surf2)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${barW}%`, borderRadius: 4, transition: 'width .5s', background: barW >= 100 ? 'var(--red)' : barW >= 80 ? 'var(--amber)' : 'var(--indigo)' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>
              {remaining > 0 ? `${remaining} invoices remaining this month` : 'Monthly limit reached — upgrade to continue'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--green)' }}>Unlimited invoices on your plan ✓</div>
        )}
      </Card>

      {/* Billing history */}
      <Card>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 14 }}>Billing History</div>
        {sub ? (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--bdr)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', background: 'var(--surf2)', padding: '9px 16px' }}>
              {['Plan', 'Status', 'Start', 'End'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '12px 16px', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{sub.plan}</span>
              <span style={{ fontSize: 12, color: sub.status === 'active' ? 'var(--green)' : 'var(--amber)', fontWeight: 600, textTransform: 'capitalize' }}>● {sub.status}</span>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>{sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : '—'}</span>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—'}</span>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--t3)', fontSize: 13 }}>No active subscription found.</div>
        )}
      </Card>
    </div>
  );
}

function IntegrationsSection({ session }) {
  const INTEGRATIONS = [
    { key: 'google_drive', label: 'Google Drive', icon: '📁', color: '#4285F4', desc: 'Sync invoices from Drive folders' },
    { key: 'gmail',        label: 'Gmail',        icon: '✉️',  color: '#EA4335', desc: 'Extract invoices from email' },
    { key: 'whatsapp',     label: 'WhatsApp',     icon: '💬',  color: '#25D366', desc: 'Receive invoices via WhatsApp' },
    { key: 'green_invoice',label: 'Green Invoice', icon: '🟢',  color: '#22C55E', desc: 'Sync from Green Invoice platform' },
    { key: 'bank',         label: 'Bank / Accounting', icon: '🏦', color: 'var(--t3)', desc: 'Coming soon', comingSoon: true },
  ];

  const [connected, setConnected] = useState({});
  useEffect(() => {
    supabase.from('integrations').select('integration_type, status').then(({ data }) => {
      if (data) setConnected(Object.fromEntries(data.map(r => [r.integration_type, r.status === 'active'])));
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {INTEGRATIONS.map(int => (
        <div key={int.key} style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, borderLeft: `3px solid ${int.color}` }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{int.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>{int.label}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>{int.desc}</div>
          </div>
          {int.comingSoon ? (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', background: 'var(--surf2)', border: '1px solid var(--bdr)', padding: '3px 10px', borderRadius: 20 }}>Coming soon</span>
          ) : connected[int.key] ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>● Connected</span>
              <button style={{ background: 'var(--red-tint)', border: '1px solid var(--red-bdr)', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: 'var(--red)', cursor: 'pointer', fontFamily: SANS }}>Disconnect</button>
            </div>
          ) : (
            <button style={{ background: 'var(--indigo)', border: 'none', borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: SANS, boxShadow: '0 2px 10px rgba(99,102,241,.3)' }}>Connect</button>
          )}
        </div>
      ))}
    </div>
  );
}

function TeamSection() {
  return (
    <div style={{ position: 'relative' }}>
      {/* Blurred mock content */}
      <div style={{ filter: 'blur(3px)', pointerEvents: 'none', opacity: 0.3 }}>
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input className="input" placeholder="teammate@email.com" style={{ flex: 1 }} readOnly />
            <button style={{ background: 'var(--indigo)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: SANS }}>Invite</button>
          </div>
        </Card>
        {['Alex Cohen', 'Dana Levi'].map(name => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>{name[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Member</div>
            </div>
          </div>
        ))}
      </div>
      {/* Lock overlay */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{ fontSize: 32 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t1)' }}>Coming soon</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center', maxWidth: 240 }}>Team collaboration will be available in the next update.</div>
      </div>
    </div>
  );
}

function DataSection({ invoices, session }) {
  const exportCSV = () => {
    const header = 'Supplier,Invoice No,Date,Due Date,Amount,Status\n';
    const rows = (invoices || []).map(inv =>
      [inv.supplier, inv.invoice_no, inv.invoice_date, inv.due_date, inv.amount, inv.status]
        .map(v => `"${(v ?? '').toString().replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'invoices.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const exportSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('*');
    if (!data) return;
    const header = 'Name,Terms,Notes\n';
    const rows = data.map(s => [s.name, s.terms, s.notes || ''].map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'suppliers.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const EXPORTS = [
    { label: 'Invoices CSV', hint: `${(invoices || []).length} invoices`, action: exportCSV, icon: '📄' },
    { label: 'Suppliers CSV', hint: 'All supplier payment terms', action: exportSuppliers, icon: '🏢' },
    { label: 'Financial Report PDF', hint: 'Coming soon', action: null, icon: '📊' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {EXPORTS.map(ex => (
        <div key={ex.label} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 12 }}>
          <span style={{ fontSize: 22 }}>{ex.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>{ex.label}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>{ex.hint}</div>
          </div>
          {ex.action ? (
            <button onClick={ex.action} style={{ background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, color: 'var(--t1)', cursor: 'pointer', fontFamily: SANS }}>↓ Export</button>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', background: 'var(--surf2)', border: '1px solid var(--bdr)', padding: '3px 10px', borderRadius: 20 }}>Coming soon</span>
          )}
        </div>
      ))}

      {/* Reset demo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'var(--amber-tint)', border: '1px solid var(--amber-bdr)', borderRadius: 12 }}>
        <span style={{ fontSize: 22 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>Reset Demo Data</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>Restore sample invoices and suppliers to their original state</div>
        </div>
        <button style={{ background: 'var(--amber-tint)', border: '1px solid var(--amber-bdr)', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 600, color: 'var(--amber)', cursor: 'pointer', fontFamily: SANS }}>Reset</button>
      </div>
    </div>
  );
}

function DangerSection({ user, session }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const confirmed = typed.trim() === 'DELETE';

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
    <div style={{ background: 'var(--red-tint)', border: '1px solid var(--red-bdr)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>Delete Account</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.5 }}>
            Permanently removes your account, all invoices, suppliers, integrations, and billing data. This cannot be undone.
          </div>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: '1px solid var(--red-bdr)', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: 'var(--red)', cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--red-tint)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >Delete Account</button>
        )}
      </div>

      {open && (
        <div style={{ padding: '0 24px 24px', borderTop: '1px solid var(--red-bdr)' }}>
          <div style={{ paddingTop: 20, fontSize: 13, color: '#fca5a5', lineHeight: 1.6, marginBottom: 14 }}>
            Type <strong style={{ color: '#F87171', background: 'rgba(239,68,68,.15)', padding: '1px 6px', borderRadius: 4 }}>DELETE</strong> to confirm:
          </div>
          <input className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder="DELETE"
            style={{ marginBottom: 14, borderColor: typed && !confirmed ? 'var(--red-bdr)' : '' }} />
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={deleteAccount} disabled={!confirmed || deleting} style={{ background: confirmed ? 'var(--red)' : 'rgba(239,68,68,.2)', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, color: confirmed ? '#fff' : 'rgba(239,68,68,.5)', cursor: confirmed && !deleting ? 'pointer' : 'not-allowed', fontFamily: SANS, boxShadow: confirmed ? '0 4px 14px rgba(239,68,68,.3)' : 'none' }}>
              {deleting ? 'Deleting…' : 'Permanently Delete'}
            </button>
            <button onClick={() => { setOpen(false); setTyped(''); }} style={{ background: 'transparent', border: '1px solid var(--bdr)', borderRadius: 8, padding: '10px 18px', fontSize: 13, color: 'var(--t2)', cursor: 'pointer', fontFamily: SANS }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { getInitials };
