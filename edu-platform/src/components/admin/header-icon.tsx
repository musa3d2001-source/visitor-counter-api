"use client";

import { usePathname } from "next/navigation";
import { ToneIcon, type ToneIconSize } from "./icon-tile";
import { navMatch } from "./sidebar";

/** أيقونة رأس الصفحة المستنتجة من المسار (نفس أيقونة ولون عنصر القائمة) */
export function RouteIcon({ size = "lg", className }: { size?: ToneIconSize; className?: string }) {
  const hit = navMatch(usePathname());
  if (!hit) return null;
  const { Icon, tone } = hit;
  return (
    <ToneIcon tone={tone} size={size} className={className}>
      <Icon strokeWidth={2.2} />
    </ToneIcon>
  );
}
