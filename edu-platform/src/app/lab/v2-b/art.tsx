import type { SubjectKey } from "./lib";
import s from "./v2b.module.css";

/** رسومات SVG مرسومة يدويًا لنموذج «ليلة الاختبار» — بلا صور خارجية */

function rng(seed: number) {
  let v = seed;
  return () => (v = (v * 16807) % 2147483647) / 2147483647;
}

/** سماء الليل: نجوم ثابتة المواضع (بذرة ثابتة) وبعضها يتلألأ */
export function Starfield({ className, seed = 7, density = 90 }: { className?: string; seed?: number; density?: number }) {
  const r = rng(seed);
  const stars = Array.from({ length: density }, (_, i) => {
    const big = r() < 0.1;
    return { x: r() * 1440, y: r() * 760, rad: big ? 1.7 : r() * 0.9 + 0.35, o: r() * 0.55 + 0.25, tw: i % 6 === 0 };
  });
  return (
    <svg aria-hidden viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice" className={className}>
      {stars.map((st, i) => (
        <circle
          key={i}
          cx={st.x.toFixed(1)}
          cy={st.y.toFixed(1)}
          r={st.rad.toFixed(2)}
          fill="#fff"
          opacity={st.o.toFixed(2)}
          className={st.tw ? s.twinkle : undefined}
          style={st.tw ? { animationDelay: `${(i % 5) * 0.9}s` } : undefined}
        />
      ))}
    </svg>
  );
}

/** هلال ليلة الاختبار */
export function Crescent({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className={className}>
      <path d="M62 8a44 44 0 1 0 30 70A38 38 0 0 1 62 8Z" fill="#FFE7A6" />
    </svg>
  );
}

/** أفق مدينة الكويت مع أبراج الكويت وبرج الحمراء — يرتكز على الطرف الأيسر */
export function Skyline({ className }: { className?: string }) {
  const r = rng(42);
  const blds: { x: number; w: number; h: number }[] = [];
  let x = 0;
  while (x < 1440) {
    const w = 24 + Math.floor(r() * 46);
    const nearTowers = x > 150 && x < 330;
    const tall = x > 980 && x < 1320;
    const h = nearTowers ? 12 + r() * 18 : 20 + r() * (tall ? 92 : 56);
    blds.push({ x, w, h });
    x += w + 2 + Math.floor(r() * 5);
  }
  const lights: { x: number; y: number }[] = [];
  for (const b of blds) {
    const n = Math.floor(b.h / 18);
    for (let i = 0; i < n; i++) if (r() < 0.45) lights.push({ x: b.x + 4 + r() * (b.w - 10), y: 220 - b.h + 6 + r() * (b.h - 12) });
  }
  const sphereDots = (cx: number, cy: number, rad: number) => {
    const out: { x: number; y: number }[] = [];
    for (let yy = cy - rad + 3; yy < cy - 1; yy += 4.2)
      for (let xx = cx - rad + 3; xx < cx + rad - 2; xx += 4.2) if ((xx - cx) ** 2 + (yy - cy) ** 2 < (rad - 2.2) ** 2) out.push({ x: xx, y: yy });
    return out;
  };
  return (
    <svg aria-hidden viewBox="0 0 1440 220" preserveAspectRatio="xMinYMax slice" className={className}>
      <g fill="#0F1645">
        {blds.map((b, i) => (
          <rect key={i} x={b.x} y={220 - b.h} width={b.w} height={b.h} rx="2" />
        ))}
      </g>
      <g fill="#FFC83D">
        {lights.map((l, i) => (
          <rect key={i} x={l.x.toFixed(1)} y={l.y.toFixed(1)} width="3" height="4" opacity={i % 3 === 0 ? 0.55 : 0.25} />
        ))}
      </g>
      {/* برج الحمراء */}
      <path d="M1150 220V64c10-18 28-26 44-24-8 26-9 92 2 180Z" fill="#131B52" />
      {/* أبراج الكويت */}
      <g fill="#18225E" stroke="rgba(255,255,255,.12)" strokeWidth="1">
        <path d="M186 96h3l4 124h-11Z" />
        <path d="M282 54h3l6 166h-15Z" />
        <circle cx="283.5" cy="134" r="16" />
        <path d="M228 10h4l7 210h-18Z" />
        <circle cx="230" cy="118" r="22" />
        <circle cx="230" cy="78" r="11" />
      </g>
      <g fill="#2B3B92">
        <path d="M208 118a22 22 0 0 1 44 0Z" />
        <path d="M267.5 134a16 16 0 0 1 32 0Z" />
      </g>
      <g fill="#7FD8FF" opacity=".55">
        {[...sphereDots(230, 118, 22), ...sphereDots(283.5, 134, 16)].map((p, i) => (
          <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="1.1" />
        ))}
      </g>
      <circle cx="230" cy="10" r="2.2" fill="#FF6B6B" className={s.twinkle} />
      <circle cx="283.5" cy="54" r="1.8" fill="#FF6B6B" className={s.twinkle} style={{ animationDelay: "1.2s" }} />
    </svg>
  );
}

/** شعار درب: طريق متعرج ينتهي بنجمة */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`${s.logoMark} ${className ?? ""}`}>
      <svg viewBox="0 0 40 40" width="40" height="40">
        <path d="M11 32c1-6 6-7.5 10-9.5s6.5-5.5 4.2-10" fill="none" stroke="#1A1240" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M27.6 6.2l1.3 2.7 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" fill="#1A1240" />
      </svg>
    </span>
  );
}

/** زخرفة الغلاف حسب المادة (خطوط بيضاء شفافة) */
export function SubjectArt({ kind, className }: { kind: SubjectKey; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg aria-hidden viewBox="0 0 200 200" className={className}>
      <g {...common}>
        {kind === "math" && (
          <>
            <path d="M28 150 95 38l67 112Z" />
            <circle cx="142" cy="66" r="32" />
            <path d="M36 62h32M52 46v32" />
            <path d="M24 186Q100 84 176 186" strokeDasharray="3 9" />
            <path d="M118 168h40M118 181h40" />
          </>
        )}
        {kind === "science" && (
          <>
            <ellipse cx="100" cy="100" rx="82" ry="30" />
            <ellipse cx="100" cy="100" rx="82" ry="30" transform="rotate(60 100 100)" />
            <ellipse cx="100" cy="100" rx="82" ry="30" transform="rotate(-60 100 100)" />
            <circle cx="100" cy="100" r="11" fill="currentColor" />
            <circle cx="182" cy="100" r="5" fill="currentColor" />
            <circle cx="59" cy="29" r="5" fill="currentColor" />
          </>
        )}
        {kind === "english" && (
          <>
            <path d="M32 34h96a16 16 0 0 1 16 16v42a16 16 0 0 1-16 16H72l-26 22v-22H32a16 16 0 0 1-16-16V50a16 16 0 0 1 16-16Z" />
            <path d="M40 62h76M40 82h48" />
            <path d="M96 124h70a14 14 0 0 1 14 14v28a14 14 0 0 1-14 14h-8v20l-22-20H96a14 14 0 0 1-14-14v-28a14 14 0 0 1 14-14Z" />
            <path d="M100 150h46" />
          </>
        )}
        {kind === "arabic" && (
          <>
            <path d="M100 60C80 45 45 45 24 52v110c21-7 56-7 76 8 20-15 55-15 76-8V52c-21-7-56-7-76 8Z" />
            <path d="M100 60v110" />
            <path d="M42 86q20-12 40 0M42 112q20-12 40 0M118 86q20-12 40 0M118 112q20-12 40 0" />
          </>
        )}
        {kind === "islamic" && (
          <>
            <rect x="44" y="44" width="112" height="112" />
            <rect x="44" y="44" width="112" height="112" transform="rotate(45 100 100)" />
            <circle cx="100" cy="100" r="30" />
            <circle cx="100" cy="100" r="12" />
          </>
        )}
        {kind === "social" && (
          <>
            <circle cx="100" cy="100" r="72" />
            <ellipse cx="100" cy="100" rx="30" ry="72" />
            <path d="M28 100h144M40 62h120M40 138h120" />
          </>
        )}
        {kind === "other" && (
          <>
            <rect x="46" y="30" width="108" height="140" rx="10" />
            <path d="M70 66h60M70 90h60M70 114h36" />
          </>
        )}
      </g>
    </svg>
  );
}

/** ساعة ليلة الاختبار: دقيقتان قبل منتصف الليل */
export function ExamClock({ className }: { className?: string }) {
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <svg aria-hidden viewBox="0 0 240 240" className={className}>
      <circle cx="120" cy="120" r="112" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.1)" strokeWidth="1.5" />
      <circle cx="120" cy="120" r="96" fill="none" stroke="rgba(255,200,61,.18)" strokeWidth="10" />
      <circle
        cx="120"
        cy="120"
        r="96"
        fill="none"
        stroke="#FFC83D"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(2 * Math.PI * 96 * 58) / 60} ${2 * Math.PI * 96}`}
        transform="rotate(-90 120 120)"
        className={s.clockArc}
      />
      {ticks.map((i) => (
        <line
          key={i}
          x1="120"
          y1={i % 5 === 0 ? 34 : 38}
          x2="120"
          y2="42"
          stroke={i % 5 === 0 ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.25)"}
          strokeWidth={i % 5 === 0 ? 2.4 : 1.2}
          transform={`rotate(${i * 6} 120 120)`}
        />
      ))}
      <line x1="120" y1="120" x2="120" y2="70" stroke="#fff" strokeWidth="6" strokeLinecap="round" transform="rotate(-1 120 120)" />
      <line x1="120" y1="128" x2="120" y2="50" stroke="#FFC83D" strokeWidth="3.5" strokeLinecap="round" transform="rotate(-12 120 120)" />
      <circle cx="120" cy="120" r="7" fill="#FFC83D" />
      <circle cx="120" cy="120" r="2.5" fill="#0A0F2E" />
    </svg>
  );
}

/** «الدرب»: خط متعرج يربط خطوات البدء */
export function PathLine({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1000 120" preserveAspectRatio="none" className={className}>
      <path
        d="M0 60Q62 0 125 60T250 60T375 60T500 60T625 60T750 60T875 60T1000 60"
        fill="none"
        stroke="url(#v2bPath)"
        strokeWidth="3"
        strokeDasharray="2 10"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <defs>
        <linearGradient id="v2bPath" x1="1" x2="0">
          <stop offset="0" stopColor="#2EE6C5" />
          <stop offset=".5" stopColor="#FFC83D" />
          <stop offset="1" stopColor="#EE4C93" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** أعمدة «يُعرض الآن» */
export function EqBars() {
  return (
    <span aria-hidden className={s.eq}>
      <i />
      <i />
      <i />
    </span>
  );
}
