import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import LogoIcon from '../components/LogoIcon'

const SANS = "'IBM Plex Sans', system-ui, sans-serif"

const FLOAT_CARDS = [
  { sup: "Acme Corp",  amt: "₪28,400", status: "Paid",      sColor: "#22C55E", sBg: "rgba(34,197,94,.12)",  init: "A", iColor: "#6366F1", left: "8%",  dur: "11s", del: "0s",   rot: "-2deg"  },
  { sup: "BuildRight", amt: "₪12,500", status: "Due in 3d", sColor: "#F59E0B", sBg: "rgba(245,158,11,.12)", init: "B", iColor: "#10B981", left: "52%", dur: "13s", del: "2.2s", rot: "1.5deg" },
  { sup: "TechParts",  amt: "₪22,000", status: "Overdue",   sColor: "#F87171", sBg: "rgba(239,68,68,.12)",  init: "T", iColor: "#F59E0B", left: "26%", dur: "14s", del: "4.8s", rot: "-1deg"  },
  { sup: "MediaPro",   amt: "₪8,400",  status: "Synced ✓",  sColor: "#818CF8", sBg: "rgba(99,102,241,.12)", init: "M", iColor: "#EF4444", left: "68%", dur: "10s", del: "1.4s", rot: "2deg"   },
  { sup: "Tadiran",    amt: "₪34,600", status: "Due soon",  sColor: "#F59E0B", sBg: "rgba(245,158,11,.12)", init: "ת", iColor: "#8B5CF6", left: "72%", dur: "15s", del: "3.6s", rot: "1deg"   },
  { sup: "HOT Mobile", amt: "₪6,100",  status: "Paid",      sColor: "#22C55E", sBg: "rgba(34,197,94,.12)",  init: "H", iColor: "#EF4444", left: "40%", dur: "11s", del: "8.2s", rot: "-0.5deg"},
]

export default function LoginPage() {
  const [mode,     setMode]     = useState('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState(null)
  const [msg,      setMsg]      = useState(null)
  const [busy,     setBusy]     = useState(false)

  const isMobile = window.innerWidth <= 640

  const inp = {
    width: '100%', padding: '10px 14px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 7, fontFamily: SANS, fontSize: 14, color: '#F1F5F9', outline: 'none',
  }

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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{`
        @keyframes floatCard {
          0%   { transform: translateY(110%) rotate(var(--rot)); opacity: 0; }
          8%   { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateY(-20%) rotate(var(--rot)); opacity: 0; }
        }
        .login-float-card {
          position: absolute;
          animation: floatCard var(--dur) ease-in-out var(--del) infinite;
        }
      `}</style>

      {/* Left panel — desktop only */}
      {!isMobile && (
        <div style={{ width: '44%', background: '#07090F', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          {/* Grid background */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
          {/* Gradient orbs */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 50% at 30% 35%, rgba(99,102,241,0.18) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 50% 40% at 75% 70%, rgba(16,185,129,0.10) 0%, transparent 60%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #07090F 0%, transparent 30%, transparent 70%, #07090F 100%)', pointerEvents: 'none', zIndex: 2 }} />

          {/* Floating invoice cards */}
          {FLOAT_CARDS.map((c, i) => (
            <div key={i} className="login-float-card" style={{ left: c.left, bottom: '-120px', '--dur': c.dur, '--del': c.del, '--rot': c.rot, zIndex: 1 }}>
              <div style={{ background: 'rgba(17,24,39,0.85)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '10px 14px', backdropFilter: 'blur(12px)', minWidth: 170 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: c.iColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 700, fontSize: 10, color: '#fff', flexShrink: 0 }}>{c.init}</div>
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: '#B8CAE0' }}>{c.sup}</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 600, color: '#E8EFF8', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', marginBottom: 7 }}>{c.amt}</div>
                <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: c.sColor, background: c.sBg, padding: '2px 8px', borderRadius: 20 }}>{c.status}</span>
              </div>
            </div>
          ))}

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column', height: '100%', padding: '40px 48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoIcon size={28} />
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 16, letterSpacing: '-0.02em', color: '#E8EFF8' }}>Cashflow</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 'clamp(26px,3vw,40px)', letterSpacing: '-0.04em', lineHeight: 1.15, color: '#E8EFF8', marginBottom: 14 }}>
                Every invoice.<br />Always on time.
              </div>
              <p style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.75, color: '#627488', maxWidth: 320 }}>
                Cashflow syncs invoices from Drive, Gmail, and WhatsApp — then schedules payments automatically so nothing slips through.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 0, borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 24 }}>
              {[['₪2.4M', 'processed monthly'], ['48 hrs', 'saved per user'], ['4.8★', '200+ businesses']].map(([v, l], i) => (
                <div key={l} style={{ flex: 1, paddingRight: 16, borderRight: i < 2 ? '1px solid rgba(255,255,255,.06)' : 'none', paddingLeft: i > 0 ? 16 : 0 }}>
                  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 20, color: '#6366F1', letterSpacing: '-0.03em', marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: '#4A6278', lineHeight: 1.4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Right — auth form */}
      <div style={{ flex: 1, background: isMobile ? '#07090F' : '#0C1017', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '40px 24px' : '48px 40px', position: 'relative' }}>
        {isMobile && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)', backgroundSize: '36px 36px', pointerEvents: 'none' }} />}
        {isMobile && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 50% at 50% 20%, rgba(99,102,241,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />}

        <div style={{ width: '100%', maxWidth: isMobile ? '100%' : 380, position: 'relative', zIndex: 1 }}>
          {isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 32 }}>
              <LogoIcon size={28} />
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 17, color: '#F8FAFC' }}>Cashflow</span>
            </div>
          )}

          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: isMobile ? 22 : 24, letterSpacing: '-0.03em', color: '#F1F5F9', marginBottom: 6 }}>
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p style={{ fontFamily: SANS, fontSize: 14, color: '#64748B' }}>
              {mode === 'signin' ? 'Sign in to your Cashflow workspace.' : 'Start managing invoices in minutes.'}
            </p>
          </div>

          {/* Google */}
          <button onClick={googleSignIn} disabled={busy} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '11px 0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: SANS, fontWeight: 500, fontSize: 14, color: '#F1F5F9', marginBottom: 18, opacity: busy ? 0.7 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            {busy ? 'Signing in…' : 'Continue with Google'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontFamily: SANS, fontSize: 12, color: '#334155' }}>or email</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
          </div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: '#64748B', display: 'block', marginBottom: 5 }}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required style={inp} autoComplete="email" />
            </div>
            <div>
              <label style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: '#64748B', display: 'block', marginBottom: 5 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{ ...inp, paddingRight: 40 }} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, color: '#F87171', fontSize: 13, fontFamily: SANS }}>{error}</div>}
            {msg   && <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 8, color: '#4ade80', fontSize: 13, fontFamily: SANS }}>{msg}</div>}

            <button type="submit" disabled={busy} style={{ padding: '11px 0', background: '#6366F1', border: 'none', borderRadius: 7, fontFamily: SANS, fontWeight: 600, fontSize: 14, color: '#fff', cursor: busy ? 'not-allowed' : 'pointer', marginTop: 4, opacity: busy ? 0.7 : 1, boxShadow: '0 4px 18px rgba(99,102,241,.35)' }}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p style={{ fontFamily: SANS, fontSize: 13, color: '#475569', textAlign: 'center', marginTop: 22 }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setMsg(null) }} style={{ background: 'none', border: 'none', color: '#6366F1', cursor: 'pointer', fontFamily: SANS, fontSize: 13, fontWeight: 500 }}>
              {mode === 'signin' ? 'Start free' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
