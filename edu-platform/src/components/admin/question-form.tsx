"use client";

import { startTransition, useActionState, useId, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { BookOpenText, Check, CircleCheck, FileQuestionMark, Lightbulb, ListChecks, LoaderCircle, Plus, Save, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import type { CurriculumOption } from "@/server/questions/curriculum";
import { CHOICE_LETTERS, DIFFICULTY_LABELS, EDITABLE_SOURCE_KINDS, QUESTION_TYPE_LABELS, SOURCE_KIND_LABELS, TRUE_FALSE_TEXT } from "@/server/questions/rules";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ar } from "@/lib/design";
import { cn } from "@/lib/utils";
import { toneStyle, type AdminTone } from "./tones";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export type QuestionFormDefaults = {
  lessonId: string;
  page: string;
  exerciseRef: string;
  sourceKind: string;
  type: "mcq" | "true_false";
  lang: "ar" | "en";
  stem: string;
  /** نصوص الخيارات بالترتيب (من ٢ إلى ٤) لسؤال الاختيار من متعدد */
  choices: string[];
  /** رقم الخيار الصحيح «1».. «4» أو فارغ */
  correct: string;
  trueFalseAnswer: "" | "true" | "false";
  explanation: string;
  hint: string;
  difficulty: string;
  rightsConfirmed: boolean;
};

/** خيارات فارغة افتراضية (لا تُصدَّر: صادرات ملف العميل غير الدوال لا تصل لمكوّنات الخادم) */
const EMPTY_CHOICES = ["", "", "", ""];

const EXPLANATION_MIN = 20;
const EXPLANATION_MAX = 600;
const MIN_CHOICES = 2;
const MAX_CHOICES = 4;

type ChoiceRow = { key: number; text: string };
type LessonOption = CurriculumOption["units"][number]["lessons"][number];

/** خيارات الدرس، مجمّعة تحت فصولها في الكتب التي تقسّم الوحدة إلى فصول */
function lessonOptions(lessons: LessonOption[]): React.ReactNode {
  const option = (l: LessonOption) => (
    <option key={l.id} value={l.id}>
      {`الدرس ${ar(l.number)}: ${l.title}`}
    </option>
  );
  if (!lessons.some((l) => l.chapterNumber !== null)) return lessons.map(option);
  const chapters = new Map<number, LessonOption[]>();
  for (const l of lessons) chapters.set(l.chapterNumber ?? 0, [...(chapters.get(l.chapterNumber ?? 0) ?? []), l]);
  return [...chapters].map(([n, list]) => (
    <optgroup key={n} label={`الفصل ${ar(n)}: ${list[0].chapterTitle ?? ""}`}>
      {list.map(option)}
    </optgroup>
  ));
}

/** يجد الكتاب والوحدة لدرس معيّن داخل شجرة المنهج */
function locate(options: CurriculumOption[], lessonId: string) {
  for (const tb of options)
    for (const u of tb.units)
      for (const l of u.lessons) if (l.id === lessonId) return { textbookId: tb.textbookId, unitId: u.id };
  return null;
}

/**
 * نموذج السؤال (إضافة/تعديل مسودة) للمالك والمعلم.
 * - اختيار متسلسل: الكتاب ← الوحدة ← الدرس (الدرس وحده يُرسل باسم lessonId) مع نطاق صفحات الدرس.
 * - الخيارات من ٢ إلى ٤ بحروف أ ب ج د، والصحيح باختيار واحد (correct = رقم الحقل).
 * - يُرسل بـ onSubmit داخل startTransition لا بـ action النموذج: فلا يعيد React ضبط الحقول بعد الحفظ،
 *   وتبقى القيم كما كتبها المستخدم عند الخطأ وعند النجاح (والقوائم المتسلسلة متزامنة مع الحالة).
 * - أخطاء الحقول بمفاتيح مسارات zod نفسها: lessonId, page, choices, choices.N.text, trueFalseAnswer...
 */
export function QuestionForm({
  action,
  options,
  defaults,
  mode,
  questionId,
}: {
  action: ServerAction;
  options: CurriculumOption[];
  defaults: QuestionFormDefaults;
  mode: "create" | "edit";
  questionId?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const fe = state?.fieldErrors ?? {};
  const keySeq = useRef(MAX_CHOICES + 1);

  const start = useMemo(() => locate(options, defaults.lessonId), [options, defaults.lessonId]);
  const lessonMissing = Boolean(defaults.lessonId) && !start;
  const [textbookId, setTextbookId] = useState(start?.textbookId ?? (options.length === 1 ? options[0].textbookId : ""));
  const [unitId, setUnitId] = useState(start?.unitId ?? "");
  const [lessonId, setLessonId] = useState(start ? defaults.lessonId : "");
  const [type, setType] = useState<"mcq" | "true_false">(defaults.type);
  const [lang, setLang] = useState<"ar" | "en">(defaults.lang);
  const [explanation, setExplanation] = useState(defaults.explanation);
  const [tf, setTf] = useState(defaults.trueFalseAnswer);

  // الخيارات: مفتاح ثابت لكل صف حتى لا تختلط النصوص عند الحذف من المنتصف
  const initialChoices = (defaults.choices.length >= MIN_CHOICES ? defaults.choices : EMPTY_CHOICES).slice(0, MAX_CHOICES);
  const [choices, setChoices] = useState<ChoiceRow[]>(() => initialChoices.map((text, i) => ({ key: i + 1, text })));
  const [correctKey, setCorrectKey] = useState<number | null>(() => {
    const n = Number(defaults.correct);
    return n >= 1 && n <= initialChoices.length ? n : null;
  });

  const textbook = options.find((o) => o.textbookId === textbookId) ?? null;
  const unit = textbook?.units.find((u) => u.id === unitId) ?? null;
  const lesson = unit?.lessons.find((l) => l.id === lessonId) ?? null;
  const ltr = lang === "en" ? "ltr" : undefined;
  const expLen = explanation.trim().length;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };

  const addChoice = () =>
    setChoices((prev) => (prev.length >= MAX_CHOICES ? prev : [...prev, { key: keySeq.current++, text: "" }]));
  const removeChoice = (key: number) => {
    setChoices((prev) => (prev.length <= MIN_CHOICES ? prev : prev.filter((c) => c.key !== key)));
    if (correctKey === key) setCorrectKey(null);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate aria-busy={pending}>
      {questionId ? <input type="hidden" name="id" value={questionId} /> : null}

      {lessonMissing ? (
        <Alert tone="warning" title="درس السؤال لم يعد متاحًا للاختيار">
          الكتاب المرتبط بهذا السؤال لم يعد الطبعة الحالية أو لم يعد من موادك. اختر الدرس من الكتاب الحالي قبل الحفظ.
        </Alert>
      ) : null}

      <Step n={1} title="أين السؤال في الكتاب؟" tone="teal" icon={<BookOpenText />}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="الكتاب" htmlFor="q-textbook" required>
            <Select
              id="q-textbook"
              name="textbookId"
              value={textbookId}
              onChange={(e) => {
                setTextbookId(e.target.value);
                setUnitId("");
                setLessonId("");
              }}
            >
              <option value="">اختر الكتاب</option>
              {options.map((o) => (
                <option key={o.textbookId} value={o.textbookId}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="الوحدة"
            htmlFor="q-unit"
            required
            hint={textbook && textbook.units.length === 0 ? "لا توجد وحدات في هذا الكتاب بعد" : undefined}
          >
            <Select
              id="q-unit"
              name="unitId"
              value={unitId}
              disabled={!textbook || textbook.units.length === 0}
              onChange={(e) => {
                setUnitId(e.target.value);
                setLessonId("");
              }}
            >
              <option value="">{textbook ? "اختر الوحدة" : "اختر الكتاب أولًا"}</option>
              {textbook?.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {`الوحدة ${ar(u.number)}: ${u.title}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="الدرس"
            htmlFor="q-lesson"
            required
            error={fe.lessonId}
            hint={
              lesson
                ? `صفحات الدرس من ${ar(lesson.pageStart)} إلى ${ar(lesson.pageEnd)}`
                : unit && unit.lessons.length === 0
                  ? "لا توجد دروس في هذه الوحدة بعد"
                  : undefined
            }
          >
            <Select
              id="q-lesson"
              name="lessonId"
              value={lessonId}
              disabled={!unit || unit.lessons.length === 0}
              onChange={(e) => setLessonId(e.target.value)}
              aria-invalid={Boolean(fe.lessonId)}
              aria-describedby={fe.lessonId ? "q-lesson-error" : undefined}
            >
              <option value="">{unit ? "اختر الدرس" : "اختر الوحدة أولًا"}</option>
              {unit ? lessonOptions(unit.lessons) : null}
            </Select>
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="رقم الصفحة" htmlFor="q-page" required error={fe.page} hint={lesson ? `بين ${ar(lesson.pageStart)} و${ar(lesson.pageEnd)}` : undefined}>
            <Input
              id="q-page"
              name="page"
              type="number"
              inputMode="numeric"
              dir="ltr"
              className="num text-start"
              defaultValue={defaults.page}
              min={lesson?.pageStart ?? 1}
              max={lesson?.pageEnd ?? 2000}
              aria-invalid={Boolean(fe.page)}
              aria-describedby={fe.page ? "q-page-error" : undefined}
            />
          </Field>
          <Field label="رقم التمرين (اختياري)" htmlFor="q-exercise" error={fe.exerciseRef} hint="مثال: 4 أو 2-ب">
            <Input id="q-exercise" name="exerciseRef" defaultValue={defaults.exerciseRef} maxLength={40} aria-invalid={Boolean(fe.exerciseRef)} />
          </Field>
          <Field label="مصدر السؤال" htmlFor="q-source" required error={fe.sourceKind}>
            <Select id="q-source" name="sourceKind" defaultValue={defaults.sourceKind} aria-invalid={Boolean(fe.sourceKind)} aria-describedby={fe.sourceKind ? "q-source-error" : undefined}>
              <option value="">اختر المصدر</option>
              {EDITABLE_SOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SOURCE_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Step>

      <Step n={2} title="نص السؤال" tone="violet" icon={<FileQuestionMark />}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="نوع السؤال" htmlFor="q-type" required error={fe.type}>
            <Select id="q-type" name="type" value={type} onChange={(e) => setType(e.target.value === "true_false" ? "true_false" : "mcq")}>
              <option value="mcq">{QUESTION_TYPE_LABELS.mcq}</option>
              <option value="true_false">{QUESTION_TYPE_LABELS.true_false}</option>
            </Select>
          </Field>
          <Field label="لغة السؤال" htmlFor="q-lang" required error={fe.lang}>
            <Select id="q-lang" name="lang" value={lang} onChange={(e) => setLang(e.target.value === "en" ? "en" : "ar")}>
              <option value="ar">العربية</option>
              <option value="en">الإنجليزية</option>
            </Select>
          </Field>
          <Field label="الصعوبة" htmlFor="q-difficulty" required error={fe.difficulty}>
            <Select id="q-difficulty" name="difficulty" defaultValue={defaults.difficulty} aria-invalid={Boolean(fe.difficulty)}>
              {([1, 2, 3] as const).map((d) => (
                <option key={d} value={String(d)}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="نص السؤال" htmlFor="q-stem" required error={fe.stem} hint="بصياغتك أنت، من ٣ إلى ٤٠٠ حرف" className="mt-4">
          <Textarea
            id="q-stem"
            name="stem"
            dir={ltr}
            defaultValue={defaults.stem}
            maxLength={400}
            rows={3}
            aria-invalid={Boolean(fe.stem)}
            aria-describedby={fe.stem ? "q-stem-error" : undefined}
          />
        </Field>
      </Step>

      <Step n={3} title={type === "mcq" ? "الخيارات والإجابة الصحيحة" : "الإجابة الصحيحة"} tone="gold" icon={<ListChecks />}>
        {type === "mcq" ? (
          <fieldset aria-describedby={fe.choices ? "q-choices-error" : undefined}>
            <legend className="mb-3 text-[0.88rem] leading-6 text-ink-soft">
              اكتب من خيارين إلى أربعة، واختر الإجابة الصحيحة. لا يُسمح بخيار «كل ما سبق» أو ما يشبهه.
            </legend>
            {fe.choices ? (
              <p id="q-choices-error" role="alert" className="mb-3 rounded-xl bg-danger-50 px-3 py-2 text-sm font-bold text-danger">
                {fe.choices}
              </p>
            ) : null}
            <ol className="grid gap-3">
              {choices.map((c, i) => {
                const n = i + 1;
                const letter = CHOICE_LETTERS[i];
                const err = fe[`choices.${i}.text`];
                const isCorrect = correctKey === c.key;
                return (
                  <li
                    key={c.key}
                    className={cn(
                      "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-[1.25rem] border-2 p-2.5 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
                      isCorrect ? "border-success/35 bg-success-50" : "border-line bg-canvas/60",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-11 place-items-center rounded-[0.9rem] font-display text-[1.2rem] font-black shadow-[inset_0_-3px_0_rgb(0_0_0/0.12)]",
                        isCorrect ? "bg-linear-to-br from-[#34D9A0] to-[#0B8A66] text-white" : "bg-linear-to-br from-[#FFE08A] to-[#F0A500] text-[#3D2A00]",
                      )}
                      aria-hidden
                    >
                      {letter}
                    </span>
                    <div className="min-w-0">
                      <Input
                        id={`q-choice-${n}`}
                        name={`choice${n}`}
                        dir={ltr}
                        value={c.text}
                        onChange={(e) => setChoices((prev) => prev.map((x) => (x.key === c.key ? { ...x, text: e.target.value } : x)))}
                        maxLength={200}
                        aria-label={`نص الخيار ${letter}`}
                        aria-invalid={Boolean(err)}
                        aria-describedby={err ? `q-choice-${n}-error` : undefined}
                      />
                      {err ? (
                        <p id={`q-choice-${n}-error`} role="alert" className="mt-1 text-sm font-medium text-danger">
                          {err}
                        </p>
                      ) : null}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1 sm:contents">
                      <label
                        htmlFor={`q-correct-${n}`}
                        className={cn(
                          "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3.5 font-display text-[0.85rem] font-extrabold whitespace-nowrap transition-colors",
                          "has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 has-[:focus-visible]:outline-solid",
                          isCorrect
                            ? "bg-linear-to-b from-[#34D9A0] to-[#0B8A66] text-white shadow-[0_3px_0_#076B4F]"
                            : "border border-line-strong bg-surface text-ink-soft shadow-[0_3px_0_var(--color-line-strong)] hover:bg-success-50 hover:text-success",
                        )}
                      >
                        <input
                          type="radio"
                          id={`q-correct-${n}`}
                          name="correct"
                          value={String(n)}
                          checked={isCorrect}
                          onChange={() => setCorrectKey(c.key)}
                          className="sr-only"
                        />
                        {isCorrect ? <CircleCheck className="size-4" aria-hidden /> : <span className="size-4 rounded-full border-2 border-current" aria-hidden />}
                        الإجابة الصحيحة
                        <span className="sr-only">{` (الخيار ${letter})`}</span>
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeChoice(c.key)}
                        disabled={choices.length <= MIN_CHOICES}
                        aria-label={`حذف الخيار ${letter}`}
                        title="حذف الخيار"
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {choices.length < MAX_CHOICES ? (
              <Button type="button" variant="soft" size="sm" className="mt-3" onClick={addChoice}>
                <Plus aria-hidden /> إضافة خيار
              </Button>
            ) : null}
          </fieldset>
        ) : (
          <fieldset aria-describedby={fe.trueFalseAnswer ? "q-tf-error" : undefined}>
            <legend className="mb-3 text-[0.88rem] leading-6 text-ink-soft">
              اكتب في نص السؤال عبارة يحكم عليها الطالب، ثم اختر الحكم الصحيح.
              {lang === "en" ? ` يرى الطالب الخيارين «${TRUE_FALSE_TEXT.en[0]}» و«${TRUE_FALSE_TEXT.en[1]}».` : null}
            </legend>
            {fe.trueFalseAnswer ? (
              <p id="q-tf-error" role="alert" className="mb-3 rounded-xl bg-danger-50 px-3 py-2 text-sm font-bold text-danger">
                {fe.trueFalseAnswer}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              {(
                [
                  { v: "true", id: "q-tf-true", label: "صح", Icon: Check, on: "from-[#34D9A0] to-[#0B8A66] shadow-[0_4px_0_#076B4F]" },
                  { v: "false", id: "q-tf-false", label: "خطأ", Icon: X, on: "from-[#FFA07A] to-[#E8483F] shadow-[0_4px_0_#B4322A]" },
                ] as const
              ).map((o) => {
                const checked = tf === o.v;
                return (
                  <label
                    key={o.v}
                    htmlFor={o.id}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl font-display text-[1.1rem] font-black transition-colors",
                      "has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600 has-[:focus-visible]:outline-solid",
                      checked ? cn("bg-linear-to-b text-white", o.on) : "border-2 border-line-strong bg-surface text-ink-soft shadow-[0_4px_0_var(--color-line-strong)] hover:bg-canvas",
                    )}
                  >
                    <input type="radio" id={o.id} name="trueFalseAnswer" value={o.v} checked={checked} onChange={() => setTf(o.v)} className="sr-only" />
                    <o.Icon className="size-5" aria-hidden />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </Step>

      <Step n={4} title="الشرح بعد الإجابة" tone="green" icon={<Lightbulb />}>
        <Field label="الشرح" htmlFor="q-explanation" required error={fe.explanation}>
          <Textarea
            id="q-explanation"
            name="explanation"
            dir={ltr}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            maxLength={EXPLANATION_MAX}
            rows={4}
            aria-invalid={Boolean(fe.explanation)}
            aria-describedby={fe.explanation ? "q-explanation-error q-explanation-count" : "q-explanation-count"}
          />
        </Field>
        <p id="q-explanation-count" className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[0.82rem]">
          <span className="text-muted">يظهر للطالب بعد إجابته: لماذا هذه الإجابة صحيحة؟ من {ar(EXPLANATION_MIN)} إلى {ar(EXPLANATION_MAX)} حرف.</span>
          <span
            className={cn(
              "inline-flex min-h-7 items-center rounded-full px-2.5 font-display font-extrabold",
              expLen < EXPLANATION_MIN ? "bg-warning-50 text-warning" : "bg-success-50 text-success",
            )}
          >
            <span className="sr-only">عدد الأحرف: </span>
            {ar(expLen)} / {ar(EXPLANATION_MAX)}
          </span>
        </p>
        <Field label="تلميح (اختياري)" htmlFor="q-hint" error={fe.hint} hint="يساعد الطالب دون أن يكشف الإجابة، حتى ٢٠٠ حرف" className="mt-4">
          <Input id="q-hint" name="hint" dir={ltr} defaultValue={defaults.hint} maxLength={200} aria-invalid={Boolean(fe.hint)} />
        </Field>
      </Step>

      <div className="rounded-[1.5rem] border-2 border-[#FFE08A] bg-[linear-gradient(160deg,#FFFBEA,#FFF0C7)] p-4 shadow-[0_4px_0_#F5D27A] sm:p-5" style={toneStyle("gold")}>
        <div className="flex items-start gap-3">
          <span className="mt-1 grid size-10 shrink-0 place-items-center rounded-[0.9rem] bg-linear-to-br from-[var(--a)] to-[var(--b)] text-[var(--icon)] shadow-[inset_0_-3px_0_rgb(0_0_0/0.14)] [&_svg]:size-5" aria-hidden>
            <ShieldCheck />
          </span>
          <div className="min-w-0 flex-1">
            <Checkbox
              id="q-rights"
              name="rightsConfirmed"
              defaultChecked={defaults.rightsConfirmed}
              label="أؤكد أن الصياغة معدّلة وليست نقلًا حرفيًا من الكتاب، وأن المرجع صحيح"
              className="font-display font-bold text-ink"
            />
            <p className="text-[0.82rem] leading-6 text-[#7A4E00]">يلزم هذا التأكيد قبل إرسال السؤال للمراجعة أو نشره.</p>
            {fe.rightsConfirmed ? (
              <p role="alert" className="mt-1 text-sm font-medium text-danger">
                {fe.rightsConfirmed}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* شريط حفظ ثابت أسفل الشاشة: النموذج طويل */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-white bg-white/95 p-3 shadow-dock backdrop-blur sm:p-4">
        <div className="min-w-0 flex-1 text-[0.88rem]" aria-live="polite">
          {state?.error ? (
            <p role="alert" className="flex items-start gap-2 font-bold text-danger">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.error}
            </p>
          ) : state?.ok && state.message ? (
            <p className="flex items-center gap-2 font-bold text-success">
              <CircleCheck className="size-4 shrink-0" aria-hidden />
              {state.message}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-ink-soft max-sm:sr-only">
              <Save className="size-4 text-brand-700" aria-hidden />
              {mode === "create" ? "يُحفظ السؤال مسودة، ثم ترسله للمراجعة من صفحته" : "تبقى مسودة حتى ترسلها للمراجعة"}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending} className="max-sm:w-full">
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {pending ? "جارٍ الحفظ…" : "حفظ كمسودة"}
        </Button>
      </div>
    </form>
  );
}

/** خطوة مرقمة ملوّنة (مثل خطوات نموذج المحتوى) */
function Step({ n, title, tone, icon, children }: { n: number; title: string; tone: AdminTone; icon: React.ReactNode; children: React.ReactNode }) {
  const id = useId();
  return (
    <fieldset aria-labelledby={id} className="relative min-w-0 rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface p-4 shadow-card sm:p-6" style={toneStyle(tone)}>
      <div className="mb-5 flex items-center gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-[0.95rem] bg-linear-to-br from-[var(--a)] to-[var(--b)] font-display text-[1.4rem] leading-none font-black text-[var(--icon)] shadow-[inset_0_-3px_0_rgb(0_0_0/0.14),0_8px_14px_-8px_var(--d)]"
          aria-hidden
        >
          {ar(n)}
        </span>
        <h2 id={id} className="font-display text-[1.2rem] leading-snug font-black text-ink sm:text-[1.3rem]">
          <span className="sr-only">الخطوة {ar(n)}: </span>
          {title}
        </h2>
        <span className="ms-auto hidden size-9 place-items-center rounded-full bg-[var(--soft)] text-[var(--tink)] sm:grid [&_svg]:size-4.5" aria-hidden>
          {icon}
        </span>
      </div>
      {children}
    </fieldset>
  );
}
