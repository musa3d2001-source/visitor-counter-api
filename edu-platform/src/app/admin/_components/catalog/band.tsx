import type * as React from "react";
import { Sparkle } from "@/components/art";
import { ToneIcon } from "@/components/admin/icon-tile";
import { toneStyle, type AdminTone, type AdminToneStyle } from "@/components/admin/tones";
import { cn } from "@/lib/utils";

/**
 * شريط رأس ملوّن لصفحات المحتوى (المنتجات، المحرر، المراحل، الباقات، الكوبونات).
 * يلف AdminPageHeader (مرّر له className="mb-0") بخلفية بلون القسم، نقاط، حلقة بيضاء، نجوم،
 * ورسم توضيحي على الحاسوب. ‎style‎ يسمح بتمرير ألوان المادة (subjectVars) بدل لون القسم.
 */
export function CatalogBand({
  tone = "sky",
  art,
  children,
  footer,
  className,
  style,
}: {
  tone?: AdminTone;
  art?: React.ReactNode;
  children: React.ReactNode;
  /** صف أسفل الشريط (كبسولات، تبويبات) بعرض الشريط كله */
  footer?: React.ReactNode;
  className?: string;
  style?: AdminToneStyle | React.CSSProperties;
}) {
  return (
    <div
      style={{ ...toneStyle(tone), ...style }}
      className={cn(
        "relative isolate overflow-hidden rounded-[2rem] border-2 border-white px-4 pt-5 pb-5 sm:px-8 sm:pt-7 sm:pb-7",
        "shadow-[0_6px_0_color-mix(in_oklab,var(--d)_18%,white),0_30px_50px_-34px_color-mix(in_oklab,var(--d)_70%,transparent)]",
        className,
      )}
    >
      <span
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(60%_100%_at_0%_0%,color-mix(in_oklab,var(--a)_42%,transparent),transparent_72%),radial-gradient(45%_80%_at_100%_100%,rgb(255_197_49/0.28),transparent_70%),linear-gradient(165deg,#fff_8%,var(--soft))]"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(color-mix(in_oklab,var(--b)_28%,transparent)_1.3px,transparent_1.6px)] bg-[length:22px_22px] opacity-70 [mask-image:radial-gradient(45%_80%_at_10%_45%,#000_10%,transparent_75%)]"
        aria-hidden
      />
      <span className="pointer-events-none absolute -end-20 -top-24 -z-10 size-64 rounded-full border-[22px] border-white/60" aria-hidden />
      <span className="pointer-events-none absolute -start-10 -bottom-16 -z-10 size-40 rounded-full bg-[var(--a)] opacity-[0.13] blur-xl" aria-hidden />
      <Sparkle className="pointer-events-none absolute end-4 top-4 size-4 animate-twinkle lg:hidden" />
      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">{children}</div>
        {art ? (
          <div className="relative hidden h-40 w-60 shrink-0 lg:block xl:w-68" aria-hidden>
            {art}
          </div>
        ) : null}
      </div>
      {footer ? <div className="relative mt-5 min-w-0">{footer}</div> : null}
    </div>
  );
}

/** كبسولة رقم/معلومة بيضاء داخل الشريط (أرقام حقيقية فقط) */
export function BandChip({ icon, tone = "teal", children, className }: { icon?: React.ReactNode; tone?: AdminTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-full border border-white bg-white/90 py-1 ps-1 pe-3.5 font-display text-[0.88rem] font-extrabold text-ink shadow-[0_3px_0_rgb(23_32_38/0.06),0_10px_20px_-14px_rgb(23_32_38/0.4)]",
        !icon && "ps-3.5",
        className,
      )}
    >
      {icon ? (
        <ToneIcon tone={tone} size="xs" className="size-8 rounded-full">
          {icon}
        </ToneIcon>
      ) : null}
      {children}
    </span>
  );
}

/** صف كبسولات الشريط */
export function BandChips({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
