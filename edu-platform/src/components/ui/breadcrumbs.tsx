import Link from "next/link";
import { ChevronLeft, House } from "lucide-react";
import { cn } from "@/lib/utils";

/** مسار التنقل: كبسولة بيضاء زجاجية؛ الصفحة الحالية بلون الهوية */
export function Breadcrumbs({ items, className }: { items: { label: string; href?: string }[]; className?: string }) {
  return (
    <nav aria-label="مسار التنقل" className={cn("text-sm", className)}>
      <ol className="inline-flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 rounded-2xl border border-white bg-white/75 px-2 py-1 font-display shadow-xs backdrop-blur-sm sm:rounded-full">
        {items.map((it, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 ? <ChevronLeft className="size-3.5 shrink-0 text-muted/70" aria-hidden /> : null}
            {it.href && i < items.length - 1 ? (
              <Link href={it.href} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 font-bold text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700">
                {i === 0 && it.href === "/" ? <House className="size-3.5" aria-hidden /> : null}
                {it.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="truncate px-2 font-extrabold text-brand-800">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
