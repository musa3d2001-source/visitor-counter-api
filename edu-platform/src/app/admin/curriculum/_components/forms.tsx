"use client";

import { Plus, Save } from "lucide-react";
import type * as React from "react";
import type { ActionState } from "@/lib/action-state";
import { ActionForm } from "@/components/admin/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { createTextbookAction, saveLessonAction, saveUnitAction, updateTextbookAction } from "../actions";

/**
 * نماذج المنهج (عميل): تعرض أخطاء كل حقل تحت الحقل نفسه وتظلله، لأن الخادم يعيد «راجع الحقول المظللة» مع التفاصيل.
 */

/** خصائص الحقل عند الخطأ: إطار أحمر وربط رسالة الخطأ به */
function invalid(state: ActionState, key: string, id: string) {
  const err = state?.fieldErrors?.[key];
  return err ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
}

/** حقل رقمي يقبل الأرقام العربية والهندية (يحوّلها الخادم) */
function NumberInput(props: React.ComponentProps<typeof Input>) {
  return <Input type="text" inputMode="numeric" autoComplete="off" {...props} className={cn("num", props.className)} />;
}

const RIGHTS_LABEL = "أؤكد حق المنصة في الإشارة إلى هذا الكتاب ومراجعه";

// ---------------------------------------------------------------- إضافة كتاب
export type SubjectOption = { id: string; label: string; hidden: boolean };

export function TextbookCreateForm({ subjects }: { subjects: SubjectOption[] }) {
  return (
    <ActionForm action={createTextbookAction} className="grid gap-4">
      {(state) => (
        <>
          <Field label="المادة والصف" htmlFor="tb-subject" error={state?.fieldErrors?.subjectId} hint="المواد المخفية تظهر هنا أيضًا ليبدأ إدخال الأسئلة قبل إظهارها." required>
            <Select id="tb-subject" name="subjectId" defaultValue="" {...invalid(state, "subjectId", "tb-subject")}>
              <option value="">اختر المادة</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.hidden ? " (مخفي)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="الفصل الدراسي" htmlFor="tb-term" error={state?.fieldErrors?.term} required>
            <Select id="tb-term" name="term" defaultValue="1" {...invalid(state, "term", "tb-term")}>
              <option value="1">الفصل الأول</option>
              <option value="2">الفصل الثاني</option>
            </Select>
          </Field>
          <Field label="عنوان الكتاب" htmlFor="tb-title" error={state?.fieldErrors?.title} required>
            <Input id="tb-title" name="title" maxLength={160} placeholder="مثال: الرياضيات، الجزء الأول" {...invalid(state, "title", "tb-title")} />
          </Field>
          <Field label="الطبعة أو العام الدراسي" htmlFor="tb-edition" error={state?.fieldErrors?.edition} hint="الصفحات تتغير بين الطبعات، فلكل طبعة كتاب مستقل." required>
            <Input id="tb-edition" name="edition" maxLength={60} placeholder="٢٠٢٦-٢٠٢٧" {...invalid(state, "edition", "tb-edition")} />
          </Field>
          <div className="grid gap-1 rounded-[1.1rem] bg-canvas px-3.5 py-2">
            <Checkbox id="tb-current" name="isCurrent" defaultChecked label="الطبعة الحالية" />
            <Checkbox id="tb-rights" name="rightsConfirmed" label={RIGHTS_LABEL} />
          </div>
          <div>
            <SubmitButton variant="accent" pendingText="جارٍ الإضافة…">
              <Plus aria-hidden /> إضافة الكتاب
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

// ---------------------------------------------------------------- بيانات الكتاب
export function TextbookEditForm({ id, title, edition, isCurrent, rightsConfirmed }: { id: string; title: string; edition: string; isCurrent: boolean; rightsConfirmed: boolean }) {
  return (
    <ActionForm action={updateTextbookAction} className="grid gap-4">
      {(state) => (
        <>
          <input type="hidden" name="id" value={id} />
          <Field label="عنوان الكتاب" htmlFor="tb-edit-title" error={state?.fieldErrors?.title} required>
            <Input id="tb-edit-title" name="title" defaultValue={title} maxLength={160} {...invalid(state, "title", "tb-edit-title")} />
          </Field>
          <Field label="الطبعة أو العام الدراسي" htmlFor="tb-edit-edition" error={state?.fieldErrors?.edition} required>
            <Input id="tb-edit-edition" name="edition" defaultValue={edition} maxLength={60} {...invalid(state, "edition", "tb-edit-edition")} />
          </Field>
          <div className="grid gap-1 rounded-[1.1rem] bg-canvas px-3.5 py-2">
            <Checkbox id="tb-edit-current" name="isCurrent" defaultChecked={isCurrent} label="الطبعة الحالية" />
            <Checkbox id="tb-edit-rights" name="rightsConfirmed" defaultChecked={rightsConfirmed} label={RIGHTS_LABEL} />
          </div>
          <p className="text-[0.82rem] leading-6 text-muted">جعل هذه الطبعة حالية يلغي «الحالية» عن أي طبعة أخرى لنفس المادة والفصل.</p>
          <div>
            <SubmitButton pendingText="جارٍ الحفظ…">
              <Save aria-hidden /> حفظ بيانات الكتاب
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

// ---------------------------------------------------------------- الوحدة
export function UnitForm({ textbookId, unit, nextNumber }: { textbookId: string; unit?: { id: string; number: number; title: string }; nextNumber?: number }) {
  const sfx = unit ? `-${unit.id}` : "";
  const numId = `unit-number${sfx}`;
  const titleId = `unit-title${sfx}`;
  return (
    <ActionForm action={saveUnitAction} resetOnSuccess={!unit} className="grid gap-3">
      {(state) => (
        <>
          <input type="hidden" name="textbookId" value={textbookId} />
          {unit ? <input type="hidden" name="id" value={unit.id} /> : null}
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
            <Field label="رقم الوحدة" htmlFor={numId} error={state?.fieldErrors?.number} required>
              <NumberInput id={numId} name="number" defaultValue={unit ? String(unit.number) : nextNumber ? String(nextNumber) : ""} maxLength={2} {...invalid(state, "number", numId)} />
            </Field>
            <Field label="عنوان الوحدة" htmlFor={titleId} error={state?.fieldErrors?.title} required>
              <Input id={titleId} name="title" defaultValue={unit?.title ?? ""} maxLength={160} placeholder={unit ? undefined : "مثال: الأعداد والعمليات"} {...invalid(state, "title", titleId)} />
            </Field>
          </div>
          <div>
            <SubmitButton size="sm" variant={unit ? "primary" : "accent"} pendingText="جارٍ الحفظ…">
              {unit ? <Save aria-hidden /> : <Plus aria-hidden />}
              {unit ? "حفظ الوحدة" : "إضافة الوحدة"}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

// ---------------------------------------------------------------- الدرس
export function LessonForm({
  textbookId,
  unitId,
  lesson,
  nextNumber,
  pageHint,
}: {
  textbookId: string;
  unitId: string;
  lesson?: { id: string; number: number; title: string; page_start: number; page_end: number };
  nextNumber?: number;
  /** صفحة مقترحة للبداية (بعد نهاية آخر درس) تظهر تلميحًا فقط */
  pageHint?: string;
}) {
  // معرّفات الإضافة ثابتة لكل وحدة، ومعرّفات التعديل لكل درس
  const ids = lesson
    ? { number: `edit-lesson-number-${lesson.id}`, title: `edit-lesson-title-${lesson.id}`, start: `edit-lesson-start-${lesson.id}`, end: `edit-lesson-end-${lesson.id}` }
    : { number: `lesson-number-${unitId}`, title: `lesson-title-${unitId}`, start: `lesson-start-${unitId}`, end: `lesson-end-${unitId}` };
  return (
    <ActionForm action={saveLessonAction} resetOnSuccess={!lesson} compact={Boolean(lesson)} className="grid gap-3">
      {(state) => (
        <>
          <input type="hidden" name="textbookId" value={textbookId} />
          <input type="hidden" name="unitId" value={unitId} />
          {lesson ? <input type="hidden" name="id" value={lesson.id} /> : null}
          {/* الجوال: الرقم والعنوان في صف، والصفحتان في صف. العريض: كلها في صف واحد */}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
              <Field label="رقم الدرس" htmlFor={ids.number} error={state?.fieldErrors?.number} required>
                <NumberInput id={ids.number} name="number" defaultValue={lesson ? String(lesson.number) : nextNumber ? String(nextNumber) : ""} maxLength={2} {...invalid(state, "number", ids.number)} />
              </Field>
              <Field label="عنوان الدرس" htmlFor={ids.title} error={state?.fieldErrors?.title} required>
                <Input id={ids.title} name="title" defaultValue={lesson?.title ?? ""} maxLength={160} {...invalid(state, "title", ids.title)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من صفحة" htmlFor={ids.start} error={state?.fieldErrors?.pageStart} hint={!lesson && pageHint ? `بعد آخر درس: ${pageHint}` : undefined} required>
                <NumberInput id={ids.start} name="pageStart" defaultValue={lesson ? String(lesson.page_start) : ""} maxLength={4} {...invalid(state, "pageStart", ids.start)} />
              </Field>
              <Field label="إلى صفحة" htmlFor={ids.end} error={state?.fieldErrors?.pageEnd} required>
                <NumberInput id={ids.end} name="pageEnd" defaultValue={lesson ? String(lesson.page_end) : ""} maxLength={4} {...invalid(state, "pageEnd", ids.end)} />
              </Field>
            </div>
          </div>
          <div>
            <SubmitButton size="sm" variant={lesson ? "primary" : "accent"} pendingText="جارٍ الحفظ…">
              {lesson ? <Save aria-hidden /> : <Plus aria-hidden />}
              {lesson ? "حفظ الدرس" : "إضافة الدرس"}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
