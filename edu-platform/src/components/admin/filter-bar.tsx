import Link from "next/link";
import { ListFilter, RotateCcw, Search } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/**
 * أدوات التصفية والبحث (نماذج GET عادية — لا منطق جديد):
 *
 * <FilterBar>                       لوح أبيض role="search"، شبكة تتكيف مع عدد الحقول
 *   <FilterSearch name="q" … />     حقل بحث بأيقونة (يأخذ عمودين على الحاسوب)
 *   <Select name="grade" … />       أي Select/Input من ui/form كما هو
 *   <FilterSubmit resetHref="/admin/products" active={filtered} />
 * </FilterBar>
 *
 * <Toolbar start={<ResultCount>…</ResultCount>} end={…} />   صف فوق الجدول
 * <Segmented label="الفترة" items={[{ href, label, active }]} />   تبويبات روابط (٧/٣٠/٩٠ يوم)
 */
export function FilterBar({
  children,
  className,
  action,
  label = "تصفية النتائج",
  ...props
}: { children: React.ReactNode; className?: string; action?: string; label?: string } & Omit<React.ComponentProps<"form">, "action" | "children">) {
  return (
    <form
      role="search"
      aria-label={label}
      action={action}
      className={cn(
        "mb-5 grid gap-2.5 rounded-[1.5rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3 shadow-card sm:grid-cols-2 sm:p-4 lg:grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]",
        className,
      )}
      {...props}
    >
      {children}
    </form>
  );
}

export function FilterSearch({
  name = "q",
  defaultValue,
  placeholder = "ابحث…",
  label = "بحث",
  className,
  wide = true,
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  className?: string;
  /** يأخذ عمودين على الشاشات الكبيرة */
  wide?: boolean;
}) {
  return (
    <div className={cn("relative min-w-0 sm:col-span-2", wide && "lg:col-span-2", className)}>
      <Search className="pointer-events-none absolute start-3.5 top-1/2 size-[1.1rem] -translate-y-1/2 text-brand-600" aria-hidden />
      <Input name={name} defaultValue={defaultValue} placeholder={placeholder} className="ps-10" aria-label={label} type="search" />
    </div>
  );
}

export function FilterSubmit({ label = "تصفية", resetHref, active, className }: { label?: string; resetHref?: string; active?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Button type="submit" variant="primary" className="h-12 flex-1">
        <ListFilter aria-hidden /> {label}
      </Button>
      {resetHref && active ? (
        <Button asChild variant="outline" size="icon" className="size-12">
          <Link href={resetHref} aria-label="إزالة التصفية" title="إزالة التصفية">
            <RotateCcw aria-hidden />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/** صف أدوات فوق القوائم والجداول */
export function Toolbar({ start, end, className }: { start?: React.ReactNode; end?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{start}</div>
      {end ? <div className="flex flex-wrap items-center gap-2">{end}</div> : null}
    </div>
  );
}

/** عدد النتائج ككبسولة: مرّر النص الجاهز من count(n, W.product) */
export function ResultCount({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-50 px-3 font-display text-[0.85rem] font-extrabold text-brand-800", className)}>
      <span className="size-2 rounded-full bg-brand-600" aria-hidden />
      {children}
    </p>
  );
}

/** تبويبات روابط على شكل كبسولة (الرابط النشط أبيض بظل) */
export function Segmented({
  items,
  label,
  className,
}: {
  items: { href: string; label: React.ReactNode; active?: boolean }[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-mist p-1 ring-1 ring-line ring-inset", className)}>
      {items.map((it, i) => (
        <Link
          key={i}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-4 font-display text-[0.88rem] font-extrabold whitespace-nowrap transition-colors",
            it.active ? "bg-surface text-brand-800 shadow-[0_3px_0_var(--color-line-strong),0_6px_14px_-8px_rgb(23_32_38/0.3)]" : "text-muted hover:text-ink",
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
