import { cn } from "@/lib/utils";

/** هيكل تحميل دافئ بلمعة متحركة (تتوقف مع «تقليل الحركة») */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-2xl bg-[linear-gradient(90deg,#f6ecdb_0%,#fff7ea_40%,#f6ecdb_80%)] bg-[length:220%_100%]",
        className,
      )}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6" role="status" aria-label="جاري التحميل">
      <Skeleton className="h-8 w-40 rounded-full" />
      <Skeleton className="mt-4 h-11 w-80 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-2 shadow-card">
            <Skeleton className="aspect-[16/11] rounded-xl" />
            <Skeleton className="mx-2 mt-4 h-4 w-3/4" />
            <Skeleton className="mx-2 mt-2 mb-3 h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
