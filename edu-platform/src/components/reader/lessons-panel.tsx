"use client";

import { useEffect, useRef } from "react";
import { ListVideo } from "lucide-react";
import { ar } from "@/lib/design";
import { cn } from "@/lib/utils";

/**
 * قائمة الدروس بأسلوب «الفصل المشمس»: لوح أبيض بشريط قوس قزح.
 * على الكمبيوتر لوح جانبي لاصق بقائمة قابلة للتمرير (يُمرَّر الدرس الحالي إلى مجال الرؤية)،
 * وعلى الجوال يظهر تحت الفيديو مباشرة ضمن تدفق الصفحة.
 */
export function LessonsPanel({
  title,
  count,
  children,
  progress,
  className,
}: {
  title: string;
  count: string;
  children: React.ReactNode;
  /** التقدم الحقيقي للطالب المسجّل (اختياري) */
  progress?: { done: number; total: number; label: string } | null;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // إظهار الدرس الحالي داخل القائمة نفسها (دون تحريك الصفحة)
  useEffect(() => {
    const box = listRef.current;
    if (!box || box.scrollHeight <= box.clientHeight + 4) return;
    const cur = box.querySelector<HTMLElement>('[aria-current="true"]');
    if (!cur) return;
    const top = cur.offsetTop - box.offsetTop - box.clientHeight / 3;
    box.scrollTop = Math.max(0, top);
  }, []);

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <aside
      id="lessons-panel"
      className={cn("panel panel-rainbow flex scroll-mt-24 flex-col overflow-hidden pt-2 lg:max-h-[calc(100dvh-6.5rem)]", className)}
      aria-label="قائمة الدروس"
    >
      <div className="border-b border-line px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <span className="icon-tile size-11 rounded-[0.9rem]" aria-hidden>
            <ListVideo className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[1.45rem] leading-tight font-black">{title}</h2>
            <p className="mt-0.5 font-display text-[0.9rem] font-bold text-muted">{count}</p>
          </div>
        </div>
        {progress && progress.total ? (
          <div className="mt-4 rounded-2xl bg-[var(--soft)] px-3.5 py-3">
            <div className="mb-1.5 flex items-center justify-between gap-3 font-display text-[0.85rem] font-extrabold text-[var(--tink)]">
              <span>{progress.label}</span>
              <span>{ar(pct)}٪</span>
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-white"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-valuetext={progress.label}
              aria-label="تقدمك في الدروس"
            >
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--a),var(--b))] transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${Math.max(pct, progress.done ? 4 : 0)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
      <div ref={listRef} className="relative overscroll-contain px-2.5 pb-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {children}
      </div>
    </aside>
  );
}
