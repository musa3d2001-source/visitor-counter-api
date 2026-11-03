import { Skeleton } from "@/components/ui/skeleton";

/** هيكل تحميل «مكتبتي»: رأس مشمس، لوح «تابع» داكن، ثم بطاقات الشروحات */
export default function Loading() {
  return (
    <div role="status" aria-label="جاري التحميل">
      <div className="page-hero">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="mt-4 h-14 w-56 max-w-full" />
            <Skeleton className="mt-4 h-5 w-96 max-w-full" />
            <div className="mt-6 flex gap-3">
              <Skeleton className="h-13 w-40 rounded-full" />
              <Skeleton className="h-13 w-36 rounded-full" />
            </div>
          </div>
          <div className="relative hidden h-[19rem] lg:block" aria-hidden>
            <Skeleton className="absolute end-[34%] top-[8%] h-56 w-44 -rotate-[9deg] rounded-[1.4rem]" />
            <Skeleton className="absolute end-[8%] top-0 h-56 w-44 rotate-[5deg] rounded-[1.4rem]" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="bg-teal-night rounded-[2rem] p-4 sm:rounded-[2.5rem] sm:p-8">
          <div className="h-8 w-40 rounded-full bg-white/12" />
          <div className="mt-4 h-10 w-72 max-w-full rounded-2xl bg-white/12" />
          <div className="mt-6 grid gap-4 rounded-[1.75rem] bg-white/10 p-2.5 sm:grid-cols-2">
            <div className="aspect-[16/10] rounded-[1.35rem] bg-white/12" />
            <div className="space-y-3 p-3">
              <div className="h-6 w-28 rounded-full bg-white/12" />
              <div className="h-7 w-3/4 rounded-xl bg-white/12" />
              <div className="h-2.5 w-full rounded-full bg-white/12" />
            </div>
          </div>
        </div>
        <Skeleton className="mt-12 h-10 w-64 max-w-full" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[1.75rem] bg-white p-2.5 shadow-card">
              <Skeleton className="aspect-[16/10] rounded-[1.3rem]" />
              <Skeleton className="mx-2 mt-4 h-5 w-3/4" />
              <Skeleton className="mx-2 mt-2 h-4 w-1/2" />
              <Skeleton className="mx-2 mt-6 mb-2 h-11 rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
