import { CardsSkeleton, LoadingRegion, SectionTitleSkeleton, TilesSkeleton, ToneBandSkeleton } from "@/components/site/page-skeletons";

/** هيكل صفحة الصف: اللوح الملون، بطاقات المواد، ثم المحتوى */
export default function Loading() {
  return (
    <LoadingRegion className="pb-16">
      <ToneBandSkeleton className="h-[45rem] lg:h-[30rem]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitleSkeleton className="mt-12" />
        <TilesSkeleton className="mt-6" />
        <SectionTitleSkeleton className="mt-14" />
        <CardsSkeleton className="mt-6" />
      </div>
    </LoadingRegion>
  );
}
