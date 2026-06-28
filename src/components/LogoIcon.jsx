export default function LogoIcon({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="rgba(99,102,241,.18)"/>
      <path d="M9 18C9 13 13 9.5 18 9.5C21 9.5 23.5 10.7 25 12.7" stroke="#A5B4FC" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M27 18C27 23 23 26.5 18 26.5C15 26.5 12.5 25.3 11 23.3" stroke="#818CF8" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <circle cx="18" cy="18" r="2.6" fill="#C7D2FE"/>
      <circle cx="25" cy="12.7" r="1.7" fill="#818CF8"/>
      <circle cx="11" cy="23.3" r="1.7" fill="#A5B4FC"/>
    </svg>
  );
}
