import { Fragment } from "react";
import Link from "next/link";
import { ChevronLeft, House } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * مسار التنقل: كبسولة بسطر واحد دائمًا؛ الصفحة الحالية بلون الهوية وتُقصّ بنقاط عند ضيق المكان.
 * - كل رابط بارتفاع ٤٤px فعلي (هامش سالب يمتصه حشو الكبسولة) فلا تكبر الكبسولة بصريًا.
 * - على الجوال: «الرئيسية» أيقونة فقط (الاسم يبقى مقروءًا لقارئ الشاشة)، ومع أربعة عناصر فأكثر
 *   تُطوى العناصر الوسطى في «…» ويبقى الأب المباشر.
 * tone: «default» كبسولة بيضاء شبه مصمتة · «glass» زجاج أبيض شفاف بنص أبيض للأبطال الداكنة أو المشبعة.
 */
export function Breadcrumbs({
  items,
  className,
  tone = "default",
}: {
  items: { label: string; href?: string }[];
  className?: string;
  tone?: "default" | "glass";
}) {
  const glass = tone === "glass";
  const last = items.length - 1;
  // العناصر الوسطى التي تُطوى على الجوال (نُبقي الأول والأب المباشر والحالي)
  const collapsible = (i: number) => items.length >= 4 && i > 0 && i < last - 1;
  return (
    <nav aria-label="مسار التنقل" className={cn("max-w-full text-sm", className)}>
      <ol
        className={cn(
          "inline-flex max-w-full flex-nowrap items-center gap-x-0.5 rounded-full border px-1.5 py-1 font-display backdrop-blur-sm sm:gap-x-1 sm:px-2",
          glass ? "border-white/30 bg-white/15 shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]" : "border-white bg-white/90 shadow-xs",
        )}
      >
        {items.map((it, i) => {
          const isLink = Boolean(it.href) && i < last;
          const homeIcon = i === 0 && it.href === "/";
          return (
            <Fragment key={i}>
              {collapsible(i) && i === 1 ? (
                <li className="flex shrink-0 items-center gap-0.5 sm:hidden" aria-hidden>
                  <ChevronLeft className={cn("size-3.5 shrink-0", glass ? "text-white/70" : "text-muted/70")} />
                  <span className={cn("px-1 font-bold", glass ? "text-white/80" : "text-muted")}>…</span>
                </li>
              ) : null}
              <li className={cn("flex items-center gap-0.5 sm:gap-1", i === last ? "min-w-0" : "shrink-0", collapsible(i) && "max-sm:hidden")}>
                {i > 0 ? <ChevronLeft className={cn("size-3.5 shrink-0", glass ? "text-white/70" : "text-muted/70")} aria-hidden /> : null}
                {isLink ? (
                  <Link prefetch={false}
                    href={it.href!}
                    className={cn(
                      "-my-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-bold transition-colors",
                      homeIcon && "max-sm:min-w-11 max-sm:justify-center max-sm:px-0",
                      glass ? "text-white/90 hover:bg-white/15 hover:text-white" : "text-ink-soft hover:bg-brand-50 hover:text-brand-700",
                    )}
                  >
                    {homeIcon ? <House className="size-4 shrink-0 sm:size-3.5" aria-hidden /> : null}
                    <span className={cn(homeIcon && "max-sm:sr-only", "max-w-[14rem] truncate max-sm:max-w-[7.5rem]")}>{it.label}</span>
                  </Link>
                ) : (
                  <span
                    aria-current={i === last ? "page" : undefined}
                    title={i === last ? it.label : undefined}
                    className={cn("min-w-0 truncate px-2 leading-9 font-extrabold", glass ? "text-white" : "text-brand-800")}
                  >
                    {it.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
