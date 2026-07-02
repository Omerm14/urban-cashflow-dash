import { useState } from "react";
import { useT } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_MONO as MONO } from "../theme";

// Presets use shotef_plus(N) format (end-of-month + N days) — matches existing DB values.
// Custom falls back to shotef_plus(N) for arbitrary values.
const TERMS_PRESETS = [
  { value: "immediate",       label: "Immediate" },
  { value: "shotef",          label: "Shotef" },
  { value: "shotef_plus(30)", label: "+30" },
  { value: "shotef_plus(45)", label: "+45" },
  { value: "shotef_plus(75)", label: "+75" },
];
const isPreset = (v) => TERMS_PRESETS.some((o) => o.value === v);

export default function TermsPicker({ value, onChange }) {
  const T = useT();
  const isCustom = value && !isPreset(value);
  const [customDays, setCustomDays] = useState(() => {
    const mShotef = value?.match(/^shotef_plus\((\d+)\)$/);
    const mNet = value?.match(/^net(\d+)$/);
    if (mShotef && !isPreset(value)) return mShotef[1];
    if (mNet) return mNet[1];
    return "";
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>
      <div style={{ display: "flex", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: 2, gap: 2 }}>
        {TERMS_PRESETS.map((opt) => (
          <button key={opt.value} onClick={() => onChange(opt.value)}
            style={{ padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: !isCustom && value === opt.value ? 700 : 400, background: !isCustom && value === opt.value ? T.accent : "transparent", color: !isCustom && value === opt.value ? T.accentInk : T.t2, transition: "background 0.15s, color 0.15s", whiteSpace: "nowrap" }}>
            {opt.label}
          </button>
        ))}
        <button onClick={() => { if (!isCustom) { setCustomDays(""); onChange("net_custom"); } }}
          style={{ padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: isCustom ? 700 : 400, background: isCustom ? T.accent : "transparent", color: isCustom ? T.accentInk : T.t2, transition: "background 0.15s, color 0.15s", whiteSpace: "nowrap" }}>
          Custom
        </button>
      </div>
      {isCustom && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>+</span>
          <input
            type="number" min="1" max="365" value={customDays}
            onChange={(e) => { setCustomDays(e.target.value); if (e.target.value) onChange(`shotef_plus(${e.target.value})`); }}
            placeholder="days" aria-label="Custom payment terms in days"
            style={{ width: 60, height: 30, padding: "0 8px", border: `1px solid ${T.accentBdr}`, borderRadius: 6, background: T.surf, color: T.t1, fontFamily: MONO, fontSize: 13, outline: "none", textAlign: "center" }}
            autoFocus
          />
          <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>days</span>
        </div>
      )}
    </div>
  );
}
