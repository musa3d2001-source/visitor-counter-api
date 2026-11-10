import { LoadingRegion, PageHeroSkeleton, TilesSkeleton } from "@/components/site/page-skeletons";

/** هيكل صفحة المرحلة */
export default function Loading() {
  return (
    <LoadingRegion className="pb-16">
      <PageHeroSkeleton pills={2} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <TilesSkeleton count={4} className="xl:grid-cols-4" />
      </div>
    </LoadingRegion>
  );
}
