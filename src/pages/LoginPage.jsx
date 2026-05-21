import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [mode,     setMode]     = useState('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [msg,      setMsg]      = useState(null);
  const [busy,     setBusy]     = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError(null); setMsg(null);
    const fn = mode === 'signup'
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    if (error) setError(error.message);
    else if (mode === 'signup') setMsg('Check your email to confirm your account.');
    setBusy(false);
  };

  const googleSignIn = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) { setError(error.message); setBusy(false); }
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em',
  };

  return (
    <div style={{
      background: 'var(--bg)', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        width: 380,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 20,
        padding: 36,
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11,
            background: 'var(--green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: 'var(--bg)' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>Cashflow</span>
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {mode === 'signup' ? 'Create account' : 'Welcome back'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 28 }}>
          {mode === 'signup' ? 'Start managing your invoices' : 'Sign in to your account'}
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Email</div>
            <input
              type="email" className="input"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required
            />
          </div>
          <div style={{ marginBottom: 22 }}>
            <div style={labelStyle}>Password</div>
            <input
              type="password" className="input"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" minLength={6} required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'var(--red-soft)', border: '1px solid var(--red)',
              borderRadius: 8, color: 'var(--red)', fontSize: 13,
            }}>{error}</div>
          )}
          {msg && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'var(--green-soft)', border: '1px solid var(--green)',
              borderRadius: 8, color: 'var(--green)', fontSize: 13,
            }}>{msg}</div>
          )}

          <button
            type="submit" disabled={busy}
            style={{
              width: '100%', padding: 12,
              background: 'var(--ink)', border: 'none',
              borderRadius: 10, color: 'var(--bg)',
              fontWeight: 700, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
              opacity: busy ? 0.65 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          onClick={googleSignIn} disabled={busy}
          style={{
            width: '100%', padding: 11,
            background: 'var(--surface)', border: '1px solid var(--line)',
            borderRadius: 10, color: 'var(--ink)',
            fontWeight: 500, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit', marginBottom: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: busy ? 0.65 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)' }}>
          {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button
            onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); setMsg(null); }}
            style={{
              background: 'none', border: 'none',
              color: 'var(--green)', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 0,
            }}
          >
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </button>
        </div>
      </div>
    </div>
  );
}
