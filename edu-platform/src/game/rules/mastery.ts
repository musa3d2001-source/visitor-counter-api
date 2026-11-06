/**
 * الإتقان (GAME_DESIGN.md §9):
 *  - الإجابة المؤهلة: أول ظهور للسؤال (بجذره) للطالب، أو إعادته بعد 24 ساعة على الأقل من آخر إجابة عنه
 *    (الإجابة الصحيحة تُعرض بعد كل إجابة، فآخر إجابة هي آخر عرض لها).
 *  - الإتقان من آخر 8 إجابات مؤهلة في الدرس، بمقارنات صحيحة فقط.
 * الوقت (epoch بالمللي ثانية) يُمرَّر من الخارج؛ لا Date هنا.
 */

export type AnswerRecord = { questionRootId: string; correct: boolean; answeredAt: number };

export const QUALIFY_GAP_MS = 24 * 60 * 60 * 1000;

/** آخر إجابات مؤهلة تُحسب في الإتقان */
const MASTERY_WINDOW = 8;
/** أقل من هذا العدد ← «بيانات قليلة» */
const MASTERY_MIN = 4;

/**
 * هل إجابة السؤال ذي الجذر questionRootId عند at مؤهلة؟ history إجابات الطالب السابقة (أي ترتيب).
 * كل إجابة سابقة للجذر نفسه تُحسب، ولو جاء توقيتها بعد at (انحراف ساعة) فلا تؤهل.
 */
export function isQualifying(history: readonly AnswerRecord[], questionRootId: string, at: number): boolean {
  let seen = false;
  let latest = 0;
  for (const h of history) {
    if (h.questionRootId !== questionRootId) continue;
    if (!seen || h.answeredAt > latest) latest = h.answeredAt;
    seen = true;
  }
  if (!seen) return true;
  return at - latest >= QUALIFY_GAP_MS;
}

export type MasteryBand = "little-data" | "mastered" | "progressing" | "needs-review";

export const MASTERY_LABELS: Record<MasteryBand, string> = {
  "little-data": "بيانات قليلة",
  mastered: "متقن",
  progressing: "يتقدّم",
  "needs-review": "يحتاج مراجعة",
};

/**
 * answers: الإجابات المؤهلة في الدرس بترتيب زمني، وتُؤخذ آخر 8.
 * أقل من 4 ← بيانات قليلة؛ 80% فأكثر ← متقن؛ 50–79% ← يتقدّم؛ أقل من 50% ← يحتاج مراجعة.
 */
export function masteryFromQualifying(answers: readonly { correct: boolean }[]): { band: MasteryBand; count: number; correct: number } {
  const recent = answers.slice(Math.max(0, answers.length - MASTERY_WINDOW));
  const count = recent.length;
  let correct = 0;
  for (const a of recent) if (a.correct) correct++;
  let band: MasteryBand;
  if (count < MASTERY_MIN) band = "little-data";
  else if (correct * 5 >= count * 4) band = "mastered";
  else if (correct * 2 >= count) band = "progressing";
  else band = "needs-review";
  return { band, count, correct };
}
