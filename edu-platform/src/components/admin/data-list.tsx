import Link from "next/link";
import type * as React from "react";
import { ar } from "@/lib/design";
import { cn } from "@/lib/utils";
import { STRETCHED_FOCUS } from "./tones";

/**
 * قوائم البيانات في لوحة التحكم:
 * - RankList: ترتيب (الأكثر مبيعًا، المعلمون) بميداليات ملوّنة ١/٢/٣.
 * - InfoList: أزواج «تسمية: قيمة» لصفحات التفاصيل (الطلب، الطالب، الكوبون).
 * - DataList + DataRow: صفوف بطاقات بديلة للجدول (مناسبة للجوال أو القوائم القصيرة).
 * - CellTitle: خلية عنوان رئيسية داخل الجداول (رابط + سطر فرعي).
 */

const MEDALS = [
  "bg-linear-to-br from-[#FFE08A] to-[#F0A500] text-[#3D2A00] shadow-[inset_0_-3px_0_rgb(0_0_0/0.12),0_6px_12px_-6px_#C98500]",
  "bg-linear-to-br from-[#E9EEF1] to-[#A9B6BE] text-[#26323A] shadow-[inset_0_-3px_0_rgb(0_0_0/0.1),0_6px_12px_-6px_#6B7A84]",
  "bg-linear-to-br from-[#FFC2A3] to-[#E07A4F] text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.12),0_6px_12px_-6px_#B4532A]",
];

export type RankItem = { key: string; href?: string; title: React.ReactNode; sub?: React.ReactNode; value: React.ReactNode; valueSub?: React.ReactNode };

export function RankList({ items, className, grid = false }: { items: RankItem[]; className?: string; grid?: boolean }) {
  return (
    <ol className={cn(grid ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2", className)}>
      {items.map((it, i) => (
        <li
          key={it.key}
          className={cn(
            "relative flex min-h-16 items-center gap-3 rounded-2xl p-2.5 pe-3.5 transition-colors",
            STRETCHED_FOCUS,
            grid ? "border border-line bg-canvas/60 hover:bg-mist/70" : "hover:bg-canvas",
          )}
        >
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-[0.9rem] font-display text-[1.15rem] font-black",
              MEDALS[i] ?? "bg-brand-50 text-brand-800",
            )}
            aria-hidden
          >
            {ar(i + 1)}
          </span>
          <span className="sr-only">المرتبة {ar(i + 1)}: </span>
          <div className="min-w-0 flex-1">
            {it.href ? (
              <Link href={it.href} className="stretched line-clamp-2 font-display text-[0.95rem] leading-snug font-extrabold text-ink hover:text-brand-700">
                {it.title}
              </Link>
            ) : (
              <p className="line-clamp-2 font-display text-[0.95rem] leading-snug font-extrabold text-ink">{it.title}</p>
            )}
            {it.sub ? <p className="text-[0.8rem] leading-5 text-muted">{it.sub}</p> : null}
          </div>
          <div className="shrink-0 text-end">
            <p className="font-display text-[1.05rem] leading-tight font-black text-ink">{it.value}</p>
            {it.valueSub ? <p className="text-[0.78rem] leading-5 text-muted">{it.valueSub}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function InfoList({ items, cols = 2, className }: { items: { label: React.ReactNode; value: React.ReactNode; wide?: boolean }[]; cols?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-1", cols >= 2 && "sm:grid-cols-2", cols === 3 && "lg:grid-cols-3", className)}>
      {items.map((it, i) => (
        <div key={i} className={cn("flex min-w-0 flex-col gap-0.5 border-b border-dashed border-line py-3", it.wide && "sm:col-span-full")}>
          <dt className="font-display text-[0.8rem] font-bold text-muted">{it.label}</dt>
          <dd className="min-w-0 font-medium break-words text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DataList({ children, className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)} {...props}>
      {children}
    </ul>
  );
}

export function DataRow({
  title,
  href,
  sub,
  badges,
  aside,
  leading,
  footer,
  className,
  id,
}: {
  title: React.ReactNode;
  href?: string;
  sub?: React.ReactNode;
  badges?: React.ReactNode;
  aside?: React.ReactNode;
  /** عنصر في البداية (ToneIcon أو صورة مصغرة) */
  leading?: React.ReactNode;
  /** تفاصيل إضافية بعرض البطاقة كاملًا تحت الصف (مثل أرقام صغيرة بعمودين) */
  footer?: React.ReactNode;
  className?: string;
  /** مرساة للانتقال إلى الصف من رابط في الصفحة نفسها (#id) */
  id?: string;
}) {
  return (
    <li
      id={id}
      className={cn(
        id && "scroll-mt-24",
        "relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[1.25rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3.5 shadow-xs transition-shadow",
        !footer && "sm:flex-nowrap",
        href && "hover:shadow-card",
        STRETCHED_FOCUS,
        className,
      )}
    >
      {leading}
      {/* يحجز الجسم عرضًا أدنى فينزل الجانب (الكبسولات/المبالغ) إلى سطر خاص على الجوال بدل خنق العنوان */}
      <div className="min-w-[min(100%,13rem)] flex-1">
        {href ? (
          <Link href={href} className="stretched line-clamp-2 font-display font-extrabold text-ink hover:text-brand-700">
            {title}
          </Link>
        ) : (
          <p className="line-clamp-2 font-display font-extrabold text-ink">{title}</p>
        )}
        {sub ? <div className="mt-0.5 text-[0.82rem] leading-6 text-muted">{sub}</div> : null}
        {badges ? <div className="mt-1.5 flex flex-wrap gap-1.5">{badges}</div> : null}
      </div>
      {aside ? <div className="relative z-[2] flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-end">{aside}</div> : null}
      {footer ? <div className="relative z-[2] min-w-0 basis-full">{footer}</div> : null}
    </li>
  );
}

/**
 * قيمة غير متوفرة: نص خافت بدل الشرطة «—» (ممنوعة في نصوص الواجهة).
 * label: «غير متوفر» افتراضيًا، أو «لا يوجد» / «بدون» حسب السياق.
 */
export function EmptyValue({ label = "غير متوفر", className }: { label?: string; className?: string }) {
  return <span className={cn("font-medium text-muted", className)}>{label}</span>;
}

export function CellTitle({ href, title, sub, className }: { href?: string; title: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      {href ? (
        <Link href={href} className="line-clamp-2 font-display font-extrabold text-ink hover:text-brand-700 hover:underline hover:decoration-brand-300 hover:underline-offset-4">
          {title}
        </Link>
      ) : (
        <p className="line-clamp-2 font-display font-extrabold text-ink">{title}</p>
      )}
      {sub ? <div className="mt-0.5 text-[0.78rem] leading-5 text-muted">{sub}</div> : null}
    </div>
  );
}
