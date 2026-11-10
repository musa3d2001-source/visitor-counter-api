import { Skeleton } from "@/components/ui/skeleton";
import { CardsSkeleton, LoadingRegion, PageHeroSkeleton } from "@/components/site/page-skeletons";

/** هيكل صفحة المعلمين */
export default function Loading() {
  return (
    <LoadingRegion className="pb-16">
      <PageHeroSkeleton aside pills={3} className="min-h-[24.3rem] lg:min-h-[25rem]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Skeleton className="h-[13.7rem] rounded-[1.75rem] sm:h-[9rem] lg:h-[6.1rem]" />
        <CardsSkeleton className="mt-10 sm:mt-12" count={8} />
      </div>
    </LoadingRegion>
  );
}
