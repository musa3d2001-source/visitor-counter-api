/**
 * رسومات صغيرة ودودة للحالات الفارغة وصفحات الدخول (مساحة ١٦٠×١٤٠).
 * currentColor = لون الهوية (ضع text-brand-600 على العنصر الأب)، والذهبي ثابت.
 */
import { GOLD, GOLD_SOFT } from "./palette";

export type SpotKind = "generic" | "cart" | "library" | "search" | "video" | "lock" | "receipt";

function Backdrop() {
  return (
    <>
      <circle cx="80" cy="74" r="58" fill={GOLD_SOFT} opacity=".55" />
      <circle cx="80" cy="74" r="42" fill="#fff" opacity=".7" />
      <path d="M22 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill={GOLD} />
      <path d="M140 96l2.5 5.5 5.5 2.5-5.5 2.5-2.5 5.5-2.5-5.5-5.5-2.5 5.5-2.5Z" fill="currentColor" opacity=".5" />
      <circle cx="136" cy="30" r="4" fill="currentColor" opacity=".35" />
      <circle cx="24" cy="112" r="3" fill={GOLD} />
    </>
  );
}

export function SpotArt({ kind = "generic", className }: { kind?: SpotKind; className?: string }) {
  return (
    <svg viewBox="0 0 160 140" className={className} width="100%" height="100%" aria-hidden focusable="false">
      <Backdrop />
      {kind === "cart" && (
        <g>
          <path d="M38 46h10l10 46h50l10-34H54" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M57 58h59l-8 28H63Z" fill="#fff" />
          <circle cx="66" cy="106" r="7" fill="currentColor" />
          <circle cx="102" cy="106" r="7" fill="currentColor" />
          <circle cx="110" cy="38" r="12" fill={GOLD} />
          <path d="M110 32v12M104 38h12" stroke="#7A4A00" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}
      {kind === "library" && (
        <g>
          <rect x="44" y="40" width="18" height="70" rx="5" fill="#FF6B5A" />
          <rect x="64" y="32" width="18" height="78" rx="5" fill={GOLD} />
          <rect x="84" y="44" width="16" height="66" rx="5" fill="#4D8DFF" />
          <rect x="102" y="42" width="18" height="70" rx="5" fill="currentColor" transform="rotate(14 111 77)" />
          <rect x="36" y="110" width="92" height="8" rx="4" fill="currentColor" opacity=".85" />
          <path d="M68 46h10M68 56h10" stroke="#7A4A00" strokeWidth="3" strokeLinecap="round" />
          <path d="M48 54h10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {kind === "search" && (
        <g>
          <rect x="40" y="34" width="62" height="78" rx="12" fill="#fff" />
          <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity=".35">
            <path d="M52 54h38M52 70h30M52 86h22" />
          </g>
          <circle cx="98" cy="76" r="20" fill="#fff" stroke="currentColor" strokeWidth="7" />
          <path d="M113 91l14 14" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
          <circle cx="92" cy="70" r="5" fill={GOLD} />
        </g>
      )}
      {kind === "video" && (
        <g>
          <rect x="30" y="38" width="100" height="66" rx="14" fill="#fff" />
          <circle cx="80" cy="71" r="18" fill="currentColor" />
          <path d="M75 61v20l16-10Z" fill="#fff" />
          <rect x="48" y="112" width="64" height="8" rx="4" fill="currentColor" opacity=".3" />
          <rect x="48" y="112" width="28" height="8" rx="4" fill={GOLD} />
        </g>
      )}
      {kind === "lock" && (
        <g>
          <path d="M60 64V52a20 20 0 0 1 40 0v12" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
          <rect x="46" y="62" width="68" height="52" rx="14" fill="#fff" />
          <rect x="46" y="62" width="68" height="52" rx="14" fill="none" stroke="currentColor" strokeWidth="4" opacity=".25" />
          <circle cx="80" cy="84" r="7" fill={GOLD} />
          <path d="M80 88v12" stroke="#7A4A00" strokeWidth="4" strokeLinecap="round" />
        </g>
      )}
      {kind === "receipt" && (
        <g>
          <path d="M48 30h64v86l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6Z" fill="#fff" />
          <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity=".35">
            <path d="M60 50h40M60 66h28M60 82h34" />
          </g>
          <circle cx="110" cy="92" r="16" fill={GOLD} />
          <path d="M103 92l5 5 9-10" fill="none" stroke="#3D2A00" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {kind === "generic" && (
        <g>
          <rect x="44" y="40" width="70" height="80" rx="12" fill="#fff" opacity=".55" transform="rotate(-10 79 80)" />
          <rect x="48" y="34" width="70" height="80" rx="12" fill="#fff" />
          <rect x="48" y="34" width="70" height="22" rx="12" fill="currentColor" />
          <rect x="48" y="46" width="70" height="10" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity=".3">
            <path d="M60 72h44M60 88h30" />
          </g>
          <circle cx="116" cy="36" r="13" fill={GOLD} />
        </g>
      )}
    </svg>
  );
}
