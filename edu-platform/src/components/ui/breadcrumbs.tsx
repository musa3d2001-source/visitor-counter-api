import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="مسار التنقل" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 ? <ChevronLeft className="size-3.5 opacity-60" aria-hidden /> : null}
            {it.href && i < items.length - 1 ? (
              <Link href={it.href} className="rounded hover:text-brand-700 hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="font-semibold text-ink-soft">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
