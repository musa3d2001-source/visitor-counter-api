import type * as React from "react";
import { Sparkle } from "@/components/art";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./breadcrumbs";
import { Eyebrow, type EyebrowTone } from "./section-head";

/**
 * رأس الصفحات الداخلية: خلفية مشمسة بنقاط (‎.page-hero‎)، مسار التنقل، كبسولة، عنوان h1 كبير، وصف،
 * أزرار، وخانة جانبية اختيارية (رسم أو بطاقة) على الحاسوب. ‎children‎ تظهر أسفل الوصف (كبسولات أرقام…).
 */
export function PageHeader({
  title,
  sub,
  breadcrumbs,
  eyebrow,
  actions,
  aside,
  children,
  className,
  titleId,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  eyebrow?: { icon?: React.ReactNode; label: React.ReactNode; tone?: EyebrowTone };
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <section className={cn("page-hero", className)} aria-labelledby={titleId}>
      <Sparkle className="animate-twinkle absolute end-[9%] top-10 size-6" />
      <Sparkle className="animate-twinkle absolute start-[6%] bottom-12 size-3.5 [animation-delay:1.3s]" color="#17A398" />
      <div className={cn("mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6", aside && "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]")}>
        <div className="min-w-0">
          {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} className="mb-6" /> : null}
          {eyebrow ? (
            <Eyebrow icon={eyebrow.icon} tone={eyebrow.tone} className="mb-3">
              {eyebrow.label}
            </Eyebrow>
          ) : null}
          <h1 id={titleId} className="h-page">
            {title}
          </h1>
          {sub ? <p className="lead mt-3 max-w-2xl">{sub}</p> : null}
          {children ? <div className="mt-6">{children}</div> : null}
          {actions ? <div className="mt-7 flex flex-wrap items-center gap-3.5">{actions}</div> : null}
        </div>
        {aside ? <div className="relative hidden min-w-0 lg:block">{aside}</div> : null}
      </div>
    </section>
  );
}

const STAT_TONES = {
  teal: "from-[#2dc2b3] to-[#0a6b66] text-white",
  coral: "from-[#ffa07a] to-[#e8483f] text-white",
  gold: "from-[#ffd25e] to-[#eb9b00] text-[#3d2a00]",
  violet: "from-[#b28cff] to-[#6a3fe0] text-white",
} as const;

/** كبسولة رقم حقيقي: أيقونة في دائرة متدرجة + رقم Cairo ثقيل + معدود (استخدم countParts) */
export function StatPill({ icon, num, label, tone = "teal", className }: { icon: React.ReactNode; num: React.ReactNode; label: React.ReactNode; tone?: keyof typeof STAT_TONES; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border border-white bg-white/80 py-1.5 ps-1.5 pe-4.5 shadow-card backdrop-blur-md",
        className,
      )}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br [&_svg]:size-[1.1rem]", STAT_TONES[tone])}>{icon}</span>
      <span className="inline-flex items-baseline gap-1.5 leading-tight">
        <b className="font-display text-[1.4rem] font-black text-ink">{num}</b>
        <small className="text-[0.92rem] font-bold text-ink-soft">{label}</small>
      </span>
    </span>
  );
}
