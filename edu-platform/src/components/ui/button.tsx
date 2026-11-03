import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * أزرار «الفصل المشمس»: الأصناف الفعلية في src/app/globals.css (.btn و .btn-*).
 * primary: فيروزي ثلاثي الأبعاد بحافة سفلية داكنة · accent: ذهبي بنص داكن · soft/secondary: مُلوَّن فاتح
 * outline: أبيض بحد دافئ وحافة صغيرة · light: أبيض للأسطح الداكنة · ghost · danger · danger-outline · link
 * الأحجام: sm (40px) · md (46px) · lg (56px) · xl (62px) · icon (44px)
 */
export const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "btn-3d btn-primary",
      accent: "btn-3d btn-accent",
      secondary: "btn-3d btn-soft",
      soft: "btn-3d btn-soft",
      outline: "btn-3d btn-outline",
      light: "btn-3d btn-light",
      ghost: "btn-ghost",
      danger: "btn-3d btn-danger",
      "danger-outline": "btn-3d btn-danger-outline",
      link: "btn-link",
    },
    size: {
      sm: "btn-sm",
      md: "btn-md",
      lg: "btn-lg",
      xl: "btn-xl",
      icon: "btn-icon",
    },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
