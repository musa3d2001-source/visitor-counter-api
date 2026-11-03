import type * as React from "react";
import { Sparkle } from "@/components/art";
import { ToneIcon } from "@/components/admin/icon-tile";
import { toneStyle, type AdminTone } from "@/components/admin/tones";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Eyebrow, type EyebrowTone } from "@/components/ui/section-head";
import { cn } from "@/lib/utils";

/** خلفية الشريط الملوّن: تدرج لون القسم + توهج ذهبي + نقاط + حلقة بيضاء */
function BandBackdrop() {
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(60%_100%_at_0%_0%,color-mix(in_oklab,var(--a)_44%,transparent),transparent_72%),radial-gradient(45%_80%_at_100%_100%,rgb(255_197_49/0.3),transparent_70%),linear-gradient(165deg,#fff_6%,var(--soft))]"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(color-mix(in_oklab,var(--b)_28%,transparent)_1.3px,transparent_1.6px)] bg-[length:22px_22px] opacity-70 [mask-image:radial-gradient(45%_80%_at_10%_45%,#000_10%,transparent_75%)]"
        aria-hidden
      />
      <span className="pointer-events-none absolute -end-20 -top-24 -z-10 size-64 rounded-full border-[22px] border-white/60" aria-hidden />
      <span className="pointer-events-none absolute -start-10 -bottom-16 -z-10 size-44 rounded-full bg-[var(--a)] opacity-[0.16] blur-xl" aria-hidden />
    </>
  );
}

const BAND_SHELL =
  "relative isolate overflow-hidden rounded-[2rem] border-2 border-white shadow-[0_6px_0_color-mix(in_oklab,var(--d)_18%,white),0_30px_50px_-34px_color-mix(in_oklab,var(--d)_70%,transparent)]";

/**
 * شريط رأس ملوّن لصفحات القوائم (الطلبات، الطلاب، المعلمون).
 * يلف AdminPageHeader (مرّر له className="mb-0")، ويعرض رسمًا توضيحيًا على الحاسوب وصف كبسولات في الأسفل.
 */
export function PeopleBand({
  tone,
  art,
  children,
  footer,
  className,
}: {
  tone: AdminTone;
  art?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div style={toneStyle(tone)} className={cn(BAND_SHELL, "px-4 pt-5 pb-5 sm:px-8 sm:pt-7 sm:pb-7", className)}>
      <BandBackdrop />
      <Sparkle className="pointer-events-none absolute end-4 top-4 size-4 animate-twinkle lg:hidden" />
      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">{children}</div>
        {art ? (
          <div className="relative hidden h-40 w-56 shrink-0 lg:block xl:w-64" aria-hidden>
            {art}
          </div>
        ) : null}
      </div>
      {footer ? <div className="relative mt-5 min-w-0">{footer}</div> : null}
    </div>
  );
}

/** كبسولة بيضاء داخل الشريط (أرقام حقيقية فقط) */
export function BandChip({ icon, tone = "teal", children, className }: { icon?: React.ReactNode; tone?: AdminTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-white bg-white/90 py-1 ps-1 pe-3.5 font-display text-[0.88rem] font-extrabold text-ink shadow-[0_3px_0_rgb(23_32_38/0.06),0_10px_20px_-14px_rgb(23_32_38/0.4)]",
        !icon && "ps-3.5",
        className,
      )}
    >
      {icon ? (
        <ToneIcon tone={tone} size="xs" className="size-8 rounded-full">
          {icon}
        </ToneIcon>
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function BandChips({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/**
 * رأس صفحة ملف (طالب، معلم، طلب): شريط ملوّن، صورة رمزية كبيرة بحلقة، كبسولة تسمية، العنوان h1،
 * وصف، كبسولات معلومات، وأزرار. ‎art‎ رسم اختياري على الحاسوب.
 */
export function ProfileHero({
  tone,
  crumbs,
  avatar,
  eyebrow,
  title,
  description,
  chips,
  actions,
  art,
  titleId,
  className,
}: {
  tone: AdminTone;
  crumbs: { label: string; href?: string }[];
  avatar: React.ReactNode;
  eyebrow?: { label: React.ReactNode; icon?: React.ReactNode; tone?: EyebrowTone };
  title: React.ReactNode;
  description?: React.ReactNode;
  chips?: React.ReactNode;
  actions?: React.ReactNode;
  art?: React.ReactNode;
  titleId?: string;
  className?: string;
}) {
  return (
    <header style={toneStyle(tone)} className={cn(BAND_SHELL, "px-4 pt-4 pb-6 sm:px-8 sm:pt-6 sm:pb-8", className)}>
      <BandBackdrop />
      <Sparkle className="pointer-events-none absolute end-5 top-16 size-4 animate-twinkle sm:top-6" />
      <Breadcrumbs items={[{ label: "الإدارة", href: "/admin" }, ...crumbs]} className="mb-5" />
      <div className="flex items-center gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="shrink-0">{avatar}</div>
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <Eyebrow icon={eyebrow.icon} tone={eyebrow.tone} className="mb-2">
                {eyebrow.label}
              </Eyebrow>
            ) : null}
            <h1 id={titleId} className="font-display text-[clamp(1.6rem,1.1rem+2vw,2.5rem)] leading-[1.25] font-black break-words text-balance text-ink">
              {title}
            </h1>
            {description ? <p className="mt-1 max-w-[62ch] text-[0.95rem] leading-7 text-ink-soft">{description}</p> : null}
            {chips ? <div className="mt-3.5 flex flex-wrap items-center gap-2">{chips}</div> : null}
          </div>
        </div>
        {art ? (
          <div className="relative hidden h-36 w-48 shrink-0 xl:block" aria-hidden>
            {art}
          </div>
        ) : null}
      </div>
      {actions ? <div className="relative mt-5 flex flex-wrap items-center gap-2.5 border-t border-dashed border-[color-mix(in_oklab,var(--b)_30%,white)] pt-4">{actions}</div> : null}
    </header>
  );
}
