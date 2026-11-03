import { Skeleton } from "@/components/ui/skeleton";

/** هيكل تحميل التقارير بشكل الصفحة نفسها: شريط ملوّن، بطاقات أرقام، لوح المخطط */
export default function AdminLoading() {
  return (
    <div role="status" aria-label="جاري التحميل" className="space-y-6">
      <div className="rounded-[2rem] border-2 border-white bg-[linear-gradient(165deg,#fff_10%,#efe9ff)] p-5 shadow-card sm:p-8">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 shrink-0 rounded-[1.15rem]" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-9 w-48 max-w-full" />
            <Skeleton className="mt-2 h-4 w-72 max-w-full" />
          </div>
        </div>
        <Skeleton className="mt-6 h-12 w-80 max-w-full rounded-full" />
      </div>
      <Skeleton className="h-20 rounded-[1.5rem]" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-[1.6rem]" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-[1.75rem]" />
      <span className="sr-only">جاري تحميل التقرير…</span>
    </div>
  );
}
