import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** تنبيه دافئ بزوايا كبيرة وأيقونة في دائرة ملونة. tone: info · success · warning · danger */
const tones = {
  info: { cls: "border-brand-100 bg-brand-50 text-brand-800", icon: "bg-linear-to-br from-brand-400 to-brand-600 text-white", Icon: Info },
  success: { cls: "border-success/15 bg-success-50 text-success", icon: "bg-linear-to-br from-[#34d399] to-success text-white", Icon: CircleCheck },
  warning: { cls: "border-accent-200 bg-warning-50 text-warning", icon: "bg-linear-to-br from-[#ffd25e] to-[#eb9b00] text-[#3d2a00]", Icon: TriangleAlert },
  danger: { cls: "border-danger/15 bg-danger-50 text-danger", icon: "bg-linear-to-br from-[#ff8a75] to-danger text-white", Icon: TriangleAlert },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  ...rest
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const { cls, icon, Icon } = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-2xl border p-4 text-sm leading-7", cls, className)} {...rest}>
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full shadow-[inset_0_-2px_0_rgb(0_0_0/0.1)]", icon)}>
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 self-center">
        {title ? <p className="font-display font-extrabold">{title}</p> : null}
        {children ? <div className="text-ink-soft [&_a]:font-bold [&_a]:underline [&_a]:underline-offset-4">{children}</div> : null}
      </div>
    </div>
  );
}
