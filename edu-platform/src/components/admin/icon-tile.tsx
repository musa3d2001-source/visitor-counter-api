import type * as React from "react";
import { cn } from "@/lib/utils";
import { toneStyle, type AdminTone } from "./tones";

const SIZES = {
  xs: "size-8 rounded-[0.7rem] [&_svg]:size-4 shadow-[inset_0_-2px_0_rgb(0_0_0/0.14),0_5px_10px_-6px_var(--d)]",
  sm: "size-10 rounded-[0.9rem] [&_svg]:size-[1.15rem] shadow-[inset_0_-3px_0_rgb(0_0_0/0.14),inset_0_1px_0_rgb(255_255_255/0.3),0_8px_14px_-8px_var(--d)]",
  md: "size-12 rounded-2xl [&_svg]:size-[1.35rem] shadow-[inset_0_-3px_0_rgb(0_0_0/0.14),inset_0_1px_0_rgb(255_255_255/0.3),0_10px_18px_-10px_var(--d)]",
  lg: "size-14 rounded-[1.15rem] [&_svg]:size-[1.6rem] shadow-[inset_0_-4px_0_rgb(0_0_0/0.14),inset_0_1px_0_rgb(255_255_255/0.3),0_14px_24px_-12px_var(--d)]",
} as const;

export type ToneIconSize = keyof typeof SIZES;

/**
 * مربع أيقونة ملوّن بتدرج اللون (squircle) مع حافة سفلية داخلية. زخرفي: aria-hidden.
 * tone: teal · gold · coral · violet · sky · pink · green · slate
 */
export function ToneIcon({ tone = "teal", size = "md", children, className }: { tone?: AdminTone; size?: ToneIconSize; children: React.ReactNode; className?: string }) {
  return (
    <span
      style={toneStyle(tone)}
      className={cn("grid shrink-0 place-items-center bg-linear-to-br from-[var(--a)] to-[var(--b)] text-[var(--icon)] [&_svg]:shrink-0", SIZES[size], className)}
      aria-hidden
    >
      {children}
    </span>
  );
}
