import { useEffect, useRef, useState } from 'react';
import './onboarding.css';

const STEPS = [
  {
    target: '[data-onboarding="kpi"]',
    title: "Your Cash Flow at a Glance",
    body: "These four cards show your financial pulse. Outstanding is what you owe in total, Overdue flags past-due invoices, Next Month shows upcoming payments, and Total Paid tracks what's already settled.",
  },
  {
    target: '[data-onboarding="upload"]',
    title: "Add Invoices with AI",
    body: "Click \"Upload Invoices\" to drop any PDF or image. Our AI reads the supplier, amount, and date automatically — no manual entry needed.",
  },
  {
    target: '[data-onboarding="integrations"]',
    title: "Auto-Sync Your Invoices",
    body: "Connect Gmail, Google Drive, WhatsApp, or Green Invoice and we'll pull new invoices automatically on a schedule you choose.",
  },
  {
    target: '[data-onboarding="suppliers"]',
    title: "Manage Your Suppliers",
    body: "Add suppliers and set their payment terms (shotef, immediate, or custom). We use these to auto-calculate due dates when invoices are uploaded.",
  },
];

export { STEPS };

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
  const PAD = 8;
  const GAP = 12;
  const TW  = 320;

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
    const placeBelow = spaceBelow >= 170 || spaceBelow >= rect.top;
    const top = placeBelow
      ? rect.top + rect.height + PAD + GAP
      : rect.top - PAD - GAP - 170;

    let left = rect.left + rect.width / 2 - TW / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - TW - 16));

    tooltipStyle = { ...tooltipStyle, top, left, width: TW };
  }

  return (
    <>
      <div className="ob-backdrop" onClick={onSkip} />

      {rect && <div className="ob-spotlight" style={spotlightStyle} />}

      <div ref={tooltipRef} className="ob-tooltip" style={tooltipStyle}>
        <div className="ob-tooltip-header">
          <span className="ob-step-counter">{step + 1} of {STEPS.length}</span>
          <button className="ob-skip-btn" onClick={onSkip}>Skip tour</button>
        </div>

        <h3 className="ob-title">{current.title}</h3>
        <p className="ob-body">{current.body}</p>

        <div className="ob-footer">
          <div className="ob-dots">
            {STEPS.map((_, i) => (
              <div key={i} className={`ob-dot${i === step ? ' active' : ''}`} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button className="ob-btn ob-btn-ghost" onClick={onPrev}>Back</button>
            )}
            <button className="ob-btn ob-btn-primary" onClick={isLast ? onFinish : onNext}>
              {isLast ? 'Finish ✓' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
