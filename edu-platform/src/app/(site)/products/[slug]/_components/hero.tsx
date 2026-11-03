import type * as React from "react";
import { Sparkle } from "@/components/art";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { cn } from "@/lib/utils";
import s from "./product.module.css";

/**
 * بطل صفحة المنتج: لوحة كبيرة بتدرج لون المادة (أو الصف للباقات)، مسار التنقل، الكبسولات،
 * العنوان (h1) بخط Cairo 900، الوصف، ثم المحتوى الإضافي (المعلم، الأرقام) والرسم في الجهة الأخرى.
 * toneClass: «tone-math» أو «grade-9» … (من toneClass/gradeClass).
 */
export function ProductHero({
  toneClass,
  breadcrumbs,
  chips,
  title,
  summary,
  children,
  art,
}: {
  toneClass: string;
  breadcrumbs: { label: string; href?: string }[];
  chips?: React.ReactNode;
  title: string;
  summary?: string | null;
  children?: React.ReactNode;
  art: React.ReactNode;
}) {
  return (
    <section className={cn(s.hero, toneClass, "on-dark")} aria-labelledby="product-title">
      <Sparkle className="animate-twinkle absolute top-8 left-[8%] size-6" />
      <Sparkle className="animate-twinkle absolute bottom-[38%] left-[47%] hidden size-4 [animation-delay:1.2s] lg:block" color="#fff" />
      <div className={s.heroGrid}>
        <div className="min-w-0">
          <Breadcrumbs items={breadcrumbs} tone="glass" className="mb-5" />
          {chips ? <div className="flex flex-wrap items-center gap-2">{chips}</div> : null}
          <h1 id="product-title" className={s.title}>
            {title}
          </h1>
          {summary ? <p className={s.summary}>{summary}</p> : null}
          {children ? <div className="mt-6 space-y-4">{children}</div> : null}
        </div>
        <div className="relative min-w-0">{art}</div>
      </div>
    </section>
  );
}

/** كبسولة زجاجية على البطل */
export function GlassChip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className={s.glassChip}>
      {icon}
      {children}
    </span>
  );
}

/** رقم حقيقي في البطل: أيقونة ذهبية + نص (استخدم count()/duration()) */
export function HeroStat({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className={s.stat}>
      <span className={s.statIcon}>{icon}</span>
      {children}
    </span>
  );
}

export function HeroStats({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2.5">{children}</div>;
}
