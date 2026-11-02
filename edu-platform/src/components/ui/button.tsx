import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-[background-color,color,border-color] duration-150 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-[1.15em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white hover:bg-brand-700",
        accent: "bg-accent-600 text-ink hover:bg-accent-700",
        secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
        outline: "border border-line-strong bg-surface text-ink hover:border-brand-300 hover:bg-brand-50",
        ghost: "text-ink-soft hover:bg-brand-50 hover:text-brand-700",
        danger: "bg-danger text-white hover:bg-danger/90",
        "danger-outline": "border border-danger/30 bg-surface text-danger hover:bg-danger-50",
        link: "h-auto p-0 text-brand-700 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-[0.95rem]",
        lg: "h-13 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
