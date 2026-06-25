export default function LogoIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo-arc-grad" x1="4" y1="4" x2="28" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6"/>
          <stop offset="1" stopColor="#2563eb"/>
        </linearGradient>
        <linearGradient id="logo-arrow-grad" x1="22" y1="28" x2="36" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#06b6d4"/>
          <stop offset="1" stopColor="#0891b2"/>
        </linearGradient>
      </defs>

      {/* C-arc: thick arc forming stylized "C" shape */}
      <path
        d="M32 13.5C29.5 8.8 24.8 6 20 6C12.3 6 6 12.3 6 20C6 27.7 12.3 34 20 34C24.8 34 29.5 31.2 32 26.5"
        stroke="url(#logo-arc-grad)"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Document body */}
      <rect x="14" y="12" width="13" height="17" rx="2.5" fill="white"/>

      {/* Document fold (top-right corner) */}
      <path d="M23 12 L27 16 L23 16 Z" fill="url(#logo-arc-grad)"/>
      <rect x="23" y="12" width="4" height="4" rx="0.5" fill="white" opacity="0.3"/>

      {/* Document lines */}
      <line x1="17" y1="19.5" x2="24" y2="19.5" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
      <line x1="17" y1="22" x2="24" y2="22" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
      <line x1="17" y1="24.5" x2="21" y2="24.5" stroke="#3b82f6" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>

      {/* Curved upward arrow (cyan) emerging from bottom-right of arc */}
      <path
        d="M28.5 29C30.5 26.5 33 23 31.5 19"
        stroke="url(#logo-arrow-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Arrowhead */}
      <polyline
        points="28,16.5 31.5,19 34.5,16"
        stroke="url(#logo-arrow-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
