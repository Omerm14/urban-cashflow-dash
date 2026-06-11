import LogoIcon from "./LogoIcon";

export default function NavBar({ view, setView, suppliersCount, onSuppliersClick, user, onSignOut, integrationError, unreadCount, onBellClick }) {
  const isAdmin = user?.email && import.meta.env.VITE_ADMIN_EMAIL && user.email === import.meta.env.VITE_ADMIN_EMAIL;
  const views = isAdmin
    ? ["dashboard","invoices","calendar","integrations","admin"]
    : ["dashboard","invoices","calendar","integrations"];

  return (
    <nav className="nav">
      <div className="nav-brand" onClick={() => setView("dashboard")}>
        <LogoIcon size={30}/>
        <span style={{ fontWeight:800, fontSize:16, background:"linear-gradient(90deg,#8b5cf6,#3b82f6)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
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
          <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--purple)" }}/>
          Suppliers ({suppliersCount})
        </button>

        {user && (
          <>
            <span style={{ fontSize:12, color:"var(--t3)", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</span>
            <button onClick={onSignOut} className="btn btn-ghost btn-sm">Sign out</button>
          </>
        )}
      </div>
    </nav>
  );
}
