import { useId } from "react";

/**
 * شعار «درب»: طريق متعرّج يصعد نحو شمس ذهبية.
 * المعرّف الداخلي للتدرج فريد لكل نسخة (useId) فلا تتعارض شعارات متعددة في الصفحة.
 * ‎`id`‎ اختياري ومحفوظ للتوافق مع نماذج المختبر.
 */
export function LogoMark({ id, size = 44, className }: { id?: string; size?: number; className?: string }) {
  const auto = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gid = `lg-${id ?? ""}${auto}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1BB3A6" />
          <stop offset="1" stopColor="#06504B" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="15" fill={`url(#${gid})`} />
      <rect x="1" y="1" width="46" height="46" rx="14" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="2" />
      <circle cx="32" cy="14.5" r="6.2" fill="#FFC531" />
      <circle cx="32" cy="14.5" r="9.5" fill="#FFC531" opacity=".22" />
      <path d="M13 41c0-8 13-7.5 13-14.5 0-5.2-6.6-5.3-6.6-9.8 0-3.4 3.4-4.6 6.6-4.4" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <path
        d="M13 41c0-8 13-7.5 13-14.5 0-5.2-6.6-5.3-6.6-9.8 0-3.4 3.4-4.6 6.6-4.4"
        fill="none"
        stroke="#06504B"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="2 3.2"
        opacity=".55"
      />
    </svg>
  );
}
