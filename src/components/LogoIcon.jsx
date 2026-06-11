export default function LogoIcon({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#3b82f6"/>
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#logo-grad)"/>
      <path d="M11 23C11 17 15 13 20 13C25 13 29 17 29 22" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M29 22C29 27 25 31 20 31C15 31 11 27 11 23" stroke="rgba(255,255,255,.4)" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <polyline points="17,13 20,9 23,13" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
