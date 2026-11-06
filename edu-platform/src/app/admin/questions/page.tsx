import Link from "next/link";
import { BookOpenText, EyeOff, GitBranch, Layers, Lock, CirclePause, Plus, Undo2, X } from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import { getSettings } from "@/server/platform/settings";
import { curriculumOptions } from "@/server/questions/curriculum";
import { countQuestions, listQuestions, questionStatusCounts, type QuestionListRow } from "@/server/questions/bank";
import { QUESTION_STATUSES, QUESTION_STATUS_LABELS, type QuestionStatus } from "@/server/questions/rules";
import { AdminPageHeader } from "@/components/admin/page-header";
import { DataList, DataRow } from "@/components/admin/data-list";
import { FilterBar, FilterSearch, FilterSubmit, ResultCount, Toolbar } from "@/components/admin/filter-bar";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/form";
import { ar, count } from "@/lib/design";
import { CatalogBand } from "../_components/catalog/band";
import { PillTabs, type PillTab } from "../_components/catalog/pill-tabs";
import { Pager } from "../_components/catalog/pager";
import { QuestionsArt } from "./_components/art";
import { DifficultyChip, QUESTION_STATUS_TONES, QuestionStatusBadge, QuestionTile, SourceChip, TypeChip, shortRef } from "./_components/bits";
import { QUESTION_WORD } from "@/server/questions/words";

export const metadata = { title: "بنك الأسئلة" };

type SP = { status?: string; book?: string; lesson?: string; q?: string; page?: string; deleted?: string };

/** عدد الأسئلة في الصفحة الواحدة */
const PAGE_SIZE = 24;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireStaff();
  const owner = actor.kind === "owner";
  const sp = await searchParams;
  const uuid = (v?: string) => (v && UUID.test(v) ? v : undefined);
  const filters = {
    status: QUESTION_STATUSES.includes(sp.status as QuestionStatus) ? (sp.status as QuestionStatus) : undefined,
    textbookId: uuid(sp.book),
    lessonId: uuid(sp.lesson),
    q: sp.q?.trim().slice(0, 80) || undefined,
  };
  const [options, counts, matching, settings] = await Promise.all([
    curriculumOptions(actor),
    questionStatusCounts(actor, { textbookId: filters.textbookId, lessonId: filters.lessonId, q: filters.q }),
    countQuestions(actor, filters),
    owner ? getSettings() : Promise.resolve(null),
  ]);
  const filtered = Boolean(filters.status || filters.textbookId || filters.lessonId || filters.q);
  const canAdd = !(actor.kind === "teacher" && !actor.canUpload);
  const total = counts.draft + counts.in_review + counts.published + counts.archived;

  // الدرس المحدد (من رابط في صفحة المنهج مثلًا) لعرضه ككبسولة قابلة للإزالة
  const lessonLabel = (() => {
    if (!filters.lessonId) return null;
    for (const tb of options)
      for (const u of tb.units)
        for (const l of u.lessons) if (l.id === filters.lessonId) return `${tb.label} · الوحدة ${ar(u.number)} · الدرس ${ar(l.number)}: ${l.title}`;
    return "درس محدد";
  })();

  // الترقيم في القاعدة: العدد الكلي بالمرشحات نفسها، ثم صفحة واحدة فقط
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const pageItems = await listQuestions(actor, filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries({ book: filters.textbookId, lesson: filters.lessonId, q: filters.q })) if (v) keep.set(k, v);
  const hrefFor = (patch: { status?: QuestionStatus | null; page?: number; lesson?: null }) => {
    const p = new URLSearchParams(keep);
    const status = patch.status === undefined ? filters.status : patch.status;
    if (status) p.set("status", status);
    if (patch.lesson === null) p.delete("lesson");
    if (patch.page && patch.page > 1) p.set("page", String(patch.page));
    const s = p.toString();
    return s ? `/admin/questions?${s}` : "/admin/questions";
  };

  const tabs: PillTab[] = [
    { href: hrefFor({ status: null }), label: "الكل", active: !filters.status, count: counts.draft + counts.in_review + counts.published, tone: "violet" },
    ...QUESTION_STATUSES.map((s) => ({
      href: hrefFor({ status: s }),
      label: QUESTION_STATUS_LABELS[s],
      active: filters.status === s,
      count: counts[s],
      tone: QUESTION_STATUS_TONES[s],
    })),
  ];

  const addButton =
    options.length === 0 ? null : canAdd ? (
      <Button asChild variant="accent">
        <Link href={filters.lessonId ? `/admin/questions/new?lesson=${filters.lessonId}` : "/admin/questions/new"}>
          <Plus aria-hidden /> إضافة سؤال
        </Link>
      </Button>
    ) : (
      <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-warning-50 px-4 font-display text-sm font-extrabold text-warning ring-1 ring-accent-700/20 ring-inset">
        <Lock className="size-4" aria-hidden /> صلاحية الإضافة موقوفة حاليًا
      </span>
    );

  const noBooks = (
    <EmptyState
      art="library"
      headingLevel={2}
      compact={total > 0}
      title={owner ? "أضف الكتاب ودروسه أولًا" : "لا توجد كتب لموادك بعد"}
      description={
        owner
          ? "كل سؤال مرتبط بدرس في الكتاب المدرسي وصفحة منه. أضف الكتاب من صفحة «المنهج» ثم وحداته ودروسه بنطاق صفحاتها، وبعدها تبدأ كتابة الأسئلة."
          : "تضيف إدارة المنصة الكتب المدرسية لموادك مع وحداتها ودروسها، وبعدها تستطيع كتابة الأسئلة هنا."
      }
      action={
        owner ? (
          <Button asChild>
            <Link href="/admin/curriculum">
              <BookOpenText aria-hidden /> فتح صفحة المنهج
            </Link>
          </Button>
        ) : null
      }
    />
  );

  return (
    <div className="space-y-6">
      <CatalogBand tone="violet" art={<QuestionsArt />} footer={total > 0 || options.length > 0 ? <PillTabs items={tabs} label="تصفية حسب الحالة" /> : undefined}>
        <AdminPageHeader
          className="mb-0 sm:mb-0"
          title={owner ? "بنك الأسئلة" : "أسئلتي"}
          description={
            owner
              ? "أسئلة اللعبة مرتبطة بدروس الكتاب المدرسي وصفحاته. راجعها واعتمدها قبل أن تصل للطلاب."
              : "اكتب أسئلة دروسك بصياغتك مع مرجعها في الكتاب، ثم أرسلها للمراجعة. تظهر للطلاب بعد اعتمادها."
          }
          actions={addButton}
        />
      </CatalogBand>

      {sp.deleted ? <Alert tone="success">تم حذف المسودة نهائيًا.</Alert> : null}
      {settings?.hide_textbook_exercises ? (
        <Alert tone="warning" title="تمارين الكتاب مخفية عن الطلاب الآن">
          الأسئلة المصنفة «تمرين من الكتاب بصياغة معدّلة» لا تُقدَّم للطلاب حتى توقف الإخفاء من <Link href="/admin/settings">إعدادات المنصة</Link>.
        </Alert>
      ) : null}

      {options.length === 0 ? noBooks : null}

      {options.length === 0 && total === 0 ? null : (
        <div>
          <FilterBar label="البحث في الأسئلة" className="grid-cols-2 lg:grid-cols-[2fr_minmax(0,1.4fr)_auto]">
            <FilterSearch defaultValue={filters.q} placeholder="ابحث في نص السؤال" className="col-span-2 lg:col-span-1" wide={false} />
            <Select name="book" defaultValue={filters.textbookId ?? ""} aria-label="الكتاب" className="col-span-2 lg:col-span-1">
              <option value="">كل الكتب</option>
              {options.map((o) => (
                <option key={o.textbookId} value={o.textbookId}>
                  {o.label}
                </option>
              ))}
            </Select>
            {/* الحالة من التبويبات والدرس من الرابط: يبقيان مع النموذج عند التصفية */}
            {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
            {filters.lessonId ? <input type="hidden" name="lesson" value={filters.lessonId} /> : null}
            <FilterSubmit resetHref="/admin/questions" active={filtered} className="col-span-2 lg:col-span-1" />
          </FilterBar>

          {lessonLabel ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="chip chip-white min-h-9 max-w-full px-3.5 text-[0.85rem] whitespace-normal">
                <Layers className="text-[#6A3FE0]" aria-hidden />
                <span className="min-w-0">{lessonLabel}</span>
              </span>
              <Button asChild variant="ghost" size="sm">
                <Link href={hrefFor({ lesson: null })}>
                  <X aria-hidden /> كل الدروس
                </Link>
              </Button>
            </div>
          ) : null}

          {matching === 0 ? (
            <EmptyState
              art={filtered ? "search" : "generic"}
              title={filtered ? "لا توجد أسئلة مطابقة" : "لا توجد أسئلة بعد"}
              description={
                filtered
                  ? "جرّب تغيير الحالة أو الكتاب أو نص البحث."
                  : owner
                    ? "ابدأ بأول سؤال: اختر الكتاب والدرس والصفحة، ثم اكتب السؤال وخياراته وشرح إجابته."
                    : "ابدأ بأول سؤال من دروسك: اختر الدرس والصفحة، ثم اكتب السؤال بصياغتك وشرح إجابته."
              }
              action={
                filtered ? (
                  <Button asChild variant="outline">
                    <Link href="/admin/questions">إزالة التصفية</Link>
                  </Button>
                ) : options.length > 0 && canAdd ? (
                  <Button asChild>
                    <Link href="/admin/questions/new">
                      <Plus aria-hidden /> إضافة سؤال
                    </Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
              <Toolbar
                start={
                  <>
                    <ResultCount>{count(matching, QUESTION_WORD)}</ResultCount>
                    {pages > 1 ? (
                      <span className="text-[0.85rem] text-muted">
                        المعروض <span className="font-display font-extrabold text-ink">{ar((page - 1) * PAGE_SIZE + 1)}</span> إلى{" "}
                        <span className="font-display font-extrabold text-ink">{ar((page - 1) * PAGE_SIZE + pageItems.length)}</span>
                      </span>
                    ) : null}
                  </>
                }
                end={
                  filters.status ? (
                    <span className="text-[0.85rem] text-muted">
                      الحالة: <b className="font-display font-extrabold text-ink">{QUESTION_STATUS_LABELS[filters.status]}</b>
                    </span>
                  ) : (
                    <span className="text-[0.85rem] text-muted">كل الحالات (عدا المؤرشف)</span>
                  )
                }
              />
              <DataList>
                {pageItems.map((q) => (
                  <QuestionRow key={q.id} q={q} owner={owner} />
                ))}
              </DataList>
              <Pager
                page={page}
                pages={pages}
                hrefFor={(n) => hrefFor({ page: n })}
                label="صفحات الأسئلة"
                className="mt-6 rounded-[1.5rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3 shadow-card sm:p-4"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionRow({ q, owner }: { q: QuestionListRow; owner: boolean }) {
  const returned = q.status === "draft" && Boolean(q.review_note);
  return (
    <DataRow
      href={`/admin/questions/${q.id}`}
      leading={<QuestionTile subjectName={q.subject_name} type={q.type} />}
      title={<span dir="auto">{q.stem}</span>}
      sub={
        <span className="flex flex-wrap gap-x-2">
          <span>
            {q.subject_name} · {q.grade_name}
          </span>
          <span className="font-display font-bold text-ink-soft">{shortRef(q.unit_number, q.lesson_number, q.page)}</span>
          {owner ? <span>· {q.teacher_name ?? "إدارة المنصة"}</span> : null}
        </span>
      }
      badges={
        <>
          {returned ? (
            <span className="chip chip-coral min-h-6 text-[0.75rem]">
              <Undo2 aria-hidden /> أُعيد بملاحظات
            </span>
          ) : null}
          {q.paused ? (
            <span className="chip min-h-6 bg-sand px-2.5 text-[0.75rem] text-ink-soft">
              <CirclePause aria-hidden /> موقوف
            </span>
          ) : null}
          <TypeChip type={q.type} />
          <DifficultyChip difficulty={q.difficulty} />
          <SourceChip source={q.source_kind} />
          {q.version > 1 ? (
            <span className="chip min-h-6 bg-mist px-2.5 text-[0.75rem] text-ink-soft">
              <GitBranch aria-hidden /> الإصدار {ar(q.version)}
            </span>
          ) : null}
        </>
      }
      aside={
        <>
          {q.status === "archived" ? <EyeOff className="size-4 text-muted" aria-hidden /> : null}
          <QuestionStatusBadge status={q.status} />
        </>
      }
    />
  );
}
