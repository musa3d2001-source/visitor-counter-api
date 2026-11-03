import { useId } from "react";

/**
 * رسومات زخرفية لصفحات «نظرة عامة» في لوحة التحكم (aria-hidden، تملأ حاويتها).
 * الألوان من متغيرات اللون الحالية (--a/--b/--d/--soft) التي يضبطها toneStyle() على الحاوية.
 */

const A = { fill: "var(--a)" } as const;
const B = { fill: "var(--b)" } as const;
const D = { fill: "var(--d)" } as const;
const SOFT = { fill: "var(--soft)" } as const;

function Spark({ x, y, s = 1, color = "#FFC531" }: { x: number; y: number; s?: number; color?: string }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} d="M0-10c.8 5.4 4.6 9.2 10 10-5.4.8-9.2 4.6-10 10-.8-5.4-4.6-9.2-10-10 5.4-.8 9.2-4.6 10-10Z" fill={color} />;
}

/** لوح المبيعات للبطل الداكن: لوح أبيض مائل بأعمدة ملوّنة وخط ذهبي، عملة ذهبية، بطاقة طلب */
export function DashArt({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg className={className} viewBox="0 0 300 220" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#F0A500" />
        </linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4FE3D2" />
          <stop offset="1" stopColor="#0A8F86" />
        </linearGradient>
      </defs>
      {/* هالة شمس */}
      <circle cx="160" cy="104" r="96" fill="#FFC531" opacity=".16" />
      <circle cx="160" cy="104" r="66" fill="#FFC531" opacity=".14" />
      {/* اللوح */}
      <g transform="rotate(-6 160 110)">
        <rect x="62" y="44" width="196" height="138" rx="22" fill="#063F3C" opacity=".35" transform="translate(0 9)" />
        <rect x="62" y="44" width="196" height="138" rx="22" fill="#fff" />
        <rect x="80" y="60" width="64" height="9" rx="4.5" fill="#EFE6D6" />
        <rect x="80" y="75" width="40" height="7" rx="3.5" fill="#F6EFE2" />
        <g>
          <rect x="84" y="128" width="18" height="38" rx="9" fill="#FF6B5A" />
          <rect x="110" y="112" width="18" height="54" rx="9" fill={`url(#${id}t)`} />
          <rect x="136" y="120" width="18" height="46" rx="9" fill="#4D8DFF" />
          <rect x="162" y="96" width="18" height="70" rx="9" fill={`url(#${id}g)`} />
          <rect x="188" y="108" width="18" height="58" rx="9" fill="#9B5CF6" />
          <rect x="214" y="88" width="18" height="78" rx="9" fill={`url(#${id}t)`} />
        </g>
        <path d="M93 116 119 100 145 108 171 84 197 96 223 74" fill="none" stroke="#F0A500" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="223" cy="74" r="7" fill="#fff" stroke="#F0A500" strokeWidth="4" />
      </g>
      {/* عملة ذهبية */}
      <g transform="translate(58 70)">
        <circle r="30" fill="#C98500" transform="translate(0 4)" />
        <circle r="30" fill={`url(#${id}g)`} />
        <circle r="21" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeDasharray="4 5" />
        <Spark x={0} y={0} s={1.15} color="#fff" />
      </g>
      {/* بطاقة طلب ناجح */}
      <g transform="translate(196 156) rotate(4)">
        <rect x="0" y="0" width="92" height="44" rx="14" fill="#0B8A66" opacity=".4" transform="translate(0 5)" />
        <rect x="0" y="0" width="92" height="44" rx="14" fill="#DEF8EE" />
        <circle cx="22" cy="22" r="12" fill="#0B8A66" />
        <path d="m16.5 22 4 4 7-8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="42" y="14" width="38" height="6" rx="3" fill="#0A6F52" opacity=".55" />
        <rect x="42" y="25" width="26" height="5" rx="2.5" fill="#0A6F52" opacity=".3" />
      </g>
      <Spark x={262} y={36} s={1.2} />
      <Spark x={28} y={150} s={0.8} color="#C4FFF0" />
      <Spark x={120} y={20} s={0.6} />
    </svg>
  );
}

export type BandArtKind = "chart" | "coins" | "review" | "settings" | "profile";

/** رسومات أشرطة الصفحات الداخلية (ملوّنة بلون الصفحة) */
export function BandArt({ kind, className }: { kind: BandArtKind; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 170" aria-hidden focusable="false">
      <circle cx="132" cy="92" r="70" style={SOFT} />
      <circle cx="132" cy="92" r="70" fill="#fff" opacity=".45" />
      {kind === "chart" && (
        <g>
          <rect x="52" y="34" width="160" height="116" rx="20" style={D} opacity=".25" transform="translate(0 7)" />
          <rect x="52" y="34" width="160" height="116" rx="20" fill="#fff" />
          <rect x="70" y="50" width="56" height="8" rx="4" fill="#EFE6D6" />
          <rect x="72" y="100" width="16" height="34" rx="8" style={A} />
          <rect x="96" y="84" width="16" height="50" rx="8" style={B} />
          <rect x="120" y="94" width="16" height="40" rx="8" style={A} />
          <rect x="144" y="70" width="16" height="64" rx="8" fill="#FFC531" />
          <rect x="168" y="80" width="16" height="54" rx="8" style={B} />
          <path d="M80 94 104 76 128 86 152 60 176 70" fill="none" stroke="#FF6B5A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <g transform="translate(196 42)">
            <circle r="22" style={B} />
            <path d="M-8 6 0-6 8 6" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      )}
      {kind === "coins" && (
        <g>
          <rect x="44" y="70" width="128" height="80" rx="20" style={D} opacity=".3" transform="translate(0 7)" />
          <rect x="44" y="70" width="128" height="80" rx="20" style={B} />
          <rect x="44" y="70" width="128" height="26" rx="13" style={A} />
          <rect x="132" y="98" width="52" height="30" rx="15" fill="#fff" />
          <circle cx="150" cy="113" r="7" style={B} />
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(196 ${132 - i * 16})`}>
              <ellipse rx="26" ry="9" fill="#C98500" transform="translate(0 4)" />
              <ellipse rx="26" ry="9" fill="#FFC531" />
              <ellipse rx="16" ry="5" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
            </g>
          ))}
          <g transform="translate(92 42)">
            <circle r="22" fill="#C98500" transform="translate(0 3)" />
            <circle r="22" fill="#FFD25E" />
            <Spark x={0} y={0} s={0.9} color="#fff" />
          </g>
        </g>
      )}
      {kind === "review" && (
        <g>
          <rect x="66" y="26" width="116" height="134" rx="18" style={D} opacity=".25" transform="translate(0 7)" />
          <rect x="66" y="26" width="116" height="134" rx="18" fill="#fff" />
          <rect x="100" y="16" width="48" height="22" rx="11" style={B} />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(84 ${58 + i * 32})`}>
              <rect width="20" height="20" rx="7" style={i < 2 ? A : SOFT} />
              {i < 2 ? <path d="m5 10 4 4 7-8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
              <rect x="30" y="3" width={i === 1 ? 50 : 62} height="6" rx="3" fill="#E0D2BA" />
              <rect x="30" y="13" width="36" height="5" rx="2.5" fill="#EFE6D6" />
            </g>
          ))}
          <g transform="translate(186 128)">
            <circle r="24" fill="#0B8A66" opacity=".35" transform="translate(0 4)" />
            <circle r="24" fill="#18B9A7" />
            <path d="m-10 0 7 7 13-14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      )}
      {kind === "settings" && (
        <g>
          <rect x="44" y="40" width="150" height="108" rx="20" style={D} opacity=".25" transform="translate(0 7)" />
          <rect x="44" y="40" width="150" height="108" rx="20" fill="#fff" />
          {[
            [62, "#FF6B5A", 0.7],
            [88, "#18B9A7", 0.4],
            [114, "#4D8DFF", 0.85],
          ].map(([y, c, f]) => (
            <g key={String(y)}>
              <rect x="62" y={Number(y)} width="114" height="8" rx="4" fill="#EFE6D6" />
              <rect x="62" y={Number(y)} width={114 * Number(f)} height="8" rx="4" fill={String(c)} />
              <circle cx={62 + 114 * Number(f)} cy={Number(y) + 4} r="9" fill="#fff" stroke={String(c)} strokeWidth="4" />
            </g>
          ))}
          <g transform="translate(196 52)">
            <circle r="26" style={B} />
            <circle r="26" fill="none" style={{ stroke: "var(--a)" }} strokeWidth="9" strokeDasharray="8 7" />
            <circle r="9" fill="#fff" />
          </g>
          <g transform="translate(58 140)">
            <circle r="16" fill="#FFC531" />
            <circle cx="24" r="16" fill="#18B9A7" opacity=".9" />
          </g>
        </g>
      )}
      {kind === "profile" && (
        <g>
          <rect x="48" y="38" width="150" height="104" rx="20" style={D} opacity=".25" transform="translate(0 7)" />
          <rect x="48" y="38" width="150" height="104" rx="20" fill="#fff" />
          <rect x="48" y="38" width="150" height="34" rx="17" style={A} />
          <rect x="48" y="56" width="150" height="16" style={A} />
          <circle cx="94" cy="80" r="24" fill="#fff" />
          <circle cx="94" cy="80" r="18" style={B} />
          <circle cx="94" cy="74" r="6" fill="#fff" />
          <path d="M83 90c2-6 6-8 11-8s9 2 11 8" fill="#fff" />
          <rect x="128" y="84" width="54" height="8" rx="4" fill="#E0D2BA" />
          <rect x="70" y="114" width="70" height="7" rx="3.5" fill="#EFE6D6" />
          <rect x="146" y="112" width="36" height="12" rx="6" style={SOFT} />
          <g transform="translate(202 44)">
            <circle r="18" fill="#C98500" transform="translate(0 3)" />
            <circle r="18" fill="#FFD25E" />
            <path d="m0-9 2.6 5.6 6 .7-4.5 4.1 1.2 6L0 4.4-5.3 7.4l1.2-6-4.5-4.1 6-.7Z" fill="#fff" />
          </g>
        </g>
      )}
      <Spark x={30} y={40} s={1} />
      <Spark x={222} y={150} s={0.7} color="#FF6B5A" />
    </svg>
  );
}
