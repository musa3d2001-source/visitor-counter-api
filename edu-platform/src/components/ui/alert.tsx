import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: { cls: "border-brand-200 bg-brand-50 text-brand-800", Icon: Info },
  success: { cls: "border-success/25 bg-success-50 text-success", Icon: CircleCheck },
  warning: { cls: "border-warning/25 bg-warning-50 text-warning", Icon: TriangleAlert },
  danger: { cls: "border-danger/25 bg-danger-50 text-danger", Icon: TriangleAlert },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { cls, Icon } = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-4 text-sm leading-7", cls, className)}>
      <Icon className="mt-1 size-4.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className="text-ink-soft [&_a]:font-semibold [&_a]:underline">{children}</div> : null}
      </div>
    </div>
  );
}
