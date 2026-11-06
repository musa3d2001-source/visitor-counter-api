/**
 * [مختبر المرحلة 0 - ليس كود إنتاج] أيقونات محلية لمختبرات /lab/game-* بدل استيرادها من lucide-react.
 *
 * لماذا؟ بوابة المرحلة 0 قاست أن استيراد lucide-react من مكوّنات العميل في المختبرات الثلاثة يعيد توزيع
 * أجزاء Turbopack المشتركة فيكبر JS كل صفحات الموقع القائمة (+118 بايت خامًا، وحتى +3.5KB في /lab/system).
 * بيانات المسارات منسوخة حرفيًا من lucide-react 1.66.0 (رخصة ISC، حقوق Lucide Contributors)
 * بمولّد في مجلد العمل، وبنفس السمات الافتراضية (24×24، stroke=currentColor، عرض 2، أطراف مستديرة).
 */
import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number | string };
type Node = [tag: "path" | "circle" | "rect" | "line" | "polyline" | "polygon" | "ellipse", attrs: Record<string, string | number>][];

function make(node: Node) {
  function LabIcon({ size = 24, strokeWidth = 2, fill = "none", ...rest }: IconProps) {
    const labelled = rest["aria-label"] !== undefined || rest["aria-labelledby"] !== undefined || rest.role !== undefined;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={labelled ? undefined : true}
        {...rest}
      >
        {node.map(([Tag, { key, ...attrs }]) => (
          <Tag key={key} {...attrs} />
        ))}
      </svg>
    );
  }
  return LabIcon;
}

export const ArrowLeft = make([["path",{"d":"m12 19-7-7 7-7","key":"1l729n"}],["path",{"d":"M19 12H5","key":"x3x0zl"}]]);
export const BookOpen = make([["path",{"d":"M12 5v16","key":"1f6ucr"}],["path",{"d":"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z","key":"1fyvmf"}]]);
export const Check = make([["path",{"d":"M20 6 9 17l-5-5","key":"1gmf2c"}]]);
export const ChevronLeft = make([["path",{"d":"m15 18-6-6 6-6","key":"1wnfg3"}]]);
export const Lightbulb = make([["path",{"d":"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5","key":"1gvzjb"}],["path",{"d":"M9 18h6","key":"x1upvd"}],["path",{"d":"M10 22h4","key":"ceow96"}]]);
export const Lock = make([["rect",{"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2","key":"1w4ew1"}],["path",{"d":"M7 11V7a5 5 0 0 1 10 0v4","key":"fwvmzm"}]]);
export const Map = make([["path",{"d":"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z","key":"169xi5"}],["path",{"d":"M15 5.764v15","key":"1pn4in"}],["path",{"d":"M9 3.236v15","key":"1uimfh"}]]);
export const Minus = make([["path",{"d":"M5 12h14","key":"1ays0h"}]]);
export const Pause = make([["rect",{"x":"14","y":"3","width":"5","height":"18","rx":"1","key":"kaeet6"}],["rect",{"x":"5","y":"3","width":"5","height":"18","rx":"1","key":"1wsw3u"}]]);
export const Play = make([["path",{"d":"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z","key":"10ikf1"}]]);
export const Plus = make([["path",{"d":"M5 12h14","key":"1ays0h"}],["path",{"d":"M12 5v14","key":"s699le"}]]);
export const RotateCcw = make([["path",{"d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8","key":"1357e3"}],["path",{"d":"M3 3v5h5","key":"1xhq8a"}]]);
export const Sparkles = make([["path",{"d":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z","key":"1s2grr"}],["path",{"d":"M20 2v4","key":"1rf3ol"}],["path",{"d":"M22 4h-4","key":"gwowj6"}],["circle",{"cx":"4","cy":"20","r":"2","key":"6kqj1y"}]]);
export const Star = make([["path",{"d":"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z","key":"r04s7s"}]]);
export const Volume2 = make([["path",{"d":"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z","key":"uqj9uw"}],["path",{"d":"M16 9a5 5 0 0 1 0 6","key":"1q6k2b"}],["path",{"d":"M19.364 18.364a9 9 0 0 0 0-12.728","key":"ijwkga"}]]);
export const VolumeX = make([["path",{"d":"M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z","key":"1p7khw"}],["path",{"d":"m16.5 14.5 5-5","key":"cul3yw"}],["path",{"d":"m16.5 9.5 5 5","key":"1akey5"}]]);
export const X = make([["path",{"d":"M18 6 6 18","key":"1bl5f8"}],["path",{"d":"m6 6 12 12","key":"d8bk6v"}]]);
