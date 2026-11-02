"use client";

import { useMemo } from "react";
import { usePreservingAction } from "./use-preserving-action";
import type { ActionState } from "@/lib/action-state";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="اسم المعلم كما يظهر للطلاب" htmlFor="displayName" error={fe.displayName} required>
          <Input id="displayName" name="displayName" defaultValue={val("displayName")} maxLength={80} placeholder="أ. أحمد الكندري" />
        </Field>
        <Field label="العنوان التعريفي" htmlFor="headline" error={fe.headline} hint="سطر قصير يظهر تحت الاسم">
          <Input id="headline" name="headline" defaultValue={val("headline")} maxLength={140} placeholder="معلم فيزياء — خبرة 12 سنة" />
        </Field>
        <Field label="نبذة عن المعلم" htmlFor="bio" error={fe.bio} className="sm:col-span-2">
          <Textarea id="bio" name="bio" defaultValue={val("bio")} rows={4} maxLength={3000} />
        </Field>
        <Field label="رابط الصفحة (slug)" htmlFor="slug" error={fe.slug} hint="أحرف إنجليزية — اتركه فارغًا ليُنشأ تلقائيًا">
          <Input id="slug" name="slug" defaultValue={val("slug")} dir="ltr" className="text-start" placeholder="ahmad-alkandari" />
        </Field>
        <Field label="حصة المعلم من صافي المبيعات (%)" htmlFor="revenueShare" error={fe.revenueShare} hint="اتركها فارغة إن لم يُفعّل نظام الأرباح لهذا المعلم">
          <Input id="revenueShare" name="revenueShare" defaultValue={val("revenueShare")} inputMode="decimal" dir="ltr" className="num text-start" placeholder="40" />
        </Field>
        <Field label="ترتيب العرض" htmlFor="sortOrder" error={fe.sortOrder} hint="الأصغر يظهر أولًا">
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={val("sortOrder")} className="num" />
        </Field>
        <div className="flex flex-col justify-end gap-3 pb-1">
          <Checkbox name="isPublished" defaultChecked={defaults.isPublished} label="إظهار صفحة المعلم للطلاب" />
          <Checkbox name="canUpload" defaultChecked={defaults.canUpload} label="يسمح للمعلم برفع المحتوى (لحسابات المعلمين)" />
        </div>
      </div>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-bold">المواد التي يدرّسها</legend>
        {byGrade.length === 0 ? (
          <p className="text-sm text-muted">لا توجد مواد بعد.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {byGrade.map(([grade, list]) => (
              <div key={grade}>
                <p className="mb-2 text-xs font-bold text-muted">{grade}</p>
                <div className="space-y-1.5">
                  {list.map((s) => (
                    <Checkbox key={s.id} name={`s:${s.id}`} defaultChecked={chosen.has(s.id)} label={s.name} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <SubmitButton pendingText="جارٍ الحفظ…">{submitLabel}</SubmitButton>
    </form>
  );
}
