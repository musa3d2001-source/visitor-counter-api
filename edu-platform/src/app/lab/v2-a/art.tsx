/**
 * رسومات SVG مرسومة يدويًا لاتجاه «ألوان المواد»: زخرفة لكل مادة، شعار، نجوم، زخارف الصفوف.
 * كلها زخرفية (aria-hidden) وتُرسم بـ currentColor لتأخذ لون السياق.
 */
import type { SubjectKey } from "./tones";

type SvgProps = { className?: string; style?: React.CSSProperties };

export function SubjectMotif({ k, className, style }: SvgProps & { k: SubjectKey }) {
  return (
    <svg
      viewBox="0 0 240 150"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={style}
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {k === "math" && (
        <g>
          <circle cx="196" cy="34" r="46" strokeWidth="3" opacity=".28" />
          <circle cx="196" cy="34" r="22" strokeWidth="3" opacity=".18" strokeDasharray="4 7" />
          <path d="M18 138 L66 58 L118 138 Z" strokeWidth="3.5" opacity=".26" />
          <path d="M66 58 V138" strokeWidth="2" opacity=".18" strokeDasharray="3 6" />
          <path d="M150 104 h22 M161 93 v22" strokeWidth="4.5" opacity=".42" />
          <path d="M34 26 l14 14 M48 26 l-14 14" strokeWidth="4" opacity=".36" />
          <path d="M132 34 h30 M140 34 v28 M154 34 v22 q0 6 6 6" strokeWidth="4" opacity=".34" />
          <path d="M184 150 a44 44 0 0 1 56 -40" strokeWidth="3" opacity=".24" />
          <path d="M196 132 l4 -6 M210 124 l3 -7 M224 120 l1 -7" strokeWidth="2.5" opacity=".24" />
          <g fill="currentColor" stroke="none" opacity=".3">
            <circle cx="92" cy="24" r="2.6" />
            <circle cx="104" cy="24" r="2.6" />
            <circle cx="116" cy="24" r="2.6" />
            <circle cx="92" cy="36" r="2.6" />
            <circle cx="104" cy="36" r="2.6" />
            <circle cx="116" cy="36" r="2.6" />
          </g>
        </g>
      )}
      {k === "science" && (
        <g>
          <g transform="translate(176 70)" opacity=".36" strokeWidth="3">
            <ellipse rx="54" ry="19" />
            <ellipse rx="54" ry="19" transform="rotate(60)" />
            <ellipse rx="54" ry="19" transform="rotate(-60)" />
            <circle r="8" fill="currentColor" stroke="none" />
            <circle cx="54" cy="0" r="4.5" fill="currentColor" stroke="none" />
          </g>
          <path d="M44 30 h30 M51 30 v32 L28 116 q-5 14 10 14 h42 q15 0 10 -14 L67 62 V30" strokeWidth="3.5" opacity=".34" />
          <path d="M36 104 q24 -10 46 0" strokeWidth="3" opacity=".3" />
          <circle cx="52" cy="112" r="4" fill="currentColor" stroke="none" opacity=".3" />
          <circle cx="64" cy="98" r="3" fill="currentColor" stroke="none" opacity=".3" />
          <circle cx="104" cy="28" r="8" strokeWidth="3" opacity=".24" />
          <circle cx="118" cy="44" r="4" strokeWidth="2.5" opacity=".24" />
          <path d="M112 128 h26 M125 115 v26" strokeWidth="3" opacity=".2" />
        </g>
      )}
      {k === "arabic" && (
        <g>
          <text
            x="186"
            y="118"
            fontSize="128"
            fontWeight="800"
            fill="currentColor"
            stroke="none"
            opacity=".2"
            textAnchor="middle"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ض
          </text>
          <path d="M6 116 C 52 70, 96 150, 146 98 S 214 60, 236 96" strokeWidth="6" opacity=".3" />
          <path d="M18 132 C 60 104, 100 150, 140 124" strokeWidth="3" opacity=".22" />
          <g fill="currentColor" stroke="none" opacity=".4">
            <rect x="60" y="36" width="11" height="11" rx="2" transform="rotate(45 65.5 41.5)" />
            <rect x="80" y="30" width="11" height="11" rx="2" transform="rotate(45 85.5 35.5)" />
            <rect x="70" y="52" width="11" height="11" rx="2" transform="rotate(45 75.5 57.5)" />
          </g>
          <path d="M112 20 L150 70" strokeWidth="7" opacity=".3" />
          <path d="M150 70 l6 12 l-12 -6 z" fill="currentColor" stroke="none" opacity=".3" />
        </g>
      )}
      {k === "english" && (
        <g>
          <path d="M136 18 h78 a18 18 0 0 1 18 18 v24 a18 18 0 0 1 -18 18 h-44 l-18 16 v-16 h-16 a18 18 0 0 1 -18 -18 v-24 a18 18 0 0 1 18 -18 z" strokeWidth="3.5" opacity=".36" />
          <path d="M140 42 h66 M140 56 h40" strokeWidth="4" opacity=".32" />
          <path d="M26 74 h66 a16 16 0 0 1 16 16 v20 a16 16 0 0 1 -16 16 h-12 v14 l-16 -14 h-38 a16 16 0 0 1 -16 -16 v-20 a16 16 0 0 1 16 -16 z" strokeWidth="3.5" opacity=".28" />
          <path d="M30 96 h52 M30 108 h30" strokeWidth="4" opacity=".26" />
          <path d="M44 22 q-12 2 -12 16 h12 v12 h-14" strokeWidth="4" opacity=".3" />
          <path d="M70 22 q-12 2 -12 16 h12 v12 h-14" strokeWidth="4" opacity=".3" />
          <path d="M196 116 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" fill="currentColor" stroke="none" opacity=".34" />
        </g>
      )}
      {k === "islamic" && (
        <g>
          <g transform="translate(180 70)" strokeWidth="3" opacity=".34">
            <rect x="-38" y="-38" width="76" height="76" rx="3" />
            <rect x="-38" y="-38" width="76" height="76" rx="3" transform="rotate(45)" />
            <circle r="22" />
            <circle r="9" fill="currentColor" stroke="none" opacity=".7" />
          </g>
          <path d="M64 24 a36 36 0 1 0 30 58 a28 28 0 1 1 -30 -58 z" fill="currentColor" stroke="none" opacity=".26" />
          <path d="M14 150 V104 q0 -34 34 -50 q34 16 34 50 V150" strokeWidth="3" opacity=".26" />
          <path d="M28 150 V108 q0 -22 20 -34 q20 12 20 34 V150" strokeWidth="2" opacity=".2" />
          <g fill="currentColor" stroke="none" opacity=".35">
            <circle cx="112" cy="26" r="3" />
            <circle cx="124" cy="132" r="3" />
            <circle cx="232" cy="134" r="3" />
          </g>
        </g>
      )}
      {k === "social" && (
        <g>
          <g transform="translate(178 72)" strokeWidth="3" opacity=".34">
            <circle r="52" />
            <ellipse rx="22" ry="52" />
            <path d="M-52 0 H52 M-46 -24 H46 M-46 24 H46" />
          </g>
          <path d="M58 22 c-17 0 -28 12 -28 27 c0 21 28 47 28 47 s28 -26 28 -47 c0 -15 -11 -27 -28 -27 z" strokeWidth="3.5" opacity=".36" />
          <circle cx="58" cy="49" r="9" fill="currentColor" stroke="none" opacity=".34" />
          <path d="M66 108 C 92 132, 118 92, 136 112" strokeWidth="3" opacity=".3" strokeDasharray="2 9" />
          <path d="M112 30 l5 12 l12 5 l-12 5 l-5 12 l-5 -12 l-12 -5 l12 -5 z" strokeWidth="2.5" opacity=".28" />
        </g>
      )}
      {k === "other" && (
        <g>
          <path d="M120 40 q-30 -14 -64 -6 v86 q34 -8 64 6 q30 -14 64 -6 v-86 q-34 -8 -64 6 z M120 40 v86" strokeWidth="3.5" opacity=".34" />
          <path d="M70 58 h34 M70 74 h34 M136 58 h34 M136 74 h34" strokeWidth="3" opacity=".26" />
          <path d="M212 22 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" fill="currentColor" stroke="none" opacity=".34" />
        </g>
      )}
    </svg>
  );
}

/** شعار «درب»: طريق متعرج ينتهي بنجمة الوصول */
export function LogoMark({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 44 44" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B6BFF" />
          <stop offset=".55" stopColor="#6C47FF" />
          <stop offset="1" stopColor="#E0408A" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="14" fill={`url(#${id})`} />
      <path d="M12 34 C 12 24, 30 26, 30 17" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" fill="none" />
      <path d="M12 34 C 12 24, 30 26, 30 17" stroke="#6C47FF" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="1.5 3.5" fill="none" opacity=".7" />
      <path d="M30 6.5 l2.2 4.6 l4.8 1.2 l-3.6 3.3 l.8 5 l-4.2 -2.5 l-4.2 2.5 l.8 -5 l-3.6 -3.3 l4.8 -1.2 z" fill="#FFC53D" />
    </svg>
  );
}

/** نجمة لامعة صغيرة */
export function Sparkle({ className, style }: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden focusable="false">
      <path d="M12 0 C 13 7, 17 11, 24 12 C 17 13, 13 17, 12 24 C 11 17, 7 13, 0 12 C 7 11, 11 7, 12 0 Z" fill="currentColor" />
    </svg>
  );
}

/** خط يدوي تحت الكلمة المميزة في العنوان */
export function Swoosh({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 220 26" preserveAspectRatio="none" className={className} aria-hidden focusable="false">
      <path d="M4 18 C 50 6, 120 4, 216 12" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M40 22 C 90 14, 150 13, 196 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity=".55" />
    </svg>
  );
}

/** زخرفة بطاقات الصفوف: حلقات ونقاط ومسار */
export function GradeArt({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden focusable="false" fill="none" stroke="currentColor" strokeLinecap="round">
      <circle cx="40" cy="40" r="90" strokeWidth="2" opacity=".22" />
      <circle cx="40" cy="40" r="56" strokeWidth="2" opacity=".18" strokeDasharray="3 9" />
      <path d="M-10 250 C 60 200, 120 280, 200 220 S 300 200, 320 230" strokeWidth="3" opacity=".22" />
      <g fill="currentColor" stroke="none">
        <circle cx="250" cy="60" r="5" opacity=".4" />
        <circle cx="226" cy="96" r="3" opacity=".35" />
        <circle cx="120" cy="40" r="3" opacity=".3" />
      </g>
      <path d="M262 136 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" fill="currentColor" stroke="none" opacity=".45" />
    </svg>
  );
}

/** نجوم سماء ليلة الاختبار */
export function NightSky({ className }: SvgProps) {
  const stars: [number, number, number][] = [
    [40, 50, 1.6], [120, 30, 1.2], [210, 80, 1.8], [300, 40, 1.1], [380, 110, 1.5], [460, 36, 1.3], [560, 70, 1.9], [640, 24, 1.2],
    [720, 96, 1.4], [820, 44, 1.7], [900, 120, 1.1], [980, 60, 1.6], [1060, 30, 1.3], [1140, 90, 1.5], [70, 180, 1.2], [260, 210, 1.4],
    [520, 190, 1.1], [760, 230, 1.5], [1000, 200, 1.2], [1180, 250, 1.6], [150, 320, 1.3], [430, 300, 1.6], [880, 330, 1.2], [1110, 360, 1.4],
  ];
  return (
    <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden focusable="false">
      {stars.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.25 + ((i * 37) % 50) / 100} />
      ))}
      <path d="M330 140 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="#FFE29A" opacity=".8" />
      <path d="M940 260 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="#FFE29A" opacity=".7" />
      <path d="M620 150 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 l6 -2 z" fill="#fff" opacity=".7" />
    </svg>
  );
}

/** الهلال المضيء */
export function Crescent({ className }: SvgProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <path d="M62 8 A44 44 0 1 0 92 70 A36 36 0 1 1 62 8 Z" fill="#FFD66B" />
    </svg>
  );
}
