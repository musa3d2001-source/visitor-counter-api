import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { toneClass } from "@/lib/design";

/**
 * كبسولات «الفصل المشمس» (Cairo عريض، زوايا كاملة).
 * الألوان: brand · accent · neutral · success · danger · warning · info · solid · gold · coral · violet · sky · glass · white · subject
 * ‎`subject="math"`‎ يلوّن الكبسولة بلون المادة تلقائيًا (يضبط tone="subject").
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-display font-extrabold whitespace-nowrap [&_svg]:size-[0.95em] [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        brand: "bg-brand-50 text-brand-800",
        accent: "bg-accent-100 text-accent-900",
        neutral: "bg-mist text-ink-soft",
        success: "bg-success-50 text-success",
        danger: "bg-danger-50 text-danger",
        warning: "bg-warning-50 text-warning",
        info: "bg-sky-50 text-sky-700",
        solid: "bg-brand-600 text-white",
        gold: "bg-accent-600 text-accent-900 shadow-[0_6px_14px_-6px_rgb(0_0_0/0.35)]",
        coral: "bg-coral-50 text-coral-700",
        violet: "bg-violet-50 text-violet-700",
        sky: "bg-sky-50 text-sky-700",
        glass: "bg-[rgb(10_16_22/0.5)] text-white backdrop-blur-md",
        white: "bg-white text-ink shadow-xs",
        subject: "bg-[var(--soft)] text-[var(--tink)]",
      },
      size: {
        sm: "min-h-6 px-2 text-[0.75rem] leading-6",
        md: "min-h-7 px-2.5 text-[0.8rem] leading-7",
        lg: "min-h-8 px-3.5 text-[0.9rem] leading-8",
      },
    },
    defaultVariants: { tone: "brand", size: "md" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { subject?: string | null };

export function Badge({ className, tone, size, subject, ...props }: BadgeProps) {
  const t = subject !== undefined ? "subject" : tone;
  return <span className={cn(badgeVariants({ tone: t, size }), t === "subject" && toneClass(subject), className)} {...props} />;
}
