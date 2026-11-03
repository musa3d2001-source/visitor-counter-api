import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { ToneIcon } from "./icon-tile";
import { toneStyle, type AdminTone } from "./tones";

/**
 * ألواح لوحة التحكم: أسطح بيضاء بزوايا ٢٨ وظل دافئ. كل محتوى الصفحة يجلس داخل ألواح على الخلفية الكريمية.
 *
 * Panel — السطح الأساسي (variant: default | tinted | night | sunny ؛ padding: none | sm | md)
 * Section — لوح مع رأس (عنوان h2 + وصف + أيقونة + إجراءات). ‎flush‎ يجعل الجدول بعرض اللوح كاملًا.
 * MoreLink — رابط «عرض الكل» صغير بسهم.
 * AdminNotice — شريط تنبيه قابل للنقر (مثل «يوجد محتوى بانتظار المراجعة»).
 */

const PANEL = {
  default: "border border-[rgb(23_32_38/0.06)] bg-surface shadow-card",
  tinted: "border border-line bg-[linear-gradient(180deg,#fffaf2,#fff4e4)]",
  sunny: "bg-sunny border border-white shadow-card",
  night: "on-dark bg-teal-night text-white shadow-pop",
} as const;

const PAD = { none: "", sm: "p-4", md: "p-4 sm:p-6" } as const;

export function Panel({
  variant = "default",
  padding = "md",
  as: As = "div",
  className,
  ...props
}: { variant?: keyof typeof PANEL; padding?: keyof typeof PAD; as?: "div" | "section" | "article" | "aside" } & React.ComponentProps<"div">) {
  return <As className={cn("relative min-w-0 rounded-[1.75rem]", PANEL[variant], PAD[padding], className)} {...props} />;
}

/** رابط «عرض الكل» بسهم (ضعه في actions الخاصة بـ Section) */
export function MoreLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-50 px-3.5 font-display text-[0.85rem] font-extrabold text-brand-800 transition-colors hover:bg-brand-100",
        className,
      )}
    >
      {children}
      <ArrowLeft className="size-4" aria-hidden />
    </Link>
  );
}

/**
 * لوح بعنوان. الخصائص القديمة كما هي (title, description, actions, children, id)، والجديدة اختيارية:
 * icon + tone (مربع أيقونة ملوّن بجوار العنوان) · flush (بلا حواف داخلية للجداول والقوائم) · variant · className
 */
export function Section({
  title,
  description,
  actions,
  children,
  id,
  icon,
  tone = "teal",
  flush = false,
  variant = "default",
  className,
  headingLevel = 2,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  icon?: React.ReactNode;
  tone?: AdminTone;
  flush?: boolean;
  variant?: "default" | "tinted";
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 3 ? "h3" : "h2";
  return (
    <section id={id} className={cn("min-w-0 scroll-mt-24 rounded-[1.75rem]", PANEL[variant], flush ? "overflow-hidden" : "p-4 sm:p-6", className)}>
      <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-3", flush ? "px-4 pt-4 pb-4 sm:px-6 sm:pt-5" : "mb-5")}>
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <ToneIcon tone={tone} size="sm">
              {icon}
            </ToneIcon>
          ) : null}
          <div className="min-w-0">
            <H className="font-display text-[1.25rem] leading-snug font-black text-ink sm:text-[1.35rem]">{title}</H>
            {description ? <p className="mt-0.5 text-[0.88rem] leading-6 text-muted">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div
        className={cn(
          "min-w-0",
          // داخل لوح flush: الجدول يفقد إطاره الخاص ويمتد بعرض اللوح
          flush && "border-t border-line [&_div:has(>table)]:rounded-none [&_div:has(>table)]:border-0 [&_div:has(>table)]:shadow-none",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** شريط تنبيه قابل للنقر (ذهبي افتراضيًا) */
export function AdminNotice({
  href,
  icon,
  children,
  action,
  tone = "gold",
  className,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  tone?: AdminTone;
  className?: string;
}) {
  return (
    <Link
      href={href}
      style={toneStyle(tone)}
      className={cn(
        "group flex min-h-16 items-center gap-3 rounded-[1.4rem] border-2 border-[color-mix(in_oklab,var(--b)_28%,white)] bg-[var(--soft)] p-3 pe-4 font-display font-bold text-ink",
        "shadow-[0_4px_0_color-mix(in_oklab,var(--d)_28%,white)] transition-transform hover:-translate-y-0.5 active:translate-y-1 motion-reduce:transform-none",
        className,
      )}
    >
      {icon ? (
        <ToneIcon tone={tone} size="sm">
          {icon}
        </ToneIcon>
      ) : null}
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
      {action ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[0.85rem] font-extrabold text-[var(--tink)] shadow-xs">
          {action}
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
        </span>
      ) : null}
    </Link>
  );
}
