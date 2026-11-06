import type * as React from "react";
import { BookMarked, BookOpenText, CheckCheck, FlaskConical, ListChecks, PenLine, SignalHigh, SignalLow, SignalMedium } from "lucide-react";
import { StatusPill, type StatusTone } from "@/components/admin/status-badge";
import { toneStyle, type AdminTone } from "@/components/admin/tones";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { ar, toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LABELS, QUESTION_STATUS_LABELS, QUESTION_TYPE_LABELS, SOURCE_KIND_LABELS, type QuestionStatus, type QuestionType, type SourceKind } from "@/server/questions/rules";

/**
 * قطع صغيرة مشتركة لصفحات بنك الأسئلة: كبسولة الحالة، وكبسولات النوع والصعوبة والمصدر،
 * ومربع السؤال بلون المادة، والمرجع المختصر.
 */

/** ألوان تبويبات الحالة (مثل صفحة المحتوى) */
export const QUESTION_STATUS_TONES: Record<QuestionStatus, AdminTone> = {
  draft: "gold",
  in_review: "coral",
  published: "green",
  archived: "slate",
};

const BADGE_TONES: Record<QuestionStatus, StatusTone> = {
  draft: "warning",
  in_review: "review",
  published: "success",
  archived: "neutral",
};

export function QuestionStatusBadge({ status }: { status: QuestionStatus }) {
  return (
    <StatusPill tone={BADGE_TONES[status]} pulse={status === "in_review"}>
      {QUESTION_STATUS_LABELS[status]}
    </StatusPill>
  );
}

/** «الوحدة ٢ · الدرس ٣ · ص ٤٥» */
export function shortRef(unitNumber: number, lessonNumber: number, page: number): string {
  return `الوحدة ${ar(unitNumber)} · الدرس ${ar(lessonNumber)} · ص ${ar(page)}`;
}

/** كبسولة ملوّنة صغيرة بلون من ألوان اللوحة */
function ToneChip({ tone, icon, children, className }: { tone: AdminTone; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("chip min-h-6 px-2.5 text-[0.75rem]", className)} style={toneStyle(tone)}>
      {icon}
      {children}
    </span>
  );
}

const DIFFICULTY_META: Record<1 | 2 | 3, { tone: AdminTone; Icon: typeof SignalLow }> = {
  1: { tone: "green", Icon: SignalLow },
  2: { tone: "gold", Icon: SignalMedium },
  3: { tone: "coral", Icon: SignalHigh },
};

export function DifficultyChip({ difficulty, className }: { difficulty: 1 | 2 | 3; className?: string }) {
  const m = DIFFICULTY_META[difficulty] ?? DIFFICULTY_META[2];
  return (
    <ToneChip tone={m.tone} icon={<m.Icon aria-hidden />} className={className}>
      <span className="sr-only">الصعوبة: </span>
      {DIFFICULTY_LABELS[difficulty]}
    </ToneChip>
  );
}

export function TypeChip({ type, className }: { type: QuestionType; className?: string }) {
  return (
    <ToneChip tone={type === "mcq" ? "sky" : "pink"} icon={type === "mcq" ? <ListChecks aria-hidden /> : <CheckCheck aria-hidden />} className={className}>
      {QUESTION_TYPE_LABELS[type]}
    </ToneChip>
  );
}

const SOURCE_ICONS: Record<SourceKind, typeof BookOpenText> = {
  textbook_exercise: BookOpenText,
  textbook_based: BookMarked,
  teacher_original: PenLine,
  demo: FlaskConical,
};

export function SourceChip({ source, className }: { source: SourceKind; className?: string }) {
  const Icon = SOURCE_ICONS[source] ?? BookMarked;
  return (
    <span className={cn("chip min-h-6 bg-mist px-2.5 text-[0.75rem] text-ink-soft", className)}>
      <Icon aria-hidden />
      {SOURCE_KIND_LABELS[source]}
    </span>
  );
}

/** مربع السؤال بلون المادة وأيقونة النوع (زخرفي) */
export function QuestionTile({ subjectName, type, className }: { subjectName: string; type: QuestionType; className?: string }) {
  const Icon = type === "mcq" ? ListChecks : CheckCheck;
  return (
    <span
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-[0.95rem] bg-linear-to-br from-[var(--a)] to-[var(--b)] text-white",
        "shadow-[inset_0_-3px_0_rgb(0_0_0/0.14),inset_0_1px_0_rgb(255_255_255/0.3),0_8px_14px_-8px_var(--d)] [&_svg]:size-[1.35rem]",
        toneClass(subjectSlugFromName(subjectName)),
        className,
      )}
      aria-hidden
    >
      <Icon strokeWidth={2.3} />
    </span>
  );
}
