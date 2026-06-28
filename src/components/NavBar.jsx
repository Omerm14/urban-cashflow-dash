import ThemeToggle from './ThemeToggle';

export default function GlobalHeader({ unreadCount, onBellClick }) {
  return (
    <header className="global-hdr">
      <ThemeToggle />

      {/* Search placeholder */}
      <button
        title="Search (coming soon)"
        style={{ padding: '7px 9px', background: 'transparent', border: '1px solid var(--bdr)', borderRadius: 6, color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bdr2)'; e.currentTarget.style.color = 'var(--t2)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bdr)'; e.currentTarget.style.color = 'var(--t3)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
      </button>

      {/* Notifications bell */}
      <button
        onClick={onBellClick}
        title="Notifications"
        style={{ position: 'relative', padding: '7px 9px', background: 'transparent', border: '1px solid var(--bdr)', borderRadius: 6, color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all .15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--bdr2)'; e.currentTarget.style.color = 'var(--t2)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bdr)'; e.currentTarget.style.color = 'var(--t3)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 14, height: 14, borderRadius: 7, background: 'var(--red)', border: '2px solid var(--surf)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', lineHeight: 1, padding: '0 2px' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </header>
  );
}
