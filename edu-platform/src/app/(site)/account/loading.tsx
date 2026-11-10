import { LoadingRegion, PageHeroSkeleton, RowsSkeleton } from "@/components/site/page-skeletons";

/** هيكل حسابي: الرأس ثم الطلبات */
export default function Loading() {
  return (
    <LoadingRegion className="pb-16">
      <PageHeroSkeleton aside pills={0} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <RowsSkeleton count={4} />
      </div>
    </LoadingRegion>
  );
}
