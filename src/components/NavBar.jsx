import ThemeToggle from './ThemeToggle';

export default function GlobalHeader({ unreadCount, onBellClick }) {
  return (
    <header className="global-hdr">
      {/* Search bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 12px', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:8, height:34, cursor:'pointer', minWidth:200, flex:'0 1 220px' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span style={{ fontSize:13, color:'rgba(255,255,255,.25)', flex:1 }}>Search anything…</span>
        <kbd style={{ fontSize:10, color:'rgba(255,255,255,.2)', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.09)', borderRadius:4, padding:'2px 6px', fontFamily:'inherit' }}>⌘K</kbd>
      </div>

      {/* Language toggle */}
      <button
        style={{ height:34, padding:'0 14px', border:'1px solid rgba(255,255,255,.1)', borderRadius:8, background:'transparent', fontSize:12, fontWeight:600, cursor:'pointer', color:'rgba(255,255,255,.4)', fontFamily:'inherit', letterSpacing:'.04em', transition:'all .12s' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.07)'; e.currentTarget.style.color = 'rgba(255,255,255,.65)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,.4)'; }}
      >
        EN
      </button>

      <ThemeToggle />

      {/* Notifications bell */}
      <button
        onClick={onBellClick}
        title="Notifications"
        style={{ position:'relative', width:34, height:34, border:'1px solid rgba(255,255,255,.1)', borderRadius:8, background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .12s', color:'rgba(255,255,255,.4)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.07)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{ position:'absolute', top:7, right:7, width:6, height:6, background:'#EF4444', borderRadius:'50%', border:'1.5px solid var(--navy)' }} />
        )}
      </button>
    </header>
  );
}
