import Link from "next/link";
import type * as React from "react";
import { ar } from "@/lib/design";
import { cn } from "@/lib/utils";
import { toneStyle, type AdminTone } from "@/components/admin/tones";

export type PillTab = { href: string; label: string; active?: boolean; count?: number | null; tone?: AdminTone; icon?: React.ReactNode };

/**
 * تبويبات تصفية ككبسولات ملوّنة (روابط GET عادية مع aria-current).
 * النشطة: لون كامل بحافة ثلاثية الأبعاد. الباقية: بيضاء بنقطة اللون والعدد الحقيقي.
 * تمرّر أفقيًا داخل حاويتها على الجوال (لا تمدّد الصفحة).
 */
export function PillTabs({ items, label, className }: { items: PillTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("-mx-1 min-w-0 overflow-x-auto px-1 pt-1 pb-2.5 [scrollbar-width:thin]", className)}>
      <ul className="flex w-max gap-2">
        {items.map((it) => (
          <li key={it.href} style={toneStyle(it.tone ?? "teal")}>
            <Link prefetch={false}
              href={it.href}
              aria-current={it.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-display text-[0.9rem] font-extrabold whitespace-nowrap transition-[transform,box-shadow,background-color] motion-safe:active:translate-y-0.5",
                it.active
                  ? "bg-linear-to-b from-[var(--a)] to-[var(--b)] text-[var(--icon)] shadow-[0_4px_0_var(--d),0_12px_20px_-12px_var(--d)]"
                  : "border border-[rgb(23_32_38/0.07)] bg-surface text-ink-soft shadow-[0_3px_0_var(--color-line-strong)] hover:bg-[var(--soft)] hover:text-[var(--tink)]",
              )}
            >
              {it.icon ? (
                <span className={cn("grid size-5 place-items-center [&_svg]:size-4", it.active ? "" : "text-[var(--b)]")}>{it.icon}</span>
              ) : (
                <span className={cn("size-2.5 rounded-full", it.active ? "bg-white/85" : "bg-[var(--b)]")} aria-hidden />
              )}
              {it.label}
              {it.count != null ? (
                <span
                  className={cn("grid min-w-6 place-items-center rounded-full px-1.5 text-[0.78rem] leading-6", it.active ? "bg-white/25 text-[var(--icon)]" : "bg-[var(--soft)] text-[var(--tink)]")}
                >
                  {ar(it.count)}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
