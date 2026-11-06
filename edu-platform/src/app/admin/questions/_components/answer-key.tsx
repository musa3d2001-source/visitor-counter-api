import { BookOpenText, CircleCheck, FileQuestionMark, KeyRound, Lightbulb, ShieldCheck, TriangleAlert } from "lucide-react";
import { Section } from "@/components/admin/page-header";
import { EmptyValue, InfoList } from "@/components/admin/data-list";
import { StatusPill } from "@/components/admin/status-badge";
import { ar } from "@/lib/design";
import { cn, formatDate } from "@/lib/utils";
import { CHOICE_LETTERS, DIFFICULTY_LABELS, QUESTION_TYPE_LABELS, SOURCE_KIND_LABELS } from "@/server/questions/rules";
import type { QuestionDetail } from "@/server/questions/bank";

/** حرف الخيار حسب موضعه (للاختيار من متعدد فقط؛ «صح أو خطأ» يُعرض نصه) */
function letterOf(q: QuestionDetail, index: number): string | null {
  return q.type === "mcq" ? (CHOICE_LETTERS[index] ?? null) : null;
}

const dirOf = (q: QuestionDetail) => (q.lang === "en" ? "ltr" : "rtl");

/**
 * مفتاح الإجابة للطاقم فقط: الخيار الصحيح، والشرح، والتلميح، والمرجع المنسّق.
 * لا يُستخدم أبدًا في أي صفحة طالب.
 */
export function AnswerKey({ q }: { q: QuestionDetail }) {
  const idx = q.choices.findIndex((c) => c.is_correct);
  const correct = idx >= 0 ? q.choices[idx] : null;
  const letter = idx >= 0 ? letterOf(q, idx) : null;
  return (
    <Section title="مفتاح الإجابة" description="للمعلم والإدارة فقط، لا يظهر للطالب قبل الإجابة" icon={<KeyRound />} tone="green">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-success-50 p-3 ring-1 ring-success/15 ring-inset">
          <span className="grid size-9 shrink-0 place-items-center rounded-[0.8rem] bg-linear-to-br from-[#34D9A0] to-[#0B8A66] font-display text-[1rem] font-black text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.14)]" aria-hidden>
            {letter ?? <CircleCheck className="size-5" />}
          </span>
          <div className="min-w-0">
            <p className="font-display text-[0.78rem] font-bold text-success">الإجابة الصحيحة{letter ? ` (${letter})` : ""}</p>
            <p className="font-display leading-7 font-extrabold break-words text-ink" dir={dirOf(q)}>
              {correct ? correct.text : <EmptyValue label="لم تُحدَّد" />}
            </p>
          </div>
        </div>
        <div>
          <p className="mb-1 font-display text-[0.8rem] font-bold text-muted">الشرح بعد الإجابة</p>
          <p className="leading-8 break-words whitespace-pre-line text-ink" dir={dirOf(q)}>
            {q.explanation}
          </p>
        </div>
        {q.hint ? (
          <div className="rounded-2xl bg-[#FFF4D6] p-3">
            <p className="mb-0.5 flex items-center gap-1.5 font-display text-[0.8rem] font-bold text-[#8A5A00]">
              <Lightbulb className="size-4" aria-hidden /> التلميح
            </p>
            <p className="leading-7 break-words text-ink" dir={dirOf(q)}>
              {q.hint}
            </p>
          </div>
        ) : null}
        <div className="rounded-2xl border border-dashed border-line-strong bg-canvas px-3 py-2.5">
          <p className="mb-0.5 flex items-center gap-1.5 font-display text-[0.8rem] font-bold text-brand-800">
            <BookOpenText className="size-4" aria-hidden /> المرجع في الكتاب
          </p>
          <p className="leading-7 font-medium text-ink">{q.reference}</p>
        </div>
      </div>
    </Section>
  );
}

/** عرض السؤال للقراءة فقط (حين لا يُسمح بالتعديل): النص، والخيارات مع الصحيح، وبيانات المصدر */
export function QuestionBody({ q }: { q: QuestionDetail }) {
  return (
    <Section title="نص السؤال وخياراته" description="للقراءة فقط في هذه الحالة" icon={<FileQuestionMark />} tone="violet">
      <p className="rounded-[1.25rem] bg-[#F7F4FF] px-4 py-3.5 font-display text-[1.05rem] leading-8 font-extrabold break-words whitespace-pre-line text-ink ring-1 ring-[#E4DAFF] ring-inset" dir={dirOf(q)}>
        {q.stem}
      </p>
      <ol className="mt-4 grid gap-2.5">
        {q.choices.map((c, i) => {
          const letter = letterOf(q, i);
          return (
            <li
              key={c.id}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-2xl border-2 px-2.5 py-2",
                c.is_correct ? "border-success/30 bg-success-50" : "border-line bg-surface",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-[0.7rem] font-display text-[0.95rem] font-black",
                  c.is_correct ? "bg-linear-to-br from-[#34D9A0] to-[#0B8A66] text-white" : "bg-mist text-ink-soft",
                )}
                aria-hidden
              >
                {letter ?? ar(i + 1)}
              </span>
              <span className="min-w-0 flex-1 leading-7 font-semibold break-words text-ink" dir={dirOf(q)}>
                {c.text}
              </span>
              {c.is_correct ? (
                <StatusPill tone="success" icon={<CircleCheck aria-hidden />}>
                  الصحيحة
                </StatusPill>
              ) : null}
            </li>
          );
        })}
      </ol>
      <InfoList
        className="mt-4"
        items={[
          { label: "النوع", value: QUESTION_TYPE_LABELS[q.type] },
          { label: "لغة السؤال", value: q.lang === "en" ? "الإنجليزية" : "العربية" },
          { label: "الصعوبة", value: DIFFICULTY_LABELS[q.difficulty] },
          { label: "المصدر", value: SOURCE_KIND_LABELS[q.source_kind] },
          { label: "الصفحة", value: `ص ${ar(q.page)}` },
          { label: "رقم التمرين", value: q.exercise_ref ? ar(q.exercise_ref) : <EmptyValue label="لا يوجد" /> },
          {
            label: "تأكيد الصياغة والمرجع",
            wide: true,
            value: q.rights_confirmed_at ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <ShieldCheck className="size-4" aria-hidden /> مؤكد في {formatDate(q.rights_confirmed_at)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <TriangleAlert className="size-4" aria-hidden /> لم يُؤكَّد بعد
              </span>
            ),
          },
        ]}
      />
    </Section>
  );
}
