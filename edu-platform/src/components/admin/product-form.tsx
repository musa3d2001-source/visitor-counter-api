"use client";

import { useActionState, useMemo, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
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
  isDownloadable: boolean;
  isFeatured: boolean;
  previewPages: string;
  sortOrder: string;
  slug: string;
};

/**
 * نموذج المنتج (إضافة/تعديل) بخطوات مرقمة واضحة:
 * الصف ← المادة ← نوع المذكرة ← العنوان والسعر ← الوصف ← خيارات العرض
 */
export function ProductForm({
  action,
  grades,
  subjects,
  defaults,
  submitLabel,
  mode,
}: {
  action: ServerAction;
  grades: { id: string; name: string; stage_name: string; is_published: boolean }[];
  subjects: { id: string; name: string; grade_id: string; is_published: boolean }[];
  defaults: ProductFormDefaults;
  submitLabel: string;
  mode: "create" | "edit";
}) {
  const [state, formAction] = useActionState(action, null);
  const v = { ...defaults, ...(state?.values ?? {}) } as ProductFormDefaults;
  const [gradeId, setGradeId] = useState(v.gradeId);
  const [subjectId, setSubjectId] = useState(v.subjectId);
  const [type, setType] = useState<ProductType>(v.type);
  const gradeSubjects = useMemo(() => subjects.filter((s) => s.grade_id === gradeId), [subjects, gradeId]);
  const fe = state?.fieldErrors ?? {};
  const isPdf = type !== "bundle" && type !== "video_course";
  const subjectRequired = isPdf;
  const typeLocked = mode === "edit" && defaults.type === "bundle";

  const stageGroups = useMemo(() => {
    const m = new Map<string, typeof grades>();
    for (const g of grades) m.set(g.stage_name, [...(m.get(g.stage_name) ?? []), g]);
    return [...m.entries()];
  }, [grades]);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Step n={1} title="أين يظهر المنتج؟">
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
          <Field label="المادة" htmlFor="subjectId" error={fe.subjectId} required={subjectRequired} hint={subjectRequired ? undefined : "اختياري للباقات ودروس الفيديو"}>
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
              {PRODUCT_TYPES.filter((t) => (mode === "edit" && defaults.type !== "bundle" ? t !== "bundle" : true)).map((t) => (
                <option key={t} value={t}>
                  {PRODUCT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Step>

      <Step n={2} title="العنوان والسعر">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان المنتج" htmlFor="title" error={fe.title} required className="sm:col-span-2">
            <Input id="title" name="title" defaultValue={v.title} maxLength={160} required aria-invalid={Boolean(fe.title)} placeholder="مثال: المذكرة النهائية — الرياضيات — الفصل الأول" />
          </Field>
          <Field label="السعر (د.ك)" htmlFor="price" error={fe.price} required hint="بالدينار الكويتي — مثال: 2.500 (ضع 0 للمجاني)">
            <Input id="price" name="price" defaultValue={v.price} inputMode="decimal" dir="ltr" className="num text-start" required aria-invalid={Boolean(fe.price)} />
          </Field>
          <Field label="السعر السابق (اختياري)" htmlFor="compareAtPrice" error={fe.compareAtPrice} hint="فقط عند وجود عرض حقيقي — يجب أن يكون أكبر من السعر">
            <Input id="compareAtPrice" name="compareAtPrice" defaultValue={v.compareAtPrice} inputMode="decimal" dir="ltr" className="num text-start" aria-invalid={Boolean(fe.compareAtPrice)} />
          </Field>
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
          <Field label="محتويات المذكرة" htmlFor="contents" error={fe.contents} hint="كل بند في سطر مستقل — تظهر كقائمة في صفحة المنتج">
            <Textarea id="contents" name="contents" defaultValue={v.contents} rows={4} maxLength={5000} />
          </Field>
        </div>
      </Step>

      <Step n={4} title="خيارات العرض والحماية">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="صفحات المعاينة المجانية" htmlFor="previewPages" error={fe.previewPages} hint={isPdf ? "تُستخرج تلقائيًا من أول ملف (0 = بدون معاينة)" : "لا تنطبق على هذا النوع"}>
            <Input id="previewPages" name="previewPages" type="number" min={0} max={30} defaultValue={v.previewPages} className="num" />
          </Field>
          <Field label="ترتيب العرض" htmlFor="sortOrder" error={fe.sortOrder} hint="الأصغر يظهر أولًا">
            <Input id="sortOrder" name="sortOrder" type="number" defaultValue={v.sortOrder} className="num" />
          </Field>
          <Field label="رابط المنتج (slug)" htmlFor="slug" error={fe.slug} hint={mode === "create" ? "اتركه فارغًا ليُنشأ تلقائيًا" : "تغييره يغيّر رابط الصفحة"}>
            <Input id="slug" name="slug" defaultValue={v.slug} dir="ltr" className="text-start" placeholder="g6-math-final-notes-xxxxx" />
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:gap-8">
          <Checkbox name="isDownloadable" defaultChecked={v.isDownloadable} label="يسمح بتنزيل الملف (وإلا: للقراءة داخل المنصة فقط)" />
          <Checkbox name="isFeatured" defaultChecked={v.isFeatured} label="منتج مميز (يظهر أولًا في العروض)" />
        </div>
      </Step>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <SubmitButton pendingText="جارٍ الحفظ…">{submitLabel}</SubmitButton>
      </div>
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
