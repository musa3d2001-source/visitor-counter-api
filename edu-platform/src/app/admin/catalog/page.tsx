import { Eye, EyeOff, Layers, Plus, Trash2 } from "lucide-react";
import { getCatalogTree } from "@/server/admin/catalog";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { SubjectIcon } from "@/components/site/subject-icon";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { SUBJECT_ICONS } from "@/lib/labels";
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
      <legend className="mb-1.5 text-sm font-semibold text-ink-soft">الأيقونة</legend>
      <div className="flex flex-wrap gap-1.5">
        {SUBJECT_ICONS.map((ic) => (
          <label key={ic} className="cursor-pointer" title={ICON_LABELS[ic]}>
            <input type="radio" name={name} value={ic} defaultChecked={ic === value} className="peer sr-only" />
            <span className="grid size-10 place-items-center rounded-xl border border-line text-ink-soft peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300">
              <SubjectIcon name={ic} className="size-5" />
              <span className="sr-only">{ICON_LABELS[ic]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default async function CatalogPage() {
  const tree = await getCatalogTree();

  return (
    <div>
      <AdminPageHeader
        title="المراحل والمواد"
        description="الهيكل الدراسي: المرحلة ← الصف ← المادة. العناصر المخفية والفارغة لا تظهر للطلاب."
      />

      {tree.length === 0 ? <EmptyState icon={<Layers />} title="لا توجد مراحل بعد" description="أضف أول مرحلة دراسية من النموذج أدناه." /> : null}

      <div className="space-y-6">
        {tree.map((stage) => (
          <section key={stage.id} className="rounded-2xl border border-line bg-surface shadow-card">
            <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{stage.name}</h2>
                  {stage.is_published ? <Badge tone="success">ظاهرة</Badge> : <Badge tone="neutral">مخفية</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-muted">{stage.description || "—"}</p>
              </div>
              <PublishToggle kind="stage" id={stage.id} published={stage.is_published} />
              <ConfirmButton action={deleteCatalogAction} hidden={{ kind: "stage", id: stage.id }} label="حذف" icon={<Trash2 aria-hidden />} variant="ghost" title={`حذف «${stage.name}»؟`} description="يمكن حذف المرحلة فقط إذا لم تحتوِ صفوفًا." confirmLabel="حذف" />
            </div>

            <details className="border-b border-line px-4 py-3 sm:px-5">
              <summary className="cursor-pointer text-sm font-semibold text-brand-700">تعديل بيانات المرحلة</summary>
              <ActionForm action={saveStageAction} className="mt-3 grid gap-3 sm:grid-cols-4">
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

            <div className="divide-y divide-line">
              {stage.grades.map((g) => (
                <div key={g.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{g.name}</h3>
                    {g.is_published ? <Badge tone="success">ظاهر</Badge> : <Badge tone="neutral">مخفي</Badge>}
                    <Badge tone="brand">الفصل الحالي: {g.current_term === 1 ? "الأول" : "الثاني"}</Badge>
                    <span className="text-xs text-muted">
                      <span className="num">{g.product_count}</span> منتج
                    </span>
                    <div className="ms-auto flex items-center gap-1">
                      <PublishToggle kind="grade" id={g.id} published={g.is_published} />
                      <ConfirmButton action={deleteCatalogAction} hidden={{ kind: "grade", id: g.id }} label="" icon={<Trash2 aria-hidden />} size="icon" variant="ghost" title={`حذف «${g.name}»؟`} description="يمكن الحذف فقط إذا لم يحتوِ الصف مواد أو منتجات. وإلا استخدم الإخفاء." confirmLabel="حذف" />
                    </div>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-2">
                    {g.subjects.map((s) => (
                      <li key={s.id}>
                        <details className="group relative">
                          <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden ${s.is_published ? "border-line bg-surface" : "border-dashed border-line-strong bg-canvas text-muted"}`}>
                            <SubjectIcon name={s.icon} className="size-4 text-brand-600" />
                            {s.name}
                            <span className="num text-xs font-normal text-muted">({s.product_count})</span>
                            {!s.is_published ? <EyeOff className="size-3.5" aria-label="مخفية" /> : null}
                          </summary>
                          <div className="absolute start-0 top-full z-20 mt-2 w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-4 shadow-lift">
                            <ActionForm action={saveSubjectAction} className="grid gap-3 sm:grid-cols-2">
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
                              <div className="flex items-end pb-2">
                                <Checkbox name="isPublished" defaultChecked={s.is_published} label="ظاهرة" />
                              </div>
                              <div className="sm:col-span-2">
                                <IconPicker name="icon" value={s.icon} />
                              </div>
                              <div className="sm:col-span-2">
                                <SubmitButton size="sm">حفظ المادة</SubmitButton>
                              </div>
                            </ActionForm>
                            <div className="mt-3 border-t border-line pt-3">
                              <ConfirmButton action={deleteCatalogAction} hidden={{ kind: "subject", id: s.id }} label="حذف المادة" icon={<Trash2 aria-hidden />} title={`حذف «${s.name}»؟`} description="يمكن الحذف فقط إذا لم تحتوِ المادة منتجات." confirmLabel="حذف" />
                            </div>
                          </div>
                        </details>
                      </li>
                    ))}
                    {g.subjects.length === 0 ? <li className="text-sm text-muted">لا توجد مواد بعد.</li> : null}
                  </ul>

                  <div className="mt-3 flex flex-wrap gap-4">
                    <details>
                      <summary className="flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand-700">
                        <Plus className="size-4" aria-hidden /> إضافة مادة
                      </summary>
                      <ActionForm action={saveSubjectAction} resetOnSuccess className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
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
                        <div className="flex items-end pb-2">
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
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-brand-700">تعديل بيانات الصف</summary>
                      <ActionForm action={saveGradeAction} className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-3">
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
                        <div className="flex items-end pb-2">
                          <Checkbox name="isPublished" defaultChecked={g.is_published} label="ظاهر للطلاب" />
                        </div>
                        <div className="sm:col-span-3">
                          <SubmitButton size="sm">حفظ الصف</SubmitButton>
                        </div>
                      </ActionForm>
                    </details>
                  </div>
                </div>
              ))}
              {stage.grades.length === 0 ? <p className="p-5 text-sm text-muted">لا توجد صفوف في هذه المرحلة.</p> : null}
            </div>

            <details className="border-t border-line px-4 py-3 sm:px-5">
              <summary className="flex cursor-pointer items-center gap-1 text-sm font-semibold text-brand-700">
                <Plus className="size-4" aria-hidden /> إضافة صف إلى {stage.name}
              </summary>
              <ActionForm action={saveGradeAction} resetOnSuccess className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-3">
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
                <div className="flex items-end pb-2">
                  <Checkbox name="isPublished" defaultChecked label="ظاهر" />
                </div>
                <div className="sm:col-span-3">
                  <SubmitButton size="sm">إضافة الصف</SubmitButton>
                </div>
              </ActionForm>
            </details>
          </section>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-dashed border-line-strong bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <Plus className="size-4" aria-hidden /> إضافة مرحلة دراسية
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
