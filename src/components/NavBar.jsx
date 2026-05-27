export default function NavBar({ view, setView, suppliersCount, onSuppliersClick, user, onSignOut, integrationError, unreadCount, onBellClick }) {
  const isAdmin = user?.email && import.meta.env.VITE_ADMIN_EMAIL && user.email === import.meta.env.VITE_ADMIN_EMAIL;
  const views = isAdmin
    ? ["dashboard","invoices","calendar","integrations","admin"]
    : ["dashboard","invoices","calendar","integrations"];

  return (
    <div style={{ background:"#0a1120", borderBottom:"1px solid #111d2e", position:"sticky", top:0, zIndex:40, backdropFilter:"blur(12px)" }}>
      <div style={{ maxWidth:1140, margin:"0 auto", padding:"0 28px", display:"flex", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginRight:40 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,#6366f1,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>💸</div>
          <span style={{ fontWeight:700, fontSize:15, color:"#f1f5f9", letterSpacing:"-0.3px" }}>Cashflow</span>
        </div>
        {views.map(v => (
          <button key={v} className={`nav-btn${view===v?" active":""}`} onClick={() => setView(v)}
            style={{ textTransform:"capitalize", position:"relative" }}>
            {v === "integrations" ? "Integrations" : v}
            {v === "integrations" && integrationError && (
              <span style={{ position:"absolute", top:6, right:-2, width:7, height:7, borderRadius:"50%", background:"#f87171", border:"2px solid #0a1120" }} />
            )}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={onBellClick}
            style={{ position:"relative", padding:"8px 10px", background:"transparent", border:"1px solid #1e2d45", borderRadius:8, color:"#64748b", cursor:"pointer", fontSize:14, transition:"all .2s", fontFamily:"inherit" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor="#334155"; e.currentTarget.style.color="#94a3b8"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor="#1e2d45"; e.currentTarget.style.color="#64748b"; }}>
            🔔
            {unreadCount > 0 && (
              <span style={{ position:"absolute", top:4, right:4, minWidth:14, height:14, borderRadius:7, background:"#f87171", border:"2px solid #0a1120", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#fff", lineHeight:1, padding:"0 2px" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button onClick={onSuppliersClick}
            style={{ padding:"8px 14px", background:"transparent", border:"1px solid #1e2d45", borderRadius:8, color:"#64748b", cursor:"pointer", fontSize:12, fontWeight:500, transition:"all .2s", fontFamily:"inherit" }}
            onMouseEnter={e => { e.target.style.borderColor="#334155"; e.target.style.color="#94a3b8"; }}
            onMouseLeave={e => { e.target.style.borderColor="#1e2d45"; e.target.style.color="#64748b"; }}>
            ⚙ Suppliers ({suppliersCount})
          </button>
          {user && (
            <>
              <span style={{ fontSize:12, color:"#334155", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</span>
              <button onClick={onSignOut}
                style={{ padding:"7px 12px", background:"#131c2e", border:"1px solid #1e2d45", borderRadius:8, color:"#64748b", cursor:"pointer", fontSize:12, fontWeight:500, fontFamily:"inherit" }}>
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
