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
    <div className="mb-6">
      {crumbs ? (
        <div className="mb-3">
          <Breadcrumbs items={[{ label: "الإدارة", href: "/admin" }, ...crumbs]} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted">{label}</p>
        {icon ? <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700 [&_svg]:size-4.5">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Section({ title, description, actions, children, id }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="min-w-0 scroll-mt-20 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
