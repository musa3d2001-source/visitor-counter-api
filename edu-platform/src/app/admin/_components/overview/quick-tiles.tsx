import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type * as React from "react";
import { ToneIcon } from "@/components/admin/icon-tile";
import { STRETCHED_FOCUS, toneStyle, type AdminTone } from "@/components/admin/tones";
import { cn } from "@/lib/utils";

export type QuickTile = { href: string; label: string; sub?: string; icon: React.ReactNode; tone: AdminTone; badge?: string };

/**
 * اختصارات سريعة: بلاطات ملوّنة ثلاثية الأبعاد (حافة سفلية بلون القسم) لكل منها رابط واحد.
 * عمودان على الجوال، ٣ على الأجهزة المتوسطة، وحتى ٦ على الحاسوب.
 */
export function QuickTiles({ items, label = "اختصارات سريعة", className }: { items: QuickTile[]; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={className}>
      <ul className={cn("grid grid-cols-2 gap-3 sm:gap-4", items.length === 4 ? "lg:grid-cols-4" : items.length >= 6 ? "sm:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-3")}>
        {items.map((it) => (
          <li key={it.href} className="min-w-0">
            <div
              style={toneStyle(it.tone)}
              className={cn(
                "group relative isolate flex h-full min-h-[7.5rem] flex-col overflow-hidden rounded-[1.4rem] border-2 border-[color-mix(in_oklab,var(--b)_18%,white)] bg-surface p-3.5 sm:p-4",
                "shadow-[0_5px_0_color-mix(in_oklab,var(--d)_30%,white),0_18px_30px_-22px_color-mix(in_oklab,var(--d)_80%,transparent)]",
                "transition-transform duration-150 hover:-translate-y-1 motion-reduce:transform-none",
                STRETCHED_FOCUS,
              )}
            >
              <span className="pointer-events-none absolute -end-8 -bottom-10 -z-10 size-24 rounded-full bg-[var(--soft)] transition-transform duration-300 group-hover:scale-125 motion-reduce:transition-none" aria-hidden />
              <div className="flex items-start justify-between gap-2">
                <ToneIcon tone={it.tone} size="sm">
                  {it.icon}
                </ToneIcon>
                {it.badge ? (
                  <span className="inline-flex min-h-6 items-center rounded-full bg-[#E8483F] px-2 font-display text-[0.78rem] font-black text-white shadow-[0_3px_0_#B4322A]">{it.badge}</span>
                ) : (
                  <ArrowLeft className="mt-1 size-4 text-[var(--tink)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                )}
              </div>
              <Link href={it.href} className="stretched mt-auto pt-3 font-display text-[0.98rem] leading-snug font-black text-ink group-hover:text-[var(--tink)]">
                {it.label}
              </Link>
              {it.sub ? <p className="mt-0.5 text-[0.8rem] leading-5 text-muted">{it.sub}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
}
