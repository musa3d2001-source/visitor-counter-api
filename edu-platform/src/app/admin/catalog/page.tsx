import type * as React from "react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { ChevronDown, Eye, EyeOff, GraduationCap, Layers, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { getCatalogTree } from "@/server/admin/catalog";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { SubjectIcon } from "@/components/site/subject-icon";
import { StatusPill } from "@/components/admin/status-badge";
import { ToneIcon } from "@/components/admin/icon-tile";
import { W, ar, count, gradeClass, toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";
import { CatalogBand, BandChip, BandChips } from "../_components/catalog/band";
import { GradesArt } from "../_components/catalog/art";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { SUBJECT_ICONS } from "@/lib/labels";

/** زر تفاصيل (details/summary) على شكل كبسولة */
const SUMMARY_PILL = "btn btn-3d btn-soft btn-sm min-h-11 w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden";
import { deleteCatalogAction, saveGradeAction, saveStageAction, saveSubjectAction, togglePublishAction } from "./actions";

export const metadata = { title: "المراحل والمواد" };

const ICON_LABELS: Record<string, string> = {
  book: "كتاب",
  "book-open": "كتاب مفتوح",
  languages: "لغات",
  calculator: "رياضيات",
  flask: "علوم",
  globe: "اجتماعيات",
  moon: "إسلامية",
  monitor: "حاسوب",
  palette: "فنون",
  music: "موسيقى",
  landmark: "تاريخ",
  atom: "فيزياء",
};

function PublishToggle({ kind, id, published }: { kind: "stage" | "grade" | "subject"; id: string; published: boolean }) {
  return published ? (
    <QuickAction action={togglePublishAction} hidden={{ kind, id, publish: "0" }} icon={<EyeOff aria-hidden />} label="إخفاء" variant="ghost" />
  ) : (
    <QuickAction action={togglePublishAction} hidden={{ kind, id, publish: "1" }} icon={<Eye aria-hidden />} label="إظهار" variant="ghost" />
  );
}

function IconPicker({ name, value }: { name: string; value: string }) {
  return (
    <fieldset>
      <legend className="mb-2 font-display text-[0.92rem] font-bold text-ink">الأيقونة</legend>
      <div className="flex flex-wrap gap-2">
        {SUBJECT_ICONS.map((ic) => (
          <label key={ic} className="cursor-pointer" title={ICON_LABELS[ic]}>
            <input type="radio" name={name} value={ic} defaultChecked={ic === value} className="peer sr-only" />
            <span className="grid size-11 place-items-center rounded-[0.9rem] border-2 border-line bg-surface text-ink-soft transition-colors hover:border-brand-300 peer-checked:border-brand-600 peer-checked:bg-linear-to-br peer-checked:from-brand-400 peer-checked:to-brand-600 peer-checked:text-white peer-checked:shadow-[0_4px_0_var(--brand-edge)] peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 peer-focus-visible:outline-solid">
              <SubjectIcon name={ic} className="size-5" />
              <span className="sr-only">{ICON_LABELS[ic]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** «مخفي» مطابقًا للمعدود: صف واحد مخفي، صفّان مخفيان، ٥ صفوف مخفية، ١١ صفًّا مخفيًّا */
function hiddenAdj(n: number) {
  const m = n % 100;
  if (n === 2) return "مخفيان";
  if (m >= 3 && m <= 10) return "مخفية";
  if (m >= 11 && m <= 99) return "مخفيًّا";
  return "مخفي";
}

/** صفوف مرحلة مخفية بلا منتجات: مطوية خلف ملخص واحد مع زر «عرض» */
function DormantGrades({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <details className="group/dormant">
      <summary className="m-3 flex min-h-16 cursor-pointer list-none flex-wrap items-center gap-3 rounded-[1.25rem] border-2 border-dashed border-line-strong bg-canvas p-3 transition-colors hover:border-brand-300 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus-visible:outline-solid sm:m-5 [&::-webkit-details-marker]:hidden">
        <span className="grid size-11 shrink-0 place-items-center rounded-[0.9rem] bg-mist text-ink-soft" aria-hidden>
          <EyeOff className="size-5" />
        </span>
        <span className="min-w-[10rem] flex-1">
          <span className="block font-display font-extrabold text-ink">
            {count(n, W.grade)} {hiddenAdj(n)}، بلا منتجات
          </span>
          <span className="block text-[0.8rem] leading-6 text-muted">المرحلة لا تظهر للطلاب. افتحها للتعديل أو الإظهار.</span>
        </span>
        <span className="btn btn-3d btn-soft btn-sm pointer-events-none min-h-11" aria-hidden>
          <span className="group-open/dormant:hidden">عرض</span>
          <span className="hidden group-open/dormant:inline">طيّ</span>
          <ChevronDown className="transition-transform group-open/dormant:rotate-180 motion-reduce:transition-none" />
        </span>
      </summary>
      {children}
    </details>
  );
}

export default async function CatalogPage() {
  await requireOwnerPage();
  const tree = await getCatalogTree();
  const gradeCount = tree.reduce((n, st) => n + st.grades.length, 0);
  const subjectCount = tree.reduce((n, st) => n + st.grades.reduce((m, g) => m + g.subjects.length, 0), 0);
  const allGrades = tree.flatMap((st) => st.grades);
  const shown = allGrades.filter((g) => g.is_published);
  const levels = (shown.length ? shown : allGrades).map((g) => g.level);
  // المراحل الظاهرة أولًا (ترتيب العرض فقط، الترتيب المحفوظ يبقى داخل كل مجموعة)
  const stages = [...tree].sort((a, b) => Number(b.is_published) - Number(a.is_published));

  return (
    <div className="space-y-6">
      <CatalogBand
        tone="green"
        art={<GradesArt levels={levels.length ? levels : undefined} />}
        footer={
          <BandChips>
            <BandChip tone="green" icon={<Layers />}>
              {count(tree.length, {
                one: "مرحلة",
                two: "مرحلتان",
                plural: "مراحل",
                acc: "مرحلة",
                oneSuffix: "واحدة",
              })}
            </BandChip>
            <BandChip tone="violet" icon={<GraduationCap />}>
              {count(gradeCount, W.grade)}
            </BandChip>
            <BandChip tone="sky" icon={<Settings2 />}>
              {count(subjectCount, W.subject)}
            </BandChip>
          </BandChips>
        }
      >
        <AdminPageHeader className="mb-0 sm:mb-0" title="المراحل والمواد" description="الهيكل الدراسي: المرحلة ← الصف ← المادة. العناصر المخفية والفارغة لا تظهر للطلاب." />
      </CatalogBand>

      {tree.length === 0 ? <EmptyState icon={<Layers />} title="لا توجد مراحل بعد" description="أضف أول مرحلة دراسية من النموذج أدناه." /> : null}

      <div className="space-y-8">
        {stages.map((stage) => {
          // مرحلة مخفية بلا أي منتج: صفوفها مطوية حتى لا تدفع المرحلة الحية تحت الطيّة
          const dormant = !stage.is_published && stage.grades.length > 0 && stage.grades.every((g) => g.product_count === 0);
          const gradeList = (
            <div className="space-y-5 p-3 sm:p-5">
              {stage.grades.map((g) => (
                <article key={g.id} aria-labelledby={`gr-${g.id}`} className={cn("tile-3d overflow-hidden", gradeClass(g.level))}>
                  <div className="relative isolate flex flex-wrap items-center gap-3 bg-[linear-gradient(100deg,var(--soft),#fff_80%)] p-3.5 sm:p-4">
                    <span
                      className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(color-mix(in_oklab,var(--b)_22%,transparent)_1.2px,transparent_1.6px)] bg-[length:18px_18px] [mask-image:linear-gradient(90deg,#000,transparent_60%)]"
                      aria-hidden
                    />
                    <span className="num-tile size-14 rounded-[1.1rem] border-2 border-white text-[2rem] shadow-[0_5px_0_var(--d)]" aria-hidden>
                      {ar(g.level)}
                    </span>
                    <div className="min-w-[11rem] flex-1">
                      <h3 id={`gr-${g.id}`} className="font-display text-[1.3rem] leading-tight font-black text-ink">
                        {g.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {g.is_published ? <StatusPill tone="success">ظاهر</StatusPill> : <StatusPill tone="neutral">مخفي</StatusPill>}
                        <span className="chip chip-white">الفصل الحالي: {g.current_term === 1 ? "الأول" : "الثاني"}</span>
                        <span className="chip">{count(g.product_count, { ...W.product, none: "بلا منتجات" })}</span>
                      </div>
                    </div>
                    <div className="ms-auto flex items-center gap-1">
                      <PublishToggle kind="grade" id={g.id} published={g.is_published} />
                      <ConfirmButton
                        action={deleteCatalogAction}
                        hidden={{ kind: "grade", id: g.id }}
                        label=""
                        icon={<Trash2 aria-hidden />}
                        size="icon"
                        variant="ghost"
                        title={`حذف «${g.name}»؟`}
                        description="يمكن الحذف فقط إذا لم يحتوِ الصف مواد أو منتجات. وإلا استخدم الإخفاء."
                        confirmLabel="حذف"
                      />
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4">
                    {g.subjects.length ? (
                      <ul className="mb-4 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
                        {g.subjects.map((s) => (
                          <li key={s.id} className="min-w-0 has-[details[open]]:col-span-full">
                            <details className={cn("group rounded-[1.25rem]", toneClass(s.slug))}>
                              <summary
                                className={cn(
                                  "flex min-h-16 cursor-pointer list-none items-center gap-2.5 rounded-[1.25rem] border-2 p-2.5 transition-[transform,box-shadow] hover:-translate-y-0.5 motion-reduce:transform-none [&::-webkit-details-marker]:hidden",
                                  s.is_published
                                    ? "border-[color-mix(in_oklab,var(--b)_20%,white)] bg-[var(--soft)] shadow-[0_4px_0_color-mix(in_oklab,var(--d)_25%,white)]"
                                    : "border-dashed border-line-strong bg-canvas text-muted",
                                  "group-open:rounded-b-none group-open:shadow-none",
                                )}
                              >
                                <span className={cn("icon-tile size-10 rounded-[0.85rem]", !s.is_published && "opacity-60 grayscale")}>
                                  <SubjectIcon name={s.icon} className="size-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className={cn("line-clamp-2 block font-display leading-snug font-extrabold", s.is_published ? "text-[var(--tink)]" : "text-muted")}>{s.name}</span>
                                  <span className="block text-[0.75rem] leading-5 text-ink-soft">
                                    {count(s.product_count, {
                                      ...W.product,
                                      none: "بلا منتجات",
                                    })}
                                  </span>
                                </span>
                                {!s.is_published ? <EyeOff className="size-4 shrink-0" aria-label="مخفية" /> : <Pencil className="size-4 shrink-0 text-[var(--tink)] opacity-60" aria-hidden />}
                              </summary>
                              <div className="rounded-b-[1.25rem] border-2 border-t-0 border-[color-mix(in_oklab,var(--b)_20%,white)] bg-surface p-4">
                                <ActionForm action={saveSubjectAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                  <input type="hidden" name="id" value={s.id} />
                                  <input type="hidden" name="gradeId" value={g.id} />
                                  <Field label="اسم المادة" htmlFor={`subn-${s.id}`}>
                                    <Input id={`subn-${s.id}`} name="name" defaultValue={s.name} />
                                  </Field>
                                  <Field label="الرابط" htmlFor={`subs-${s.id}`}>
                                    <Input id={`subs-${s.id}`} name="slug" defaultValue={s.slug} dir="ltr" className="text-start" />
                                  </Field>
                                  <Field label="الترتيب" htmlFor={`subo-${s.id}`}>
                                    <Input id={`subo-${s.id}`} name="sortOrder" type="number" defaultValue={s.sort_order} className="num" />
                                  </Field>
                                  <div className="flex items-end">
                                    <Checkbox name="isPublished" defaultChecked={s.is_published} label="ظاهرة" />
                                  </div>
                                  <div className="sm:col-span-2 lg:col-span-4">
                                    <IconPicker name="icon" value={s.icon} />
                                  </div>
                                  <div className="sm:col-span-2 lg:col-span-4">
                                    <SubmitButton size="sm">حفظ المادة</SubmitButton>
                                  </div>
                                </ActionForm>
                                <div className="mt-3 border-t border-dashed border-line pt-3">
                                  <ConfirmButton
                                    action={deleteCatalogAction}
                                    hidden={{ kind: "subject", id: s.id }}
                                    label="حذف المادة"
                                    icon={<Trash2 aria-hidden />}
                                    title={`حذف «${s.name}»؟`}
                                    description="يمكن الحذف فقط إذا لم تحتوِ المادة منتجات."
                                    confirmLabel="حذف"
                                  />
                                </div>
                              </div>
                            </details>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="flex flex-wrap items-start gap-3">
                      {g.subjects.length === 0 ? <p className="flex min-h-10 items-center text-sm text-muted">لا توجد مواد بعد.</p> : null}
                      <details className="group w-full sm:w-auto [&[open]]:w-full">
                        <summary className={SUMMARY_PILL}>
                          <Plus aria-hidden /> إضافة مادة
                        </summary>
                        <ActionForm action={saveSubjectAction} resetOnSuccess className="mt-3 grid max-w-3xl gap-3 rounded-[1.25rem] bg-canvas p-4 sm:grid-cols-2">
                          <input type="hidden" name="gradeId" value={g.id} />
                          <Field label="اسم المادة" htmlFor={`ns-${g.id}`} required>
                            <Input id={`ns-${g.id}`} name="name" placeholder="مثال: الرياضيات" />
                          </Field>
                          <Field label="الرابط (إنجليزي)" htmlFor={`nss-${g.id}`} required>
                            <Input id={`nss-${g.id}`} name="slug" dir="ltr" className="text-start" placeholder="math" />
                          </Field>
                          <Field label="الترتيب" htmlFor={`nso-${g.id}`}>
                            <Input id={`nso-${g.id}`} name="sortOrder" type="number" defaultValue={g.subjects.length} className="num" />
                          </Field>
                          <div className="flex items-end">
                            <Checkbox name="isPublished" defaultChecked label="ظاهرة" />
                          </div>
                          <div className="sm:col-span-2">
                            <IconPicker name="icon" value="book" />
                          </div>
                          <div className="sm:col-span-2">
                            <SubmitButton size="sm">إضافة المادة</SubmitButton>
                          </div>
                        </ActionForm>
                      </details>
                      <details className="group w-full sm:w-auto [&[open]]:w-full">
                        <summary className={cn(SUMMARY_PILL, "btn-outline")}>
                          <Pencil aria-hidden /> تعديل بيانات الصف
                        </summary>
                        <ActionForm action={saveGradeAction} className="mt-3 grid max-w-3xl gap-3 rounded-[1.25rem] bg-canvas p-4 sm:grid-cols-3">
                          <input type="hidden" name="id" value={g.id} />
                          <input type="hidden" name="stageId" value={stage.id} />
                          <Field label="الاسم" htmlFor={`gn-${g.id}`}>
                            <Input id={`gn-${g.id}`} name="name" defaultValue={g.name} />
                          </Field>
                          <Field label="الرابط" htmlFor={`gs-${g.id}`}>
                            <Input id={`gs-${g.id}`} name="slug" defaultValue={g.slug} dir="ltr" className="text-start" />
                          </Field>
                          <Field label="رقم الصف (1-12)" htmlFor={`gl-${g.id}`}>
                            <Input id={`gl-${g.id}`} name="level" type="number" min={1} max={12} defaultValue={g.level} className="num" />
                          </Field>
                          <Field label="الفصل الدراسي الحالي" htmlFor={`gt-${g.id}`}>
                            <Select id={`gt-${g.id}`} name="currentTerm" defaultValue={String(g.current_term)}>
                              <option value="1">الفصل الأول</option>
                              <option value="2">الفصل الثاني</option>
                            </Select>
                          </Field>
                          <Field label="الترتيب" htmlFor={`go-${g.id}`}>
                            <Input id={`go-${g.id}`} name="sortOrder" type="number" defaultValue={g.sort_order} className="num" />
                          </Field>
                          <div className="flex items-end">
                            <Checkbox name="isPublished" defaultChecked={g.is_published} label="ظاهر للطلاب" />
                          </div>
                          <div className="sm:col-span-3">
                            <SubmitButton size="sm">حفظ الصف</SubmitButton>
                          </div>
                        </ActionForm>
                      </details>
                    </div>
                  </div>
                </article>
              ))}
              {stage.grades.length === 0 ? <p className="rounded-[1.25rem] border-2 border-dashed border-line-strong bg-canvas p-5 text-sm text-muted">لا توجد صفوف في هذه المرحلة.</p> : null}
            </div>
          );
          return (
            <section key={stage.id} aria-labelledby={`st-${stage.id}`} className="overflow-hidden rounded-[1.9rem] border border-[rgb(23_32_38/0.06)] bg-surface shadow-card">
            <div className="relative isolate flex flex-wrap items-center gap-3 bg-[linear-gradient(160deg,#DEF8EE,#fff_75%)] p-4 sm:p-6">
              <span className="pointer-events-none absolute -end-14 -top-20 -z-10 size-48 rounded-full border-[18px] border-white/70" aria-hidden />
              <ToneIcon tone="green" size="lg" className="max-sm:size-12">
                <Layers />
              </ToneIcon>
              <div className="min-w-[12rem] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={`st-${stage.id}`} className="font-display text-[1.5rem] leading-tight font-black text-ink">
                    {stage.name}
                  </h2>
                  {stage.is_published ? <StatusPill tone="success">ظاهرة</StatusPill> : <StatusPill tone="neutral">مخفية</StatusPill>}
                  <span className="chip chip-white">{count(stage.grades.length, W.grade)}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink-soft">{stage.description || "بدون وصف"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <PublishToggle kind="stage" id={stage.id} published={stage.is_published} />
                <ConfirmButton
                  action={deleteCatalogAction}
                  hidden={{ kind: "stage", id: stage.id }}
                  label="حذف"
                  icon={<Trash2 aria-hidden />}
                  variant="ghost"
                  title={`حذف «${stage.name}»؟`}
                  description="يمكن حذف المرحلة فقط إذا لم تحتوِ صفوفًا."
                  confirmLabel="حذف"
                />
              </div>
            </div>

            <details className="group border-y border-dashed border-line px-4 py-3 sm:px-6">
              <summary className={SUMMARY_PILL}>
                <Pencil aria-hidden /> تعديل بيانات المرحلة
                <ChevronDown className="transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
              </summary>
              <ActionForm action={saveStageAction} className="mt-4 grid gap-3 rounded-[1.25rem] bg-canvas p-4 sm:grid-cols-4">
                <input type="hidden" name="id" value={stage.id} />
                <Field label="الاسم" htmlFor={`sn-${stage.id}`} className="sm:col-span-2">
                  <Input id={`sn-${stage.id}`} name="name" defaultValue={stage.name} />
                </Field>
                <Field label="الرابط" htmlFor={`ss-${stage.id}`}>
                  <Input id={`ss-${stage.id}`} name="slug" defaultValue={stage.slug} dir="ltr" className="text-start" />
                </Field>
                <Field label="الترتيب" htmlFor={`so-${stage.id}`}>
                  <Input id={`so-${stage.id}`} name="sortOrder" type="number" defaultValue={stage.sort_order} className="num" />
                </Field>
                <Field label="الوصف" htmlFor={`sd-${stage.id}`} className="sm:col-span-4">
                  <Textarea id={`sd-${stage.id}`} name="description" defaultValue={stage.description} rows={2} />
                </Field>
                <Checkbox name="isPublished" defaultChecked={stage.is_published} label="ظاهرة للطلاب" />
                <div className="sm:col-span-4">
                  <SubmitButton size="sm">حفظ</SubmitButton>
                </div>
              </ActionForm>
            </details>

            {dormant ? (
              <DormantGrades n={stage.grades.length}>{gradeList}</DormantGrades>
            ) : (
              gradeList
            )}

            <details className="group border-t border-dashed border-line bg-canvas/60 px-4 py-4 sm:px-6">
              <summary className={SUMMARY_PILL}>
                <Plus aria-hidden /> إضافة صف إلى {stage.name}
              </summary>
              <ActionForm action={saveGradeAction} resetOnSuccess className="mt-3 grid max-w-3xl gap-3 rounded-[1.25rem] bg-surface p-4 sm:grid-cols-3">
                <input type="hidden" name="stageId" value={stage.id} />
                <Field label="الاسم" htmlFor={`ng-${stage.id}`} required>
                  <Input id={`ng-${stage.id}`} name="name" placeholder="الصف السادس" />
                </Field>
                <Field label="الرابط" htmlFor={`ngs-${stage.id}`} required>
                  <Input id={`ngs-${stage.id}`} name="slug" dir="ltr" className="text-start" placeholder="grade-6" />
                </Field>
                <Field label="رقم الصف (1-12)" htmlFor={`ngl-${stage.id}`} required>
                  <Input id={`ngl-${stage.id}`} name="level" type="number" min={1} max={12} className="num" />
                </Field>
                <Field label="الفصل الحالي" htmlFor={`ngt-${stage.id}`}>
                  <Select id={`ngt-${stage.id}`} name="currentTerm" defaultValue="1">
                    <option value="1">الفصل الأول</option>
                    <option value="2">الفصل الثاني</option>
                  </Select>
                </Field>
                <Field label="الترتيب" htmlFor={`ngo-${stage.id}`}>
                  <Input id={`ngo-${stage.id}`} name="sortOrder" type="number" defaultValue={stage.grades.length + 1} className="num" />
                </Field>
                <div className="flex items-end">
                  <Checkbox name="isPublished" defaultChecked label="ظاهر" />
                </div>
                <div className="sm:col-span-3">
                  <SubmitButton size="sm">إضافة الصف</SubmitButton>
                </div>
              </ActionForm>
            </details>
          </section>
          );
        })}
      </div>

      <section
        aria-labelledby="new-stage-h"
        className="relative isolate overflow-hidden rounded-[1.75rem] border-2 border-dashed border-[#9FE5C9] bg-[linear-gradient(160deg,#fff,#EFFBF5)] p-4 sm:p-6"
      >
        <h2 id="new-stage-h" className="mb-4 flex items-center gap-3 font-display text-[1.25rem] font-black text-ink">
          <ToneIcon tone="green" size="sm">
            <Plus />
          </ToneIcon>
          إضافة مرحلة دراسية
        </h2>
        <ActionForm action={saveStageAction} resetOnSuccess className="grid max-w-3xl gap-3 sm:grid-cols-4">
          <Field label="الاسم" htmlFor="new-stage-name" className="sm:col-span-2" required>
            <Input id="new-stage-name" name="name" placeholder="المرحلة الثانوية" />
          </Field>
          <Field label="الرابط" htmlFor="new-stage-slug" required>
            <Input id="new-stage-slug" name="slug" dir="ltr" className="text-start" placeholder="secondary" />
          </Field>
          <Field label="الترتيب" htmlFor="new-stage-sort">
            <Input id="new-stage-sort" name="sortOrder" type="number" defaultValue={tree.length + 1} className="num" />
          </Field>
          <Field label="الوصف" htmlFor="new-stage-desc" className="sm:col-span-4">
            <Input id="new-stage-desc" name="description" placeholder="الصفوف من العاشر إلى الثاني عشر" />
          </Field>
          <Checkbox name="isPublished" label="ظاهرة للطلاب" />
          <div className="sm:col-span-4">
            <SubmitButton size="sm">إضافة المرحلة</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
