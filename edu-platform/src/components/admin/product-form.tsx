"use client";

import { usePreservingAction } from "./use-preserving-action";
import { useMemo, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { ACCESS_MODE_LABELS, PRODUCT_TYPES, PRODUCT_TYPE_LABELS, isPdfType, isVideoType, type ProductType } from "@/lib/labels";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export type ProductFormDefaults = {
  type: ProductType;
  title: string;
  summary: string;
  description: string;
  contents: string;
  gradeId: string;
  subjectId: string;
  academicYear: string;
  term: string;
  price: string;
  compareAtPrice: string;
  proposedPrice: string;
  isDownloadable: boolean;
  isFeatured: boolean;
  previewPages: string;
  sortOrder: string;
  slug: string;
  teacherId: string;
  accessMode: string;
  accessUntil: string;
  accessDays: string;
};

/** أنواع المحتوى مرتبة: الفيديو أولًا ثم المذكرات ثم الباقة */
const TYPE_GROUPS: { label: string; types: ProductType[] }[] = [
  { label: "فيديو", types: ["unit", "video_lesson", "quiz_review", "exam_review", "video_course"] },
  { label: "مذكرات PDF", types: ["final_notes", "review_notes", "exam_night", "exam_model", "answer_key"] },
  { label: "تجميع", types: ["bundle"] },
];

/**
 * نموذج المنتج (إضافة/تعديل) بخطوات مرقمة واضحة — نفس النموذج للمالك والمعلم:
 *  - المعلم: المحتوى + السعر المقترح فقط
 *  - المالك: + السعر المعتمد، المعلم، فترة الإتاحة، الحماية والترتيب
 */
export function ProductForm({
  action,
  grades,
  subjects,
  teachers,
  defaults,
  submitLabel,
  mode,
  role,
  readOnly,
}: {
  action: ServerAction;
  grades: { id: string; name: string; stage_name: string; is_published: boolean }[];
  subjects: { id: string; name: string; grade_id: string; is_published: boolean }[];
  teachers?: { id: string; display_name: string }[];
  defaults: ProductFormDefaults;
  submitLabel: string;
  mode: "create" | "edit";
  role: "owner" | "teacher";
  readOnly?: boolean;
}) {
  const { state, formAction, formRef } = usePreservingAction(action);
  const v = { ...defaults, ...(state?.values ?? {}) } as ProductFormDefaults;
  const [gradeId, setGradeId] = useState(v.gradeId);
  const [subjectId, setSubjectId] = useState(v.subjectId);
  const [type, setType] = useState<ProductType>(v.type);
  const [accessMode, setAccessMode] = useState(v.accessMode || "unlimited");
  const gradeSubjects = useMemo(() => subjects.filter((s) => s.grade_id === gradeId), [subjects, gradeId]);
  const fe = state?.fieldErrors ?? {};
  const isPdf = isPdfType(type);
  const isVideo = isVideoType(type);
  const subjectRequired = type !== "bundle" && type !== "video_course";
  const typeLocked = mode === "edit" && defaults.type === "bundle";
  const owner = role === "owner";

  const stageGroups = useMemo(() => {
    const m = new Map<string, typeof grades>();
    for (const g of grades) m.set(g.stage_name, [...(m.get(g.stage_name) ?? []), g]);
    return [...m.entries()];
  }, [grades]);

  return (
    <form ref={formRef} action={formAction} className="space-y-6" noValidate>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <fieldset disabled={readOnly} className="space-y-6 disabled:opacity-80">
        <Step n={1} title="أين يظهر المحتوى؟">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="الصف" htmlFor="gradeId" error={fe.gradeId} required>
              <Select
                id="gradeId"
                name="gradeId"
                value={gradeId}
                onChange={(e) => {
                  setGradeId(e.target.value);
                  setSubjectId("");
                }}
                aria-invalid={Boolean(fe.gradeId)}
              >
                <option value="">اختر الصف</option>
                {stageGroups.map(([stage, gs]) => (
                  <optgroup key={stage} label={stage}>
                    {gs.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                        {g.is_published ? "" : " (مخفي)"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            <Field label="المادة" htmlFor="subjectId" error={fe.subjectId} required={subjectRequired} hint={subjectRequired ? undefined : "اختياري للباقات والدورات الشاملة"}>
              <Select id="subjectId" name="subjectId" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!gradeId} aria-invalid={Boolean(fe.subjectId)}>
                <option value="">{gradeId ? (subjectRequired ? "اختر المادة" : "كل المواد (باقة الصف)") : "اختر الصف أولًا"}</option>
                {gradeSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_published ? "" : " (مخفية)"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="نوع المحتوى" htmlFor="type" error={fe.type} required>
              {typeLocked ? <input type="hidden" name="type" value={type} /> : null}
              <Select id="type" name={typeLocked ? undefined : "type"} value={type} onChange={(e) => setType(e.target.value as ProductType)} disabled={typeLocked}>
                {TYPE_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.types
                      .filter((t) => PRODUCT_TYPES.includes(t))
                      .filter((t) => (mode === "edit" && defaults.type !== "bundle" ? t !== "bundle" : true))
                      .map((t) => (
                        <option key={t} value={t}>
                          {PRODUCT_TYPE_LABELS[t]}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
            {owner && teachers ? (
              <Field label="المعلم" htmlFor="teacherId" error={fe.teacherId} hint="اتركه «محتوى المنصة» إن لم يكن لمعلم محدد" className="sm:col-span-3">
                <Select id="teacherId" name="teacherId" defaultValue={v.teacherId}>
                  <option value="">محتوى المنصة (بدون معلم)</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.display_name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </Step>

        <Step n={2} title={owner ? "العنوان والسعر" : "العنوان والسعر المقترح"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="العنوان" htmlFor="title" error={fe.title} required className="sm:col-span-2">
              <Input
                id="title"
                name="title"
                defaultValue={v.title}
                maxLength={160}
                required
                aria-invalid={Boolean(fe.title)}
                placeholder={isVideo ? "مثال: شرح الوحدة الأولى — الحركة والقوة" : "مثال: المذكرة النهائية — الرياضيات — الفصل الأول"}
              />
            </Field>
            {owner ? (
              <>
                <Field label="السعر المعتمد (د.ك)" htmlFor="price" error={fe.price} required hint={v.proposedPrice ? `السعر المقترح من المعلم: ${v.proposedPrice} د.ك` : "بالدينار الكويتي — مثال: 2.500 (ضع 0 للمجاني)"}>
                  <Input id="price" name="price" defaultValue={v.price} inputMode="decimal" dir="ltr" className="num text-start" required aria-invalid={Boolean(fe.price)} />
                </Field>
                <Field label="السعر السابق (اختياري)" htmlFor="compareAtPrice" error={fe.compareAtPrice} hint="فقط عند وجود عرض حقيقي — يجب أن يكون أكبر من السعر">
                  <Input id="compareAtPrice" name="compareAtPrice" defaultValue={v.compareAtPrice} inputMode="decimal" dir="ltr" className="num text-start" aria-invalid={Boolean(fe.compareAtPrice)} />
                </Field>
                <input type="hidden" name="proposedPrice" value={v.proposedPrice} />
              </>
            ) : (
              <Field label="السعر المقترح (د.ك)" htmlFor="proposedPrice" error={fe.proposedPrice} hint="اقتراح فقط — السعر النهائي تحدده إدارة المنصة عند الاعتماد" className="sm:col-span-2">
                <Input id="proposedPrice" name="proposedPrice" defaultValue={v.proposedPrice} inputMode="decimal" dir="ltr" className="num text-start" aria-invalid={Boolean(fe.proposedPrice)} />
              </Field>
            )}
            <Field label="الفصل الدراسي" htmlFor="term" error={fe.term}>
              <Select id="term" name="term" defaultValue={v.term}>
                <option value="1">الفصل الدراسي الأول</option>
                <option value="2">الفصل الدراسي الثاني</option>
                <option value="">العام الدراسي كاملًا</option>
              </Select>
            </Field>
            <Field label="العام الدراسي" htmlFor="academicYear" error={fe.academicYear} required>
              <Input id="academicYear" name="academicYear" defaultValue={v.academicYear} dir="ltr" className="num text-start" placeholder="2026-2027" aria-invalid={Boolean(fe.academicYear)} />
            </Field>
          </div>
        </Step>

        <Step n={3} title="الوصف والمحتويات">
          <div className="grid gap-4">
            <Field label="وصف مختصر (يظهر في البطاقة)" htmlFor="summary" error={fe.summary}>
              <Input id="summary" name="summary" defaultValue={v.summary} maxLength={300} />
            </Field>
            <Field label="الوصف التفصيلي" htmlFor="description" error={fe.description}>
              <Textarea id="description" name="description" defaultValue={v.description} rows={4} maxLength={5000} />
            </Field>
            <Field label={isVideo ? "ماذا سيتعلم الطالب؟" : "محتويات المذكرة"} htmlFor="contents" error={fe.contents} hint="كل بند في سطر مستقل — تظهر كقائمة في صفحة المنتج">
              <Textarea id="contents" name="contents" defaultValue={v.contents} rows={4} maxLength={5000} />
            </Field>
          </div>
        </Step>

        <Step n={4} title={owner ? "الإتاحة والعرض والحماية" : "المعاينة"}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="صفحات المعاينة المجانية" htmlFor="previewPages" error={fe.previewPages} hint={isPdf ? "تُستخرج تلقائيًا من أول ملف (0 = بدون معاينة)" : "للمذكرات فقط — في الفيديو حدّد «درس مجاني» من قائمة الدروس"}>
              <Input id="previewPages" name="previewPages" type="number" min={0} max={30} defaultValue={v.previewPages} className="num" />
            </Field>
            {owner ? (
              <>
                <Field label="ترتيب العرض" htmlFor="sortOrder" error={fe.sortOrder} hint="الأصغر يظهر أولًا">
                  <Input id="sortOrder" name="sortOrder" type="number" defaultValue={v.sortOrder} className="num" />
                </Field>
                <Field label="رابط المنتج (slug)" htmlFor="slug" error={fe.slug} hint={mode === "create" ? "اتركه فارغًا ليُنشأ تلقائيًا" : "تغييره يغيّر رابط الصفحة"}>
                  <Input id="slug" name="slug" defaultValue={v.slug} dir="ltr" className="text-start" placeholder="g6-math-unit-xxxxx" />
                </Field>
              </>
            ) : null}
          </div>
          {owner ? (
            <>
              <div className="mt-5 grid gap-4 rounded-xl border border-line bg-canvas/60 p-4 sm:grid-cols-3">
                <Field label="فترة الإتاحة بعد الشراء" htmlFor="accessMode" error={fe.accessMode} className="sm:col-span-1">
                  <Select id="accessMode" name="accessMode" value={accessMode} onChange={(e) => setAccessMode(e.target.value)}>
                    {Object.entries(ACCESS_MODE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {accessMode === "until_date" ? (
                  <Field label="ينتهي الوصول في" htmlFor="accessUntil" error={fe.accessUntil} hint="مثل نهاية الفصل الدراسي (نهاية اليوم بتوقيت الكويت)">
                    <Input id="accessUntil" name="accessUntil" type="date" defaultValue={v.accessUntil} dir="ltr" className="num" />
                  </Field>
                ) : null}
                {accessMode === "days" ? (
                  <Field label="عدد الأيام من تاريخ الشراء" htmlFor="accessDays" error={fe.accessDays}>
                    <Input id="accessDays" name="accessDays" type="number" min={1} max={3650} defaultValue={v.accessDays} className="num" />
                  </Field>
                ) : null}
                <p className="text-xs leading-6 text-muted sm:col-span-3">تُطبّق الفترة على المشتريات الجديدة فقط — صلاحيات المشترين السابقين لا تتغير.</p>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-8">
                {isPdf || type === "bundle" ? <Checkbox name="isDownloadable" defaultChecked={v.isDownloadable} label="يسمح بتنزيل ملفات PDF (وإلا: للقراءة داخل المنصة فقط)" /> : null}
                <Checkbox name="isFeatured" defaultChecked={v.isFeatured} label="منتج مميز (يظهر أولًا في العروض)" />
              </div>
            </>
          ) : null}
        </Step>
      </fieldset>

      {readOnly ? null : (
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <SubmitButton pendingText="جارٍ الحفظ…">{submitLabel}</SubmitButton>
        </div>
      )}
    </form>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className={cn("rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6")}>
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-center gap-3" aria-hidden>
        <span className="num grid size-8 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {children}
    </fieldset>
  );
}
