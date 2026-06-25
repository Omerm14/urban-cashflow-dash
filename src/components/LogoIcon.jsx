export default function LogoIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="li-arc" x1="50" y1="10" x2="85" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0"   stopColor="#1d4ed8"/>
          <stop offset="0.5" stopColor="#3b82f6"/>
          <stop offset="1"   stopColor="#06b6d4"/>
        </linearGradient>
        <linearGradient id="li-arrow" x1="76" y1="68" x2="90" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>

      {/* C-arc: center (50,50), radius 34, opens to the right */}
      {/* From ~1 o'clock (67,21) counterclockwise to ~4 o'clock (79,67) */}
      <path
        d="M 67 21 A 34 34 0 1 0 79 67"
        stroke="url(#li-arc)"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />

      {/* Document body — rounded corners except top-right which is folded */}
      <path
        d="M 37 26 L 57 26 L 65 34 L 65 64 Q 65 66 63 66 L 37 66 Q 35 66 35 64 L 35 28 Q 35 26 37 26 Z"
        fill="white"
      />

      {/* Fold triangle — cyan */}
      <path d="M 57 26 L 65 34 L 57 34 Z" fill="#06b6d4"/>

      {/* Document text lines — dark navy */}
      <line x1="41" y1="44" x2="61" y2="44" stroke="#0f172a" strokeWidth="2.8" strokeLinecap="round"/>
      <line x1="41" y1="51" x2="61" y2="51" stroke="#0f172a" strokeWidth="2.8" strokeLinecap="round"/>
      <line x1="41" y1="58" x2="52" y2="58" stroke="#0f172a" strokeWidth="2.8" strokeLinecap="round"/>

      {/* Arrow body — curved, from arc endpoint sweeping up-right */}
      <path
        d="M 76 68 Q 89 72 85 52"
        stroke="url(#li-arrow)"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Arrowhead — solid filled triangle pointing upper-right */}
      <path d="M 85 44 L 93 55 L 79 57 Z" fill="#22d3ee"/>
    </svg>
  );
}
