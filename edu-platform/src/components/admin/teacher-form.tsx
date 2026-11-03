"use client";

import { useMemo } from "react";
import { BookOpen, Eye, IdCard, Link2, Upload } from "lucide-react";
import type * as React from "react";
import { usePreservingAction } from "./use-preserving-action";
import { ToneIcon } from "./icon-tile";
import type { AdminTone } from "./tones";
import type { ActionState } from "@/lib/action-state";
import { SubjectIcon } from "@/components/art";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { gradeVars, subjectVars } from "@/lib/design";
import { cn } from "@/lib/utils";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export type TeacherFormDefaults = {
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  isPublished: boolean;
  canUpload: boolean;
  revenueShare: string;
  sortOrder: string;
  subjectIds: string[];
};

/** مفتاح المادة من اسمها العربي (لتلوين كبسولة المادة فقط) */
function slugOf(name: string): string | null {
  if (/عرب/u.test(name)) return "arabic";
  if (/إنجليز|انجليز|English/iu.test(name)) return "english";
  if (/رياض/u.test(name)) return "math";
  if (/علوم/u.test(name)) return "science";
  if (/إسلام|اسلام/u.test(name)) return "islamic";
  if (/اجتماع/u.test(name)) return "social";
  return null;
}

/** مجموعة حقول بعنوان وأيقونة ملوّنة */
function Group({ icon, tone, title, children, className }: { icon: React.ReactNode; tone: AdminTone; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[1.5rem] border border-line bg-[linear-gradient(180deg,#fffdf9,#fff8ee)] p-4 sm:p-5", className)}>
      <h3 className="mb-4 flex items-center gap-2.5 font-display text-[1.05rem] font-black text-ink">
        <ToneIcon tone={tone} size="xs">
          {icon}
        </ToneIcon>
        {title}
      </h3>
      {children}
    </div>
  );
}

/** مربع اختيار على شكل بطاقة: التسمية كما هي (لإمكانية الوصول والاختبارات)، والشرح خارجها */
function ToggleTile({ name, defaultChecked, label, hint, icon }: { name: string; defaultChecked: boolean; label: string; hint: string; icon: React.ReactNode }) {
  const hintId = `${name}-hint`;
  return (
    <div className="rounded-[1.2rem] border-2 border-line bg-surface p-3 transition-colors has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/70">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 font-display font-extrabold text-ink">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} aria-describedby={hintId} className="size-5 shrink-0 cursor-pointer rounded-md accent-[var(--brand)]" />
        <span className="min-w-0 flex-1">{label}</span>
        <span className="text-brand-600 [&_svg]:size-5" aria-hidden>
          {icon}
        </span>
      </label>
      <p id={hintId} className="ps-8 text-[0.8rem] leading-6 text-muted">
        {hint}
      </p>
    </div>
  );
}

/** نموذج ملف المعلم (للمالك): البيانات العامة، المواد، الصلاحيات، نسبة الأرباح */
export function TeacherForm({
  action,
  defaults,
  subjects,
  submitLabel,
}: {
  action: ServerAction;
  defaults: TeacherFormDefaults;
  subjects: { id: string; name: string; grade_name: string; grade_level: number }[];
  submitLabel: string;
}) {
  const { state, formAction, formRef } = usePreservingAction(action);
  const fe = state?.fieldErrors ?? {};
  const v = state?.values;
  const val = (k: keyof TeacherFormDefaults) => (v && k in v ? v[k] : (defaults[k] as string));
  const chosen = new Set(defaults.subjectIds);
  const byGrade = useMemo(() => {
    const m = new Map<string, typeof subjects>();
    for (const s of subjects) m.set(s.grade_name, [...(m.get(s.grade_name) ?? []), s]);
    return [...m.entries()];
  }, [subjects]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <Group icon={<IdCard />} tone="pink" title="البيانات العامة">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المعلم كما يظهر للطلاب" htmlFor="displayName" error={fe.displayName} required>
            <Input id="displayName" name="displayName" defaultValue={val("displayName")} maxLength={80} placeholder="أ. أحمد الكندري" />
          </Field>
          <Field label="العنوان التعريفي" htmlFor="headline" error={fe.headline} hint="سطر قصير يظهر تحت الاسم">
            <Input id="headline" name="headline" defaultValue={val("headline")} maxLength={140} placeholder="معلم فيزياء، خبرة 12 سنة" />
          </Field>
          <Field label="نبذة عن المعلم" htmlFor="bio" error={fe.bio} className="sm:col-span-2">
            <Textarea id="bio" name="bio" defaultValue={val("bio")} rows={4} maxLength={3000} />
          </Field>
        </div>
      </Group>

      <Group icon={<Link2 />} tone="sky" title="الرابط والترتيب والأرباح">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="رابط الصفحة (slug)" htmlFor="slug" error={fe.slug} hint="أحرف إنجليزية، اتركه فارغًا ليُنشأ تلقائيًا">
            <Input id="slug" name="slug" defaultValue={val("slug")} dir="ltr" className="text-start" placeholder="ahmad-alkandari" />
          </Field>
          <Field label="حصة المعلم (%)" htmlFor="revenueShare" error={fe.revenueShare} hint="من صافي المبيعات. اتركها فارغة إن لم يُفعّل نظام الأرباح لهذا المعلم">
            <Input id="revenueShare" name="revenueShare" defaultValue={val("revenueShare")} inputMode="decimal" dir="ltr" className="num text-start" placeholder="40" />
          </Field>
          <Field label="ترتيب العرض" htmlFor="sortOrder" error={fe.sortOrder} hint="الأصغر يظهر أولًا">
            <Input id="sortOrder" name="sortOrder" type="number" defaultValue={val("sortOrder")} className="num" />
          </Field>
        </div>
      </Group>

      <Group icon={<Eye />} tone="green" title="الظهور والصلاحيات">
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleTile name="isPublished" defaultChecked={defaults.isPublished} label="إظهار صفحة المعلم للطلاب" hint="تظهر صفحته في قائمة المعلمين وعلى محتواه المنشور." icon={<Eye />} />
          <ToggleTile name="canUpload" defaultChecked={defaults.canUpload} label="يسمح للمعلم برفع المحتوى (لحسابات المعلمين)" hint="يرفع مسوداته ويرسلها للمراجعة قبل النشر." icon={<Upload />} />
        </div>
      </Group>

      <fieldset className="rounded-[1.5rem] border border-line bg-[linear-gradient(180deg,#fffdf9,#fff8ee)] p-4 sm:p-5">
        <legend className="sr-only">المواد التي يدرّسها</legend>
        <p className="mb-4 flex items-center gap-2.5 font-display text-[1.05rem] font-black text-ink" aria-hidden>
          <ToneIcon tone="violet" size="xs">
            <BookOpen />
          </ToneIcon>
          المواد التي يدرّسها
        </p>
        {byGrade.length === 0 ? (
          <p className="text-sm text-muted">لا توجد مواد بعد.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {byGrade.map(([grade, list]) => (
              <div key={grade} role="group" aria-label={grade} className="@container overflow-hidden rounded-[1.2rem] border border-line bg-surface" style={gradeVars(list[0]?.grade_level)}>
                <p className="relative bg-linear-to-l from-[var(--a)] via-[var(--m,var(--b))] to-[var(--b)] px-3.5 py-2 font-display text-[0.92rem] font-black text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.25)]">
                  {grade}
                </p>
                <div className="grid grid-cols-1 gap-1.5 p-2.5 @[21rem]:grid-cols-2">
                  {list.map((s) => {
                    const slug = slugOf(s.name);
                    return (
                      <label
                        key={s.id}
                        style={subjectVars(slug)}
                        className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border-2 border-transparent px-2.5 text-[0.9rem] font-bold text-ink-soft transition-colors hover:bg-[var(--soft)] has-[:checked]:border-[color-mix(in_oklab,var(--b)_45%,white)] has-[:checked]:bg-[var(--soft)] has-[:checked]:text-[var(--tink)]"
                      >
                        <input type="checkbox" name={`s:${s.id}`} defaultChecked={chosen.has(s.id)} className="size-5 shrink-0 cursor-pointer rounded-md accent-[var(--b)]" />
                        <SubjectIcon slug={slug ?? undefined} name={s.name} size={16} className="shrink-0 text-[var(--b)]" />
                        <span className="min-w-0 truncate">{s.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <SubmitButton size="lg" pendingText="جارٍ الحفظ…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
