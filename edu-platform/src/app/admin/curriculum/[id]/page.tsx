import type * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ChevronDown, CircleHelp, EyeOff, FileSpreadsheet, Layers, ListOrdered, Pencil, Plus, ShieldAlert, ShieldCheck, Star, Trash2 } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { getTextbook, TOC_COLUMNS, type CurriculumUnit } from "@/server/questions/curriculum";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { StatusPill } from "@/components/admin/status-badge";
import { ToneIcon } from "@/components/admin/icon-tile";
import { toneStyle, type AdminTone } from "@/components/admin/tones";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ar, count, subjectVars } from "@/lib/design";
import { cn, formatDate } from "@/lib/utils";
import { CatalogBand } from "../../_components/catalog/band";
import { deleteLessonAction, deleteUnitAction } from "../actions";
import { BookCoverArt } from "../_components/art";
import { LessonForm, TextbookEditForm, UnitForm } from "../_components/forms";
import { TocImport } from "../_components/toc-import";
import { LESSON, QUESTION, UNIT, hiddenFromStudents, pagesLabel, termName, textbookLabel } from "../_components/words";

export const metadata = { title: "كتاب المنهج" };

/** زر تفاصيل (details/summary) على شكل كبسولة، كما في صفحة المراحل والمواد */
const SUMMARY_PILL = "btn btn-3d btn-soft btn-sm min-h-11 w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden";

/** ألوان الوحدات بالتناوب: لكل وحدة لونها في الرأس وأرقام دروسها */
const UNIT_TONES: AdminTone[] = ["sky", "violet", "green", "coral", "pink", "teal"];

/** شرح أعمدة ملف الفهرس بالترتيب نفسه في الخادم */
const COLUMN_HELP: Record<(typeof TOC_COLUMNS)[number], string> = {
  unit_number: "رقم الوحدة",
  unit_title: "عنوان الوحدة",
  lesson_number: "رقم الدرس داخل الوحدة",
  lesson_title: "عنوان الدرس",
  page_start: "صفحة البداية",
  page_end: "صفحة النهاية",
};

const CSV_EXAMPLE = [
  TOC_COLUMNS.join(","),
  "1,الأعداد والعمليات,1,القيمة المنزلية,8,13",
  "1,الأعداد والعمليات,2,مقارنة الأعداد,14,19",
  "2,الهندسة,1,الزوايا,40,46",
].join("\n");

export default async function TextbookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  const sp = await searchParams;
  const tb = await getTextbook(id);
  if (!tb) notFound();

  const hidden = hiddenFromStudents(tb);
  const units = tb.unitsList;
  const nextUnit = Math.min(99, units.reduce((m, u) => Math.max(m, u.number), 0) + 1);

  return (
    <div className="space-y-6">
      <CatalogBand tone="violet" style={subjectVars(tb.subject_slug)} art={<BookCoverArt slug={tb.subject_slug} edition={tb.edition} />}>
        <AdminPageHeader
          className="mb-0 sm:mb-0"
          icon={<BookOpen />}
          tone="violet"
          title={textbookLabel(tb)}
          description={`${tb.title}، طبعة ${ar(tb.edition)}`}
          crumbs={[{ label: "المنهج والكتب", href: "/admin/curriculum" }, { label: tb.subject_name }]}
        >
          <div className="flex flex-wrap items-center gap-2">
            {tb.is_current ? (
              <span className="chip chip-gold">
                <Star aria-hidden /> الطبعة الحالية
              </span>
            ) : (
              <StatusPill tone="neutral">طبعة سابقة</StatusPill>
            )}
            {hidden ? (
              <StatusPill tone="neutral" icon={<EyeOff aria-hidden />}>
                مخفي عن الطلاب
              </StatusPill>
            ) : null}
            {tb.rights_confirmed_at ? (
              <StatusPill tone="success" icon={<ShieldCheck aria-hidden />}>
                الحقوق مؤكدة
              </StatusPill>
            ) : (
              <StatusPill tone="warning" icon={<ShieldAlert aria-hidden />}>
                الحقوق غير مؤكدة
              </StatusPill>
            )}
            <span className="chip chip-white">
              <Layers aria-hidden /> {count(tb.units, { ...UNIT, none: "بلا وحدات" })}
            </span>
            <span className="chip chip-white">
              <ListOrdered aria-hidden /> {count(tb.lessons, { ...LESSON, none: "بلا دروس" })}
            </span>
            <span className="chip chip-white">
              <CircleHelp aria-hidden /> {count(tb.questions, { ...QUESTION, none: "بلا أسئلة" })}
            </span>
          </div>
        </AdminPageHeader>
      </CatalogBand>

      {sp.created ? (
        <Alert tone="success" title="تمت إضافة الكتاب">
          الخطوة التالية: <a href="#toc-import">استورد فهرس الكتاب</a> من ملف CSV، أو <a href="#add-unit">أضف الوحدات</a> ودروسها يدويًا.
        </Alert>
      ) : null}
      {!tb.rights_confirmed_at ? (
        <Alert tone="warning" title="حق الإشارة إلى الكتاب غير مؤكد">
          أكّد حق المنصة في الإشارة إلى هذا الكتاب ومراجعه من <a href="#textbook-data">بيانات الكتاب</a>.
        </Alert>
      ) : null}
      {hidden ? (
        <Alert tone="info">
          المادة أو الصف أو المرحلة مخفية عن الطلاب. يمكن إعداد المنهج وإدخال الأسئلة الآن، وتظهر للطلاب عند إظهارها من <Link href="/admin/catalog">المراحل والمواد</Link>.
        </Alert>
      ) : null}
      {!tb.is_current ? <Alert tone="info">هذه طبعة سابقة: لا تظهر للمعلمين عند إدخال أسئلة جديدة. اجعلها «الطبعة الحالية» من بيانات الكتاب إن لزم.</Alert> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* ───── الوحدات والدروس ───── */}
        <div className="min-w-0 space-y-6">
          {units.length === 0 ? (
            <EmptyState
              art="library"
              headingLevel={2}
              title="لا توجد وحدات بعد"
              description="أسرع طريقة: استورد فهرس الكتاب من ملف CSV. أو أضف الوحدات ثم دروسها واحدًا واحدًا."
              action={
                <>
                  <Button asChild variant="primary">
                    <a href="#toc-import">
                      <FileSpreadsheet aria-hidden /> استيراد الفهرس
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href="#add-unit">
                      <Plus aria-hidden /> إضافة وحدة
                    </a>
                  </Button>
                </>
              }
            />
          ) : (
            units.map((u, i) => <UnitSection key={u.id} unit={u} tone={UNIT_TONES[i % UNIT_TONES.length]} textbookId={tb.id} />)
          )}

          <section
            id="add-unit"
            aria-labelledby="add-unit-h"
            className="relative isolate scroll-mt-24 overflow-hidden rounded-[1.75rem] border-2 border-dashed border-[#C9B6FF] bg-[linear-gradient(160deg,#fff,#F4EFFF)] p-4 sm:p-6"
          >
            <h2 id="add-unit-h" className="mb-4 flex items-center gap-3 font-display text-[1.25rem] font-black text-ink">
              <ToneIcon tone="violet" size="sm">
                <Plus />
              </ToneIcon>
              إضافة وحدة
            </h2>
            <div className="max-w-2xl">
              <UnitForm textbookId={tb.id} nextNumber={nextUnit} />
            </div>
          </section>
        </div>

        {/* ───── بيانات الكتاب ───── */}
        <aside className="min-w-0 space-y-6">
          <Section id="textbook-data" title="بيانات الكتاب" icon={<Pencil />} tone="violet">
            <TextbookEditForm id={tb.id} title={tb.title} edition={tb.edition} isCurrent={tb.is_current} rightsConfirmed={Boolean(tb.rights_confirmed_at)} />
            <dl className="mt-5 border-t border-dashed border-line pt-2 text-[0.85rem]">
              <MetaRow label="المرحلة" value={tb.stage_name} />
              <MetaRow label="الصف" value={tb.grade_name} />
              <MetaRow label="المادة" value={tb.subject_name} />
              <MetaRow label="الفصل" value={termName(tb.term)} />
              <MetaRow label="تأكيد الحقوق" value={tb.rights_confirmed_at ? formatDate(tb.rights_confirmed_at) : "لم يُؤكَّد"} />
            </dl>
          </Section>
        </aside>
      </div>

      {/* ───── استيراد فهرس الكتاب ───── */}
      <Section id="toc-import" title="استيراد فهرس الكتاب" description="أضف الوحدات والدروس دفعة واحدة من ملف CSV، أو حدّث نطاقات صفحاتها." icon={<FileSpreadsheet />} tone="sky">
        <div id="toc-help" className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-3 text-[0.92rem] leading-7 text-ink-soft">
            <p>
              ملف <b className="text-ink">CSV بترميز UTF-8</b>، صفه الأول <b className="text-ink">عناوين الأعمدة (إلزامي)</b>، ثم صف لكل درس بهذه الأعمدة بالترتيب:
            </p>
            <ol className="grid gap-2 sm:grid-cols-2">
              {TOC_COLUMNS.map((c, i) => (
                <li key={c} className="flex min-w-0 items-center gap-2.5 rounded-[1rem] border border-line bg-canvas px-2.5 py-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-linear-to-br from-[#7CC4FF] to-[#3B6FE0] font-display text-[0.8rem] font-black text-white" aria-hidden>
                    {ar(i + 1)}
                  </span>
                  <span className="min-w-0">
                    <code dir="ltr" className="block truncate font-mono text-[0.85rem] font-bold text-ink">
                      {c}
                    </code>
                    <span className="block text-[0.78rem] leading-5 text-muted">{COLUMN_HELP[c]}</span>
                  </span>
                </li>
              ))}
            </ol>
            <ul className="list-disc space-y-1 ps-5 text-[0.88rem]">
              <li>تتكرر الوحدة في كل صف من صفوف دروسها بنفس العنوان.</li>
              <li>الدرس الموجود بنفس رقم الوحدة والدرس يُحدَّث، والجديد يُضاف، ولا يُحذف شيء.</li>
              <li>من Excel: «حفظ باسم» ثم «CSV UTF-8 (مفصول بفواصل)». ملفات Windows-1256 تُرفض.</li>
            </ul>
          </div>
          <div className="min-w-0">
            <p className="mb-2 font-display text-[0.85rem] font-bold text-ink">مثال</p>
            <pre dir="ltr" className="overflow-x-auto rounded-[1rem] bg-teal-night p-3 font-mono text-[0.8rem] leading-6 text-white">
              {CSV_EXAMPLE}
            </pre>
          </div>
        </div>
        <TocImport textbookId={tb.id} />
      </Section>
    </div>
  );
}

function UnitSection({ unit, tone, textbookId }: { unit: CurriculumUnit; tone: AdminTone; textbookId: string }) {
  const questions = unit.lessons.reduce((n, l) => n + l.questions, 0);
  const nextLesson = Math.min(99, unit.lessons.reduce((m, l) => Math.max(m, l.number), 0) + 1);
  const last = unit.lessons.at(-1);
  return (
    <Section
      id={`unit-${unit.id}`}
      icon={<span className="font-display text-[1.15rem] leading-none font-black">{ar(unit.number)}</span>}
      tone={tone}
      title={`الوحدة ${ar(unit.number)}: ${unit.title}`}
      description={`${count(unit.lessons.length, { ...LESSON, none: "بلا دروس" })}، ${count(questions, { ...QUESTION, none: "بلا أسئلة" })}`}
      actions={
        <ConfirmButton
          action={deleteUnitAction}
          hidden={{ id: unit.id, textbookId }}
          label="حذف الوحدة"
          icon={<Trash2 aria-hidden />}
          variant="ghost"
          title={`حذف «الوحدة ${ar(unit.number)}: ${unit.title}»؟`}
          description={questions ? "في دروس هذه الوحدة أسئلة، لذلك لا يمكن حذفها." : "تُحذف الوحدة ودروسها نهائيًا. لا يمكن حذف وحدة فيها أسئلة."}
          confirmLabel="حذف"
        />
      }
    >
      <div style={toneStyle(tone)}>
        {unit.lessons.length ? (
          <>
            {/* رأس الأعمدة على الشاشات العريضة؛ على الجوال كل درس بطاقة بتسمياتها */}
            <div
              className="mb-2 hidden rounded-xl bg-[var(--soft)] px-3 py-2.5 font-display text-[0.8rem] font-extrabold text-[var(--tink)] md:grid md:grid-cols-[2.75rem_minmax(0,1fr)_9rem_7.5rem_2.75rem] md:items-center md:gap-3"
              aria-hidden
            >
              <span>الرقم</span>
              <span>الدرس</span>
              <span>الصفحات</span>
              <span>الأسئلة</span>
              <span />
            </div>
            <ul className="space-y-2" aria-label={`دروس الوحدة ${ar(unit.number)}`}>
              {unit.lessons.map((l) => (
                <li key={l.id} className="overflow-hidden rounded-[1.15rem] border border-[rgb(23_32_38/0.07)] bg-surface shadow-[0_3px_0_var(--color-line)]">
                  <details className="group">
                    <summary className="grid min-h-14 cursor-pointer list-none grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-2.5 transition-colors hover:bg-canvas focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-brand-600 focus-visible:outline-solid md:grid-cols-[2.75rem_minmax(0,1fr)_9rem_7.5rem_2.75rem] [&::-webkit-details-marker]:hidden">
                      <span className="num-tile size-10 rounded-[0.8rem] text-[1.1rem]" aria-hidden>
                        {ar(l.number)}
                      </span>
                      <span className="min-w-0 font-display font-extrabold text-ink">
                        <span className="sr-only">الدرس {ar(l.number)}: </span>
                        {l.title}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 max-md:col-span-2 max-md:col-start-2 max-md:row-start-2 md:contents">
                        <span className="chip min-h-7 bg-mist text-[0.78rem] text-ink-soft md:w-fit">{pagesLabel(l.page_start, l.page_end)}</span>
                        <span className={cn("chip min-h-7 text-[0.78rem] md:w-fit", l.questions ? "" : "bg-sand text-ink-soft")}>
                          <CircleHelp aria-hidden /> {count(l.questions, { ...QUESTION, none: "بلا أسئلة" })}
                        </span>
                      </span>
                      <span className="col-start-3 row-start-1 grid size-10 place-items-center justify-self-end rounded-xl bg-[var(--soft)] text-[var(--tink)] md:col-start-auto md:row-start-auto" aria-hidden>
                        <Pencil className="size-4 group-open:hidden" />
                        <ChevronDown className="hidden size-5 rotate-180 group-open:block" />
                      </span>
                      <span className="sr-only">تعديل الدرس</span>
                    </summary>
                    <div className="space-y-3 border-t border-dashed border-line bg-canvas/50 p-3 sm:p-4">
                      <LessonForm textbookId={textbookId} unitId={unit.id} lesson={l} />
                      <div className="border-t border-dashed border-line pt-3">
                        <ConfirmButton
                          action={deleteLessonAction}
                          hidden={{ id: l.id, textbookId }}
                          label="حذف الدرس"
                          icon={<Trash2 aria-hidden />}
                          title={`حذف درس «${l.title}»؟`}
                          description={l.questions ? "في هذا الدرس أسئلة، لذلك لا يمكن حذفه." : "سيُحذف الدرس نهائيًا من الوحدة."}
                          confirmLabel="حذف"
                        />
                      </div>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="rounded-[1.1rem] border-2 border-dashed border-line-strong bg-canvas/70 p-4 text-sm text-muted">لا توجد دروس في هذه الوحدة بعد.</p>
        )}

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <details className="group/add w-full sm:w-auto [&[open]]:w-full" open={unit.lessons.length === 0}>
            <summary className={SUMMARY_PILL}>
              <Plus aria-hidden /> إضافة درس
            </summary>
            <div className="mt-3 rounded-[1.25rem] bg-[var(--soft)] p-3 sm:p-4">
              <LessonForm textbookId={textbookId} unitId={unit.id} nextNumber={nextLesson} pageHint={last ? `ص ${ar(last.page_end + 1)}` : undefined} />
            </div>
          </details>
          <details className="group/edit w-full sm:w-auto [&[open]]:w-full">
            <summary className={cn(SUMMARY_PILL, "btn-outline")}>
              <Pencil aria-hidden /> تعديل الوحدة
            </summary>
            <div className="mt-3 max-w-2xl rounded-[1.25rem] bg-canvas p-3 sm:p-4">
              <UnitForm textbookId={textbookId} unit={{ id: unit.id, number: unit.number, title: unit.title }} />
            </div>
          </details>
        </div>
      </div>
    </Section>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-2 last:border-0">
      <dt className="shrink-0 font-display font-bold text-muted">{label}</dt>
      <dd className="min-w-0 text-end text-ink-soft">{value}</dd>
    </div>
  );
}
