import { Skeleton } from "@/components/ui/skeleton";
import { CardsSkeleton, LoadingRegion, SectionTitleSkeleton, ToneBandSkeleton } from "@/components/site/page-skeletons";

/** هيكل صفحة المادة: اللوح الملون ثم المحتوى */
export default function Loading() {
  return (
    <LoadingRegion className="pb-16">
      <ToneBandSkeleton className="h-[36rem] lg:h-[28rem]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Skeleton className="mt-8 h-[4.5rem] rounded-[1.5rem] sm:mt-10" />
        <SectionTitleSkeleton className="mt-12 sm:mt-14" />
        <CardsSkeleton className="mt-6" count={8} />
      </div>
    </LoadingRegion>
  );
}
