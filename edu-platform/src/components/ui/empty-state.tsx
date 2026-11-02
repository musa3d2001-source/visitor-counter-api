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
    <div className={cn("flex flex-col items-center justify-center rounded-lg bg-mist px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-3 text-brand-600 [&_svg]:size-8">{icon}</div> : null}
      <h3 className="font-display text-[1.7rem] leading-tight">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-7 text-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
