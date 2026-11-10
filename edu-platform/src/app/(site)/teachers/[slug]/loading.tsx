import { CardsSkeleton, LoadingRegion, PageHeroSkeleton, SectionTitleSkeleton } from "@/components/site/page-skeletons";

/** هيكل صفحة معلم */
export default function Loading() {
  return (
    <LoadingRegion className="pb-16">
      <PageHeroSkeleton aside pills={3} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitleSkeleton />
        <CardsSkeleton className="mt-6" count={8} />
      </div>
    </LoadingRegion>
  );
}
