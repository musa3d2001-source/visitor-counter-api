import type * as React from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export function AdminPageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  crumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="mb-8 border-b-2 border-ink pb-5">
      {crumbs ? (
        <div className="mb-3">
          <Breadcrumbs items={[{ label: "الإدارة", href: "/admin" }, ...crumbs]} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[clamp(2rem,4vw,2.8rem)]">{title}</h1>
          {description ? <p className="mt-1 max-w-[68ch] text-ink-soft">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/**
 * رقم ملخّص: تسمية صغيرة ثم القيمة بحجم كبير، مع خط علوي بلون الحبر بدل البطاقة المظللة.
 * الأيقونة اختيارية وتظهر صغيرة بجوار التسمية فقط.
 */
export function StatCard({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="border-t-2 border-ink pt-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
        {icon ? <span className="text-brand-700 [&_svg]:size-4" aria-hidden>{icon}</span> : null}
        {label}
      </p>
      <p className="mt-1 text-[1.9rem] leading-tight font-bold tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}

export function Section({ title, description, actions, children, id }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-20 rounded-lg border border-line bg-surface p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.6rem] leading-tight">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
