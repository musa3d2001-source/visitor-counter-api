import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    tone: {
      brand: "bg-brand-50 text-brand-700",
      accent: "bg-accent-100 text-accent-800",
      neutral: "bg-canvas text-ink-soft border border-line",
      success: "bg-success-50 text-success",
      danger: "bg-danger-50 text-danger",
      warning: "bg-warning-50 text-warning",
      solid: "bg-brand-600 text-white",
    },
  },
  defaultVariants: { tone: "brand" },
});

export function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
