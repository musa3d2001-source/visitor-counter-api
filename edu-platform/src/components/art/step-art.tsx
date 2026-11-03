/** رسومات خطوات البدء الأربع (مساحة ١٢٠×١٢٠). */
/** رسومات خطوات البدء الأربع (مساحة ١٢٠×١٢٠) */
export function StepArt({ n, className }: { n: number; className?: string }) {
  switch (n) {
    case 1:
      return (
        <svg viewBox="0 0 120 120" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <rect x="18" y="18" width="38" height="38" rx="12" fill="#FFC531" />
          <rect x="64" y="18" width="38" height="38" rx="12" fill="#fff" opacity=".9" />
          <rect x="18" y="64" width="38" height="38" rx="12" fill="#fff" opacity=".55" />
          <rect x="64" y="64" width="38" height="38" rx="12" fill="#fff" opacity=".9" />
          <text x="37" y="47" textAnchor="middle" fontFamily="'Cairo Variable', Cairo, sans-serif" fontWeight="900" fontSize="26" fill="#7A4A00">٦</text>
          <path d="M74 74l26 10-11 4-4 11Z" fill="#172026" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
        </svg>
      );
    case 2:
      return (
        <svg viewBox="0 0 120 120" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <rect x="12" y="22" width="96" height="66" rx="14" fill="#fff" />
          <circle cx="60" cy="55" r="17" fill="currentColor" />
          <path d="M55 46v18l15-9Z" fill="#fff" />
          <rect x="30" y="96" width="60" height="8" rx="4" fill="#fff" opacity=".55" />
          <rect x="30" y="96" width="26" height="8" rx="4" fill="#FFC531" />
          <path d="M96 12l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" fill="#FFC531" />
        </svg>
      );
    case 3:
      return (
        <svg viewBox="0 0 120 120" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <rect x="10" y="30" width="80" height="54" rx="12" fill="#fff" opacity=".6" transform="rotate(-8 50 57)" />
          <rect x="16" y="36" width="80" height="54" rx="12" fill="#fff" />
          <rect x="16" y="48" width="80" height="10" fill="currentColor" opacity=".8" />
          <rect x="26" y="70" width="26" height="7" rx="3.5" fill="currentColor" opacity=".3" />
          <path d="M86 58l22 8v14c0 14-10 22-22 26-12-4-22-12-22-26V66Z" fill="#FFC531" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
          <path d="M77 82l7 7 12-14" fill="none" stroke="#172026" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 120" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <rect x="16" y="26" width="18" height="70" rx="5" fill="#fff" />
          <rect x="38" y="18" width="18" height="78" rx="5" fill="#FFC531" />
          <rect x="60" y="30" width="16" height="66" rx="5" fill="#fff" opacity=".7" />
          <rect x="74" y="30" width="18" height="70" rx="5" fill="#fff" transform="rotate(16 83 65)" />
          <rect x="10" y="96" width="100" height="8" rx="4" fill="#fff" opacity=".85" />
          <path d="M42 30h10M42 40h10" stroke="#7A4A00" strokeWidth="3" strokeLinecap="round" />
          <circle cx="100" cy="22" r="12" fill="#fff" />
          <path d="M96 16v12l9-6Z" fill="currentColor" />
        </svg>
      );
  }
}
