import Link from "next/link";
import { Check, Lock, Play, Sparkles } from "lucide-react";
import type { PlaylistGroup } from "@/server/catalog/queries";
import { ar, count, duration, W } from "@/lib/design";
import { cn } from "@/lib/utils";

export type RowState = {
  open: boolean;
  done: boolean;
  /** نسبة المشاهدة الحقيقية لدرس بدأه الطالب ولم يكمله (0–100) */
  partial: number;
  free: boolean;
};

/**
 * خط زمني ملوّن للدروس: عقدة مرقّمة (منجز/الحالي/مقفل/مجاني) مع المدة.
 * الدرس الحالي المقفل يظهر بعقدة قفل (لا زر تشغيل) حتى يطابق ما يقوله المسرح.
 * المعرّفات: كل صف data-testid="lesson-item"، وأيقونة القفل data-testid="lesson-locked" (aria-label «مقفل»).
 */
export function LessonRows({
  groups,
  productId,
  selectedId,
  numberOf,
  stateOf,
}: {
  groups: PlaylistGroup[];
  productId: string;
  selectedId: string | null;
  numberOf: (lessonId: string) => number;
  stateOf: (lessonId: string) => RowState;
}) {
  const many = groups.length > 1;
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title} className="pt-1">
          <h3 className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white/95 px-2.5 pt-3 pb-2 font-display text-[0.86rem] font-extrabold text-[var(--tink)] backdrop-blur-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-[var(--b)]" aria-hidden />
              <span className="truncate">{g.title}</span>
            </span>
            {many ? <span className="shrink-0 text-[0.78rem] font-bold text-muted">{count(g.lessons.length, W.lesson)}</span> : null}
          </h3>
          <ol className="relative">
            {g.lessons.map((l, i) => {
              const st = stateOf(l.id);
              const current = selectedId === l.id;
              const n = numberOf(l.id);
              const last = i === g.lessons.length - 1;
              const dur = duration(l.durationSeconds);
              return (
                <li key={l.id} data-testid="lesson-item" className="relative">
                  {/* خيط الخط الزمني بين العقد */}
                  {!last ? (
                    <span
                      className={cn("pointer-events-none absolute start-[calc(1.875rem-1.5px)] top-1/2 z-[1] h-full w-[3px] rounded-full", st.done ? "bg-success/45" : "bg-line")}
                      aria-hidden
                    />
                  ) : null}
                  <Link
                    href={`/watch/${productId}?lesson=${l.id}`}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "group/row relative my-0.5 grid min-h-[3.75rem] grid-cols-[2.6rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors",
                      current
                        ? "bg-[var(--soft)] shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--b)_45%,transparent)]"
                        : "hover:bg-mist",
                    )}
                  >
                    <Node n={n} current={current} done={st.done} open={st.open} />
                    <span className="min-w-0">
                      {current ? (
                        <span className="mb-0.5 block font-display text-[0.72rem] font-extrabold text-[var(--tink)]">
                          {st.open ? "يُعرض الآن" : "الدرس الحالي · مقفل"}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "line-clamp-2 font-display text-[0.95rem] leading-snug",
                          current ? "font-extrabold text-[var(--tink)]" : st.open ? "font-bold text-ink" : "font-bold text-ink-soft",
                        )}
                      >
                        {l.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] font-semibold text-muted">
                        {dur ? <span>{dur}</span> : null}
                        {st.done ? <span className="font-bold text-success">شاهدته</span> : null}
                      </span>
                      {!st.done && st.partial > 0 ? (
                        <span className="mt-1.5 block h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-line" aria-hidden>
                          <span className="block h-full rounded-full bg-[var(--b)]" style={{ width: `${st.partial}%` }} />
                        </span>
                      ) : null}
                    </span>
                    {!st.open ? (
                      <span className="grid size-8 place-items-center rounded-full bg-mist text-muted">
                        <Lock className="size-4" aria-label="مقفل" data-testid="lesson-locked" />
                      </span>
                    ) : st.free ? (
                      <span className="chip chip-gold min-h-6 gap-1 px-2 text-[0.74rem]">
                        <Sparkles aria-hidden /> مجاني
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </>
  );
}

function Node({ n, current, done, open }: { n: number; current: boolean; done: boolean; open: boolean }) {
  if (current) {
    return (
      <span
        className="relative z-[2] grid size-10 place-items-center rounded-full text-white shadow-[0_0_0_4px_#fff,0_0_0_7px_color-mix(in_oklab,var(--a)_40%,transparent),0_10px_18px_-8px_var(--b)]"
        style={{ backgroundImage: "linear-gradient(145deg, var(--a), var(--b))" }}
        aria-hidden
      >
        {open ? <Play className="size-4 translate-x-[-1px] fill-current" /> : <Lock className="size-[1.05rem]" strokeWidth={2.6} />}
      </span>
    );
  }
  if (done) {
    return (
      <span className="relative z-[2] grid size-10 place-items-center rounded-full bg-success text-white shadow-[0_0_0_4px_#fff]" aria-hidden>
        <Check className="size-5" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "relative z-[2] grid size-10 place-items-center rounded-full border-2 font-display text-[1.05rem] font-black shadow-[0_0_0_4px_#fff]",
        open ? "border-[color-mix(in_oklab,var(--b)_35%,white)] bg-white text-[var(--tink)]" : "border-line bg-sand text-muted",
      )}
      aria-hidden
    >
      {ar(n)}
    </span>
  );
}
