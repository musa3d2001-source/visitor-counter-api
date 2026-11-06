import type { QuestionFormDefaults } from "@/components/admin/question-form";
import type { QuestionDetail } from "@/server/questions/bank";
import { TRUE_FALSE_TEXT } from "@/server/questions/rules";

/**
 * قيم نموذج السؤال الابتدائية (تُبنى في الخادم ثم تُمرَّر للنموذج).
 * ليست في ملف النموذج لأن صادرات ملف "use client" غير المكوّنات لا تُقرأ في مكوّنات الخادم.
 */
export function emptyQuestionDefaults(lessonId = ""): QuestionFormDefaults {
  return {
    lessonId,
    page: "",
    exerciseRef: "",
    sourceKind: "",
    type: "mcq",
    lang: "ar",
    stem: "",
    choices: ["", "", "", ""],
    correct: "",
    trueFalseAnswer: "",
    explanation: "",
    hint: "",
    difficulty: "2",
    rightsConfirmed: false,
  };
}

/** قيم مسودة محفوظة لنموذج التعديل */
export function questionDefaults(q: QuestionDetail): QuestionFormDefaults {
  const correctIndex = q.choices.findIndex((c) => c.is_correct);
  // «صح أو خطأ»: الحكم من نص الخيار الصحيح (الترتيب المخزّن صح ثم خطأ احتياطًا)
  const correctText = correctIndex >= 0 ? q.choices[correctIndex].text : null;
  const tfCorrect: QuestionFormDefaults["trueFalseAnswer"] =
    q.type !== "true_false" || correctText === null
      ? ""
      : correctText === TRUE_FALSE_TEXT[q.lang][0]
        ? "true"
        : correctText === TRUE_FALSE_TEXT[q.lang][1]
          ? "false"
          : correctIndex === 0
            ? "true"
            : "false";
  return {
    lessonId: q.lesson_id,
    page: String(q.page),
    exerciseRef: q.exercise_ref ?? "",
    sourceKind: q.source_kind === "demo" ? "" : q.source_kind,
    type: q.type,
    lang: q.lang,
    stem: q.stem,
    choices: q.type === "mcq" ? q.choices.map((c) => c.text) : ["", "", "", ""],
    correct: q.type === "mcq" && correctIndex >= 0 ? String(correctIndex + 1) : "",
    trueFalseAnswer: tfCorrect,
    explanation: q.explanation,
    hint: q.hint ?? "",
    difficulty: String(q.difficulty),
    rightsConfirmed: Boolean(q.rights_confirmed_at),
  };
}
