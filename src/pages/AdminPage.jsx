import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminPage() {
  const [data,    setData]    = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/usage', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) setError(json.error || 'Failed to load')
      else setData(json)
      setLoading(false)
    })()
  }, [])

  if (loading) return <div style={{ padding:40, color:'var(--t3)', textAlign:'center' }}>Loading usage data…</div>
  if (error)   return <div style={{ padding:40, color:'var(--red)', textAlign:'center' }}>{error}</div>

  const { totals, byUser, timeline } = data
  const maxBar = Math.max(...(timeline?.map(d => d.calls) ?? [1]), 1)

  return (
    <div>
      <div style={{ fontWeight:700, fontSize:20, color:'var(--t1)', marginBottom:4 }}>Usage Dashboard</div>
      <div style={{ fontSize:13, color:'var(--t2)', marginBottom:28 }}>API consumption per customer</div>

      <div className="stat-grid" style={{ marginBottom:32 }}>
        {[
          ['Total Calls',   totals.calls],
          ['Input Tokens',  totals.inputTokens.toLocaleString()],
          ['Output Tokens', totals.outputTokens.toLocaleString()],
          ['Est. Cost',     `$${totals.estimatedCostUSD.toFixed(4)}`],
        ].map(([label, val]) => (
          <div key={label} className="card" style={{ padding:'20px 24px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:8 }}>{label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:'var(--t1)' }}>{val}</div>
          </div>
        ))}
      </div>

      {timeline?.length > 0 && (
        <div className="card" style={{ padding:'24px', marginBottom:28 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:16 }}>Daily Calls (last 30 days)</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:80 }}>
            {timeline.map(d => (
              <div key={d.date} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ width:'100%', background:'var(--indigo)', borderRadius:3, height:`${(d.calls / maxBar) * 72}px`, minHeight:2 }} title={`${d.date}: ${d.calls} calls`} />
              </div>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:10, color:'var(--t3)' }}>
            <span>{timeline[0]?.date}</span>
            <span>{timeline[timeline.length - 1]?.date}</span>
          </div>
        </div>
      )}

      <div className="card" style={{ overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--bdr)' }}>
              {['Email','Calls','Input Tokens','Output Tokens','Est. Cost'].map(h => (
                <th key={h} style={{ padding:'14px 18px', textAlign:'left', fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'1px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byUser.length === 0 && (
              <tr><td colSpan={5} style={{ padding:'40px 0', textAlign:'center', color:'var(--t3)' }}>No API calls recorded yet</td></tr>
            )}
            {byUser.map(u => (
              <tr key={u.email} className="row-hover" style={{ borderTop:'1px solid var(--bdr)' }}>
                <td style={{ padding:'13px 18px', fontWeight:500 }}>{u.email}</td>
                <td style={{ padding:'13px 18px', color:'var(--t2)' }}>{u.calls}</td>
                <td style={{ padding:'13px 18px', color:'var(--t2)' }}>{u.inputTokens.toLocaleString()}</td>
                <td style={{ padding:'13px 18px', color:'var(--t2)' }}>{u.outputTokens.toLocaleString()}</td>
                <td style={{ padding:'13px 18px', fontWeight:600, color:'#A5B4FC' }}>${u.estimatedCostUSD.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
