import Link from "next/link";
import { CircleCheck, Clock3, Lock, Play, Sparkles } from "lucide-react";
import { ar, count, duration, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import s from "./product.module.css";

type TLesson = { id: string; title: string; durationSeconds: number | null; isFreePreview: boolean };
export type TimelineGroup = { key: string; title: string | null; lessons: TLesson[] };

/**
 * جدول الدروس كخط زمني مرقّم ملوّن: الترقيم تسلسل فعلي لترتيب المشاهدة.
 * الدروس المفتوحة بدائرة متدرجة، المجانية بخلفية ذهبية وكبسولة «مجاني»، والمقفلة رمادية بقفل
 * (data-testid="lesson-locked")؛ كل صف data-testid="lesson-item".
 */
export function LessonTimeline({
  groups,
  productId,
  isOwned,
  watchedIds,
  linkable = true,
  testIds = true,
}: {
  groups: TimelineGroup[];
  productId: string;
  isOwned: boolean;
  watchedIds?: Set<string>;
  /** روابط المشاهدة (صفحة الفيديو) */
  linkable?: boolean;
  /** معرّفات الاختبار lesson-item/lesson-locked (صفحة الفيديو فقط) */
  testIds?: boolean;
}) {
  let n = 0;
  return (
    <div className="space-y-6">
      {groups.map((g, gi) => (
        <div key={g.key}>
          {g.title ? (
            <h3 className={s.groupHead}>
              <span className={s.groupTitle}>
                <span className={s.groupIdx} aria-hidden>
                  {ar(gi + 1)}
                </span>
                <span className="min-w-0">{g.title}</span>
              </span>
              <span className="chip chip-white shrink-0">
                {count(g.lessons.length, W.lesson)}
                {(() => {
                  const d = duration(g.lessons.reduce((t, l) => t + (l.durationSeconds ?? 0), 0));
                  return d ? ` · ${d}` : "";
                })()}
              </span>
            </h3>
          ) : null}
          <ol className={s.timeline}>
            {g.lessons.map((l) => {
              n += 1;
              const open = isOwned || l.isFreePreview;
              const watched = watchedIds?.has(l.id) ?? false;
              const free = l.isFreePreview && !isOwned;
              const d = duration(l.durationSeconds);
              const inner = (
                <>
                  <span className={cn(s.lnum, !open && s.lnumLocked, watched && s.lnumDone)} aria-hidden>
                    {watched ? <CircleCheck className="size-5" /> : ar(n)}
                  </span>
                  <span className="min-w-0">
                    <span className={s.ltitle}>{l.title}</span>
                    {d ? (
                      <span className={s.lmeta}>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 aria-hidden /> {d}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center">
                    {watched ? (
                      <span className="chip !bg-success-50 !text-success">
                        <CircleCheck aria-label="تمت المشاهدة" /> تمت
                      </span>
                    ) : free ? (
                      <span className="chip chip-gold">
                        <Sparkles aria-hidden /> مجاني
                      </span>
                    ) : open ? (
                      <span className="play-dot !size-9 !shadow-[0_0_0_3px_var(--soft),0_6px_12px_-6px_var(--d)]" aria-hidden>
                        <Play className="size-3.5 fill-current" />
                      </span>
                    ) : (
                      <span className={s.lock}>
                        <Lock className="size-4" aria-label="مقفل" data-testid={testIds ? "lesson-locked" : undefined} />
                      </span>
                    )}
                  </span>
                </>
              );
              const rowClass = cn(s.lrow, !open && s.lrowLocked, free && s.lfree);
              return (
                <li key={l.id} data-testid={testIds ? "lesson-item" : undefined}>
                  {linkable ? (
                    <Link href={`/watch/${productId}?lesson=${l.id}`} className={rowClass} aria-label={`${l.title}${open ? "" : "، مقفل"}`}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={rowClass}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
