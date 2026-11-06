/**
 * مختبر فقط: رسوم SVG أصلية لاتجاه «فانوس الساحل» (أيقونات اللعبة، أفق ساحلي، مشهد الشروق).
 * كلها زخرفية (aria-hidden) والمعنى يُقال نصًا في DOM بجانبها.
 */
const INK = "#0b1433";

/** نجمة التقييم: ممتلئة ذهبية أو إطار منقّط */
export function RateStar({ filled, size = 40, frac }: { filled: boolean; size?: number; frac?: number }) {
  const d = "M24 3.5l6 12.6 13.8 1.8-10.1 9.6 2.5 13.7L24 34.6l-12.2 6.6 2.5-13.7L4.2 17.9 18 16.1Z";
  const id = `cf${Math.round((frac ?? 0) * 100)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      {frac != null && !filled ? (
        <>
          <defs>
            <clipPath id={id}>
              <rect x="0" y={44 - 40 * frac} width="48" height={4 + 40 * frac} />
            </clipPath>
          </defs>
          <path d={d} fill="rgba(255,255,255,.08)" stroke="#ffe39a" strokeWidth="2.6" strokeLinejoin="round" />
          <path d={d} fill="#ffc531" clipPath={`url(#${id})`} />
          <path d={d} fill="none" stroke="#ffe39a" strokeWidth="2.6" strokeLinejoin="round" />
        </>
      ) : filled ? (
        <>
          <path d={d} fill="#ffc531" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M17 18.5l5-1 2-4.6" fill="none" stroke="#fff6d6" strokeWidth="2.6" strokeLinecap="round" />
        </>
      ) : (
        <path d={d} fill="rgba(255,255,255,.06)" stroke="#9fb0e0" strokeWidth="2.6" strokeDasharray="4 3.5" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** قنديل سداسي صغير */
export function LanternIcon({ lit = true, size = 28 }: { lit?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      {lit && <circle cx="16" cy="18" r="14" fill="#ffc531" opacity=".22" />}
      <path d="M12 6a4 4 0 0 1 8 0" fill="none" stroke={lit ? "#ffc531" : "#7d8bb8"} strokeWidth="2" />
      <path d="M9 11h14l-3-4h-8Z" fill={lit ? "#0d7f7a" : "#43507c"} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 11h12l1.5 13h-15Z" fill={lit ? "#ffe08a" : "#2a3766"} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 11v13" stroke={lit ? "#ffb733" : "#43507c"} strokeWidth="1.4" />
      <rect x="7.5" y="24" width="17" height="3.4" rx="1.6" fill={lit ? "#0d7f7a" : "#43507c"} stroke={INK} strokeWidth="1.6" />
    </svg>
  );
}

/** الشهاب: نواة ذهبية بذيل فيروزي */
export function MeteorIcon({ size = 26, dim = false }: { size?: number; dim?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false" opacity={dim ? 0.45 : 1}>
      <path d="M27 5 13 16" stroke="#46e6d3" strokeWidth="5" strokeLinecap="round" opacity=".55" />
      <path d="M24 10 14 18" stroke="#ffe39a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="11" cy="20" r="7" fill="#ffd56a" stroke={INK} strokeWidth="2" />
      <circle cx="9" cy="18" r="2" fill="#fff6d6" />
    </svg>
  );
}

/** الحصاة الخفيفة */
export function PebbleIcon({ size = 26, dim = false }: { size?: number; dim?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false" opacity={dim ? 0.45 : 1}>
      <path d="M7 20c0-6 5-10 10-10s8 4 8 9-4 7-9 7-9-2-9-6Z" fill="#9fb3c4" stroke={INK} strokeWidth="2" />
      <circle cx="13" cy="17" r="1.6" fill="#d7e3ec" />
      <circle cx="19" cy="21" r="1.2" fill="#6f879a" />
    </svg>
  );
}

/** النيزك الثقيل (قذيفة خاصة) */
export function HeavyIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <path d="M28 4 16 14" stroke="#ff9f6b" strokeWidth="5" strokeLinecap="round" opacity=".6" />
      <circle cx="13" cy="19" r="9" fill="#ff7a5c" stroke={INK} strokeWidth="2.2" />
      <path d="M8 17c2-3 5-4 8-3M10 23c3 1 6 0 8-2" stroke="#9e3520" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="10" cy="15.5" r="2" fill="#ffd2c2" />
    </svg>
  );
}

/** سؤال في انتظار الخانة */
export function SlotQuestion({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M8.5 9a3.5 3.5 0 1 1 5 3.2c-1 .5-1.5 1.2-1.5 2.3" fill="none" stroke="#ffe39a" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="18.5" r="1.5" fill="#ffe39a" />
    </svg>
  );
}

/** المرقاب مصغّرًا (للخريطة والنتائج) */
export function ObservatoryMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden focusable="false">
      <path d="M14 58V36h36v22Z" fill="#fbe9c6" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M12 37a20 20 0 0 1 40 0Z" fill="#19b3a4" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M33 26 8 14" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <path d="M33 26 8 14" stroke="#f3f0ff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="16" r="2.6" fill="#ffc531" stroke={INK} strokeWidth="1.6" />
      <rect x="27" y="45" width="10" height="13" rx="4" fill="#8b4a2b" stroke={INK} strokeWidth="2" />
      <path d="M12 41h40" stroke="#0d7f7a" strokeWidth="3" />
    </svg>
  );
}

/** نجمة رباعية للتحديات والزخرفة (ليست رمزًا دينيًا أو وطنيًا) */
export function Spark({ size = 18, color = "#ffe39a" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M12 1c.8 6 5 10.2 11 11-6 .8-10.2 5-11 11-.8-6-5-10.2-11-11 6-.8 10.2-5 11-11Z" fill={color} />
    </svg>
  );
}

/** أفق ساحلي أصلي: مبانٍ منخفضة وثلاثة أبراج إبرية بكرات (خلفية بعيدة فقط) */
const BLD: [number, number, number][] = [
  [0, 40, 30], [38, 26, 46], [62, 44, 26], [104, 20, 58], [122, 46, 36], [166, 30, 62], [194, 40, 28], [232, 24, 74],
  [254, 44, 40], [296, 28, 52], [322, 36, 32], [356, 26, 46], [430, 34, 40], [462, 24, 58], [484, 48, 30], [530, 28, 50],
  [556, 40, 26], [594, 28, 38], [760, 36, 32], [794, 26, 52], [818, 46, 28], [862, 24, 64], [884, 40, 36], [922, 30, 50],
  [950, 44, 30], [992, 24, 60], [1014, 42, 34], [1054, 28, 48], [1080, 40, 26], [1118, 30, 44], [1146, 54, 30],
];
export function CoastSkyline({ className, color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 130" preserveAspectRatio="xMidYMax slice" aria-hidden focusable="false">
      <g fill={color}>
        {BLD.map(([x, w, h]) => (
          <rect key={x} x={x} y={130 - h} width={w} height={h + 1} rx="3" />
        ))}
        <path d="M676 131 L679 30 L681 2 L683 30 L686 131 Z" />
        <circle cx="681" cy="66" r="15" />
        <circle cx="681" cy="38" r="8.5" />
        <path d="M712 131 L714.5 56 L716 32 L717.5 56 L720 131 Z" />
        <circle cx="716" cy="86" r="11.5" />
        <path d="M650 131 L652 72 L653 54 L654 72 L656 131 Z" />
        <path d="M630 131 C642 124 664 122 684 122 C704 122 726 124 738 131 Z" />
      </g>
      <g fill="#ffd479" opacity=".85">
        {BLD.filter((_, i) => i % 3 === 1).map(([x, w, h]) => (
          <rect key={x} x={x + w / 2 - 3} y={130 - h + 10} width="6" height="6" rx="1" />
        ))}
      </g>
    </svg>
  );
}

/** مشهد الشروق للنتائج: شمس تطلع خلف الأفق فوق بحر فيروزي، وكوكبة القناديل المحررة */
export function SunriseHero({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 420" preserveAspectRatio="xMidYMax slice" aria-hidden focusable="false">
      <defs>
        <linearGradient id="sr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#101c4a" />
          <stop offset=".42" stopColor="#4b3d86" />
          <stop offset=".7" stopColor="#e7708a" />
          <stop offset=".86" stopColor="#ffa65e" />
          <stop offset="1" stopColor="#ffd77a" />
        </linearGradient>
        <radialGradient id="sr-sun" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset=".55" stopColor="#ffd25e" />
          <stop offset="1" stopColor="#ffd25e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sr-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f8f98" />
          <stop offset="1" stopColor="#0b3f5a" />
        </linearGradient>
      </defs>
      <rect width="1200" height="420" fill="url(#sr-sky)" />
      <circle cx="600" cy="352" r="170" fill="url(#sr-sun)" opacity=".75" />
      <circle cx="600" cy="352" r="70" fill="#ffe08a" stroke="#ffb02e" strokeWidth="6" />
      <g stroke="#fff1c4" strokeWidth="7" strokeLinecap="round" opacity=".8">
        <path d="M600 252v-26M520 276l-16-18M680 276l16-18M470 330h-24M730 330h24" />
      </g>
      <g fill="#fff">
        {[[90, 40], [210, 80], [330, 30], [980, 50], [1100, 96], [860, 26], [140, 150], [1040, 160]].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="2.2" opacity=".75" />
        ))}
      </g>
      <rect y="352" width="1200" height="68" fill="url(#sr-sea)" />
      <g stroke="#ffe39a" strokeWidth="4" strokeLinecap="round" opacity=".7">
        <path d="M560 368h80M574 382h52M586 396h28M590 408h20" />
      </g>
      <g stroke="#7af0e0" strokeWidth="3" strokeLinecap="round" opacity=".45">
        <path d="M80 372h120M260 392h90M860 380h140M1040 400h100M140 408h60" />
      </g>
    </svg>
  );
}

/** كوكبة القناديل المحررة: ثلاث نجوم رباعية متصلة */
export function FreedConstellation({ className }: { className?: string }) {
  const pts: [number, number][] = [[20, 60], [100, 18], [180, 46]];
  return (
    <svg className={className} viewBox="0 0 200 80" aria-hidden focusable="false">
      <path d="M20 60 L100 18 L180 46" stroke="#ffe39a" strokeWidth="2" strokeDasharray="5 5" opacity=".75" fill="none" />
      {pts.map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <circle r="16" fill="#ffc531" opacity=".25" />
          <path d="M0-12c.8 6 4.4 10.4 12 12-7.6 1.6-11.2 6-12 12-.8-6-4.4-10.4-12-12C-4.4-1.6-.8-6 0-12Z" fill="#fff1c4" />
        </g>
      ))}
    </svg>
  );
}
