/** رسومات الصفوف (مساحة ١٦٠×١٦٠). currentColor = اللون الداكن للصف. */
import { GOLD, GOLD_SOFT } from "./palette";

/** رسومات الصفوف: ٦ صاروخ الانطلاق، ٧ كتاب مفتوح، ٨ مصباح فكرة، ٩ قبعة التخرج من المتوسطة */
export function GradeArt({ level, className }: { level: number; className?: string }) {
  switch (level) {
    case 6:
      return (
        <svg viewBox="0 0 160 160" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <g transform="rotate(38 80 80)">
            <path d="M68 104q12 46 24 0Z" fill={GOLD} />
            <path d="M73 104q7 26 14 0Z" fill="#fff" opacity=".85" />
            <path d="M80 14c20 16 26 46 22 86H58c-4-40 2-70 22-86Z" fill="#fff" />
            <path d="M58 76 38 106l22-4ZM102 76l20 30-22-4Z" fill={GOLD_SOFT} />
            <circle cx="80" cy="58" r="13" fill="currentColor" />
            <circle cx="80" cy="58" r="13" fill="none" stroke={GOLD} strokeWidth="4" />
            <circle cx="76" cy="54" r="4" fill="#fff" opacity=".7" />
          </g>
          <path d="M22 30l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" fill="#fff" />
          <circle cx="138" cy="128" r="5" fill="#fff" opacity=".8" />
          <circle cx="30" cy="124" r="3.5" fill="#fff" opacity=".7" />
        </svg>
      );
    case 7:
      return (
        <svg viewBox="0 0 160 160" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <path d="M80 54c-16-12-38-14-60-8v74c22-6 44-4 60 8Z" fill="#fff" />
          <path d="M80 54c16-12 38-14 60-8v74c-22-6-44-4-60 8Z" fill="#fff" opacity=".82" />
          <g stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" opacity=".45">
            <path d="M34 68c12-2 24-1 34 4M34 84c12-2 24-1 34 4M34 100c12-2 22-1 30 3" />
            <path d="M126 68c-12-2-24-1-34 4M126 84c-12-2-24-1-34 4" />
          </g>
          <path d="M80 54v74" stroke="currentColor" strokeWidth="3" opacity=".25" />
          <path d="M104 18l5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" fill={GOLD} />
          <path d="M50 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#fff" />
          <circle cx="136" cy="30" r="4" fill="#fff" opacity=".8" />
        </svg>
      );
    case 8:
      return (
        <svg viewBox="0 0 160 160" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <g stroke={GOLD_SOFT} strokeWidth="6" strokeLinecap="round">
            <path d="M80 8v14M22 64h14M124 64h14M38 24l10 10M122 24l-10 10" />
          </g>
          <circle cx="80" cy="66" r="38" fill="#fff" />
          <path d="M64 96h32v20a8 8 0 0 1-8 8H72a8 8 0 0 1-8-8Z" fill="#fff" opacity=".85" />
          <rect x="68" y="126" width="24" height="10" rx="5" fill={GOLD} />
          <path d="M66 74l7-12 7 12 7-12 7 12" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M80 74v22" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".6" />
          <circle cx="66" cy="54" r="7" fill="#fff" opacity=".9" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 160 160" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <path d="M44 84v28c22 18 50 18 72 0V84l-36 16Z" fill="#fff" opacity=".82" />
          <path d="M80 36l70 30-70 30-70-30Z" fill="#fff" />
          <path d="M80 50 40 66l40 16 40-16Z" fill="currentColor" opacity=".18" />
          <path d="M130 70v38" stroke={GOLD} strokeWidth="5" strokeLinecap="round" />
          <path d="M130 106l-8 18h16Z" fill={GOLD} />
          <circle cx="80" cy="66" r="6" fill={GOLD} />
          <path d="M28 22l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" fill={GOLD} />
          <circle cx="136" cy="28" r="5" fill="#fff" opacity=".8" />
        </svg>
      );
  }
}
