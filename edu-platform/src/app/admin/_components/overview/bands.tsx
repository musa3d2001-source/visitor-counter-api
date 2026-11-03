import type * as React from "react";
import { Sparkle, Swash } from "@/components/art";
import { toneStyle, type AdminTone } from "@/components/admin/tones";
import { cn } from "@/lib/utils";
import { BandArt, DashArt, type BandArtKind } from "./art";

/**
 * بطل الصفحة الرئيسية للوحة: شريط فيروزي ليلي بتوهج ذهبي، كبسولة الدور، تحية باسم المستخدم مع خط ذهبي،
 * سطر وصف، كبسولات أرقام حقيقية اختيارية، أزرار ثلاثية الأبعاد، ورسم لوح المبيعات على الحاسوب.
 */
export function DashHero({
  eyebrow,
  greeting,
  name,
  sub,
  chips,
  actions,
  titleId = "dash-title",
}: {
  eyebrow: React.ReactNode;
  greeting: string;
  name: string;
  sub?: React.ReactNode;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
  titleId?: string;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className="on-dark bg-teal-night relative isolate overflow-hidden rounded-[2rem] px-5 pt-6 pb-7 shadow-pop sm:px-8 sm:pt-8 sm:pb-9 lg:px-10"
    >
      {/* نقاط وحلقات زخرفية */}
      <span
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.22)_1.2px,transparent_1.6px)] bg-[length:22px_22px] opacity-60 [mask-image:radial-gradient(55%_85%_at_18%_40%,#000_10%,transparent_75%)]"
        aria-hidden
      />
      <span className="pointer-events-none absolute -end-24 -bottom-32 -z-10 size-80 rounded-full border-[28px] border-white/[0.06]" aria-hidden />
      <span className="pointer-events-none absolute -start-16 -top-24 -z-10 size-64 rounded-full bg-[#FFC531]/10 blur-2xl" aria-hidden />
      <Sparkle className="pointer-events-none absolute start-[46%] top-6 size-5 animate-twinkle max-md:hidden" />
      <Sparkle className="pointer-events-none absolute end-5 top-5 size-4 animate-twinkle md:hidden" />

      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_14rem] lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">{eyebrow}</div>
          <h1 id={titleId} className="mt-4 font-display text-[clamp(1.9rem,1.2rem+2.6vw,3.1rem)] leading-[1.3] font-black text-balance text-white">
            {greeting}{" "}
            <span className="relative inline-block text-gold">
              {name}
              <Swash className="pointer-events-none absolute inset-x-0 -bottom-2 h-3 w-full" />
            </span>
          </h1>
          {sub ? <p className="mt-4 max-w-[60ch] text-[1rem] leading-8 text-white/85">{sub}</p> : null}
          {chips ? <div className="mt-5 flex flex-wrap gap-2">{chips}</div> : null}
          {actions ? <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
        <div className="relative hidden h-[12rem] md:block lg:h-[15rem]">
          <DashArt className="absolute inset-0 size-full motion-safe:animate-bob" />
        </div>
      </div>
    </section>
  );
}

/** كبسولة رقم زجاجية داخل البطل الداكن */
export function HeroChip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/20 bg-white/10 py-1 ps-1.5 pe-3.5 font-display text-[0.88rem] font-extrabold text-white backdrop-blur-sm">
      {icon ? <span className="grid size-6 place-items-center rounded-full bg-[#FFC531] text-[#3D2A00] [&_svg]:size-3.5">{icon}</span> : null}
      {children}
    </span>
  );
}

/**
 * شريط ملوّن لرأس الصفحات الداخلية: يلف AdminPageHeader (مرّر له className="mb-0") بخلفية بلون القسم،
 * نقاط، حلقة، ورسم توضيحي على الحاسوب.
 */
export function PageBand({ tone, art, children, className }: { tone: AdminTone; art?: BandArtKind; children: React.ReactNode; className?: string }) {
  return (
    <div
      style={toneStyle(tone)}
      className={cn(
        "relative isolate overflow-hidden rounded-[2rem] border-2 border-white px-5 pt-5 pb-6 sm:px-8 sm:pt-7 sm:pb-8",
        "shadow-[0_6px_0_color-mix(in_oklab,var(--d)_16%,white),0_30px_50px_-34px_color-mix(in_oklab,var(--d)_65%,transparent)]",
        className,
      )}
    >
      <span
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(55%_95%_at_0%_0%,color-mix(in_oklab,var(--a)_38%,transparent),transparent_72%),radial-gradient(45%_80%_at_100%_100%,rgb(255_197_49/0.26),transparent_70%),linear-gradient(165deg,#fff_10%,var(--soft))]"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(color-mix(in_oklab,var(--b)_26%,transparent)_1.3px,transparent_1.6px)] bg-[length:22px_22px] opacity-70 [mask-image:radial-gradient(45%_80%_at_12%_45%,#000_10%,transparent_75%)]"
        aria-hidden
      />
      <span className="pointer-events-none absolute -end-20 -top-24 -z-10 size-64 rounded-full border-[22px] border-white/55" aria-hidden />
      <Sparkle className="pointer-events-none absolute end-4 top-4 size-4 animate-twinkle sm:hidden" />
      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">{children}</div>
        {art ? (
          <div className="hidden h-28 w-40 shrink-0 md:block lg:h-36 lg:w-52">
            <BandArt kind={art} className="size-full" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
