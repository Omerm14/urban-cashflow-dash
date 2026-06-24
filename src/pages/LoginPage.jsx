import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [mode,     setMode]     = useState('signin') // 'signin' | 'signup'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [msg,      setMsg]      = useState(null)
  const [busy,     setBusy]     = useState(false)

  const submit = async e => {
    e.preventDefault()
    setBusy(true); setError(null); setMsg(null)
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMsg('Check your email to confirm your account.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      // No explicit navigate — onAuthStateChange fires, App.jsx re-renders
      // in authenticated mode and the /login route redirects to /app
    }
    setBusy(false)
  }

  const googleSignIn = async () => {
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/app' },
    })
    if (error) { setError(error.message); setBusy(false) }
  }

  return (
    <div style={{ background:'#080e1a', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter,system-ui,sans-serif' }}>
      <div style={{ width:380, background:'#0a1120', border:'1px solid #111d2e', borderRadius:16, padding:32 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:32 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#6366f1,#a78bfa)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>💸</div>
          <span style={{ fontWeight:700, fontSize:18, color:'#f1f5f9' }}>Cashflow</span>
        </div>

        <div style={{ fontWeight:700, fontSize:20, color:'#f1f5f9', marginBottom:4 }}>
          {mode === 'signup' ? 'Create account' : 'Welcome back'}
        </div>
        <div style={{ fontSize:13, color:'#475569', marginBottom:24 }}>
          {mode === 'signup' ? 'Start managing your invoices' : 'Sign in to your account'}
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#475569', marginBottom:6, textTransform:'uppercase', letterSpacing:'.5px' }}>Email</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input"
              placeholder="you@example.com" autoComplete="email" />
          </div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#475569', marginBottom:6, textTransform:'uppercase', letterSpacing:'.5px' }}>Password</div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="input"
              placeholder="••••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} />
          </div>

          {error && <div style={{ marginBottom:14, padding:'10px 14px', background:'#2d0a0a', border:'1px solid #7f1d1d', borderRadius:8, color:'#f87171', fontSize:13 }}>{error}</div>}
          {msg   && <div style={{ marginBottom:14, padding:'10px 14px', background:'#052e16', border:'1px solid #166534', borderRadius:8, color:'#4ade80', fontSize:13 }}>{msg}</div>}

          <button type="submit" disabled={busy}
            style={{ width:'100%', padding:'11px', background:'linear-gradient(135deg,#6366f1,#a78bfa)', border:'none', borderRadius:10, color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit', marginBottom:12, opacity:busy?0.7:1 }}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button onClick={googleSignIn} disabled={busy}
          style={{ width:'100%', padding:'11px', background:'#131c2e', border:'1px solid #1e2d45', borderRadius:10, color:'#e2e8f0', fontWeight:500, fontSize:14, cursor:'pointer', fontFamily:'inherit', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:busy?0.7:1 }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>

        <div style={{ textAlign:'center', fontSize:13, color:'#475569' }}>
          {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); setMsg(null) }}
            style={{ background:'none', border:'none', color:'#a78bfa', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:500, padding:0 }}>
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </button>
        </div>
      </div>
    </div>
  )
}
