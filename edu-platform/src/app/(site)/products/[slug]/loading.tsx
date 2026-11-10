import { LoadingRegion } from "@/components/site/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** هيكل صفحة المنتج: البطل بعرض الصفحة، ثم التفاصيل ولوح الشراء */
export default function Loading() {
  return (
    <LoadingRegion className="pb-16">
      <div className="mx-auto max-w-7xl px-3 pt-4 sm:px-6">
        <Skeleton className="h-[54rem] rounded-[2rem] sm:h-[44rem] lg:h-[38rem]" />
        <div className="mt-8 grid gap-8 lg:mt-0 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_24.5rem]">
          <div className="relative z-10 lg:col-start-2 lg:row-start-1 lg:-mt-24 lg:me-6 xl:me-8">
            <div className="rounded-[2rem] bg-white p-5 shadow-pop sm:p-6">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="mt-5 h-12 w-1/2" />
              <Skeleton className="mt-6 h-13 rounded-2xl" />
              <Skeleton className="mt-3 h-13 rounded-2xl" />
              <Skeleton className="mt-6 h-4 w-3/4" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </div>
          </div>
          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1 lg:pt-8">
            <div className="rounded-[1.75rem] bg-white p-5 shadow-card sm:p-7">
              <Skeleton className="h-8 w-44" />
              <div className="mt-5 grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-20 rounded-[1.25rem]" />
                ))}
              </div>
            </div>
            <div className="rounded-[1.75rem] bg-white p-5 shadow-card sm:p-7">
              <Skeleton className="h-8 w-52" />
              <Skeleton className="mt-5 h-5 w-full" />
              <Skeleton className="mt-3 h-5 w-5/6" />
              <Skeleton className="mt-3 h-5 w-2/3" />
            </div>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
