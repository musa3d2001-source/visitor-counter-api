import type * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * قطع هياكل التحميل. كل قطعة تأخذ مقاس ما ستحل محله (رأس الصفحات، البطاقات، الصفوف)، فلا تقفز الصفحة عند وصول المحتوى.
 * اللمعة تتوقف مع «تقليل الحركة» (Skeleton)، ولا توجد دوائر انتظار.
 */
export function LoadingRegion({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="جاري التحميل" className={cn("min-h-dvh", className)}>
      {children}
    </div>
  );
}

const times = (n: number) => Array.from({ length: n }, (_, i) => i);

/** مكان PageHeader: مسار تنقل، كبسولة، عنوان، وصف، وكبسولات أرقام */
export function PageHeroSkeleton({ aside, pills = 2, crumbs = true, className }: { aside?: boolean; pills?: number; crumbs?: boolean; className?: string }) {
  return (
    <div className="page-hero">
      <div className={cn("mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6", aside && "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]", className)}>
        <div className="min-w-0">
          {crumbs ? <Skeleton className="mb-6 h-6 w-44 rounded-full" /> : null}
          <Skeleton className="mb-3 h-9 w-36 rounded-full" />
          <Skeleton className="h-12 w-64 max-w-full sm:h-14 sm:w-80" />
          <Skeleton className="mt-3 h-5 w-[32rem] max-w-full" />
          {pills ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {times(pills).map((i) => (
                <Skeleton key={i} className="h-13 w-32 rounded-full" />
              ))}
            </div>
          ) : null}
        </div>
        {aside ? (
          <div className="relative hidden h-[19rem] lg:block" aria-hidden>
            <Skeleton className="absolute end-[34%] top-[8%] h-56 w-44 -rotate-[9deg] rounded-[1.4rem]" />
            <Skeleton className="absolute end-[8%] top-0 h-56 w-44 rotate-[5deg] rounded-[1.4rem]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** مكان ToneHero في صفحات الصف والمادة: مسار تنقل، ثم لوح كبير */
export function ToneBandSkeleton({ className }: { className: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <Skeleton className="mb-4 h-6 w-44 rounded-full" />
      <Skeleton className={cn("rounded-[2rem]", className)} />
    </div>
  );
}

/** عنوان قسم */
export function SectionTitleSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="h-8 w-32 rounded-full" />
      <Skeleton className="mt-3 h-10 w-72 max-w-full" />
    </div>
  );
}

/** بطاقات المنتجات: صورة ثم عنوان وسعر */
export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {times(count).map((i) => (
        <div key={i} className="rounded-[1.75rem] bg-white p-2.5 shadow-card">
          <Skeleton className="aspect-[16/10] rounded-[1.3rem]" />
          <Skeleton className="mx-2 mt-4 h-5 w-3/4" />
          <Skeleton className="mx-2 mt-2 h-4 w-1/2" />
          <Skeleton className="mx-2 mt-6 mb-2 h-11 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

/** بطاقات المواد والصفوف */
export function TilesSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 xl:grid-cols-6", className)}>
      {times(count).map((i) => (
        <Skeleton key={i} className="h-[9.5rem] rounded-[22px]" />
      ))}
    </div>
  );
}

/** صفوف قائمة داخل لوح أبيض */
export function RowsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("rounded-[1.75rem] bg-white p-4 shadow-card sm:p-6", className)}>
      <Skeleton className="h-7 w-40" />
      <div className="mt-5 space-y-3">
        {times(count).map((i) => (
          <div key={i} className="flex items-center gap-3.5 rounded-[1.25rem] bg-field p-3">
            <Skeleton className="size-12 shrink-0 rounded-[0.95rem]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** صفحات النصوص (الشروط، الخصوصية، التواصل) */
export function ProseSkeleton() {
  return (
    <LoadingRegion>
      <PageHeroSkeleton pills={0} />
      <div className="mx-auto max-w-3xl space-y-3 px-4 pb-16 sm:px-6">
        {times(9).map((i) => (
          <Skeleton key={i} className={cn("h-5", i % 3 === 2 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </LoadingRegion>
  );
}

/** صفحات الوثائق القانونية: مسار، لوح ملون، تنبيه، ثم النص والفهرس */
export function LegalSkeleton() {
  return (
    <LoadingRegion className="bg-sunny pb-20">
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">
        <Skeleton className="h-[2.875rem] w-52 rounded-full" />
        <Skeleton className="mt-5 h-[24.5rem] rounded-[2rem] lg:h-[21.3rem]" />
        <Skeleton className="mt-6 h-[7.4rem] rounded-[1.5rem] lg:h-[5.6rem]" />
        <div className="mt-8 grid items-start gap-6 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="space-y-3 rounded-[1.75rem] bg-white p-5 shadow-card sm:p-8">
            {times(10).map((i) => (
              <Skeleton key={i} className={cn("h-5", i % 3 === 2 ? "w-2/3" : "w-full")} />
            ))}
          </div>
          <Skeleton className="-order-1 h-48 rounded-[1.75rem] lg:order-none" />
        </div>
      </div>
    </LoadingRegion>
  );
}

/** عمودا السلة والدفع: القائمة ثم ملخص المبلغ */
export function CommerceSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <LoadingRegion>
      <PageHeroSkeleton pills={2} aside />
      <div className="mx-auto grid max-w-7xl items-start gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <RowsSkeleton count={rows} />
        <div className="rounded-[1.75rem] bg-white p-5 shadow-card sm:p-6">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-5 h-5 w-full" />
          <Skeleton className="mt-3 h-5 w-full" />
          <Skeleton className="mt-6 h-10 w-1/2" />
          <Skeleton className="mt-6 h-13 rounded-2xl" />
        </div>
      </div>
    </LoadingRegion>
  );
}

/** لوحة الإدارة والمعلم: رأس ملون، أرقام، جدول */
export function AdminSkeleton() {
  return (
    <LoadingRegion className="space-y-6">
      <div className="rounded-[2rem] border-2 border-white bg-[linear-gradient(165deg,#fff_10%,#e7f7f3)] p-5 shadow-card sm:p-8">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 shrink-0 rounded-[1.15rem]" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-9 w-48 max-w-full" />
            <Skeleton className="mt-2 h-4 w-72 max-w-full" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {times(4).map((i) => (
          <Skeleton key={i} className="h-32 rounded-[1.6rem]" />
        ))}
      </div>
      <RowsSkeleton count={6} />
    </LoadingRegion>
  );
}

/** قارئ PDF: شريط علوي داكن وصفحة بيضاء، بمقاس القارئ نفسه */
export function ReaderSkeleton() {
  return (
    <div role="status" aria-label="جاري التحميل" className="flex h-dvh flex-col bg-[#0b2f2d]">
      <div className="bg-teal-night shrink-0">
        <div className="flex h-16 items-center gap-3 px-2 sm:px-4">
          <span className="h-11 w-11 rounded-full bg-white/12 sm:w-36" />
          <div className="min-w-0 flex-1">
            <span className="block h-5 w-2/3 max-w-sm rounded-lg bg-white/12" />
            <span className="mt-1.5 block h-3.5 w-1/3 max-w-40 rounded-full bg-white/10" />
          </div>
        </div>
        <span className="block h-[3px] bg-linear-to-l from-[#ff6b5a] via-[#ffc531] via-40% to-[#9b5cf6]" aria-hidden />
      </div>
      <div className="flex-1 overflow-hidden px-2 pt-5">
        <div className="mx-auto aspect-[1/1.414] w-full max-w-[56rem] rounded-sm bg-white/90" />
      </div>
    </div>
  );
}

/** صفحة الدرس: شريط داكن، مشغل، وقائمة الدروس */
export function WatchSkeleton() {
  return (
    <div role="status" aria-label="جاري التحميل" className="min-h-dvh bg-canvas">
      <div className="on-dark sticky top-0 z-40 border-b border-white/10 bg-[var(--brand-deep)]">
        <div className="mx-auto flex h-16 max-w-[88rem] items-center gap-3 px-3 sm:px-6 lg:px-8">
          <span className="h-11 w-11 rounded-xl bg-white/12 sm:w-32" />
          <span className="block h-5 w-1/2 max-w-sm rounded-lg bg-white/12" />
        </div>
      </div>
      <div className="bg-[var(--brand-deep)]">
        <div className="mx-auto grid max-w-[88rem] gap-5 px-3 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:px-8 lg:py-6">
          <span className="block aspect-video rounded-[1.1rem] bg-white/10 sm:rounded-[1.5rem]" />
          <div className="hidden h-[6.5rem] rounded-[1.6rem] bg-white/90 lg:block" />
        </div>
      </div>
      <div className="mx-auto max-w-[88rem] px-3 pt-4 sm:px-6 lg:hidden">
        <RowsSkeleton count={4} />
      </div>
    </div>
  );
}
