import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ar } from "@/lib/design";
import { cn } from "@/lib/utils";

/** أرقام الصفحات المعروضة: الأولى والأخيرة وما حول الحالية، والفجوات «…» */
function pageWindow(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev === 2) out.push(prev + 1); // فجوة من صفحة واحدة: اعرض رقمها بدل «…»
    else if (n - prev > 2) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}

const PILL =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-3 font-display text-[0.92rem] font-extrabold whitespace-nowrap transition-[transform,box-shadow,background-color] motion-safe:active:translate-y-0.5";
const IDLE = "border border-[rgb(23_32_38/0.07)] bg-surface text-ink-soft shadow-[0_3px_0_var(--color-line-strong)] hover:bg-brand-50 hover:text-brand-800";

/**
 * ترقيم صفحات بروابط GET عادية (يحافظ على باقي معايير التصفية عبر hrefFor).
 * «صفحة ١ من ٤» بأرقام عربية، والصفحة الحالية بلون كامل وaria-current.
 */
export function Pager({ page, pages, hrefFor, label = "الصفحات", className }: { page: number; pages: number; hrefFor: (page: number) => string; label?: string; className?: string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={label} className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="font-display text-[0.9rem] font-extrabold text-ink-soft" aria-live="polite">
        صفحة {ar(page)} من {ar(pages)}
      </p>
      <ul className="flex flex-wrap items-center gap-1.5">
        <li>
          {page > 1 ? (
            <Link prefetch={false} href={hrefFor(page - 1)} rel="prev" className={cn(PILL, IDLE)}>
              <ChevronRight className="size-4" aria-hidden /> السابقة
            </Link>
          ) : (
            <span className={cn(PILL, "cursor-not-allowed bg-mist text-muted")} aria-disabled="true">
              <ChevronRight className="size-4" aria-hidden /> السابقة
            </span>
          )}
        </li>
        {pageWindow(page, pages).map((n, i) =>
          n === "gap" ? (
            <li key={`g${i}`} className="px-1 text-muted" aria-hidden>
              …
            </li>
          ) : (
            <li key={n}>
              <Link prefetch={false}
                href={hrefFor(n)}
                aria-current={n === page ? "page" : undefined}
                aria-label={`صفحة ${ar(n)}`}
                className={cn(PILL, n === page ? "bg-linear-to-b from-brand-400 to-brand-600 text-white shadow-[0_4px_0_var(--brand-edge)]" : IDLE)}
              >
                {ar(n)}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pages ? (
            <Link prefetch={false} href={hrefFor(page + 1)} rel="next" className={cn(PILL, IDLE)}>
              التالية <ChevronLeft className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className={cn(PILL, "cursor-not-allowed bg-mist text-muted")} aria-disabled="true">
              التالية <ChevronLeft className="size-4" aria-hidden />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
