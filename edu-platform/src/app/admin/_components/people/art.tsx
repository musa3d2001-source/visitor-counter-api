import { useId } from "react";

/**
 * رسومات زخرفية لصفحات الأشخاص (aria-hidden، تملأ حاويتها). ألوانها من متغيرات القسم (--a/--b/--d)
 * مع ألوان قوس قزح المواد، فتتلوّن تلقائيًا بلون الشريط.
 */

function Spark({ x, y, s = 1, color = "#FFC531" }: { x: number; y: number; s?: number; color?: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0-10c.8 5.4 4.6 9.2 10 10-5.4.8-9.2 4.6-10 10-.8-5.4-4.6-9.2-10-10 5.4-.8 9.2-4.6 10-10Z" fill={color} />;
}

function useGid() {
  return useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

/** إيصال أبيض مائل بخطوط ملوّنة، ختم «مدفوع» أخضر، عملة ذهبية */
export function OrdersArt({ className }: { className?: string }) {
  const id = useGid();
  return (
    <svg className={className} viewBox="0 0 240 170" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#F0A500" />
        </linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--a)" />
          <stop offset="1" stopColor="var(--b)" />
        </linearGradient>
      </defs>
      <circle cx="128" cy="84" r="74" fill="var(--a)" opacity=".16" />
      <g transform="rotate(-7 120 86)">
        <path d="M74 14h96v136l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6Z" fill="var(--d)" opacity=".28" transform="translate(0 8)" />
        <path d="M74 14h96v136l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6Z" fill="#fff" />
        <rect x="74" y="14" width="96" height="26" rx="0" fill={`url(#${id}t)`} />
        <rect x="86" y="23" width="44" height="8" rx="4" fill="#fff" opacity=".85" />
        <rect x="86" y="54" width="60" height="7" rx="3.5" fill="#EFE6D6" />
        <rect x="150" y="54" width="10" height="7" rx="3.5" fill="#FF6B5A" />
        <rect x="86" y="70" width="48" height="7" rx="3.5" fill="#EFE6D6" />
        <rect x="150" y="70" width="10" height="7" rx="3.5" fill="#4D8DFF" />
        <rect x="86" y="86" width="54" height="7" rx="3.5" fill="#EFE6D6" />
        <rect x="150" y="86" width="10" height="7" rx="3.5" fill="#9B5CF6" />
        <path d="M86 106h74" stroke="#E0D2BA" strokeWidth="2.5" strokeDasharray="5 5" />
        <rect x="86" y="116" width="34" height="10" rx="5" fill="var(--b)" />
        <rect x="132" y="114" width="28" height="13" rx="6.5" fill={`url(#${id}g)`} />
      </g>
      {/* ختم «مدفوع» */}
      <g transform="translate(186 112) rotate(10)">
        <circle r="24" fill="#076B4F" transform="translate(0 4)" />
        <circle r="24" fill="#18B987" />
        <circle r="17" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.5" strokeDasharray="3 4" />
        <path d="m-9 0 6 6 12-12" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* عملة */}
      <g transform="translate(46 54)">
        <circle r="22" fill="#C98500" transform="translate(0 4)" />
        <circle r="22" fill={`url(#${id}g)`} />
        <circle r="15" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2.5" strokeDasharray="3 4" />
        <Spark x={0} y={0} s={0.85} color="#fff" />
      </g>
      <Spark x={206} y={30} s={0.9} />
      <Spark x={30} y={128} s={0.6} color="var(--b)" />
      <circle cx="214" cy="64" r="4" fill="#FF6B5A" />
      <circle cx="52" cy="104" r="3.5" fill="#4D8DFF" />
    </svg>
  );
}

/** ثلاث صور رمزية متداخلة بألوان قوس قزح، كتاب مفتوح، ونجمة ذهبية */
export function StudentsArt({ className }: { className?: string }) {
  const id = useGid();
  const people = [
    { cx: 70, cy: 92, r: 34, a: "#FFA266", b: "#E2463A" },
    { cx: 170, cy: 92, r: 34, a: "#7CC4FF", b: "#3B6FE0" },
    { cx: 120, cy: 78, r: 42, a: "var(--a)", b: "var(--b)" },
  ];
  return (
    <svg className={className} viewBox="0 0 240 170" aria-hidden focusable="false">
      <defs>
        {people.map((p, i) => (
          <linearGradient key={i} id={`${id}p${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={p.a} />
            <stop offset="1" stopColor={p.b} />
          </linearGradient>
        ))}
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#F0A500" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="84" r="78" fill="var(--a)" opacity=".14" />
      {people.map((p, i) => (
        <g key={i}>
          <circle cx={p.cx} cy={p.cy + 5} r={p.r} fill="rgb(23 32 38 / .14)" />
          <circle cx={p.cx} cy={p.cy} r={p.r} fill={`url(#${id}p${i})`} stroke="#fff" strokeWidth="5" />
          <circle cx={p.cx} cy={p.cy - p.r * 0.22} r={p.r * 0.3} fill="#fff" opacity=".92" />
          <path
            d={`M${p.cx - p.r * 0.56} ${p.cy + p.r * 0.62}c${p.r * 0.1}-${p.r * 0.5} ${p.r * 1.02}-${p.r * 0.5} ${p.r * 1.12} 0`}
            fill="#fff"
            opacity=".92"
          />
        </g>
      ))}
      {/* كتاب مفتوح */}
      <g transform="translate(120 146)">
        <path d="M-46 -12c16-6 32-6 46 4 14-10 30-10 46-4v20c-16-6-32-6-46 4-14-10-30-10-46-4Z" fill="var(--d)" opacity=".3" transform="translate(0 4)" />
        <path d="M-46 -12c16-6 32-6 46 4 14-10 30-10 46-4v20c-16-6-32-6-46 4-14-10-30-10-46-4Z" fill="#fff" />
        <path d="M0 -8v24" stroke="#E0D2BA" strokeWidth="2.5" />
        <path d="M-36 -4c10-3 20-3 28 2M8 -2c8-5 18-5 28-2" stroke="var(--b)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity=".6" />
      </g>
      <g transform="translate(204 34)">
        <circle r="16" fill="#C98500" transform="translate(0 3)" />
        <circle r="16" fill={`url(#${id}g)`} />
        <Spark x={0} y={0} s={0.7} color="#fff" />
      </g>
      <Spark x={30} y={36} s={0.8} />
      <Spark x={214} y={130} s={0.55} color="var(--b)" />
      <circle cx="36" cy="140" r="4" fill="#9B5CF6" />
    </svg>
  );
}

/** سبورة خضراء داكنة برموز المواد، صورة رمزية بقبعة تخرج، وشارة ذهبية */
export function TeachersArt({ className }: { className?: string }) {
  const id = useGid();
  return (
    <svg className={className} viewBox="0 0 240 170" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--a)" />
          <stop offset="1" stopColor="var(--b)" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#F0A500" />
        </linearGradient>
      </defs>
      <circle cx="124" cy="80" r="76" fill="var(--a)" opacity=".15" />
      {/* السبورة */}
      <g transform="rotate(-5 120 70)">
        <rect x="58" y="18" width="150" height="100" rx="18" fill="var(--d)" opacity=".35" transform="translate(0 8)" />
        <rect x="58" y="18" width="150" height="100" rx="18" fill="#0E4A46" />
        <rect x="66" y="26" width="134" height="84" rx="12" fill="#11605A" />
        <text x="178" y="62" fontFamily="var(--font-display)" fontWeight="900" fontSize="26" fill="#FFC531">
          أ
        </text>
        <text x="142" y="66" fontFamily="var(--font-display)" fontWeight="900" fontSize="24" fill="#7CC4FF">
          +
        </text>
        <text x="112" y="64" fontFamily="var(--font-display)" fontWeight="900" fontSize="22" fill="#FF85B8">
          B
        </text>
        <path d="M80 86h48M80 98h30" stroke="#fff" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" />
        <path d="M146 92c8-14 20-14 28 0s20 14 26 0" fill="none" stroke="#34D9A0" strokeWidth="4" strokeLinecap="round" />
      </g>
      {/* المعلم */}
      <g transform="translate(62 116)">
        <circle r="34" fill="rgb(23 32 38 / .16)" transform="translate(0 5)" />
        <circle r="34" fill={`url(#${id}t)`} stroke="#fff" strokeWidth="5" />
        <circle cy="-8" r="11" fill="#fff" opacity=".95" />
        <path d="M-20 22c3-16 37-16 40 0" fill="#fff" opacity=".95" />
        <path d="M-22 -24 0 -34 22 -24 0 -14Z" fill="#172026" />
        <path d="M14 -20v12" stroke="#FFC531" strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* شارة */}
      <g transform="translate(196 132) rotate(8)">
        <circle r="20" fill="#C98500" transform="translate(0 4)" />
        <circle r="20" fill={`url(#${id}g)`} />
        <path d="m0-9 2.6 5.4 5.9.8-4.3 4.1 1 5.9L0 4.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8Z" fill="#fff" />
      </g>
      <Spark x={30} y={40} s={0.85} />
      <Spark x={222} y={22} s={0.6} color="var(--b)" />
      <circle cx="218" cy="92" r="4" fill="#FF6B5A" />
      <circle cx="26" cy="96" r="3.5" fill="#4D8DFF" />
    </svg>
  );
}
