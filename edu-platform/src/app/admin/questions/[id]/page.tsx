import type * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Archive,
  BadgeCheck,
  CirclePause,
  CirclePlay,
  CopyPlus,
  GitBranch,
  History,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
  Zap,
} from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import { curriculumOptions } from "@/server/questions/curriculum";
import { getQuestion, readinessIssues } from "@/server/questions/bank";
import { previewClientQuestion, type ClientQuestion } from "@/server/questions/serve";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { EmptyValue, InfoList } from "@/components/admin/data-list";
import { ToneIcon } from "@/components/admin/icon-tile";
import { QuestionForm } from "@/components/admin/question-form";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ar, count, subjectVars } from "@/lib/design";
import { formatDate, formatDateTime } from "@/lib/utils";
import { CatalogBand } from "../../_components/catalog/band";
import { QuestionsArt } from "../_components/art";
import { AnswerKey, QuestionBody } from "../_components/answer-key";
import { DifficultyChip, QuestionStatusBadge, SourceChip, TypeChip } from "../_components/bits";
import { questionDefaults } from "../_components/form-defaults";
import { StudentPreview } from "../_components/student-preview";
import {
  approveQuestionAction,
  deleteQuestionAction,
  returnQuestionAction,
  reviseQuestionAction,
  setQuestionPausedAction,
  submitQuestionAction,
  updateQuestionAction,
  withdrawQuestionAction,
} from "../actions";
import { ATTEMPT_WORD } from "@/server/questions/words";

export const metadata = { title: "سؤال من بنك الأسئلة" };

type SP = { created?: string; approved?: string; returned?: string; revised?: string };

export default async function QuestionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  const owner = actor.kind === "owner";
  const { id } = await params;
  const sp = await searchParams;
  const q = await getQuestion(id, actor);
  if (!q) notFound();

  // الكتابة: المالك دائمًا، والمعلم ما دامت صلاحية الإضافة مفعّلة (نطاق المادة يفرضه الخادم)
  const canWrite = owner || (actor.kind === "teacher" && actor.canUpload);
  const editable = q.status === "draft" && canWrite;
  const [options, issues] = await Promise.all([
    editable ? curriculumOptions(actor) : Promise.resolve([]),
    q.status === "draft" || q.status === "in_review" ? readinessIssues(q.id) : Promise.resolve([] as string[]),
  ]);

  // المعاينة من المسلسل نفسه الذي يصل الطالب: بلا is_correct ولا شرح ولا صفحة
  let preview: ClientQuestion | null = null;
  try {
    preview = previewClientQuestion({ type: q.type, lang: q.lang, stem: q.stem, hint: q.hint, choices: q.choices.map((c) => ({ id: c.id, text: c.text })) });
  } catch {
    preview = null;
  }

  const slug = subjectSlugFromName(q.context.subject_name);
  const backLabel = owner ? "بنك الأسئلة" : "أسئلتي";
  const ownerReview = owner && q.status === "in_review";

  return (
    <div className="space-y-6">
      <CatalogBand tone="violet" style={slug ? subjectVars(slug) : undefined} art={<QuestionsArt />}>
        <AdminPageHeader
          className="mb-0 sm:mb-0"
          title={`سؤال من درس ${q.context.lesson_title}`}
          description={q.reference}
          crumbs={[{ label: backLabel, href: "/admin/questions" }, { label: "السؤال" }]}
        >
          <div className="flex flex-wrap items-center gap-2">
            <QuestionStatusBadge status={q.status} />
            <span className="chip chip-white">
              <GitBranch aria-hidden /> الإصدار {ar(q.version)}
            </span>
            <TypeChip type={q.type} className="min-h-7 text-[0.8rem]" />
            <DifficultyChip difficulty={q.difficulty} className="min-h-7 text-[0.8rem]" />
            <SourceChip source={q.source_kind} className="min-h-7 bg-white text-[0.8rem]" />
            {q.paused ? (
              <span className="chip chip-coral">
                <CirclePause aria-hidden /> موقوف
              </span>
            ) : null}
            <span className="chip chip-white">
              <Zap aria-hidden /> {q.attempts ? count(q.attempts, ATTEMPT_WORD) : "لا محاولات بعد"}
            </span>
          </div>
        </AdminPageHeader>
      </CatalogBand>

      {sp.created ? (
        <Alert tone="success" title="تم حفظ السؤال كمسودة">
          راجع المعاينة كما يراها الطالب، ثم {owner ? "اعتمده للنشر" : "أرسله للمراجعة"}.
        </Alert>
      ) : null}
      {sp.revised && q.status === "draft" ? (
        <Alert tone="info" title="هذه نسخة معدّلة من سؤال منشور">
          عدّلها ثم {owner ? "اعتمدها" : "أرسلها للمراجعة"}. تبقى النسخة المنشورة ظاهرة للطلاب حتى اعتماد هذه، ثم تحل محلها.
        </Alert>
      ) : null}
      {sp.approved && q.status === "published" ? <Alert tone="success" title="تم اعتماد السؤال ونشره">أصبح متاحًا لأسئلة اللعبة في درسه.</Alert> : null}
      {sp.returned && owner ? (
        <Alert tone="info" title="أُعيد السؤال للمعلم مع ملاحظاتك">
          يظهر للمعلم في قائمة أسئلته بعلامة «أُعيد بملاحظات».
        </Alert>
      ) : null}

      {/* حالة المراجعة كما يراها المعلم */}
      {!owner && q.status === "draft" && q.review_note ? (
        <Alert tone="warning" title="أُعيد السؤال بملاحظات">
          <p className="whitespace-pre-line">{q.review_note}</p>
          <p className="mt-1 text-xs">عدّل المطلوب ثم أعد الإرسال للمراجعة.</p>
        </Alert>
      ) : null}
      {!owner && q.status === "in_review" ? (
        <Alert tone="info" title="بانتظار مراجعة إدارة المنصة">
          لا يمكن تعديل السؤال أثناء المراجعة. سيُنشر بعد اعتماده، أو يعود إليك مع ملاحظات.
          <div className="mt-2">
            <QuickAction action={withdrawQuestionAction} hidden={{ id: q.id }} icon={<Undo2 aria-hidden />} label="سحب من المراجعة" variant="outline" />
          </div>
        </Alert>
      ) : null}
      {!owner && q.status === "published" ? (
        <Alert tone="info">هذا السؤال منشور ولا يُعدَّل مباشرة. أنشئ نسخة معدّلة: تبقى الحالية ظاهرة للطلاب حتى اعتماد الجديدة.</Alert>
      ) : null}
      {!owner && q.status === "draft" && !canWrite ? (
        <Alert tone="warning" title="صلاحية الإضافة موقوفة">
          لا يمكنك تعديل المسودة أو إرسالها حاليًا. تواصل مع إدارة المنصة.
        </Alert>
      ) : null}

      {/* لوح مراجعة المالك */}
      {ownerReview ? (
        <section
          className="relative isolate overflow-hidden rounded-[1.75rem] border-2 border-[#FFE08A] bg-[linear-gradient(160deg,#FFFBEA,#FFF0C7)] p-4 shadow-[0_5px_0_#F5D27A,0_24px_40px_-28px_#C98500] sm:p-6"
          aria-labelledby="review-h"
        >
          <span className="pointer-events-none absolute -end-16 -top-20 -z-10 size-52 rounded-full border-[20px] border-white/60" aria-hidden />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <ToneIcon tone="gold" size="md">
                <BadgeCheck />
              </ToneIcon>
              <div className="min-w-0">
                <h2 id="review-h" className="font-display text-[1.3rem] leading-snug font-black text-ink">
                  مراجعة السؤال قبل النشر
                </h2>
                <p className="mt-1 text-sm leading-7 text-ink-soft">
                  أرسله {q.teacher_name ?? "المعلم"}
                  {q.submitted_at ? ` في ${formatDateTime(q.submitted_at)}` : ""}. تأكد من الصياغة والمرجع والإجابة الصحيحة والشرح.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2.5">
              <ActionForm action={approveQuestionAction} compact>
                <input type="hidden" name="id" value={q.id} />
                <SubmitButton variant="primary" size="md" pendingText="جارٍ الاعتماد…" disabled={issues.length > 0}>
                  <BadgeCheck aria-hidden /> اعتماد ونشر السؤال
                </SubmitButton>
              </ActionForm>
              <ConfirmButton
                action={returnQuestionAction}
                hidden={{ id: q.id }}
                label="إعادة للمعلم بملاحظات"
                icon={<Undo2 aria-hidden />}
                variant="outline"
                size="md"
                title="إعادة السؤال للمعلم؟"
                description="اكتب ملاحظة واضحة بما يجب تعديله، ستظهر للمعلم في صفحة السؤال."
                requireReason
                reasonLabel="ملاحظات المراجعة (إلزامي)"
                confirmLabel="إعادة بملاحظات"
              />
            </div>
          </div>
          {issues.length ? (
            <Alert tone="warning" className="mt-4">
              لا يمكن الاعتماد الآن: {issues.join("، ")}
            </Alert>
          ) : null}
        </section>
      ) : null}

      <QuestionActions q={q} owner={owner} canWrite={canWrite} issues={issues} ownerReview={ownerReview} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {editable ? (
            <QuestionForm mode="edit" questionId={q.id} action={updateQuestionAction} options={options} defaults={questionDefaults(q)} />
          ) : (
            <QuestionBody q={q} />
          )}
        </div>
        <aside className="min-w-0 space-y-6">
          <StudentPreview preview={preview} />
          <AnswerKey q={q} />
          <Section title="سجل السؤال" icon={<History />} tone="slate">
            <InfoList
              cols={1}
              items={[
                { label: "المعلم", value: q.teacher_name ?? "إدارة المنصة" },
                { label: "الإصدار", value: ar(q.version) },
                { label: "أُرسل للمراجعة", value: q.submitted_at ? formatDateTime(q.submitted_at) : <EmptyValue label="لم يُرسل" /> },
                { label: "آخر مراجعة", value: q.reviewed_at ? formatDateTime(q.reviewed_at) : <EmptyValue label="لم يُراجع بعد" /> },
                { label: "النشر", value: q.published_at ? formatDate(q.published_at) : <EmptyValue label="لم يُنشر" /> },
                { label: "محاولات الطلاب", value: q.attempts ? count(q.attempts, ATTEMPT_WORD) : <EmptyValue label="لا يوجد" /> },
                ...(owner && q.review_note ? [{ label: "آخر ملاحظة مراجعة", value: <span className="whitespace-pre-line">{q.review_note}</span> }] : []),
              ]}
            />
          </Section>
        </aside>
      </div>
    </div>
  );
}

/** شريط الإجراءات حسب الحالة والدور (الخادم يتحقق من كل إجراء مرة أخرى) */
function QuestionActions({
  q,
  owner,
  canWrite,
  issues,
  ownerReview,
}: {
  q: NonNullable<Awaited<ReturnType<typeof getQuestion>>>;
  owner: boolean;
  canWrite: boolean;
  issues: string[];
  ownerReview: boolean;
}) {
  const hidden = { id: q.id };
  const items: React.ReactNode[] = [];

  if (q.status === "draft") {
    if (canWrite) {
      items.push(
        <QuickAction key="submit" action={submitQuestionAction} hidden={hidden} icon={<Send aria-hidden />} label="إرسال للمراجعة" variant={owner ? "outline" : "primary"} size="md" />,
      );
    }
    if (owner) {
      items.push(
        <ActionForm key="approve" action={approveQuestionAction} compact>
          <input type="hidden" name="id" value={q.id} />
          <SubmitButton variant="primary" size="md" pendingText="جارٍ الاعتماد…" disabled={issues.length > 0}>
            <BadgeCheck aria-hidden /> اعتماد ونشر السؤال
          </SubmitButton>
        </ActionForm>,
      );
    }
    if (canWrite) {
      items.push(
        <ConfirmButton
          key="delete"
          action={deleteQuestionAction}
          hidden={hidden}
          label="حذف المسودة"
          icon={<Trash2 aria-hidden />}
          size="md"
          title="حذف المسودة نهائيًا؟"
          description={q.attempts ? "لهذه المسودة محاولات مسجلة، لذا ستُؤرشف بدل الحذف." : "لا يمكن التراجع عن الحذف."}
          confirmLabel="حذف المسودة"
        />,
      );
    }
  }

  if (q.status === "published") {
    if (q.open_revision_id) {
      items.push(
        <Button key="open-rev" asChild variant="soft" size="md">
          <Link href={`/admin/questions/${q.open_revision_id}`}>
            <GitBranch aria-hidden /> متابعة النسخة المعدّلة
          </Link>
        </Button>,
      );
    } else if (canWrite) {
      items.push(<QuickAction key="revise" action={reviseQuestionAction} hidden={hidden} icon={<CopyPlus aria-hidden />} label="إنشاء نسخة معدّلة" variant="primary" size="md" />);
    }
    if (owner) {
      items.push(
        q.paused ? (
          <QuickAction key="unpause" action={setQuestionPausedAction} hidden={{ id: q.id, paused: "0" }} icon={<CirclePlay aria-hidden />} label="إعادة التفعيل" variant="soft" size="md" />
        ) : (
          <QuickAction key="pause" action={setQuestionPausedAction} hidden={{ id: q.id, paused: "1" }} icon={<CirclePause aria-hidden />} label="إيقاف مؤقت" variant="outline" size="md" />
        ),
      );
    }
  }

  if (owner && (q.status === "in_review" || q.status === "published")) {
    items.push(
      <ConfirmButton
        key="archive"
        action={deleteQuestionAction}
        hidden={hidden}
        label="أرشفة"
        icon={<Archive aria-hidden />}
        size="md"
        title="أرشفة السؤال؟"
        description="يتوقف تقديمه للطلاب نهائيًا ويبقى في السجل مع محاولاته. لا يمكن تعديله بعد الأرشفة."
        confirmLabel="أرشفة"
      />,
    );
  }

  // روابط النسخ الأخرى من السؤال نفسه
  if (q.status !== "published" && q.open_revision_id) {
    items.push(
      <Button key="rev-link" asChild variant="ghost" size="md">
        <Link href={`/admin/questions/${q.open_revision_id}`}>
          <GitBranch aria-hidden /> النسخة المعدّلة المفتوحة
        </Link>
      </Button>,
    );
  }
  if (q.published_id) {
    items.push(
      <Button key="pub-link" asChild variant="ghost" size="md">
        <Link href={`/admin/questions/${q.published_id}`}>
          <BadgeCheck aria-hidden /> النسخة المنشورة الحالية
        </Link>
      </Button>,
    );
  }

  if (!items.length) {
    return q.status === "archived" ? <Alert tone="info">هذا السؤال مؤرشف: لا يُقدَّم للطلاب ولا يمكن تعديله.</Alert> : null;
  }

  const showIssues = issues.length > 0 && q.status === "draft" && !ownerReview;
  return (
    <Section
      title="الإجراءات"
      description={q.status === "draft" ? "احفظ تعديلاتك أولًا، ثم أرسل أو اعتمد" : undefined}
      icon={<Send />}
      tone="violet"
      headingLevel={2}
    >
      <div className="flex flex-wrap items-start gap-2.5">{items}</div>
      {showIssues ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-warning-50 px-3.5 py-2.5 text-[0.88rem] leading-7 font-semibold text-warning">
          <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden />
          <span>
            قبل {owner ? "الاعتماد" : "الإرسال"}: {issues.join("، ")}
          </span>
        </p>
      ) : null}
    </Section>
  );
}
