import { useEffect, useRef, useState } from 'react';
import './onboarding.css';

const STEPS = [
  {
    target: '[data-onboarding="kpi"]',
    icon: '📊',
    title: 'Your Cash Flow Dashboard',
    body: 'Four live KPI cards track Outstanding, Overdue, Next Month, and Total Paid — your complete financial picture at a glance.',
  },
  {
    target: '[data-onboarding="upload"]',
    icon: '⚡',
    title: 'AI Invoice Extraction',
    body: 'Drop any PDF or photo of an invoice. Our AI reads the supplier, amount, and date in seconds — no manual typing ever.',
  },
  {
    target: '[data-onboarding="integrations"]',
    icon: '🔗',
    title: 'Connect & Auto-Sync',
    body: 'Link Gmail, Google Drive, WhatsApp, or Green Invoice. We pull new invoices automatically on your schedule.',
  },
  {
    target: '[data-onboarding="suppliers"]',
    icon: '🏢',
    title: 'Suppliers & Payment Terms',
    body: 'Add your suppliers and set terms like Shotef+30. We calculate every due date automatically from there.',
  },
];

// ── Welcome Modal ────────────────────────────────────────────────
export function OnboardingWelcome({ onBegin, onSkip }) {
  return (
    <div className="ob-overlay ob-welcome-overlay">
      <div className="ob-welcome-card">
        <div className="ob-welcome-body">
          <div className="ob-welcome-icon">💸</div>
          <h1 className="ob-welcome-title">Welcome to Cashflow</h1>
          <p className="ob-welcome-sub">
            Let's show you around in 60 seconds — you'll know exactly what to do.
          </p>
          <button className="ob-welcome-cta" onClick={onBegin}>
            Let's go →
          </button>
          <br />
          <button className="ob-welcome-skip" onClick={onSkip}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confetti ─────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#f472b6'];

function Confetti() {
  const particles = Array.from({ length: 22 }, (_, i) => ({
    id: i,
    left: `${5 + Math.floor((i / 22) * 90)}%`,
    top: `${40 + Math.floor(Math.random() * 30)}%`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${(i % 8) * 0.08}s`,
    size: 6 + (i % 4) * 2,
    rotate: i % 2 === 0 ? 'rotate(45deg)' : 'none',
  }));

  return (
    <div className="ob-confetti-wrap">
      {particles.map(p => (
        <div
          key={p.id}
          className="ob-confetti-particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: p.color,
            transform: p.rotate,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}

// ── Celebration Screen ───────────────────────────────────────────
export function OnboardingCelebration() {
  return (
    <>
      <Confetti />
      <div className="ob-overlay ob-celebration-overlay">
        <div className="ob-check-ring">✓</div>
        <div className="ob-celebration-title">You're all set!</div>
        <div className="ob-celebration-sub">Your checklist is waiting on the dashboard.</div>
      </div>
    </>
  );
}

// ── Spotlight Tour ───────────────────────────────────────────────
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
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step, current?.target]);

  if (!current) return null;

  const isLast = step === STEPS.length - 1;
  const PAD    = 10;
  const GAP    = 14;
  const TW     = 380;

  let spotlightStyle = {};
  let tooltipStyle   = { position: 'fixed', zIndex: 1002 };

  if (rect) {
    spotlightStyle = {
      top:    rect.top    - PAD,
      left:   rect.left   - PAD,
      width:  rect.width  + PAD * 2,
      height: rect.height + PAD * 2,
    };

    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const placeBelow = spaceBelow >= 190 || spaceBelow >= rect.top;
    const top = placeBelow
      ? rect.top + rect.height + PAD + GAP
      : rect.top - PAD - GAP - 210;

    let left = rect.left + rect.width / 2 - TW / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - TW - 16));

    tooltipStyle = { ...tooltipStyle, top, left, width: TW };
  }

  return (
    <>
      <div className="ob-tour-backdrop" onClick={onSkip} />

      {rect && <div className="ob-spotlight" style={spotlightStyle} />}

      <div ref={tooltipRef} className="ob-tooltip" style={tooltipStyle}>
        {/* key forces re-animation on step change */}
        <div key={step} className="ob-tooltip-inner">
          <div className="ob-tooltip-top">
            <div className="ob-step-icon">{current.icon}</div>
            <div className="ob-tooltip-meta">
              <div className="ob-step-pill">Step {step + 1} of {STEPS.length}</div>
              <div className="ob-tooltip-title">{current.title}</div>
            </div>
          </div>

          <p className="ob-tooltip-body">{current.body}</p>

          <div className="ob-tooltip-footer">
            <div className="ob-dots">
              {STEPS.map((_, i) => (
                <div key={i} className={`ob-dot${i === step ? ' active' : ''}`} />
              ))}
            </div>
            <div className="ob-nav-btns">
              {step > 0 && (
                <button className="ob-btn ob-btn-ghost" onClick={onPrev}>Back</button>
              )}
              <button className="ob-btn ob-btn-primary" onClick={isLast ? onFinish : onNext}>
                {isLast ? 'Finish ✓' : 'Next →'}
              </button>
            </div>
          </div>

          <button className="ob-skip-link" onClick={onSkip}>Skip tour</button>
        </div>
      </div>
    </>
  );
}
