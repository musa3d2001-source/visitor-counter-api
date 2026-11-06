import Link from "next/link";
import { BadgeCheck, BookOpenText, CalendarClock, GitBranch, GraduationCap, Layers } from "lucide-react";
import { EmptyValue } from "@/components/admin/data-list";
import { StatusPill } from "@/components/admin/status-badge";
import { STRETCHED_FOCUS } from "@/components/admin/tones";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import { SOURCE_KIND_LABELS } from "@/server/questions/rules";
import type { QuestionReviewItem } from "@/server/questions/bank";
import { DifficultyChip, QuestionTile, TypeChip, shortRef } from "./bits";

/**
 * بطاقة سؤال في طابور المراجعة (تبويب «الأسئلة» في صفحة المراجعة):
 * نص السؤال رابط ممتد (اسمه = نص السؤال) وزر «مراجعة السؤال» منفصل، على نمط بطاقة مراجعة المحتوى.
 */
export function QuestionReviewCard({ item: q }: { item: QuestionReviewItem }) {
  return (
    <li
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-[1.6rem] border-2 border-[#E4DAFF] bg-surface p-4 sm:p-5",
        "shadow-[0_5px_0_#D9CCFF,0_22px_36px_-26px_rgb(74_47_176/0.6)]",
        STRETCHED_FOCUS,
      )}
    >
      <span className="pointer-events-none absolute -end-10 -top-12 size-32 rounded-full bg-[#F3EEFF]" aria-hidden />
      <div className="relative flex items-start gap-3.5">
        <QuestionTile subjectName={q.subject_name} type={q.type} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone="review" pulse>
              بانتظار المراجعة
            </StatusPill>
            <TypeChip type={q.type} />
            <DifficultyChip difficulty={q.difficulty} />
            {q.version > 1 ? (
              <span className="chip min-h-6 bg-mist px-2.5 text-[0.75rem] text-ink-soft">
                <GitBranch aria-hidden /> نسخة معدّلة
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 font-display text-[1.08rem] leading-8 font-black text-ink">
            <Link href={`/admin/questions/${q.id}`} className="stretched line-clamp-3 break-words hover:text-brand-700" dir="auto">
              {q.stem}
            </Link>
          </h2>
        </div>
      </div>

      <dl className="relative mt-4 mb-4 grid grid-cols-2 gap-2.5 text-[0.85rem]">
        <div className="min-w-0 rounded-2xl bg-[#FFE6F1]/60 px-3 py-2">
          <dt className="flex items-center gap-1 font-display text-[0.75rem] font-bold text-[#A8256F]">
            <GraduationCap className="size-3.5" aria-hidden /> المعلم
          </dt>
          <dd className="line-clamp-2 font-display leading-snug font-extrabold text-ink">{q.teacher_name ?? <EmptyValue label="إدارة المنصة" />}</dd>
        </div>
        <div className="min-w-0 rounded-2xl bg-[#DEF8EE]/70 px-3 py-2">
          <dt className="flex items-center gap-1 font-display text-[0.75rem] font-bold text-[#0A6F52]">
            <Layers className="size-3.5" aria-hidden /> المادة والصف
          </dt>
          <dd className="line-clamp-2 font-display leading-snug font-extrabold text-ink">
            {q.subject_name} · {q.grade_name}
          </dd>
        </div>
        <div className="min-w-0 rounded-2xl bg-[#E6EEFF]/70 px-3 py-2">
          <dt className="flex items-center gap-1 font-display text-[0.75rem] font-bold text-[#2B33B5]">
            <BookOpenText className="size-3.5" aria-hidden /> المرجع
          </dt>
          <dd className="font-display leading-snug font-extrabold text-ink">{shortRef(q)}</dd>
        </div>
        <div className="min-w-0 rounded-2xl bg-[#FFF4D6] px-3 py-2">
          <dt className="font-display text-[0.75rem] font-bold text-[#8A5A00]">المصدر</dt>
          <dd className="line-clamp-2 font-display leading-snug font-extrabold text-ink">{SOURCE_KIND_LABELS[q.source_kind]}</dd>
        </div>
      </dl>

      <div className="relative mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line-strong pt-4">
        <div className="flex flex-wrap items-center gap-2 text-[0.8rem] text-muted">
          {q.submitted_at ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4 text-[#6A3FE0]" aria-hidden />
              أُرسل {formatDateTime(q.submitted_at)}
            </span>
          ) : null}
        </div>
        <Button asChild size="sm" variant="accent" className="relative z-[2]">
          <Link href={`/admin/questions/${q.id}`}>
            <BadgeCheck aria-hidden /> مراجعة السؤال
          </Link>
        </Button>
      </div>
    </li>
  );
}
