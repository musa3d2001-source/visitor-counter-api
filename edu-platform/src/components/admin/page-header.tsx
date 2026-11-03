import type * as React from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Eyebrow, type EyebrowTone } from "@/components/ui/section-head";
import { cn } from "@/lib/utils";
import { RouteIcon } from "./header-icon";
import { ToneIcon } from "./icon-tile";
import type { AdminTone } from "./tones";

export { StatCard, StatTile, StatGrid, MiniStat, autoTone } from "./stat-tile";
export { Section, Panel, MoreLink, AdminNotice } from "./panel";

/**
 * رأس صفحة لوحة التحكم: مسار تنقل، مربع أيقونة ملوّن (يُستنتج من القائمة تلقائيًا)، عنوان Cairo كبير،
 * وصف، وخانة أزرار. ‎children‎ تظهر أسفل العنوان (كبسولات أرقام، تبويبات...).
 * - icon: أيقونة مخصصة (مع tone)، أو false لإخفاء المربع. بدونها: أيقونة عنصر القائمة الحالي ولونه.
 */
export function AdminPageHeader({
  title,
  description,
  actions,
  crumbs,
  icon,
  tone = "teal",
  eyebrow,
  children,
  className,
  titleId,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { label: string; href?: string }[];
  icon?: React.ReactNode | false;
  tone?: AdminTone;
  eyebrow?: { label: React.ReactNode; icon?: React.ReactNode; tone?: EyebrowTone };
  children?: React.ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <header className={cn("mb-7 sm:mb-9", className)}>
      {crumbs ? <Breadcrumbs items={[{ label: "الإدارة", href: "/admin" }, ...crumbs]} className="mb-4" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
          {icon === false ? null : icon ? (
            <ToneIcon tone={tone} size="lg" className="max-sm:size-12 max-sm:rounded-2xl">
              {icon}
            </ToneIcon>
          ) : (
            <RouteIcon size="lg" className="max-sm:size-12 max-sm:rounded-2xl" />
          )}
          <div className="min-w-0">
            {eyebrow ? (
              <Eyebrow icon={eyebrow.icon} tone={eyebrow.tone} className="mb-2">
                {eyebrow.label}
              </Eyebrow>
            ) : null}
            <h1 id={titleId} className="font-display text-[clamp(1.6rem,3.1vw,2.4rem)] leading-[1.25] font-black text-balance text-ink">
              {title}
            </h1>
            {description ? <p className="mt-1 max-w-[68ch] text-[0.95rem] leading-7 text-ink-soft">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  );
}
