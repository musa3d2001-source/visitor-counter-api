import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import s from "../_home/home.module.css";

/** هيكل الرئيسية بأصناف البطل ولوح الصفوف نفسها، فيبقى كل شيء في مكانه عند وصول المحتوى */
export default function Loading() {
  return (
    <div className={cn(s.home, "min-h-dvh")} role="status" aria-label="جاري التحميل">
      <section className={cn(s.hero, "max-lg:min-h-[46.6rem] lg:min-h-[57.9rem]")}>
        <div className={s.heroMesh} aria-hidden />
        <div className={cn(s.wrap, s.heroGrid)}>
          <div className={s.heroText}>
            <Skeleton className="h-[2.6rem] w-64 max-w-full rounded-full" />
            <Skeleton className="mt-4 h-10 w-full max-w-lg lg:mt-5 lg:h-[4.6rem]" />
            <Skeleton className="mt-1 h-10 w-11/12 max-w-lg lg:mt-3 lg:h-[4.6rem]" />
            <Skeleton className="mt-1 h-10 w-3/4 max-w-md lg:mt-3 lg:h-[4.6rem]" />
            <Skeleton className="mt-4 h-6 w-full max-w-md lg:mt-7" />
            <Skeleton className="mt-3 h-6 w-1/2 lg:hidden" />
            <Skeleton className="mt-5 h-[3.9rem] w-full rounded-[1.25rem] lg:mt-9 lg:w-52" />
            <Skeleton className="mt-4 h-5 w-56 lg:mt-6" />
            <div className="mt-4 grid grid-cols-4 gap-2 lg:w-[37.5rem] lg:gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[5.5rem] rounded-[1.25rem] lg:h-16" />
              ))}
            </div>
            <Skeleton className="mt-4 h-[6.9rem] rounded-[1.75rem] lg:hidden" />
            <div className="mt-6 hidden gap-3 lg:flex">
              <Skeleton className="h-14 w-36 rounded-full" />
              <Skeleton className="h-14 w-36 rounded-full" />
            </div>
          </div>
        </div>
      </section>
      <div className={s.dockSec}>
        <div className={s.wrap}>
          <div className={s.dock}>
            <Skeleton className="h-8 w-36 rounded-full" />
            <Skeleton className="mt-3 mb-6 h-10 w-72 max-w-full" />
            <div className={s.gradeGrid}>
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-64 rounded-[1.75rem]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
