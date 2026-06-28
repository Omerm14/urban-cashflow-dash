import { useRef } from 'react';
import { getInitials } from '../pages/SettingsPage';

const Logo = () => (
  <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
    <rect width="36" height="36" rx="9" fill="#1E293B"/>
    <path d="M10 18 C10 13.5 13.5 10 18 10 C20.5 10 22.8 11.1 24.3 12.9" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <path d="M26 18 C26 22.5 22.5 26 18 26 C15.5 26 13.2 24.9 11.7 23.1" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <circle cx="18" cy="18" r="3" fill="#6366F1"/>
    <circle cx="24.3" cy="12.9" r="1.8" fill="#818CF8"/>
    <circle cx="11.7" cy="23.1" r="1.8" fill="#6366F1"/>
  </svg>
);

const Icon = ({ d, size = 13, strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {Array.isArray(d)
      ? d.map((p, i) => <path key={i} d={p} />)
      : <path d={d} />}
  </svg>
);

const ICONS = {
  dashboard: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
  invoices:  ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8"],
  calendar:  ["M3 4h18v18H3z", "M16 2v4", "M8 2v4", "M3 10h18"],
  integrations: ["M12 2v3", "M12 19v3", "M4.22 4.22l2.12 2.12", "M17.66 17.66l2.12 2.12", "M2 12h3", "M19 12h3", "M4.22 19.78l2.12-2.12", "M17.66 6.34l2.12-2.12", "circle cx='12' cy='12' r='3'"],
  suppliers: ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M23 21v-2a4 4 0 0 0-3-3.87", "circle cx='9' cy='7' r='4'", "M16 3.13a4 4 0 0 1 0 7.75"],
  settings:  ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  admin:     ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"],
  upload:    ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"],
};

function NavIcon({ name }) {
  const paths = ICONS[name] || ICONS.dashboard;
  const isCircle = p => p.startsWith('circle');
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {paths.map((p, i) =>
        isCircle(p)
          ? <circle key={i} {...Object.fromEntries(p.slice(7).split(' ').map(a => a.split('=').map((v, j) => j === 1 ? v.replace(/'/g, '') : v)))} />
          : <path key={i} d={p} />
      )}
    </svg>
  );
}

const PLAN_LABEL = { free: 'FREE', basic: 'BASIC', pro: 'PRO', enterprise: 'ENTERPRISE' };

export default function Sidebar({
  view, setView,
  user, onSignOut, onSettings,
  plan, used, limit, pct,
  suppliersCount,
  onSuppliersClick,
  onUpgrade,
  onUpload,
  isAtLimit,
  extracting,
  isAdmin,
}) {
  const fileRef = useRef();

  const mainLinks = [
    { key: 'dashboard',    label: 'Dashboard' },
    { key: 'invoices',     label: 'Invoices' },
    { key: 'calendar',     label: 'Calendar' },
    { key: 'integrations', label: 'Integrations' },
  ];
  if (isAdmin) mainLinks.push({ key: 'admin', label: 'Admin' });

  const handleUploadClick = () => {
    if (isAtLimit) { onUpgrade(); return; }
    if (fileRef.current) fileRef.current.click();
  };

  return (
    <aside className="sb">
      {/* Logo */}
      <div className="sb-logo" onClick={() => setView('dashboard')}>
        <Logo />
        <span className="sb-logo-text">Cashflow</span>
      </div>

      {/* Upload CTA */}
      <button
        className="sb-upload"
        onClick={handleUploadClick}
        disabled={extracting}
        title={isAtLimit ? 'Invoice limit reached — upgrade your plan' : 'Upload invoices'}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {extracting ? 'Extracting…' : isAtLimit ? 'Limit reached' : 'Upload Invoices'}
      </button>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={onUpload} style={{ display: 'none' }} />

      {/* Main nav */}
      <div className="sb-section">MENU</div>
      {mainLinks.map(({ key, label }) => (
        <button
          key={key}
          className={`sb-link${view === key ? ' active' : ''}`}
          onClick={() => setView(key)}
        >
          <NavIcon name={key} />
          {label}
        </button>
      ))}

      <div className="sb-divider" />

      {/* Manage */}
      <div className="sb-section">MANAGE</div>
      <button className={`sb-link${view === 'suppliers' ? ' active' : ''}`} onClick={onSuppliersClick}>
        <NavIcon name="suppliers" />
        Suppliers
        {suppliersCount > 0 && <span className="sb-badge">{suppliersCount}</span>}
      </button>

      {/* Bottom */}
      <div className="sb-bottom">
        {/* Plan usage card */}
        {plan && (
          <div className="sb-plan">
            <div className="sb-plan-label">{PLAN_LABEL[plan] || 'FREE'} PLAN</div>
            <div className="sb-plan-usage">{used ?? '–'} / {limit === Infinity ? '∞' : limit} invoices</div>
            <div className="sb-plan-bar">
              <div className="sb-plan-fill" style={{ width: `${Math.min(100, (pct || 0) * 100)}%` }} />
            </div>
          </div>
        )}

        {/* Upgrade button for non-enterprise */}
        {plan && plan !== 'enterprise' && (
          <button className="sb-upgrade-btn" onClick={onUpgrade}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upgrade plan
          </button>
        )}

        {/* User */}
        {user && (
          <div className="sb-user" onClick={onSettings} title={user.email}>
            <div className="sb-avatar">{getInitials(user)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sb-user-name">{user.user_metadata?.full_name || user.email?.split('@')[0] || 'Account'}</div>
              <div className="sb-user-sub">Settings</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
