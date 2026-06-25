import LogoIcon from "./LogoIcon";

const PLAN_BADGE = {
  free:       { label: 'FREE',       bg: 'rgba(100,116,139,.15)', color: '#94a3b8', border: 'rgba(100,116,139,.3)' },
  basic:      { label: 'BASIC',      bg: 'rgba(16,185,129,.12)',  color: '#10b981', border: 'rgba(16,185,129,.3)' },
  pro:        { label: 'PRO',        bg: 'rgba(59,130,246,.12)',  color: '#60a5fa', border: 'rgba(59,130,246,.35)' },
  enterprise: { label: 'ENTERPRISE', bg: 'rgba(99,102,241,.12)',  color: '#818cf8', border: 'rgba(99,102,241,.35)' },
};

export default function NavBar({ view, setView, suppliersCount, onSuppliersClick, user, onSignOut, integrationError, unreadCount, onBellClick, plan, onUpgrade }) {
  const isAdmin = user?.email && import.meta.env.VITE_ADMIN_EMAIL && user.email === import.meta.env.VITE_ADMIN_EMAIL;
  const views = isAdmin
    ? ["dashboard","invoices","calendar","integrations","admin"]
    : ["dashboard","invoices","calendar","integrations"];

  return (
    <nav className="nav">
      <div className="nav-brand" onClick={() => setView("dashboard")}>
        <LogoIcon size={30}/>
        <span style={{ fontWeight:800, fontSize:16, background:"linear-gradient(90deg,#06b6d4,#3b82f6)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          Cashflow
        </span>
      </div>

      <div className="nav-links">
        {views.map(v => (
          <button
            key={v}
            className={`nav-link${view === v ? " active" : ""}`}
            onClick={() => setView(v)}
            style={{ textTransform:"capitalize", position:"relative" }}>
            {v === "integrations" ? "Integrations" : v}
            {v === "integrations" && integrationError && (
              <span style={{ position:"absolute", top:8, right:6, width:7, height:7, borderRadius:"50%", background:"var(--red)", border:"2px solid var(--bg)" }}/>
            )}
          </button>
        ))}
      </div>

      <div className="nav-right">
        <button
          onClick={onBellClick}
          style={{ position:"relative", padding:"8px 10px", background:"transparent", border:"1px solid var(--bdr)", borderRadius:8, color:"var(--t3)", cursor:"pointer", fontSize:14, transition:"all .2s", fontFamily:"inherit" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor="var(--bdr2)"; e.currentTarget.style.color="var(--t2)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor="var(--bdr)"; e.currentTarget.style.color="var(--t3)"; }}>
          🔔
          {unreadCount > 0 && (
            <span style={{ position:"absolute", top:4, right:4, minWidth:14, height:14, borderRadius:7, background:"var(--red)", border:"2px solid var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#fff", lineHeight:1, padding:"0 2px" }}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        <button className="sup-pill" onClick={onSuppliersClick}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--cyan)" }}/>
          Suppliers ({suppliersCount})
        </button>

        {user && (
          <>
            {plan && (() => {
              const b = PLAN_BADGE[plan] || PLAN_BADGE.free;
              return (
                <span
                  onClick={plan !== 'enterprise' ? onUpgrade : undefined}
                  title={plan !== 'enterprise' ? 'View plans & upgrade' : undefined}
                  style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
                    padding: '3px 8px', borderRadius: 6,
                    background: b.bg, color: b.color, border: `1px solid ${b.border}`,
                    cursor: plan !== 'enterprise' ? 'pointer' : 'default',
                  }}>{b.label}</span>
              );
            })()}
            {(plan === 'free' || plan === 'basic') && (
              <button
                onClick={onUpgrade}
                style={{
                  background: 'linear-gradient(135deg,var(--purple),var(--primary))',
                  border: 'none', borderRadius: 8, padding: '5px 11px',
                  fontSize: 12, fontWeight: 700, color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                Upgrade ↑
              </button>
            )}
            <button onClick={onSignOut} title={user.email} className="btn btn-ghost btn-sm">Sign out</button>
          </>
        )}
      </div>
    </nav>
  );
}
