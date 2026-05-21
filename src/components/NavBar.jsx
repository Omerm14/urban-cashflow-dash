export default function NavBar({ view, setView, user, onSignOut, restaurantName, lastSync, suppliersCount, onSuppliersClick }) {
  const tabs = [
    { id: 'today',    label: 'Today' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'sources',  label: 'Sources' },
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      padding: '0 40px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg)',
      height: 60,
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 9,
          background: 'var(--green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--bg)' }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em' }}>Cashflow</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 14px',
              height: 60,
              borderRadius: 0,
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 500,
              color: view === t.id ? 'var(--ink)' : 'var(--ink-dim)',
              position: 'relative',
              borderBottom: view === t.id ? '2px solid var(--ink)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {restaurantName && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--ink-soft)',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
            {restaurantName}{lastSync ? ` · ${lastSync}` : ''}
          </div>
        )}
        {suppliersCount !== undefined && (
          <button
            onClick={onSuppliersClick}
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              borderRadius: 999,
              padding: '5px 12px',
              fontSize: 12,
              color: 'var(--ink-soft)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>⚙</span>
            <span>Suppliers ({suppliersCount})</span>
          </button>
        )}
        {user && (
          <>
            <span style={{ fontSize: 12, color: 'var(--ink-dim)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span>
            <button
              onClick={onSignOut}
              style={{
                background: 'transparent',
                border: '1px solid var(--line)',
                borderRadius: 999,
                padding: '5px 12px',
                fontSize: 12,
                color: 'var(--ink-soft)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >Sign out</button>
          </>
        )}
      </div>
    </div>
  );
}
