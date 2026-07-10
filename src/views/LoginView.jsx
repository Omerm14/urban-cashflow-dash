import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useLayout } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, NIGHT as T } from "../theme";
import { BrandMark } from "../components/layout/Sidebar";
import { Eye, EyeOff } from "lucide-react";

// Login is always Night Ledger dark — it is the brand's front door.
export default function LoginView() {
  const { isMobile } = useLayout();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [mode, setMode] = useState("signin");
  const [metricVals, setMetricVals] = useState([0, 0, 0]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMetricVals([3.2, 94, 8]);
      return;
    }
    const targets = [3.2, 94, 8];
    const dur = 1400;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - t, 3);
      setMetricVals([
        parseFloat((targets[0] * e).toFixed(1)),
        Math.round(targets[1] * e),
        Math.round(targets[2] * e),
      ]);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timeout = setTimeout(() => { raf = requestAnimationFrame(tick); }, 400);
    return () => { clearTimeout(timeout); cancelAnimationFrame(raf); };
  }, []);

  const handleGoogle = async () => { setLoading(true); setAuthError(null); await supabase.auth.signInWithOAuth({ provider: "google" }); setLoading(false); };
  const handleEmail = async (e) => {
    e.preventDefault(); setLoading(true); setAuthError(null);
    const { error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) setAuthError(error.message);
  };
  const inp = { width: "100%", padding: "12px 16px", background: "rgba(242,241,234,0.05)", border: "1px solid rgba(242,241,234,0.12)", borderRadius: 8, fontFamily: SANS, fontSize: 15, color: T.t1, outline: "none" };

  const FLOAT_CARDS = [
    { sup: "Acme Corp",   amt: "₪28,400", status: "Paid",      sColor: T.green, sBg: T.greenTint, init: "A", iColor: "#3987E5", left: "8%",  dur: "11s", del: "0s",   rot: "-2deg" },
    { sup: "BuildRight",  amt: "₪12,500", status: "Due in 3d", sColor: T.amber, sBg: T.amberTint, init: "B", iColor: "#1FA97A", left: "52%", dur: "13s", del: "2.2s", rot: "1.5deg" },
    { sup: "TechParts",   amt: "₪22,000", status: "Overdue",   sColor: T.red,   sBg: T.redTint,   init: "T", iColor: "#C98500", left: "26%", dur: "14s", del: "4.8s", rot: "-1deg" },
    { sup: "MediaPro",    amt: "₪8,400",  status: "Synced ✓",  sColor: T.accent,sBg: T.accentTint,init: "M", iColor: "#D55181", left: "68%", dur: "10s", del: "1.4s", rot: "2deg" },
    { sup: "Yes Planet",  amt: "₪18,200", status: "Paid",      sColor: T.green, sBg: T.greenTint, init: "Y", iColor: "#1FA97A", left: "14%", dur: "12s", del: "6.5s", rot: "-1.5deg" },
    { sup: "Tadiran",     amt: "₪34,600", status: "Due soon",  sColor: T.amber, sBg: T.amberTint, init: "ת", iColor: "#9085E9", left: "72%", dur: "15s", del: "3.6s", rot: "1deg" },
    { sup: "HOT Mobile",  amt: "₪6,100",  status: "Paid",      sColor: T.green, sBg: T.greenTint, init: "H", iColor: "#E66767", left: "40%", dur: "11s", del: "8.2s", rot: "-0.5deg" },
    { sup: "Strauss",     amt: "₪9,750",  status: "Unpaid",    sColor: T.t3,    sBg: T.surf3,     init: "ש", iColor: "#3987E5", left: "82%", dur: "13s", del: "5.1s", rot: "2.5deg" },
    { sup: "Bezeq",       amt: "₪4,300",  status: "Paid",      sColor: T.green, sBg: T.greenTint, init: "ב", iColor: "#1FA97A", left: "33%", dur: "14s", del: "9.3s", rot: "1.5deg" },
    { sup: "Super-Pharm", amt: "₪11,200", status: "Due soon",  sColor: T.amber, sBg: T.amberTint, init: "S", iColor: "#D95926", left: "60%", dur: "12s", del: "7.1s", rot: "-2deg" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", direction: "ltr" }}>
      {!isMobile && (
        <div style={{ width: "44%", background: T.bg, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", flexShrink: 0 }}>
          <style>{`
            .login-float-card { position: absolute; animation: floatCard var(--dur) ease-in-out var(--del) infinite; }
            @keyframes loginFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
            @keyframes metricGlow { 0%, 100% { text-shadow: 0 0 12px rgba(61,214,163,0); } 50% { text-shadow: 0 0 18px rgba(61,214,163,0.4); } }
            .login-metric-val { animation: metricGlow 3s ease-in-out infinite; }
          `}</style>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(61,214,163,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(61,214,163,0.05) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 30% 35%, rgba(61,214,163,0.14) 0%, transparent 65%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 50% 40% at 75% 70%, rgba(217,169,63,0.08) 0%, transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${T.bg} 0%, transparent 30%, transparent 70%, ${T.bg} 100%)`, pointerEvents: "none", zIndex: 2 }} />
          {FLOAT_CARDS.map((c, i) => (
            <div key={i} className="login-float-card" style={{ left: c.left, bottom: "-120px", "--dur": c.dur, "--del": c.del, "--rot": c.rot, zIndex: 1 }}>
              <div style={{ background: "rgba(17,25,23,0.88)", border: `1px solid ${T.bdr2}`, borderRadius: 10, padding: "10px 14px", backdropFilter: "blur(12px)", minWidth: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.iColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 10, color: "#fff", flexShrink: 0 }}>{c.init}</div>
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.t2 }}>{c.sup}</span>
                </div>
                <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: T.t1, letterSpacing: "-0.02em", marginBottom: 7 }}>{c.amt}</div>
                <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: c.sColor, background: c.sBg, padding: "2px 8px", borderRadius: 20 }}>{c.status}</span>
              </div>
            </div>
          ))}
          <div style={{ position: "relative", zIndex: 3, display: "flex", flexDirection: "column", height: "100%", padding: "40px 48px 40px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0s both" }}>
              <BrandMark size={28} />
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: T.t1 }}>Cashflow</span>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: "clamp(38px,4vw,62px)", letterSpacing: "-0.03em", lineHeight: 1.05, color: T.t1, marginBottom: 14, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.1s both" }}>
                Every invoice.<br /><span style={{ background: "linear-gradient(120deg,#3DD6A3,#8FE8C9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>on time.</span>
              </div>
              <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.7, color: T.t2, maxWidth: 320, marginBottom: 28, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.2s both" }}>
                Cashflow collects every invoice from Gmail, Drive, and WhatsApp automatically — so you always know what you owe, what's overdue, and what's due next.
              </p>
              <div style={{ display: "flex", gap: 0, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.28s both" }}>
                {[
                  { val: `${metricVals[0]}h`, label: "saved per week", sub: "avg. per user" },
                  { val: `${metricVals[1]}%`, label: "fewer late payments", sub: "vs. manual tracking" },
                  { val: `${metricVals[2]}s`, label: "invoice processed", sub: "upload → dashboard" },
                ].map((m, i) => (
                  <div key={i} style={{ flex: 1, padding: "14px 16px", border: `1px solid ${T.bdr}`, borderInlineStart: i === 0 ? `1px solid ${T.bdr}` : "none", ...(i === 0 ? { borderStartStartRadius: 10, borderEndStartRadius: 10 } : i === 2 ? { borderStartEndRadius: 10, borderEndEndRadius: 10 } : {}), background: T.accentTint.replace("0.10", "0.04") }}>
                    <div className="login-metric-val" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: "-0.03em", color: T.accent, lineHeight: 1, marginBottom: 4 }}>{m.val}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t2, lineHeight: 1.3 }}>{m.label}</div>
                    <div style={{ fontFamily: SANS, fontSize: 10, color: T.t3, marginTop: 2 }}>{m.sub}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${T.bdr}`, paddingTop: 20, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.38s both" }}>
              <div style={{ fontFamily: SANS, fontSize: 10, color: T.t3, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Connects with</div>
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}>
                  <svg width="20" height="15" viewBox="0 0 20 15" fill="none" aria-hidden="true"><path fill="#4285F4" d="M0 2v11h4V6.5l6 4 6-4V13h4V2L10 8.5z"/><path fill="#EA4335" d="M0 2l10 6.5L20 2H0z"/><path fill="#34A853" d="M16 13h4V6.5z"/><path fill="#FBBC05" d="M0 13h4V6.5z"/></svg>
                  <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t3 }}>Gmail</span>
                </div>
                <div style={{ width: 1, height: 18, background: T.bdr }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}>
                  <svg width="20" height="18" viewBox="0 0 87.3 78" aria-hidden="true"><path fill="#0066DA" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00AC47" d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5C.4 49.9 0 51.45 0 53h27.5z"/><path fill="#EA4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H60l5.85 11.65z"/><path fill="#00832D" d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684FC" d="M60 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.5c1.6 0 3.15-.4 4.5-1.2z"/><path fill="#FFBA00" d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 60 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>
                  <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t3 }}>Drive</span>
                </div>
                <div style={{ width: 1, height: 18, background: T.bdr }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#25D366"/><path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                  <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t3 }}>WhatsApp</span>
                </div>
                <div style={{ width: 1, height: 18, background: T.bdr }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#10B981"/><path d="M6 8h8M6 11.5h8M6 15h5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 14l1.5 1.5 2.5-2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t3 }}>Green Invoice</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{ flex: 1, background: isMobile ? T.bg : T.surf, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "40px 24px" : "48px 40px", position: "relative" }}>
        {isMobile && <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(61,214,163,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(61,214,163,0.04) 1px, transparent 1px)", backgroundSize: "36px 36px", pointerEvents: "none" }} />}
        {isMobile && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% 20%, rgba(61,214,163,0.10) 0%, transparent 60%)", pointerEvents: "none" }} />}
        <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 400, position: "relative", zIndex: 1 }}>
          {isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 32 }}>
              <BrandMark size={28} />
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: T.t1 }}>Cashflow</span>
            </div>
          )}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: isMobile ? 22 : 28, letterSpacing: "-0.02em", color: T.t1, marginBottom: 6 }}>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
            <p style={{ fontFamily: SANS, fontSize: 15, color: T.t3, marginBottom: 16 }}>{mode === "signin" ? "Sign in to your Cashflow workspace." : "Start managing invoices in minutes."}</p>
            <div style={{ borderRadius: 10, border: `1px solid ${T.accentBdr}`, background: T.accentTint, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(61,214,163,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, color: T.t1, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                  Free up to <span style={{ color: T.accent }}>20 invoices</span> / month
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, marginTop: 3 }}>No credit card required · Upgrade anytime</div>
              </div>
            </div>
          </div>
          <button onClick={handleGoogle} disabled={loading} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "13px 0", background: "rgba(242,241,234,0.06)", border: "1px solid rgba(242,241,234,0.12)", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer", fontFamily: SANS, fontWeight: 500, fontSize: 15, color: T.t1, marginBottom: 18, opacity: loading ? 0.7 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
            {loading ? "Signing in…" : "Continue with Google"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: T.bdr }} />
            <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>or email</span>
            <div style={{ flex: 1, height: 1, background: T.bdr }} />
          </div>
          <form onSubmit={handleEmail} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label htmlFor="login-email" style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: T.t3, display: "block", marginBottom: 5 }}>Email address</label>
              <input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required style={inp} />
            </div>
            <div>
              <label htmlFor="login-password" style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: T.t3, display: "block", marginBottom: 5 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input id="login-password" type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{ ...inp, paddingInlineEnd: 40 }} />
                <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide password" : "Show password"} style={{ position: "absolute", insetInlineEnd: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {authError && (
              <div role="alert" style={{ fontFamily: SANS, fontSize: 13, color: T.red, background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 7, padding: "9px 12px" }}>
                {authError}
              </div>
            )}
            <button type="submit" disabled={loading} style={{ padding: "13px 0", background: T.accent, border: "none", borderRadius: 8, fontFamily: SANS, fontWeight: 700, fontSize: 15, color: T.accentInk, cursor: loading ? "not-allowed" : "pointer", marginTop: 4, opacity: loading ? 0.7 : 1, boxShadow: "0 4px 18px rgba(61,214,163,0.25)" }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.filter = "brightness(1.08)"; }}
              onMouseLeave={e => e.currentTarget.style.filter = "none"}>
              {loading ? "Signing in…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p style={{ fontFamily: SANS, fontSize: 13, color: T.t3, textAlign: "center", marginTop: 22 }}>
            {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setAuthError(null); }} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>{mode === "signin" ? "Start free" : "Sign in"}</button>
          </p>
        </div>
      </div>
    </div>
  );
}
