"use client";

import { usePreservingAction } from "./use-preserving-action";
import { useId, useMemo, useState } from "react";
import { BookOpen, CalendarClock, FileText, Layers, MapPin, PlayCircle, Save, ShieldCheck, Tag } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { ACCESS_MODE_LABELS, PRODUCT_TYPES, PRODUCT_TYPE_LABELS, VIDEO_PRODUCT_TYPES, isPdfType, isVideoType, type ProductType } from "@/lib/labels";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { SubjectArt } from "@/components/art";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { ar, gradeClass, toneClass } from "@/lib/design";
import { PREVIEW_POLICY, PREVIEW_RULE_TEXT } from "@/lib/preview-policy";
import { toneStyle, type AdminTone } from "./tones";

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
  isFree: boolean;
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
  {
    label: "فيديو",
    // شرح الوحدة أولًا لأنه الأكثر استخدامًا، والبقية من القائمة المعتمدة حتى يظهر أي نوع جديد
    types: ["unit", ...VIDEO_PRODUCT_TYPES.filter((t) => t !== "unit")],
  },
  {
    label: "مذكرات PDF",
    types: ["final_notes", "review_notes", "exam_night", "exam_model", "answer_key"],
  },
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
  videoHostingClosed = false,
  headingLevel = 2,
}: {
  action: ServerAction;
  grades: {
    id: string;
    name: string;
    stage_name: string;
    is_published: boolean;
    level?: number;
  }[];
  subjects: {
    id: string;
    name: string;
    grade_id: string;
    is_published: boolean;
  }[];
  teachers?: { id: string; display_name: string }[];
  defaults: ProductFormDefaults;
  submitLabel: string;
  mode: "create" | "edit";
  role: "owner" | "teacher";
  readOnly?: boolean;
  /** لا يوجد مزود فيديو آمن على هذا النشر: محتوى الفيديو لا يصل إلى النشر */
  videoHostingClosed?: boolean;
  /** مستوى عناوين الخطوات: 2 في صفحة الإضافة، 3 داخل لوح «بيانات المحتوى» في صفحة التعديل */
  headingLevel?: 2 | 3;
}) {
  const { state, formAction, formRef } = usePreservingAction(action);
  const v = { ...defaults, ...(state?.values ?? {}) } as ProductFormDefaults;
  const [gradeId, setGradeId] = useState(v.gradeId);
  const [subjectId, setSubjectId] = useState(v.subjectId);
  const [type, setType] = useState<ProductType>(v.type);
  const [accessMode, setAccessMode] = useState(v.accessMode || "unlimited");
  const [isFree, setIsFree] = useState(Boolean(v.isFree));
  const gradeSubjects = useMemo(() => subjects.filter((s) => s.grade_id === gradeId), [subjects, gradeId]);
  const fe = state?.fieldErrors ?? {};
  const isPdf = isPdfType(type);
  const isVideo = isVideoType(type);
  const subjectRequired = type !== "bundle" && type !== "video_course";
  const typeLocked = mode === "edit" && defaults.type === "bundle";
  const owner = role === "owner";
  const nested = headingLevel === 3;
  const grade = grades.find((g) => g.id === gradeId);
  const subjectName = gradeSubjects.find((x) => x.id === subjectId)?.name ?? null;

  const stageGroups = useMemo(() => {
    const m = new Map<string, typeof grades>();
    for (const g of grades) m.set(g.stage_name, [...(m.get(g.stage_name) ?? []), g]);
    return [...m.entries()];
  }, [grades]);

  return (
    <form ref={formRef} action={formAction} className="space-y-6" noValidate>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <fieldset disabled={readOnly} className={cn("disabled:opacity-80", nested ? "space-y-4" : "space-y-5")}>
        <Step n={1} title="أين يظهر المحتوى؟" tone="teal" icon={<MapPin />} nested={nested} headingLevel={headingLevel}>
          <div className="flex gap-5">
            <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-3">
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
                    <optgroup key={g.label} label={videoHostingClosed && g.label === "فيديو" ? "فيديو (لا يمكن نشره حاليًا)" : g.label}>
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
              {videoHostingClosed && isVideo ? (
                <Alert tone="warning" className="sm:col-span-3" data-testid="video-hosting-closed">
                  استضافة الفيديو غير مفعّلة على المنصة بعد، فلا يمكن نشر هذا النوع من المحتوى ولا رفع دروسه الآن. اختر نوعًا من مذكرات PDF.
                </Alert>
              ) : null}
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
            {nested ? null : <LivePreview type={type} gradeName={grade?.name ?? null} gradeLevel={grade?.level ?? null} subjectName={subjectName} />}
          </div>
        </Step>

        <Step n={2} title={owner ? "العنوان والسعر" : "العنوان والسعر المقترح"} tone="gold" icon={<Tag />} nested={nested} headingLevel={headingLevel}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="العنوان" htmlFor="title" error={fe.title} required className="sm:col-span-2">
              <Input
                id="title"
                name="title"
                defaultValue={v.title}
                maxLength={160}
                required
                aria-invalid={Boolean(fe.title)}
                placeholder={isVideo ? "مثال: شرح الوحدة الأولى، الحركة والقوة" : "مثال: المذكرة النهائية، الرياضيات، الفصل الأول"}
              />
            </Field>
            {owner ? (
              <>
                <Field
                  label="السعر المعتمد (د.ك)"
                  htmlFor="price"
                  error={fe.price}
                  required
                  hint={v.proposedPrice ? `السعر المقترح من المعلم: ${v.proposedPrice} د.ك` : "بالدينار الكويتي، مثال: 2.500"}
                >
                  <Input id="price" name="price" defaultValue={v.price} inputMode="decimal" dir="ltr" className="num text-start" required={!isFree} disabled={isFree} aria-invalid={Boolean(fe.price)} />
                </Field>
                <Field label="السعر السابق (اختياري)" htmlFor="compareAtPrice" error={fe.compareAtPrice} hint="فقط عند وجود عرض حقيقي، يجب أن يكون أكبر من السعر">
                  <Input id="compareAtPrice" name="compareAtPrice" defaultValue={v.compareAtPrice} inputMode="decimal" dir="ltr" className="num text-start" disabled={isFree} aria-invalid={Boolean(fe.compareAtPrice)} />
                </Field>
                <Checkbox name="isFree" label="منتج مجاني (بدون سعر)" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="min-h-11 sm:col-span-2" />
                <input type="hidden" name="proposedPrice" value={v.proposedPrice} />
              </>
            ) : (
              <Field label="السعر المقترح (د.ك)" htmlFor="proposedPrice" error={fe.proposedPrice} hint="اقتراح فقط، السعر النهائي تحدده إدارة المنصة عند الاعتماد" className="sm:col-span-2">
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

        <Step n={3} title="الوصف والمحتويات" tone="coral" icon={<BookOpen />} nested={nested} headingLevel={headingLevel}>
          <div className="grid gap-4">
            <Field label="وصف مختصر (يظهر في البطاقة)" htmlFor="summary" error={fe.summary}>
              <Input id="summary" name="summary" defaultValue={v.summary} maxLength={300} />
            </Field>
            <Field label="الوصف التفصيلي" htmlFor="description" error={fe.description}>
              <Textarea id="description" name="description" defaultValue={v.description} rows={4} maxLength={5000} />
            </Field>
            <Field label={isVideo ? "ماذا سيتعلم الطالب؟" : "محتويات المذكرة"} htmlFor="contents" error={fe.contents} hint="كل بند في سطر مستقل، تظهر كقائمة في صفحة المنتج">
              <Textarea id="contents" name="contents" defaultValue={v.contents} rows={4} maxLength={5000} />
            </Field>
          </div>
        </Step>

        <Step n={4} title={owner ? "الإتاحة والعرض والحماية" : "المعاينة"} tone="violet" icon={owner ? <ShieldCheck /> : <FileText />} nested={nested} headingLevel={headingLevel}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="صفحات المعاينة المجانية"
              htmlFor="previewPages"
              error={fe.previewPages}
              hint={isPdf ? `تُستخرج تلقائيًا من أول ملف (0 = بدون معاينة). ${PREVIEW_RULE_TEXT}` : "للمذكرات فقط، في الفيديو حدّد «درس مجاني» من قائمة الدروس"}
            >
              <Input id="previewPages" name="previewPages" type="number" min={0} max={PREVIEW_POLICY.maxPages} defaultValue={Math.min(Number(v.previewPages) || 0, PREVIEW_POLICY.maxPages)} className="num" />
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
              <div className="mt-5 grid gap-4 rounded-[1.25rem] border-2 border-dashed border-[#D9CCFF] bg-[#F7F3FF] p-4 sm:grid-cols-3">
                <p className="flex items-center gap-2 font-display text-[0.95rem] font-extrabold text-[#4A2FB0] sm:col-span-3">
                  <CalendarClock className="size-4.5" aria-hidden /> فترة الوصول بعد الشراء
                </p>
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
                <p className="text-xs leading-6 text-muted sm:col-span-3">تُطبّق الفترة على المشتريات الجديدة فقط، صلاحيات المشترين السابقين لا تتغير.</p>
              </div>
              <div className="mt-4 flex flex-col gap-1 rounded-[1.25rem] bg-surface px-4 py-2 ring-1 ring-line sm:flex-row sm:flex-wrap sm:gap-x-8">
                {isPdf || type === "bundle" ? <Checkbox name="isDownloadable" defaultChecked={v.isDownloadable} label="يسمح بتنزيل ملفات PDF (وإلا: للقراءة داخل المنصة فقط)" /> : null}
                <Checkbox name="isFeatured" defaultChecked={v.isFeatured} label="منتج مميز (يظهر أولًا في العروض)" />
              </div>
            </>
          ) : null}
        </Step>
      </fieldset>

      {readOnly ? null : (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-white bg-white/95 p-3 shadow-dock backdrop-blur sm:static sm:bg-[linear-gradient(160deg,#fff,var(--color-brand-50))] sm:p-4">
          <p className="hidden items-center gap-2 text-[0.88rem] text-ink-soft sm:flex">
            <Save className="size-4 text-brand-700" aria-hidden />
            {mode === "create" ? "تُحفظ كمسودة، ثم تنتقل لرفع الملفات." : "التعديلات تظهر للطلاب فور الحفظ إذا كان المحتوى منشورًا."}
          </p>
          <SubmitButton pendingText="جارٍ الحفظ…" size="lg" className="max-sm:w-full">
            {submitLabel}
          </SubmitButton>
        </div>
      )}
    </form>
  );
}

const STEP_SURFACE = {
  top: "rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface p-4 shadow-card sm:p-6",
  nested: "rounded-[1.5rem] border border-line bg-[linear-gradient(170deg,#fffdf8,var(--color-canvas))] p-4 sm:p-5",
};

function Step({
  n,
  title,
  tone,
  icon,
  nested,
  headingLevel,
  children,
}: {
  n: number;
  title: string;
  tone: AdminTone;
  icon: React.ReactNode;
  nested: boolean;
  headingLevel: 2 | 3;
  children: React.ReactNode;
}) {
  const id = useId();
  const H = headingLevel === 3 ? "h3" : "h2";
  return (
    <fieldset aria-labelledby={id} className={cn("relative min-w-0", nested ? STEP_SURFACE.nested : STEP_SURFACE.top)} style={toneStyle(tone)}>
      <div className="mb-5 flex items-center gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-[0.95rem] bg-linear-to-br from-[var(--a)] to-[var(--b)] font-display text-[1.4rem] leading-none font-black text-[var(--icon)] shadow-[inset_0_-3px_0_rgb(0_0_0/0.14),0_8px_14px_-8px_var(--d)]"
          aria-hidden
        >
          {ar(n)}
        </span>
        <H id={id} className="font-display text-[1.2rem] leading-snug font-black text-ink sm:text-[1.3rem]">
          <span className="sr-only">الخطوة {ar(n)}: </span>
          {title}
        </H>
        <span className="ms-auto hidden size-9 place-items-center rounded-full bg-[var(--soft)] text-[var(--tink)] sm:grid [&_svg]:size-4.5" aria-hidden>
          {icon}
        </span>
      </div>
      {children}
    </fieldset>
  );
}

/** معاينة حيّة لغلاف المحتوى: لون المادة ورسمها، النوع والصف كما سيظهران للطلاب تقريبًا */
function LivePreview({ type, gradeName, gradeLevel, subjectName }: { type: ProductType; gradeName: string | null; gradeLevel: number | null; subjectName: string | null }) {
  const slug = subjectSlugFromName(subjectName);
  const useGrade = !subjectName;
  const TypeIcon = isVideoType(type) ? PlayCircle : isPdfType(type) ? FileText : Layers;
  return (
    <div className="hidden w-40 shrink-0 lg:block" aria-hidden>
      <p className="mb-2 text-center font-display text-[0.75rem] font-bold text-muted">معاينة الغلاف</p>
      <div
        className={cn(
          "poster relative aspect-[4/5] rounded-[1.25rem] border-[3px] border-white shadow-[0_14px_24px_-14px_var(--d)] transition-colors",
          useGrade ? cn("poster-grade", gradeClass(gradeLevel)) : toneClass(slug),
        )}
      >
        <span className="chip chip-glass absolute start-2 top-2 z-10 max-w-[calc(100%-1rem)] truncate px-2 text-[0.68rem]">{PRODUCT_TYPE_LABELS[type]}</span>
        <span className="absolute inset-x-[16%] top-[20%] bottom-[30%] block">
          {useGrade ? (
            <span className="grid size-full place-items-center font-display text-[3.5rem] leading-none font-black text-white">{gradeLevel != null ? ar(gradeLevel) : "؟"}</span>
          ) : (
            <SubjectArt slug={slug} />
          )}
        </span>
        <span className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-1">
          <span className="min-w-0">
            <span className="block truncate font-display text-[0.9rem] leading-tight font-black text-white">{subjectName ?? (type === "bundle" ? "باقة" : "المادة")}</span>
            <span className="chip chip-white mt-0.5 min-h-5 max-w-full truncate px-1.5 text-[0.62rem]">{gradeName ?? "الصف"}</span>
          </span>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-[var(--b)]">
            <TypeIcon className="size-3.5" strokeWidth={2.6} />
          </span>
        </span>
      </div>
    </div>
  );
}
