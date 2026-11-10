import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export type EyebrowTone = "teal" | "gold" | "coral" | "violet" | "light";
const EYEBROW: Record<EyebrowTone, string> = {
  teal: "",
  gold: "eyebrow-gold",
  coral: "eyebrow-coral",
  violet: "eyebrow-violet",
  light: "eyebrow-light",
};

/** كبسولة تسمية القسم بأيقونة دائرية متدرجة */
export function Eyebrow({ icon, children, tone = "teal", className }: { icon?: React.ReactNode; children: React.ReactNode; tone?: EyebrowTone; className?: string }) {
  return (
    <span className={cn("eyebrow-pill", EYEBROW[tone], !icon && "ps-3.5", className)}>
      {icon ? <span className="eyebrow-icon">{icon}</span> : null}
      {children}
    </span>
  );
}

/**
 * رأس قسم «الفصل المشمس»: كبسولة تسمية + عنوان Cairo ثقيل + وصف + رابط «المزيد» أبيض.
 * لكلمة مميزة في العنوان: <span className="text-hl">…</span> (ذهبي تلقائيًا على الأسطح الداكنة .on-dark).
 */
export function SectionHead({
  id,
  icon,
  eyebrow,
  title,
  sub,
  more,
  tone = "teal",
  as: H = "h2",
  className,
}: {
  id?: string;
  icon?: React.ReactNode;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  more?: { href: string; label: string };
  tone?: EyebrowTone;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const light = tone === "light";
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-10", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <Eyebrow icon={icon} tone={tone}>
            {eyebrow}
          </Eyebrow>
        ) : null}
        <H id={id} className={cn(H === "h1" ? "h-page" : "h-section", eyebrow && "mt-3", light && "text-white")}>
          {title}
        </H>
        {sub ? <p className={cn("mt-2 max-w-2xl text-[1.05rem] leading-8", light ? "text-white/85" : "text-muted")}>{sub}</p> : null}
      </div>
      {more ? (
        <Link prefetch={false} href={more.href} className="btn btn-3d btn-outline btn-md shrink-0 text-brand-700">
          {more.label}
          <ArrowLeft aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
