import type * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 [&_svg]:size-7">{icon}</div> : null}
      <h3 className="text-lg font-bold">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-7 text-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
