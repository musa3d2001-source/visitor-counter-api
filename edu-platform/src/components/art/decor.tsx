/** زخارف: نجمة، خط ذهبي، سماء ليلية، شروق، أوراق الباقة. كلها aria-hidden. */
/** نجمة لامعة صغيرة للزخرفة */
export function Sparkle({ className, color = "#FFC531" }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M12 0c1 6.5 5.5 11 12 12-6.5 1-11 5.5-12 12-1-6.5-5.5-11-12-12C6.5 11 11 6.5 12 0Z" fill={color} />
    </svg>
  );
}

/** خط يدوي ذهبي تحت الكلمة المميزة في العنوان */
export function Swash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 24" preserveAspectRatio="none" aria-hidden focusable="false">
      <path d="M4 16C46 6 108 2 216 10" fill="none" stroke="#FFC531" strokeWidth="9" strokeLinecap="round" />
      <path d="M30 20C80 14 140 12 196 16" fill="none" stroke="#FF9F43" strokeWidth="4" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

/** هلال ونجوم لجانب «ليلة الاختبار» */
export function NightSky({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 200" aria-hidden focusable="false">
      <path d="M232 30a40 40 0 1 0 36 62 32 32 0 1 1-36-62Z" fill="#FFE29A" />
      <g fill="#fff">
        <circle cx="40" cy="40" r="2.5" />
        <circle cx="120" cy="24" r="2" opacity=".8" />
        <circle cx="180" cy="70" r="2.5" opacity=".9" />
        <circle cx="70" cy="110" r="2" opacity=".6" />
        <circle cx="150" cy="140" r="1.8" opacity=".7" />
        <circle cx="270" cy="150" r="2.2" opacity=".8" />
        <circle cx="20" cy="170" r="1.8" opacity=".6" />
      </g>
      <path d="M96 64l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#FFE29A" />
      <path d="M206 134l2.5 5.5 5.5 2.5-5.5 2.5-2.5 5.5-2.5-5.5-5.5-2.5 5.5-2.5Z" fill="#fff" />
    </svg>
  );
}

/** شمس مشرقة لجانب «الاختبار القصير» */
export function Sunrise({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 120" aria-hidden focusable="false">
      <g stroke="#FFF4C9" strokeWidth="6" strokeLinecap="round" opacity=".9">
        <path d="M100 6v16M40 30l10 12M160 30l-10 12M14 80h16M170 80h16" />
      </g>
      <path d="M40 120a60 60 0 0 1 120 0Z" fill="#FFF4C9" />
      <path d="M58 120a42 42 0 0 1 84 0Z" fill="#FFD25E" />
    </svg>
  );
}

/** أوراق متراكبة بألوان مواد الباقة الحقيقية */
export function BundleStack({ colors, className }: { colors: string[]; className?: string }) {
  const sheets = colors.slice(0, 5);
  const n = sheets.length || 1;
  return (
    <svg viewBox="0 0 220 160" className={className} width="100%" height="100%" aria-hidden focusable="false">
      {sheets.map((c, i) => {
        const angle = (i - (n - 1) / 2) * 9;
        return (
          <g key={i} transform={`rotate(${angle} 110 170)`}>
            <rect x="72" y="22" width="76" height="100" rx="10" fill="#fff" />
            <rect x="72" y="22" width="76" height="30" rx="10" fill={c} />
            <rect x="72" y="42" width="76" height="10" fill={c} />
            <rect x="82" y="64" width="56" height="6" rx="3" fill={c} opacity=".35" />
            <rect x="82" y="78" width="40" height="6" rx="3" fill={c} opacity=".25" />
            <rect x="82" y="92" width="48" height="6" rx="3" fill={c} opacity=".2" />
          </g>
        );
      })}
    </svg>
  );
}
