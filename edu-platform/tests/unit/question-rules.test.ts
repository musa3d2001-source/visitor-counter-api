/**
 * قواعد بنك الأسئلة النقية (src/server/questions/rules.ts):
 * التطبيع قبل كشف التكرار، وحظر «كل ما سبق»، والتحقق من مدخلات السؤال، وصياغة مرجع الكتاب.
 */
import { describe, expect, it } from "vitest";
import { fieldErrors } from "@/lib/validation";
import {
  cleanText,
  contentFingerprintSource,
  formatReference,
  isBannedChoice,
  normalizeForCompare,
  questionInputSchema,
  TRUE_FALSE_TEXT,
} from "@/server/questions/rules";

const LESSON_ID = "11111111-1111-4111-8111-111111111111";

/** سؤال اختيار من متعدد صالح، تُغيَّر حقوله في كل اختبار */
function mcq(over: Record<string, unknown> = {}) {
  return {
    lessonId: LESSON_ID,
    page: 45,
    sourceKind: "teacher_original",
    type: "mcq",
    lang: "ar",
    stem: "ما وحدة قياس القوة في النظام الدولي؟",
    explanation: "تقاس القوة بوحدة النيوتن في النظام الدولي للوحدات.",
    difficulty: 2,
    choices: [
      { text: "نيوتن", isCorrect: true },
      { text: "جول", isCorrect: false },
      { text: "واط", isCorrect: false },
    ],
    rightsConfirmed: true,
    ...over,
  };
}

/** أخطاء الحقول كما يعرضها الخادم (المفتاح = مسار الحقل) */
function errorsOf(input: unknown): Record<string, string> {
  const r = questionInputSchema.safeParse(input);
  if (r.success) return {};
  return fieldErrors(r.error);
}

function choices(...texts: string[]) {
  return texts.map((text, i) => ({ text, isCorrect: i === 0 }));
}

describe("normalizeForCompare — تطبيع للمقارنة فقط", () => {
  it("removes diacritics (tashkeel, shadda, sukun, dagger alef)", () => {
    expect(normalizeForCompare("مُحَمَّدٌ")).toBe("محمد");
    expect(normalizeForCompare("الْكِتَابُ")).toBe("الكتاب");
    expect(normalizeForCompare("رحمٰن")).toBe("رحمن");
  });

  it("removes tatweel", () => {
    expect(normalizeForCompare("كـــتاب")).toBe("كتاب");
  });

  it("unifies alef forms, alef maqsura and taa marbuta", () => {
    expect(normalizeForCompare("إبراهيم")).toBe("ابراهيم");
    expect(normalizeForCompare("أحمد")).toBe("احمد");
    expect(normalizeForCompare("آمن")).toBe("امن");
    expect(normalizeForCompare("ٱلله")).toBe("الله");
    expect(normalizeForCompare("مستشفى")).toBe("مستشفي");
    expect(normalizeForCompare("مدرسة")).toBe("مدرسه");
    expect(normalizeForCompare("إِلَى المَدْرَسَةِ")).toBe(normalizeForCompare("الي المدرسه"));
  });

  it("maps Arabic-Indic and Eastern Arabic-Indic digits to Latin digits", () => {
    expect(normalizeForCompare("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(normalizeForCompare("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normalizeForCompare("٤٥ نيوتن")).toBe(normalizeForCompare("45 نيوتن"));
  });

  it("drops punctuation and symbols, collapses spaces, lowercases Latin", () => {
    expect(normalizeForCompare("  نيوتن،   جول؛ (واط)!  ")).toBe("نيوتن جول واط");
    expect(normalizeForCompare("«القوة» = الكتلة × التسارع؟")).toBe("القوه الكتله التسارع");
    expect(normalizeForCompare("All  Of the ABOVE.")).toBe("all of the above");
    expect(normalizeForCompare("H2O")).toBe("h2o");
  });

  it("is idempotent", () => {
    const once = normalizeForCompare("إِلَى «المدرسة» ٤٥!");
    expect(normalizeForCompare(once)).toBe(once);
  });
});

describe("cleanText — تنظيف للتخزين دون تغيير النص", () => {
  it("strips zero-width characters and extra spaces but keeps diacritics and line breaks", () => {
    expect(cleanText("  مُحَمَّدٌ​   ذهب  \n\n  إلى المدرسة﻿ ")).toBe("مُحَمَّدٌ ذهب\nإلى المدرسة");
  });
});

describe("isBannedChoice — «كل ما سبق» وأخواتها", () => {
  it("rejects the exact banned phrases in Arabic and English", () => {
    for (const t of ["كل ما سبق", "جميع ما سبق", "كل ما ذكر", "جميع ما ذكر", "لا شيء مما سبق", "ليس مما سبق", "all of the above", "none of the above"]) {
      expect(isBannedChoice(t), t).toBe(true);
    }
  });

  it("rejects variants with diacritics, tatweel, punctuation, hamza and case differences", () => {
    for (const t of ["كُلُّ مَا سَبَقَ", "كــل ما ســبق", "جميع ما سبق.", "«كل ما سبق»", "لا شيء ممّا سبق!", "جَمِيعُ مَا ذُكِرَ", "All of the Above", "  NONE OF THE ABOVE.  "]) {
      expect(isBannedChoice(t), t).toBe(true);
    }
  });

  it("rejects phrases that start or end with a banned phrase", () => {
    expect(isBannedChoice("كل ما سبق صحيح")).toBe(true);
    expect(isBannedChoice("الإجابات كل ما سبق")).toBe(true);
    expect(isBannedChoice("أ و ب: جميع ما ذكر")).toBe(true);
    expect(isBannedChoice("all of the above are correct")).toBe(true);
  });

  it("accepts normal choices that merely contain similar words", () => {
    for (const t of ["كل الأجسام", "ما سبق ذكره في الدرس الأول", "كل ما سبقه", "سبق", "نيوتن", "above", "all", "Both A and B", "None"]) {
      expect(isBannedChoice(t), t).toBe(false);
    }
  });
});

describe("contentFingerprintSource — بصمة المحتوى", () => {
  it("ignores choice order, diacritics and punctuation but not the type or language", () => {
    const a = contentFingerprintSource({ type: "mcq", lang: "ar", stem: "ما وحدة القوة؟", choices: [{ text: "نيوتن" }, { text: "جول" }] });
    const b = contentFingerprintSource({ type: "mcq", lang: "ar", stem: "ما وَحدة القوة", choices: [{ text: "جُول" }, { text: "نيوتن." }] });
    expect(a).toBe(b);
    expect(contentFingerprintSource({ type: "mcq", lang: "en", stem: "ما وحدة القوة؟", choices: [{ text: "نيوتن" }, { text: "جول" }] })).not.toBe(a);
    expect(contentFingerprintSource({ type: "mcq", lang: "ar", stem: "ما وحدة الطاقة؟", choices: [{ text: "نيوتن" }, { text: "جول" }] })).not.toBe(a);
  });
});

describe("questionInputSchema — مدخلات السؤال", () => {
  it("accepts a valid MCQ, cleans text and turns empty optional fields into null", () => {
    const r = questionInputSchema.parse(mcq({ stem: "  ما وحدة   قياس القوة؟  ", page: "45", hint: "", exerciseRef: "" }));
    expect(r.stem).toBe("ما وحدة قياس القوة؟");
    expect(r.page).toBe(45);
    expect(r.hint).toBeNull();
    expect(r.exerciseRef).toBeNull();
    expect(r.choices).toHaveLength(3);
    expect(r.rightsConfirmed).toBe(true);
  });

  it("MCQ needs 2 to 4 choices", () => {
    expect(errorsOf(mcq({ choices: choices("نيوتن") }))).toMatchObject({ choices: "السؤال يحتاج من خيارين إلى أربعة خيارات" });
    expect(errorsOf(mcq({ choices: choices("أ١", "ب٢", "ج٣", "د٤", "هـ٥") }))).toMatchObject({ choices: "السؤال يحتاج من خيارين إلى أربعة خيارات" });
    expect(errorsOf(mcq({ choices: [] }))).toHaveProperty("choices");
    expect(errorsOf(mcq({ choices: choices("نيوتن", "جول") }))).toEqual({});
    expect(errorsOf(mcq({ choices: choices("نيوتن", "جول", "واط", "باسكال") }))).toEqual({});
  });

  it("needs exactly one correct choice", () => {
    const none = [{ text: "نيوتن", isCorrect: false }, { text: "جول", isCorrect: false }];
    const two = [{ text: "نيوتن", isCorrect: true }, { text: "جول", isCorrect: true }, { text: "واط", isCorrect: false }];
    expect(errorsOf(mcq({ choices: none }))).toMatchObject({ choices: "حدّد إجابة صحيحة واحدة فقط" });
    expect(errorsOf(mcq({ choices: two }))).toMatchObject({ choices: "حدّد إجابة صحيحة واحدة فقط" });
  });

  it("rejects choices that are duplicates after normalization", () => {
    expect(errorsOf(mcq({ choices: choices("نيوتن", "نِيُوتن.") }))).toMatchObject({ "choices.1.text": "خيار مكرر" });
    expect(errorsOf(mcq({ choices: choices("إلكترون", "الكترون", "بروتون") }))).toMatchObject({ "choices.1.text": "خيار مكرر" });
    expect(errorsOf(mcq({ choices: choices("٤٥", "45", "50") }))).toMatchObject({ "choices.1.text": "خيار مكرر" });
    expect(errorsOf(mcq({ choices: choices("مدرسة", "نيوتن", "مدرسه") }))).toMatchObject({ "choices.2.text": "خيار مكرر" });
  });

  it("rejects banned choices with the Arabic message on the choice", () => {
    expect(errorsOf(mcq({ choices: choices("نيوتن", "جول", "كل ما سبق") }))).toMatchObject({ "choices.2.text": "لا يُسمح بخيار «كل ما سبق» أو ما يشبهه" });
    expect(errorsOf(mcq({ lang: "en", choices: choices("Newton", "None of the above") }))).toMatchObject({ "choices.1.text": "لا يُسمح بخيار «كل ما سبق» أو ما يشبهه" });
  });

  it("rejects empty or too long choice text", () => {
    expect(errorsOf(mcq({ choices: choices("نيوتن", "   ") }))).toMatchObject({ "choices.1.text": "اكتب نص الخيار" });
    expect(errorsOf(mcq({ choices: choices("نيوتن", "x".repeat(201)) }))).toMatchObject({ "choices.1.text": "الخيار أطول من ٢٠٠ حرف" });
    expect(errorsOf(mcq({ choices: choices("نيوتن", "x".repeat(200)) }))).toEqual({});
  });

  it("true_false builds the two fixed choices from the answer, per language", () => {
    const ar = questionInputSchema.parse(mcq({ type: "true_false", trueFalseAnswer: "true", choices: undefined }));
    expect(ar.choices).toEqual([
      { text: "صح", isCorrect: true },
      { text: "خطأ", isCorrect: false },
    ]);
    const en = questionInputSchema.parse(mcq({ type: "true_false", lang: "en", trueFalseAnswer: "false", stem: "Force is measured in joules." }));
    expect(en.choices).toEqual([
      { text: "True", isCorrect: false },
      { text: "False", isCorrect: true },
    ]);
    expect(TRUE_FALSE_TEXT.ar).toEqual(["صح", "خطأ"]);
    expect(TRUE_FALSE_TEXT.en).toEqual(["True", "False"]);
  });

  it("true_false ignores any submitted choices and requires an answer", () => {
    const r = questionInputSchema.parse(mcq({ type: "true_false", trueFalseAnswer: "false", choices: choices("كل ما سبق", "x", "y", "z") }));
    expect(r.choices.map((c) => c.text)).toEqual(["صح", "خطأ"]);
    expect(errorsOf(mcq({ type: "true_false" }))).toEqual({ trueFalseAnswer: "اختر الإجابة الصحيحة: صح أو خطأ" });
  });

  it("stem is 3 to 400 characters after cleaning", () => {
    expect(errorsOf(mcq({ stem: "ما" }))).toMatchObject({ stem: "اكتب نص السؤال" });
    expect(errorsOf(mcq({ stem: "س".repeat(400) }))).toEqual({});
    expect(errorsOf(mcq({ stem: `   ${"س".repeat(400)}   ` }))).toEqual({});
    expect(errorsOf(mcq({ stem: "س".repeat(401) }))).toMatchObject({ stem: "نص السؤال أطول من ٤٠٠ حرف" });
  });

  it("explanation is 20 to 600 characters after cleaning", () => {
    expect(errorsOf(mcq({ explanation: "ش".repeat(19) }))).toMatchObject({ explanation: "الشرح قصير: ٢٠ حرفًا على الأقل" });
    expect(errorsOf(mcq({ explanation: `${"ش".repeat(10)}            ${"ش".repeat(8)}` }))).toMatchObject({ explanation: "الشرح قصير: ٢٠ حرفًا على الأقل" });
    expect(errorsOf(mcq({ explanation: "ش".repeat(20) }))).toEqual({});
    expect(errorsOf(mcq({ explanation: "ش".repeat(600) }))).toEqual({});
    expect(errorsOf(mcq({ explanation: "ش".repeat(601) }))).toMatchObject({ explanation: "الشرح أطول من ٦٠٠ حرف" });
  });

  it("hint is optional and at most 200 characters", () => {
    expect(errorsOf(mcq({ hint: "ت".repeat(200) }))).toEqual({});
    expect(errorsOf(mcq({ hint: "ت".repeat(201) }))).toMatchObject({ hint: "التلميح أطول من ٢٠٠ حرف" });
    expect(questionInputSchema.parse(mcq({ hint: "   " })).hint).toBeNull();
  });

  it("validates page, difficulty, lesson id, source and type", () => {
    expect(errorsOf(mcq({ page: 0 }))).toMatchObject({ page: "رقم الصفحة غير صحيح" });
    expect(errorsOf(mcq({ page: 2001 }))).toMatchObject({ page: "رقم الصفحة غير صحيح" });
    expect(errorsOf(mcq({ page: 4.5 }))).toMatchObject({ page: "رقم الصفحة عدد صحيح" });
    expect(errorsOf(mcq({ difficulty: 4 }))).toMatchObject({ difficulty: "اختر الصعوبة" });
    expect(errorsOf(mcq({ lessonId: "not-a-uuid" }))).toMatchObject({ lessonId: "اختر قيمة صحيحة" });
    expect(errorsOf(mcq({ sourceKind: "copied" }))).toMatchObject({ sourceKind: "اختر مصدر السؤال" });
    expect(errorsOf(mcq({ type: "essay" }))).toMatchObject({ type: "اختر نوع السؤال" });
    expect(errorsOf(mcq({ exerciseRef: "x".repeat(41) }))).toMatchObject({ exerciseRef: "رقم التمرين أطول من ٤٠ حرفًا" });
  });

  it("rightsConfirmed defaults to false", () => {
    const { rightsConfirmed: _r, ...rest } = mcq();
    expect(questionInputSchema.parse(rest).rightsConfirmed).toBe(false);
  });
});

describe("formatReference — مرجع الكتاب", () => {
  it("formats the exact reference with Arabic-Indic digits", () => {
    expect(formatReference({ subjectName: "العلوم", gradeName: "الصف السابع", term: 1, unitNumber: 2, lessonNumber: 3, page: 45 })).toBe(
      "كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ٣، ص ٤٥",
    );
  });

  it("second term, multi-digit numbers and an exercise number", () => {
    expect(formatReference({ subjectName: "الرياضيات", gradeName: "الصف الحادي عشر", term: 2, unitNumber: 10, lessonNumber: 12, page: 120, exerciseRef: "4" })).toBe(
      "كتاب الرياضيات، الصف الحادي عشر، الفصل الثاني، الوحدة ١٠، الدرس ١٢، ص ١٢٠، تمرين ٤",
    );
    expect(formatReference({ subjectName: "العلوم", gradeName: "الصف السابع", term: 1, unitNumber: 1, lessonNumber: 1, page: 9, exerciseRef: "3-ب" })).toBe(
      "كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ١، الدرس ١، ص ٩، تمرين ٣-ب",
    );
    expect(formatReference({ subjectName: "العلوم", gradeName: "الصف السابع", term: 1, unitNumber: 1, lessonNumber: 1, page: 9, exerciseRef: null })).not.toContain("تمرين");
  });
});
