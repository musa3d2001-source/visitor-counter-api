/**
 * رسومات v2-c «الفصل المشمس»: كلها SVG مرسومة يدويًا (بلا صور خارجية).
 * تُلوَّن بالأبيض والذهبي فوق تدرجات المواد والصفوف، و currentColor = اللون الداكن للبطاقة.
 */
import {
  BookOpen,
  Calculator,
  FlaskConical,
  Globe2,
  Languages,
  Layers,
  MoonStar,
  type LucideIcon,
} from "lucide-react";

const GOLD = "#FFD25E";
const GOLD_SOFT = "#FFE9A8";

export const SUBJECT_ICONS: Record<string, LucideIcon> = {
  math: Calculator,
  science: FlaskConical,
  english: Languages,
  arabic: BookOpen,
  islamic: MoonStar,
  social: Globe2,
};
export function SubjectIcon({ slug, size = 22, strokeWidth = 2.2 }: { slug: string | null | undefined; size?: number; strokeWidth?: number }) {
  const Icon = (slug && SUBJECT_ICONS[slug]) || Layers;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden />;
}

/** شعار «درب»: طريق متعرّج يصعد نحو شمس ذهبية */
export function LogoMark({ id, size = 44 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1BB3A6" />
          <stop offset="1" stopColor="#06504B" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="15" fill={`url(#lg-${id})`} />
      <rect x="1" y="1" width="46" height="46" rx="14" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="2" />
      <circle cx="32" cy="14.5" r="6.2" fill="#FFC531" />
      <circle cx="32" cy="14.5" r="9.5" fill="#FFC531" opacity=".22" />
      <path d="M13 41c0-8 13-7.5 13-14.5 0-5.2-6.6-5.3-6.6-9.8 0-3.4 3.4-4.6 6.6-4.4" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M13 41c0-8 13-7.5 13-14.5 0-5.2-6.6-5.3-6.6-9.8 0-3.4 3.4-4.6 6.6-4.4" fill="none" stroke="#06504B" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 3.2" opacity=".55" />
    </svg>
  );
}

/** رسم المادة الكبير على أغلفة الدروس (مساحة ٢٠٠×٢٠٠) */
export function SubjectArt({ slug }: { slug: string | null | undefined }) {
  switch (slug) {
    case "math":
      return (
        <svg viewBox="0 0 200 200" aria-hidden focusable="false">
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
        <svg viewBox="0 0 200 200" aria-hidden focusable="false">
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
        <svg viewBox="0 0 200 200" aria-hidden focusable="false">
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
        <svg viewBox="0 0 200 200" aria-hidden focusable="false">
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
        <svg viewBox="0 0 200 200" aria-hidden focusable="false">
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
        <svg viewBox="0 0 200 200" aria-hidden focusable="false">
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
        <svg viewBox="0 0 200 200" aria-hidden focusable="false">
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

/** رسومات الصفوف: ٦ صاروخ الانطلاق، ٧ كتاب مفتوح، ٨ مصباح فكرة، ٩ قبعة التخرج من المتوسطة */
export function GradeArt({ level }: { level: number }) {
  switch (level) {
    case 6:
      return (
        <svg viewBox="0 0 160 160" aria-hidden focusable="false">
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
        <svg viewBox="0 0 160 160" aria-hidden focusable="false">
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
        <svg viewBox="0 0 160 160" aria-hidden focusable="false">
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
        <svg viewBox="0 0 160 160" aria-hidden focusable="false">
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

/** رسومات خطوات البدء الأربع (مساحة ١٢٠×١٢٠) */
export function StepArt({ n }: { n: number }) {
  switch (n) {
    case 1:
      return (
        <svg viewBox="0 0 120 120" aria-hidden focusable="false">
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
        <svg viewBox="0 0 120 120" aria-hidden focusable="false">
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
        <svg viewBox="0 0 120 120" aria-hidden focusable="false">
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
        <svg viewBox="0 0 120 120" aria-hidden focusable="false">
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
export function BundleStack({ colors }: { colors: string[] }) {
  const sheets = colors.slice(0, 5);
  const n = sheets.length || 1;
  return (
    <svg viewBox="0 0 220 160" aria-hidden focusable="false">
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
