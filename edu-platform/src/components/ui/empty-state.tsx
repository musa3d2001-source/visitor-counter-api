import type * as React from "react";
import { SpotArt, Sparkle, type SpotKind } from "@/components/art";
import { cn } from "@/lib/utils";

/**
 * حالة فارغة ودودة: لوح كريمي مشمس، رسم توضيحي (art) أو أيقونة في دائرة متدرجة، عنوان Cairo، وصف، وإجراء.
 * بلا art ولا icon يظهر الرسم «generic». art: «cart» · «library» · «search» · «video» · «lock» · «receipt» · «generic» (يُفضَّل على icon)
 * compact: شريط مضغوط داخل اللوحات (رسم صغير، والعنوان والوصف والإجراء في صف واحد على الشاشات العريضة).
 * headingLevel: مستوى العنوان (الافتراضي 3)؛ استخدم 2 حين تقع الحالة مباشرة تحت h1.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  art,
  compact = false,
  headingLevel = 3,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  art?: SpotKind;
  compact?: boolean;
  headingLevel?: 2 | 3 | 4;
}) {
  const H = `h${headingLevel}` as "h3";

  if (compact) {
    return (
      <div
        className={cn(
          "bg-sunny relative isolate flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-[rgb(23_32_38/0.12)] px-4 py-5 text-center sm:flex-row sm:gap-4 sm:px-5 sm:py-4 sm:text-start",
          className,
        )}
      >
        {art || !icon ? (
          <div className="h-14 w-16 shrink-0 text-brand-600" aria-hidden>
            <SpotArt kind={art ?? "generic"} />
          </div>
        ) : (
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-[0_4px_0_var(--brand-edge)] [&_svg]:size-6" aria-hidden>
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <H className="font-display text-[1.08rem] leading-snug font-extrabold text-ink">{title}</H>
          {description ? <p className="mt-0.5 text-[0.92rem] leading-7 text-ink-soft">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">{action}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-sunny relative isolate flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-[rgb(23_32_38/0.05)] px-6 py-14 text-center shadow-card sm:py-16",
        className,
      )}
    >
      <Sparkle className="animate-twinkle absolute start-[12%] top-8 size-5" />
      <Sparkle className="animate-twinkle absolute end-[14%] bottom-10 size-3.5 [animation-delay:1.2s]" color="#17A398" />
      {art || !icon ? (
        <div className="mb-2 h-32 w-36 text-brand-600">
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
      <H className="font-display text-[1.6rem] leading-snug font-black text-ink">{title}</H>
      {description ? <p className="mt-2 max-w-md text-[0.98rem] leading-8 text-ink-soft">{description}</p> : null}
      {action ? <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
    </div>
  );
}
