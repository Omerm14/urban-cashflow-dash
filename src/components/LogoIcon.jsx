export default function LogoIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="li-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0d1f3c"/>
          <stop offset="1" stopColor="#0a1628"/>
        </linearGradient>
        <linearGradient id="li-arc" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6"/>
          <stop offset="1" stopColor="#2563eb"/>
        </linearGradient>
        <linearGradient id="li-arrow" x1="24" y1="32" x2="36" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#06b6d4"/>
          <stop offset="1" stopColor="#22d3ee"/>
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="40" height="40" rx="10" fill="url(#li-bg)"/>

      {/* C-arc — bold stroke forming the C shape, open on the right */}
      <path
        d="M30 12C27 8.5 23.2 7 20 7C13 7 7 13 7 20C7 27 13 33 20 33C23.2 33 27 31.5 30 28"
        stroke="url(#li-arc)"
        strokeWidth="3.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Document body */}
      <rect x="15" y="13" width="11" height="14" rx="2" fill="white"/>

      {/* Document fold corner */}
      <path d="M22 13 L26 17 L22 17 Z" fill="#dbeafe" opacity="0.6"/>

      {/* Document text lines */}
      <line x1="17.5" y1="20" x2="23.5" y2="20" stroke="#3b82f6" strokeWidth="1.1" strokeLinecap="round" opacity="0.55"/>
      <line x1="17.5" y1="22.5" x2="23.5" y2="22.5" stroke="#3b82f6" strokeWidth="1.1" strokeLinecap="round" opacity="0.55"/>
      <line x1="17.5" y1="25" x2="21" y2="25" stroke="#3b82f6" strokeWidth="1.1" strokeLinecap="round" opacity="0.55"/>

      {/* Upward arrow tail (curved, cyan) */}
      <path
        d="M27 31C29 28.5 31.5 25 30 21"
        stroke="url(#li-arrow)"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Arrowhead */}
      <polyline
        points="26.5,18 30,21 33,18"
        stroke="url(#li-arrow)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
