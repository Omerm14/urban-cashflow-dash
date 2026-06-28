import { useState } from 'react'
import { supabase } from '../lib/supabase'
import LogoIcon from '../components/LogoIcon'

const Logo = () => (
  <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
    <rect width="36" height="36" rx="9" fill="#1E293B"/>
    <path d="M10 18 C10 13.5 13.5 10 18 10 C20.5 10 22.8 11.1 24.3 12.9" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <path d="M26 18 C26 22.5 22.5 26 18 26 C15.5 26 13.2 24.9 11.7 23.1" stroke="#818CF8" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <circle cx="18" cy="18" r="3" fill="#6366F1"/>
    <circle cx="24.3" cy="12.9" r="1.8" fill="#818CF8"/>
    <circle cx="11.7" cy="23.1" r="1.8" fill="#6366F1"/>
  </svg>
)

const PROOF_POINTS = [
  { stat: '2,400+', label: 'Invoices processed monthly' },
  { stat: '99.9%',  label: 'OCR accuracy on clean PDFs' },
  { stat: '4 min',  label: 'Average time to clear a month' },
]

export default function LoginPage() {
  const [mode,     setMode]     = useState('signin')
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
    }
    setBusy(false)
  }

  const googleSignIn = async () => {
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/login' },
    })
    if (error) { setError(error.message); setBusy(false) }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', fontFamily:"'DM Sans',system-ui,sans-serif", background:'#0B0F1A' }}>

      {/* Left panel — value prop */}
      <div style={{ width:420, background:'#0F172A', borderRight:'1px solid rgba(255,255,255,.06)', padding:'48px 40px', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:'auto' }}>
          <Logo />
          <span style={{ fontWeight:700, fontSize:17, color:'#F8FAFC', letterSpacing:'-.02em' }}>Cashflow</span>
        </div>

        <div style={{ paddingBottom:48 }}>
          <div style={{ fontSize:28, fontWeight:800, color:'#F1F5F9', lineHeight:1.2, marginBottom:16, letterSpacing:'-.03em' }}>
            AP automation<br/>for growing teams.
          </div>
          <div style={{ fontSize:14, color:'#64748B', lineHeight:1.65, marginBottom:36 }}>
            Upload, extract, and pay supplier invoices in minutes. Cashflow connects Gmail, Drive, and WhatsApp so nothing slips through.
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {PROOF_POINTS.map(p => (
              <div key={p.stat} style={{ display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:48, flexShrink:0 }}>
                  <div style={{ fontWeight:800, fontSize:18, color:'#818CF8', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{p.stat}</div>
                </div>
                <div style={{ fontSize:13, color:'#475569' }}>{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <div style={{ fontWeight:800, fontSize:22, color:'#F1F5F9', marginBottom:4, letterSpacing:'-.02em' }}>
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </div>
          <div style={{ fontSize:13, color:'#64748B', marginBottom:28 }}>
            {mode === 'signup' ? 'Start managing invoices in under a minute' : 'Sign in to continue'}
          </div>

          <button onClick={googleSignIn} disabled={busy}
            style={{ width:'100%', padding:'11px', background:'#1A2236', border:'1px solid rgba(255,255,255,.08)', borderRadius:6, color:'#E2E8F0', fontWeight:500, fontSize:14, cursor:'pointer', fontFamily:'inherit', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'center', gap:10, opacity:busy?0.7:1, transition:'all .15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='rgba(255,255,255,.18)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,.08)'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:'rgba(255,255,255,.06)' }}/>
            <span style={{ fontSize:11, color:'#475569', fontWeight:600 }}>OR</span>
            <div style={{ flex:1, height:1, background:'rgba(255,255,255,.06)' }}/>
          </div>

          <form onSubmit={submit}>
            <div style={{ marginBottom:14 }}>
              <label className="lbl">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input"
                placeholder="you@example.com" autoComplete="email" />
            </div>
            <div style={{ marginBottom:20 }}>
              <label className="lbl">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="input"
                placeholder="••••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} />
            </div>

            {error && (
              <div style={{ marginBottom:14, padding:'10px 14px', background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', borderRadius:6, color:'#F87171', fontSize:13 }}>
                {error}
              </div>
            )}
            {msg && (
              <div style={{ marginBottom:14, padding:'10px 14px', background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.2)', borderRadius:6, color:'#34D399', fontSize:13 }}>
                {msg}
              </div>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary"
              style={{ width:'100%', justifyContent:'center', padding:'11px', fontSize:14, opacity:busy?0.7:1, marginBottom:16 }}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div style={{ textAlign:'center', fontSize:13, color:'#475569' }}>
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); setMsg(null) }}
              style={{ background:'none', border:'none', color:'var(--indigo)', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600, padding:0 }}>
              {mode === 'signup' ? 'Sign in' : 'Create one'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
