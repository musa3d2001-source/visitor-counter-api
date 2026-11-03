import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * بطاقة بيضاء دافئة. variant:
 * default (زوايا ٢٤ + ظل ناعم) · lift (ترتفع عند المرور) · panel (لوح ٣٢ بظل عميق) · flat (حد فقط) · tinted (كريمي)
 */
const cardVariants = {
  default: "rounded-2xl border border-[rgb(23_32_38/0.05)] bg-surface shadow-card",
  lift: "lift rounded-2xl border border-[rgb(23_32_38/0.05)] bg-surface shadow-card",
  panel: "panel",
  flat: "rounded-2xl border border-line bg-surface",
  tinted: "rounded-2xl border border-line bg-canvas",
} as const;

export function Card({ className, variant = "default", ...props }: React.ComponentProps<"div"> & { variant?: keyof typeof cardVariants }) {
  return <div className={cn(cardVariants[variant], className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3 sm:p-6 sm:pb-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("font-display text-lg font-extrabold text-ink", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3 rounded-b-[inherit] border-t border-line bg-canvas/60 p-4 sm:px-6", className)} {...props} />;
}
