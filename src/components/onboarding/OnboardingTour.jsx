import { useEffect, useRef, useState } from 'react';
import { BarChart3, Zap, Link2, Building2, ChevronRight } from 'lucide-react';
import './onboarding.css';

const SANS = "'IBM Plex Sans', system-ui, sans-serif";

const T = {
  bg: "#07090F", surf: "#111827", surf2: "#0E1520",
  bdr: "rgba(255,255,255,0.07)", bdr2: "rgba(255,255,255,0.12)",
  t1: "#E8EFF8", t2: "#627488", t3: "#4A6278",
  indigo: "#6366F1", indigoTint: "rgba(99,102,241,0.10)", indigoBdr: "rgba(99,102,241,0.30)",
  green: "#22C55E", greenBdr: "rgba(34,197,94,0.25)",
};

const STEPS = [
  { target: '[data-onboarding="kpi"]',          Icon: BarChart3, title: 'Your Cash Flow Dashboard',    body: 'Four live KPI cards track Outstanding, Overdue, Next Month, and Total Paid — your complete financial picture at a glance.' },
  { target: '[data-onboarding="upload"]',        Icon: Zap,       title: 'AI Invoice Extraction',       body: 'Drop any PDF or photo of an invoice. Our AI reads the supplier, amount, and due date in seconds — no manual entry ever.' },
  { target: '[data-onboarding="integrations"]',  Icon: Link2,     title: 'Connect & Auto-Sync',         body: 'Link Gmail, Google Drive, WhatsApp, or Green Invoice. New invoices land in your dashboard automatically.' },
  { target: '[data-onboarding="suppliers"]',     Icon: Building2, title: 'Suppliers & Payment Terms',   body: 'Add your regular suppliers and set terms like Shotef+30. Due dates are calculated automatically from the invoice date.' },
];

// ── Logo SVG (matches Sidebar) ─────────────────────────────────────────────
function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <path d="M9 18C9 13 13 9.5 18 9.5C21 9.5 23.5 10.7 25 12.7" stroke="#A5B4FC" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M27 18C27 23 23 26.5 18 26.5C15 26.5 12.5 25.3 11 23.3" stroke="#818CF8" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="18" cy="18" r="2.6" fill="#C7D2FE"/>
      <circle cx="25" cy="12.7" r="1.7" fill="#818CF8"/>
      <circle cx="11" cy="23.3" r="1.7" fill="#A5B4FC"/>
    </svg>
  );
}

// ── Welcome Modal ──────────────────────────────────────────────────────────
export function OnboardingWelcome({ onBegin, onSkip }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(7,9,15,.9)', backdropFilter: 'blur(24px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'ob-fade-in 0.3s ease',
    }}>
      <div style={{
        width: 440, maxWidth: 'calc(100vw - 32px)',
        background: T.surf, borderRadius: 20,
        border: '1px solid rgba(99,102,241,.22)',
        boxShadow: '0 40px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(99,102,241,.1)',
        overflow: 'hidden',
        animation: 'ob-card-in 0.4s cubic-bezier(.16,1,.3,1)',
      }}>
        {/* Indigo top bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#6366F1,#818CF8)' }} />

        <div style={{ padding: '44px 40px 36px', textAlign: 'center' }}>
          {/* Icon */}
          <div style={{
            width: 72, height: 72, borderRadius: 18,
            background: 'rgba(99,102,241,.12)',
            border: '1px solid rgba(99,102,241,.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 28px',
            boxShadow: '0 12px 32px rgba(99,102,241,.2)',
          }}>
            <LogoMark size={36} />
          </div>

          <h1 style={{
            fontFamily: SANS, fontSize: 26, fontWeight: 700,
            letterSpacing: '-0.04em', color: T.t1,
            margin: '0 0 10px', lineHeight: 1.2,
          }}>
            Welcome to Cashflow
          </h1>
          <p style={{
            fontFamily: SANS, fontSize: 14, color: T.t2,
            lineHeight: 1.65, margin: '0 auto 32px', maxWidth: 300,
          }}>
            Let's take a quick tour so you know exactly what to do from day one.
          </p>

          <button
            onClick={onBegin}
            style={{
              width: '100%', padding: '13px 0',
              background: '#6366F1', border: 'none', borderRadius: 10,
              fontFamily: SANS, fontSize: 14, fontWeight: 600, color: '#fff',
              cursor: 'pointer', letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              boxShadow: '0 6px 20px rgba(99,102,241,.35)',
              transition: 'box-shadow .15s, transform .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 10px 28px rgba(99,102,241,.48)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,.35)'; e.currentTarget.style.transform = 'none'; }}
          >
            Start tour <ChevronRight size={14} strokeWidth={2.5} />
          </button>

          <button
            onClick={onSkip}
            style={{
              marginTop: 14, background: 'none', border: 'none',
              fontFamily: SANS, fontSize: 13, color: T.t3,
              cursor: 'pointer', display: 'block', width: '100%',
              transition: 'color .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = T.t2}
            onMouseLeave={e => e.currentTarget.style.color = T.t3}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confetti ───────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#6366F1', '#818CF8', '#22C55E', '#F59E0B', '#3B82F6', '#A5B4FC'];

function Confetti() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${5 + (i / 20) * 90}%`,
    top: `${35 + (i % 6) * 5}%`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${(i % 9) * 0.07}s`,
    w: 6 + (i % 3) * 2,
    h: 8 + (i % 3) * 2,
    rotate: i % 3 === 0 ? 'rotate(45deg)' : i % 3 === 1 ? 'rotate(20deg)' : 'none',
  }));
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2003, overflow: 'hidden' }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: p.left, top: p.top,
          width: p.w, height: p.h, background: p.color, borderRadius: 2,
          transform: p.rotate, animationDelay: p.delay,
          animation: 'ob-confetti-fall 1.8s ease-out forwards',
        }} />
      ))}
    </div>
  );
}

// ── Celebration ────────────────────────────────────────────────────────────
export function OnboardingCelebration() {
  return (
    <>
      <Confetti />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2002,
        background: 'rgba(5,8,18,.9)', backdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        animation: 'ob-fade-in 0.25s ease',
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: 'rgba(34,197,94,.1)', border: `2px solid ${T.green}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 24,
          animation: 'ob-ring-in 0.45s cubic-bezier(.16,1,.3,1)',
          boxShadow: '0 0 40px rgba(34,197,94,.18)',
        }}>
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <path d="M11 22 L19 30 L33 14"
              stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              style={{
                strokeDasharray: 44, strokeDashoffset: 44,
                animation: 'ob-draw-check 0.45s cubic-bezier(.16,1,.3,1) 0.3s forwards',
              }}
            />
          </svg>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 24, fontWeight: 700, color: T.t1, letterSpacing: '-0.04em', marginBottom: 8, animation: 'ob-slide-up 0.4s ease 0.1s both' }}>
          You're all set!
        </div>
        <div style={{ fontFamily: SANS, fontSize: 14, color: T.t2, animation: 'ob-slide-up 0.4s ease 0.2s both' }}>
          Your getting-started checklist is ready on the dashboard.
        </div>
      </div>
    </>
  );
}

// ── Spotlight Tour ─────────────────────────────────────────────────────────
export default function OnboardingTour({ step, onNext, onPrev, onSkip, onFinish }) {
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);
  const current = STEPS[step];

  useEffect(() => {
    if (!current) return;
    const el = document.querySelector(current.target);
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [step, current?.target]);

  if (!current) return null;

  const { Icon } = current;
  const isLast = step === STEPS.length - 1;
  const PAD = 10, GAP = 16, TW = 360;

  let spotlightStyle = null;
  let tooltipTop = null, tooltipLeft = null;

  if (rect) {
    spotlightStyle = {
      top: rect.top - PAD, left: rect.left - PAD,
      width: rect.width + PAD * 2, height: rect.height + PAD * 2,
    };
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const below = spaceBelow >= 200 || spaceBelow >= rect.top;
    tooltipTop = below ? rect.top + rect.height + PAD + GAP : rect.top - PAD - GAP - 230;
    let cl = rect.left + rect.width / 2 - TW / 2;
    tooltipLeft = Math.max(16, Math.min(cl, window.innerWidth - TW - 16));
  }

  // Always show a dark overlay; spotlight cutout is provided by the ring's box-shadow
  return (
    <>
      {/* Always-visible dark overlay — ensures dimming even before rect resolves */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(7,9,15,.75)', cursor: 'default' }} onClick={onSkip} />

      {/* Spotlight ring — provides the cutout via box-shadow */}
      {spotlightStyle && (
        <div style={{
          position: 'fixed', zIndex: 2001, pointerEvents: 'none',
          borderRadius: 12,
          ...spotlightStyle,
          animation: 'ob-spotlight-pulse 1.8s ease-in-out infinite',
          transition: 'top .3s cubic-bezier(.16,1,.3,1), left .3s cubic-bezier(.16,1,.3,1), width .3s cubic-bezier(.16,1,.3,1), height .3s cubic-bezier(.16,1,.3,1)',
        }} />
      )}

      {/* Tooltip — only render once we have a position */}
      {tooltipTop !== null && <div ref={tooltipRef} style={{
        position: 'fixed', zIndex: 2002,
        top: tooltipTop, left: tooltipLeft, width: TW,
        background: '#0E1520',
        border: '1px solid rgba(99,102,241,.25)',
        borderRadius: 16,
        boxShadow: '0 24px 56px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.04)',
        overflow: 'hidden',
      }}>
        {/* Accent bar */}
        <div style={{ height: 2, background: 'linear-gradient(90deg,#6366F1,#818CF8)' }} />

        <div key={step} style={{ padding: '18px 20px 16px', animation: 'ob-step-in 0.25s cubic-bezier(.16,1,.3,1)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 11, flexShrink: 0,
              background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={18} strokeWidth={1.75} color="#818CF8" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '2px 9px', borderRadius: 20, marginBottom: 6,
                background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)',
                fontFamily: SANS, fontSize: 10, fontWeight: 700,
                letterSpacing: '.07em', textTransform: 'uppercase', color: '#818CF8',
              }}>
                Step {step + 1} of {STEPS.length}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: T.t1, letterSpacing: '-0.03em', lineHeight: 1.25 }}>
                {current.title}
              </div>
            </div>
          </div>

          <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, lineHeight: 1.65, margin: '0 0 18px' }}>
            {current.body}
          </p>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Dots */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{
                  width: i === step ? 18 : 6, height: 6, borderRadius: 3,
                  background: i === step ? '#6366F1' : 'rgba(255,255,255,.12)',
                  transition: 'all .25s cubic-bezier(.16,1,.3,1)',
                  boxShadow: i === step ? '0 0 8px rgba(99,102,241,.5)' : 'none',
                }} />
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 0 && (
                <button onClick={onPrev} style={{
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
                  fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t2,
                  transition: 'all .15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.2)'; e.currentTarget.style.color = T.t1; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = T.t2; }}
                >Back</button>
              )}
              <button onClick={isLast ? onFinish : onNext} style={{
                padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                background: '#6366F1', border: 'none',
                fontFamily: SANS, fontSize: 13, fontWeight: 600, color: '#fff',
                display: 'flex', alignItems: 'center', gap: 4,
                boxShadow: '0 4px 12px rgba(99,102,241,.35)',
                transition: 'box-shadow .15s, transform .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 18px rgba(99,102,241,.5)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,.35)'; e.currentTarget.style.transform = 'none'; }}
              >
                {isLast ? 'Finish' : 'Next'} <ChevronRight size={13} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <button onClick={onSkip} style={{
            display: 'block', width: '100%', textAlign: 'center',
            marginTop: 12, background: 'none', border: 'none',
            fontFamily: SANS, fontSize: 11, color: T.t3, cursor: 'pointer',
            transition: 'color .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = T.t2}
            onMouseLeave={e => e.currentTarget.style.color = T.t3}
          >Skip tour</button>
        </div>
      </div>}
    </>
  );
}
