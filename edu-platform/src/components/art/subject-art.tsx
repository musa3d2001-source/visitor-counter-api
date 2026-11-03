/** رسومات المواد الكبيرة على الأغلفة (مساحة ٢٠٠×٢٠٠). currentColor = اللون الداكن للمادة (‎--d‎). */
import { GOLD, GOLD_SOFT } from "./palette";

/** رسم المادة الكبير على أغلفة الدروس (مساحة ٢٠٠×٢٠٠) */
export function SubjectArt({ slug, className }: { slug: string | null | undefined; className?: string }) {
  switch (slug) {
    case "math":
      return (
        <svg viewBox="0 0 200 200" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <g transform="rotate(-8 100 100)">
            <rect x="26" y="26" width="68" height="68" rx="20" fill="#fff" />
            <rect x="106" y="26" width="68" height="68" rx="20" fill="#fff" opacity=".28" />
            <rect x="26" y="106" width="68" height="68" rx="20" fill="#fff" opacity=".28" />
            <rect x="106" y="106" width="68" height="68" rx="20" fill={GOLD} />
            <g fill="currentColor">
              <rect x="44" y="56" width="32" height="8" rx="4" />
              <rect x="56" y="44" width="8" height="32" rx="4" />
              <rect x="124" y="136" width="32" height="8" rx="4" />
              <circle cx="140" cy="124" r="5" />
              <circle cx="140" cy="156" r="5" />
            </g>
            <g fill="#fff">
              <rect x="124" y="56" width="32" height="8" rx="4" />
              <rect x="44" y="136" width="32" height="8" rx="4" transform="rotate(45 60 140)" />
              <rect x="44" y="136" width="32" height="8" rx="4" transform="rotate(-45 60 140)" />
            </g>
          </g>
        </svg>
      );
    case "science":
      return (
        <svg viewBox="0 0 200 200" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <g fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round">
            <ellipse cx="100" cy="100" rx="80" ry="30" />
            <ellipse cx="100" cy="100" rx="80" ry="30" transform="rotate(60 100 100)" opacity=".7" />
            <ellipse cx="100" cy="100" rx="80" ry="30" transform="rotate(120 100 100)" opacity=".45" />
          </g>
          <circle cx="100" cy="100" r="22" fill={GOLD} />
          <circle cx="93" cy="93" r="7" fill="#fff" opacity=".7" />
          <circle cx="180" cy="100" r="9" fill="#fff" />
          <circle cx="60" cy="31" r="8" fill={GOLD_SOFT} />
          <circle cx="60" cy="169" r="7" fill="#fff" opacity=".8" />
        </svg>
      );
    case "english":
      return (
        <svg viewBox="0 0 200 200" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <path
            d="M86 92h76a18 18 0 0 1 18 18v40a18 18 0 0 1-18 18h-10v22l-24-22H86a18 18 0 0 1-18-18v-40a18 18 0 0 1 18-18Z"
            fill="#fff"
            opacity=".3"
          />
          <path
            d="M38 28h86a20 20 0 0 1 20 20v44a20 20 0 0 1-20 20H72l-28 24v-24h-6a20 20 0 0 1-20-20V48a20 20 0 0 1 20-20Z"
            fill="#fff"
          />
          <g fill="currentColor">
            <circle cx="56" cy="70" r="9" />
            <circle cx="81" cy="70" r="9" opacity=".7" />
            <circle cx="106" cy="70" r="9" opacity=".45" />
          </g>
          <g stroke="#fff" strokeWidth="7" strokeLinecap="round">
            <path d="M94 128h52" />
            <path d="M94 146h30" opacity=".7" />
          </g>
          <path d="M168 40l5 11 11 5-11 5-5 11-5-11-11-5 11-5Z" fill={GOLD} />
        </svg>
      );
    case "arabic":
      return (
        <svg viewBox="0 0 200 200" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <circle cx="108" cy="96" r="70" fill="#fff" opacity=".16" />
          <text
            x="104"
            y="140"
            textAnchor="middle"
            fontFamily="'Cairo Variable', Cairo, sans-serif"
            fontWeight="900"
            fontSize="150"
            fill="#fff"
          >
            ض
          </text>
          <path d="M30 172c22-14 44 10 66-4s44 8 74-8" fill="none" stroke={GOLD} strokeWidth="7" strokeLinecap="round" />
          <path d="M160 34l-26 50 8 4 26-50Z" fill={GOLD_SOFT} />
          <path d="M134 84l-4 14 12-8Z" fill="#fff" />
        </svg>
      );
    case "islamic":
      return (
        <svg viewBox="0 0 200 200" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <path d="M40 186V96a60 60 0 0 1 120 0v90" fill="none" stroke="#fff" strokeWidth="7" opacity=".45" />
          <path d="M118 52a46 46 0 1 0 30 80 38 38 0 1 1-30-80Z" fill="#fff" transform="translate(-24 6)" />
          <g transform="translate(132 70)">
            <rect x="-18" y="-18" width="36" height="36" rx="3" fill={GOLD} />
            <rect x="-18" y="-18" width="36" height="36" rx="3" fill={GOLD} transform="rotate(45)" />
            <circle r="8" fill="currentColor" />
          </g>
          <circle cx="160" cy="150" r="5" fill="#fff" />
          <circle cx="44" cy="40" r="4" fill="#fff" opacity=".8" />
        </svg>
      );
    case "social":
      return (
        <svg viewBox="0 0 200 200" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <circle cx="94" cy="108" r="66" fill="#fff" opacity=".22" />
          <g fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round">
            <circle cx="94" cy="108" r="66" />
            <ellipse cx="94" cy="108" rx="28" ry="66" />
            <path d="M28 108h132M38 76h112M38 140h112" opacity=".7" />
          </g>
          <path d="M150 22a26 26 0 0 0-26 26c0 20 26 46 26 46s26-26 26-46a26 26 0 0 0-26-26Z" fill={GOLD} />
          <circle cx="150" cy="48" r="9" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 200 200" className={className} width="100%" height="100%" aria-hidden focusable="false">
          <rect x="40" y="56" width="110" height="120" rx="14" fill="#fff" opacity=".3" transform="rotate(-10 95 116)" />
          <rect x="50" y="44" width="110" height="120" rx="14" fill="#fff" opacity=".55" transform="rotate(6 105 104)" />
          <rect x="46" y="40" width="110" height="120" rx="14" fill="#fff" />
          <g stroke="currentColor" strokeWidth="7" strokeLinecap="round" opacity=".5">
            <path d="M66 74h70M66 96h70M66 118h44" />
          </g>
          <circle cx="152" cy="44" r="18" fill={GOLD} />
        </svg>
      );
  }
}
