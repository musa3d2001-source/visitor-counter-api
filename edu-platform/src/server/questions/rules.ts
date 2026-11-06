/**
 * قواعد بنك الأسئلة النقية (بلا قاعدة بيانات ولا Node): الثوابت، والتسميات العربية، والتحقق من المدخلات،
 * والتطبيع قبل كشف التكرار، وصياغة مرجع الكتاب. تستوردها الواجهة والخادم والاختبارات.
 * القيود نفسها مفروضة أيضًا في القاعدة (0007_question_bank.sql) كخط دفاع ثانٍ.
 */
import { z } from "zod";

export const QUESTION_STATUSES = ["draft", "in_review", "published", "archived"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  draft: "مسودة",
  in_review: "بانتظار المراجعة",
  published: "منشور",
  archived: "مؤرشف",
};

export const SOURCE_KINDS = ["textbook_exercise", "textbook_based", "teacher_original", "demo"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
/** «تجريبي» لا يُختار من الواجهة: يُنشأ بسكربت البيانات التجريبية فقط */
export const EDITABLE_SOURCE_KINDS = ["textbook_exercise", "textbook_based", "teacher_original"] as const;
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  textbook_exercise: "تمرين من الكتاب بصياغة معدّلة",
  textbook_based: "مبني على محتوى الكتاب",
  teacher_original: "من تأليف المعلم",
  demo: "تجريبي",
};

export const QUESTION_TYPES = ["mcq", "true_false"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = { mcq: "اختيار من متعدد", true_false: "صح أو خطأ" };

export const QUESTION_LANGS = ["ar", "en"] as const;
export type QuestionLang = (typeof QUESTION_LANGS)[number];

export const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = { 1: "سهل", 2: "متوسط", 3: "صعب" };

export const REPORT_REASONS = ["wrong_key", "unclear", "typo", "off_curriculum", "inappropriate"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  wrong_key: "الإجابة المعتمدة خاطئة",
  unclear: "السؤال غير واضح",
  typo: "خطأ إملائي أو في الأرقام",
  off_curriculum: "ليس من هذا الدرس",
  inappropriate: "محتوى غير مناسب",
};

/** حروف الخيارات كما في الكتب: أ ب ج د */
export const CHOICE_LETTERS = ["أ", "ب", "ج", "د"] as const;

/** نصّا «صح أو خطأ» الثابتان حسب لغة السؤال */
export const TRUE_FALSE_TEXT: Record<QuestionLang, [string, string]> = { ar: ["صح", "خطأ"], en: ["True", "False"] };

/* ───────────── التطبيع ───────────── */

/** الأرقام الهندية العربية والفارسية إلى لاتينية (لوحة المفاتيح العربية تكتبها، والحقول الرقمية تحتاج اللاتينية) */
export function latinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/**
 * تطبيع للمقارنة وكشف التكرار (لا للعرض): NFKC، وحذف التشكيل والتطويل، وتوحيد الألف والياء والتاء المربوطة،
 * وتوحيد الأرقام الهندية إلى لاتينية، وحذف علامات الترقيم، ودمج المسافات، وأحرف لاتينية صغيرة.
 */
export function normalizeForCompare(s: string): string {
  return s
    .normalize("NFKC")
    .replace(DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** تنظيف للتخزين والعرض: يحذف المسافات الزائدة فقط ويحافظ على النص كما كتبه المؤلف */
export function cleanText(s: string): string {
  return s.normalize("NFC").replace(/[​-‍﻿]/g, "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

const BANNED = ["كل ما سبق", "جميع ما سبق", "كل ما ذكر", "جميع ما ذكر", "لا شيء مما سبق", "ليس مما سبق", "all of the above", "none of the above"].map(normalizeForCompare);

/** «كل ما سبق» وأخواتها ممنوعة: تكسر خلط ترتيب الخيارات وتكافئ التخمين */
export function isBannedChoice(text: string): boolean {
  const n = normalizeForCompare(text);
  return BANNED.some((b) => n === b || n.startsWith(`${b} `) || n.endsWith(` ${b}`));
}

/** المادة الخام لبصمة المحتوى: النوع واللغة والنص والخيارات مرتبة (الترتيب لا يغيّر السؤال) */
export function contentFingerprintSource(q: { type: QuestionType; lang: QuestionLang; stem: string; choices: { text: string }[] }): string {
  const choices = q.choices.map((c) => normalizeForCompare(c.text)).sort();
  return [q.type, q.lang, normalizeForCompare(q.stem), ...choices].join("␞");
}

/* ───────────── المدخلات ───────────── */

const uuid = z.string().uuid({ error: "اختر قيمة صحيحة" });

export const choiceInputSchema = z.object({
  text: z.string().transform(cleanText).pipe(z.string().min(1, { error: "اكتب نص الخيار" }).max(200, { error: "الخيار أطول من ٢٠٠ حرف" })),
  isCorrect: z.boolean(),
});

/**
 * سؤال واحد كما يأتي من النموذج أو الاستيراد. لـ «صح أو خطأ» يبني الخادم الخيارين الثابتين من trueFalseAnswer.
 * الصفحة تُقارن بنطاق الدرس في الخادم (والقاعدة)، لأن النطاق ليس في المدخلات.
 */
export const questionInputSchema = z
  .object({
    lessonId: uuid,
    page: z.coerce.number({ error: "اكتب رقم الصفحة" }).int({ error: "رقم الصفحة عدد صحيح" }).min(1, { error: "رقم الصفحة غير صحيح" }).max(2000, { error: "رقم الصفحة غير صحيح" }),
    exerciseRef: z.string().transform(cleanText).pipe(z.string().max(40, { error: "رقم التمرين أطول من ٤٠ حرفًا" })).optional().transform((v) => v || null),
    sourceKind: z.enum(SOURCE_KINDS, { error: "اختر مصدر السؤال" }),
    type: z.enum(QUESTION_TYPES, { error: "اختر نوع السؤال" }),
    lang: z.enum(QUESTION_LANGS, { error: "اختر لغة السؤال" }),
    stem: z.string().transform(cleanText).pipe(z.string().min(3, { error: "اكتب نص السؤال" }).max(400, { error: "نص السؤال أطول من ٤٠٠ حرف" })),
    explanation: z.string().transform(cleanText).pipe(z.string().min(20, { error: "الشرح قصير: ٢٠ حرفًا على الأقل" }).max(600, { error: "الشرح أطول من ٦٠٠ حرف" })),
    hint: z.string().transform(cleanText).pipe(z.string().max(200, { error: "التلميح أطول من ٢٠٠ حرف" })).optional().transform((v) => v || null),
    difficulty: z.coerce.number().int().min(1, { error: "اختر الصعوبة" }).max(3, { error: "اختر الصعوبة" }),
    choices: z.array(choiceInputSchema).default([]),
    trueFalseAnswer: z.enum(["true", "false"]).optional(),
    rightsConfirmed: z.boolean().default(false),
  })
  .transform((q) => {
    if (q.type !== "true_false") return q;
    const [t, f] = TRUE_FALSE_TEXT[q.lang];
    const answer = q.trueFalseAnswer;
    return { ...q, choices: answer ? [{ text: t, isCorrect: answer === "true" }, { text: f, isCorrect: answer === "false" }] : [] };
  })
  .superRefine((q, ctx) => {
    if (q.type === "true_false" && q.choices.length !== 2) {
      ctx.addIssue({ code: "custom", path: ["trueFalseAnswer"], message: "اختر الإجابة الصحيحة: صح أو خطأ" });
      return;
    }
    if (q.type === "mcq" && (q.choices.length < 2 || q.choices.length > 4)) {
      ctx.addIssue({ code: "custom", path: ["choices"], message: "السؤال يحتاج من خيارين إلى أربعة خيارات" });
    }
    if (q.choices.filter((c) => c.isCorrect).length !== 1) {
      ctx.addIssue({ code: "custom", path: ["choices"], message: "حدّد إجابة صحيحة واحدة فقط" });
    }
    const seen = new Set<string>();
    q.choices.forEach((c, i) => {
      if (isBannedChoice(c.text)) ctx.addIssue({ code: "custom", path: ["choices", i, "text"], message: "لا يُسمح بخيار «كل ما سبق» أو ما يشبهه" });
      const n = normalizeForCompare(c.text);
      if (seen.has(n)) ctx.addIssue({ code: "custom", path: ["choices", i, "text"], message: "خيار مكرر" });
      seen.add(n);
    });
  });
export type QuestionInput = z.output<typeof questionInputSchema>;

/* ───────────── مرجع الكتاب ───────────── */

export type BookReference = { subjectName: string; gradeName: string; term: 1 | 2; unitNumber: number; lessonNumber: number; page: number; exerciseRef?: string | null };

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arNum = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
const TERM_NAMES = { 1: "الفصل الأول", 2: "الفصل الثاني" } as const;

/** «كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ٣، ص ٤٥» (ثم «تمرين ٤» إن وُجد) */
export function formatReference(r: BookReference): string {
  const parts = [`كتاب ${r.subjectName}`, r.gradeName, TERM_NAMES[r.term], `الوحدة ${arNum(r.unitNumber)}`, `الدرس ${arNum(r.lessonNumber)}`, `ص ${arNum(r.page)}`];
  if (r.exerciseRef) parts.push(`تمرين ${arNum(r.exerciseRef)}`);
  return parts.join("، ");
}
