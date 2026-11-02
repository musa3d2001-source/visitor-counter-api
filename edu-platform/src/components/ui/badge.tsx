import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    tone: {
      brand: "bg-brand-50 text-brand-700",
      accent: "bg-accent-200 text-ink",
      neutral: "bg-mist text-ink-soft",
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
