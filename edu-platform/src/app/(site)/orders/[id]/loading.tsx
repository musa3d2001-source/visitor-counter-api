import { LoadingRegion, RowsSkeleton } from "@/components/site/page-skeletons";

/** هيكل صفحة الطلب: لوح الحالة ثم المحتوى */
export default function Loading() {
  return (
    <LoadingRegion className="bg-sunny">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
        <div className="h-64 rounded-[2rem] bg-white/70 shadow-card sm:h-56 sm:rounded-[2.5rem]" />
        <RowsSkeleton count={3} />
      </div>
    </LoadingRegion>
  );
}
