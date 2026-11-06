import Link from "next/link";
import { BookOpen, CircleHelp, EyeOff, Layers, LibraryBig, ListOrdered, Plus, ShieldAlert, ShieldCheck, Star } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { listTextbooks, subjectOptions, type TextbookRow } from "@/server/questions/curriculum";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { StatusPill } from "@/components/admin/status-badge";
import { ToneIcon } from "@/components/admin/icon-tile";
import { STRETCHED_FOCUS } from "@/components/admin/tones";
import { SubjectIcon } from "@/components/art";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ar, count, gradeClass, toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";
import { CatalogBand, BandChip, BandChips } from "../_components/catalog/band";
import { BooksArt } from "./_components/art";
import { TextbookCreateForm } from "./_components/forms";
import { LESSON, QUESTION, TEXTBOOK, UNIT, hiddenFromStudents, termName } from "./_components/words";

export const metadata = { title: "المنهج والكتب" };

type SubjectGroup = { id: string; name: string; slug: string; published: boolean; books: TextbookRow[] };
type GradeGroup = { id: string; name: string; level: number; published: boolean; subjects: SubjectGroup[] };
type StageGroup = { name: string; published: boolean; grades: GradeGroup[] };

/** تجميع المرحلة ← الصف ← المادة بترتيب الاستعلام (بحث بالمعرّف لا بالتتابع، فلا تتكرر مجموعة عند تساوي الترتيب) */
function groupBooks(books: TextbookRow[]): StageGroup[] {
  const stages: StageGroup[] = [];
  for (const b of books) {
    let st = stages.find((s) => s.name === b.stage_name);
    if (!st) stages.push((st = { name: b.stage_name, published: b.stage_published, grades: [] }));
    let g = st.grades.find((x) => x.id === b.grade_id);
    if (!g) st.grades.push((g = { id: b.grade_id, name: b.grade_name, level: b.grade_level, published: b.grade_published, subjects: [] }));
    let s = g.subjects.find((x) => x.id === b.subject_id);
    if (!s) g.subjects.push((s = { id: b.subject_id, name: b.subject_name, slug: b.subject_slug, published: b.subject_published, books: [] }));
    s.books.push(b);
  }
  return stages;
}

export default async function CurriculumPage() {
  await requireOwnerPage();
  const [books, subjects] = await Promise.all([listTextbooks(), subjectOptions()]);
  const stages = groupBooks(books);
  const totals = books.reduce((t, b) => ({ units: t.units + b.units, lessons: t.lessons + b.lessons, questions: t.questions + b.questions }), { units: 0, lessons: 0, questions: 0 });

  return (
    <div className="space-y-6">
      <CatalogBand
        tone="violet"
        art={<BooksArt />}
        footer={
          <BandChips>
            <BandChip tone="violet" icon={<LibraryBig />}>
              {count(books.length, { ...TEXTBOOK, none: "لا كتب بعد" })}
            </BandChip>
            <BandChip tone="sky" icon={<Layers />}>
              {count(totals.units, { ...UNIT, none: "لا وحدات بعد" })}
            </BandChip>
            <BandChip tone="green" icon={<ListOrdered />}>
              {count(totals.lessons, { ...LESSON, none: "لا دروس بعد" })}
            </BandChip>
            <BandChip tone="gold" icon={<CircleHelp />}>
              {count(totals.questions, { ...QUESTION, none: "لا أسئلة بعد" })}
            </BandChip>
          </BandChips>
        }
      >
        <AdminPageHeader
          className="mb-0 sm:mb-0"
          icon={<LibraryBig />}
          tone="violet"
          title="المنهج والكتب"
          description="الكتب المدرسية لكل مادة وفصل، ووحداتها ودروسها بنطاق الصفحات. عليها تُبنى أسئلة بنك الكتاب، ويمكن إعدادها للمراحل المخفية قبل إظهارها."
          actions={
            subjects.length ? (
              <Button asChild variant="accent">
                <a href="#add-textbook">
                  <Plus aria-hidden /> إضافة كتاب
                </a>
              </Button>
            ) : null
          }
        />
      </CatalogBand>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-8">
          {books.length === 0 ? (
            <EmptyState
              art="library"
              headingLevel={2}
              title="لا توجد كتب بعد"
              description="أضف أول كتاب: اختر المادة والفصل والطبعة، ثم أضف الوحدات والدروس أو استورد فهرس الكتاب من ملف."
            />
          ) : (
            stages.map((stage, si) => (
              <section
                key={stage.name}
                aria-labelledby={`cst-${si}`}
                className="overflow-hidden rounded-[1.9rem] border border-[rgb(23_32_38/0.06)] bg-surface shadow-card"
              >
                <div className="relative isolate flex flex-wrap items-center gap-3 bg-[linear-gradient(160deg,#EFE9FF,#fff_75%)] p-4 sm:p-5">
                  <span className="pointer-events-none absolute -end-14 -top-20 -z-10 size-48 rounded-full border-[18px] border-white/70" aria-hidden />
                  <ToneIcon tone="violet" size="md">
                    <Layers />
                  </ToneIcon>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <h2 id={`cst-${si}`} className="font-display text-[1.4rem] leading-tight font-black text-ink">
                      {stage.name}
                    </h2>
                    {stage.published ? null : <StatusPill tone="neutral">مرحلة مخفية</StatusPill>}
                    <span className="chip chip-white">{count(stage.grades.reduce((n, g) => n + g.subjects.reduce((m, s) => m + s.books.length, 0), 0), TEXTBOOK)}</span>
                  </div>
                </div>

                <div className="space-y-5 p-3 sm:p-5">
                  {stage.grades.map((g) => (
                    <article key={g.id} aria-labelledby={`cgr-${g.id}`} className={cn("tile-3d overflow-hidden", gradeClass(g.level))}>
                      <div className="flex flex-wrap items-center gap-3 bg-[linear-gradient(100deg,var(--soft),#fff_80%)] p-3.5 sm:p-4">
                        <span className="num-tile size-12 rounded-[1rem] border-2 border-white text-[1.6rem] shadow-[0_4px_0_var(--d)]" aria-hidden>
                          {ar(g.level)}
                        </span>
                        <h3 id={`cgr-${g.id}`} className="font-display text-[1.2rem] leading-tight font-black text-ink">
                          {g.name}
                        </h3>
                        {g.published ? null : <StatusPill tone="neutral">صف مخفي</StatusPill>}
                      </div>

                      <div className="space-y-4 p-3 sm:p-4">
                        {g.subjects.map((s) => (
                          <div key={s.id} className={cn("min-w-0", toneClass(s.slug))}>
                            <h4 className="mb-2 flex flex-wrap items-center gap-2 font-display text-[1rem] font-extrabold text-[var(--tink)]">
                              <span className="icon-tile size-8 rounded-[0.7rem]" aria-hidden>
                                <SubjectIcon slug={s.slug} size={16} />
                              </span>
                              {s.name}
                              {s.published ? null : (
                                <span className="chip min-h-6 bg-sand px-2 text-[0.72rem] text-ink-soft">
                                  <EyeOff aria-hidden /> مادة مخفية
                                </span>
                              )}
                            </h4>
                            <ul className="space-y-2.5">
                              {s.books.map((b) => (
                                <TextbookItem key={b.id} b={b} />
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="min-w-0">
          <Section id="add-textbook" title="إضافة كتاب" description="كتاب لكل مادة وفصل وطبعة." icon={<Plus />} tone="gold">
            {subjects.length ? (
              <TextbookCreateForm subjects={subjects} />
            ) : (
              <Alert tone="warning" title="لا توجد مواد بعد">
                أضف المرحلة والصف والمادة أولًا من <Link href="/admin/catalog">المراحل والمواد</Link>، ولو كانت مخفية.
              </Alert>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function TextbookItem({ b }: { b: TextbookRow }) {
  const hidden = hiddenFromStudents(b);
  return (
    <li
      className={cn(
        "relative flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-[1.25rem] border-2 border-[color-mix(in_oklab,var(--b)_14%,white)] bg-surface p-3 shadow-[0_3px_0_color-mix(in_oklab,var(--d)_18%,white)] transition-shadow hover:shadow-[0_3px_0_color-mix(in_oklab,var(--d)_28%,white),0_16px_28px_-18px_rgb(23_32_38/0.35)] sm:p-3.5",
        STRETCHED_FOCUS,
      )}
    >
      <div className="flex min-w-[min(100%,15rem)] flex-1 items-start gap-3">
        <span className="poster relative grid h-14 w-11 shrink-0 place-items-center rounded-[0.7rem] rounded-s-[0.3rem] border-2 border-white text-white shadow-[0_6px_14px_-8px_var(--d)]" aria-hidden>
          <span className="absolute inset-y-0 start-0 w-1.5 bg-[var(--d)] opacity-70" />
          <BookOpen className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/admin/curriculum/${b.id}`} className="stretched line-clamp-2 font-display text-[1rem] leading-snug font-extrabold text-ink hover:text-brand-700">
            {b.title}
          </Link>
          <p className="mt-0.5 text-[0.82rem] leading-6 text-ink-soft">
            {termName(b.term)} · طبعة {ar(b.edition)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {b.is_current ? (
              <span className="chip chip-gold min-h-7 text-[0.75rem]">
                <Star aria-hidden /> الطبعة الحالية
              </span>
            ) : null}
            {hidden ? (
              <StatusPill tone="neutral" icon={<EyeOff aria-hidden />}>
                مخفي عن الطلاب
              </StatusPill>
            ) : null}
            {b.rights_confirmed_at ? (
              <StatusPill tone="success" icon={<ShieldCheck aria-hidden />}>
                الحقوق مؤكدة
              </StatusPill>
            ) : (
              <StatusPill tone="warning" icon={<ShieldAlert aria-hidden />}>
                الحقوق غير مؤكدة
              </StatusPill>
            )}
          </div>
        </div>
      </div>
      <ul className="flex flex-wrap gap-1.5 border-t border-dashed border-line pt-2.5 max-md:w-full md:border-t-0 md:border-s-2 md:ps-4 md:pt-0" aria-label="المحتوى">
        <li className="chip min-h-7 bg-mist text-[0.75rem] text-ink-soft">
          <Layers aria-hidden /> {count(b.units, { ...UNIT, none: "بلا وحدات" })}
        </li>
        <li className="chip min-h-7 bg-mist text-[0.75rem] text-ink-soft">
          <ListOrdered aria-hidden /> {count(b.lessons, { ...LESSON, none: "بلا دروس" })}
        </li>
        <li className="chip min-h-7 text-[0.75rem]">
          <CircleHelp aria-hidden /> {count(b.questions, { ...QUESTION, none: "بلا أسئلة" })}
        </li>
      </ul>
    </li>
  );
}
