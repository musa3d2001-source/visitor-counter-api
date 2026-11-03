import type * as React from "react";
import { SpotArt, Sparkle, type SpotKind } from "@/components/art";
import { cn } from "@/lib/utils";

/**
 * حالة فارغة ودودة: لوح كريمي مشمس، رسم توضيحي (art) أو أيقونة في دائرة متدرجة، عنوان Cairo، وصف، وإجراء.
 * بلا art ولا icon يظهر الرسم «generic». art: «cart» · «library» · «search» · «video» · «lock» · «receipt» · «generic» (يُفضَّل على icon)
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  art,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  art?: SpotKind;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-sunny relative isolate flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-[rgb(23_32_38/0.05)] px-6 text-center shadow-card",
        compact ? "py-10" : "py-14 sm:py-16",
        className,
      )}
    >
      <Sparkle className="animate-twinkle absolute start-[12%] top-8 size-5" />
      <Sparkle className="animate-twinkle absolute end-[14%] bottom-10 size-3.5 [animation-delay:1.2s]" color="#17A398" />
      {art || !icon ? (
        <div className={cn("mb-2 text-brand-600", compact ? "h-24 w-28" : "h-32 w-36")}>
          <SpotArt kind={art ?? "generic"} />
        </div>
      ) : (
        <div className="relative mb-5">
          <span className="absolute inset-0 -m-3 rounded-full bg-accent-200/60" aria-hidden />
          <div className="relative grid size-18 place-items-center rounded-[1.4rem] bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-[0_6px_0_var(--brand-edge),0_18px_30px_-14px_rgb(6_63_60/0.6)] [&_svg]:size-8">
            {icon}
          </div>
        </div>
      )}
      <h3 className="font-display text-[1.6rem] leading-snug font-black text-ink">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-[0.98rem] leading-8 text-ink-soft">{description}</p> : null}
      {action ? <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
    </div>
  );
}
