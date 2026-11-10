import { CardsSkeleton, LoadingRegion, PageHeroSkeleton } from "@/components/site/page-skeletons";

/** هيكل صفحة الباقات */
export default function Loading() {
  return (
    <LoadingRegion className="pb-16">
      <PageHeroSkeleton aside pills={4} className="min-h-[24.3rem] lg:min-h-[25rem]" />
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
        <CardsSkeleton count={8} />
      </div>
    </LoadingRegion>
  );
}
