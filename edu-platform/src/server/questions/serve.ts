import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { z } from "zod";
import { sql, type Db } from "../db";
import { env } from "../env";
import { getSettings } from "../platform/settings";
import { lessonContext } from "./curriculum";
import { formatReference, type QuestionLang, type QuestionType } from "./rules";

/**
 * التقديم والتصحيح: الطريق الوحيد لإيصال سؤال إلى طالب ولتصحيح إجابته (اللعبة الآن، والمنافسة لاحقًا).
 *  - toClientQuestion() المسلسل الوحيد: نص وخيارات مخلوطة بمعرّفات خاصة بكل محاولة، بلا مفتاح ولا شرح ولا صفحة.
 *  - gradeAnswer() السلطة الوحيدة للتصحيح، والمنح يُحسب من صف المحاولة المخزّن لا من العميل.
 *  - التوقيتات كلها من الخادم (served_at و shown_at و answered_at).
 */

/** المعرّفات تأتي من العميل: أي قيمة ليست UUID تُعامل كغير موجودة بدل خطأ من القاعدة */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** المفاتيح المسموحة فقط قبل الإجابة. strict(): أي مفتاح إضافي يُسقط التسلسل بخطأ بدل أن يتسرب. */
export const clientQuestionSchema = z
  .object({
    attemptId: z.string().uuid(),
    type: z.enum(["mcq", "true_false"]),
    lang: z.enum(["ar", "en"]),
    stem: z.string(),
    hint: z.string().nullable(),
    choices: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{16}$/), text: z.string() }).strict()).min(2).max(4),
  })
  .strict();
export type ClientQuestion = z.infer<typeof clientQuestionSchema>;

/** معرّف الخيار كما يراه العميل: مشتق من المحاولة، فلا يمكن ربطه بالخيار الصحيح من محاولة سابقة */
export function clientChoiceId(attemptId: string, choiceId: string): string {
  return createHmac("sha256", env().APP_SECRET).update(`question-choice:${attemptId}:${choiceId}`).digest("base64url").slice(0, 16);
}

export function toClientQuestion(attemptId: string, q: { type: QuestionType; lang: QuestionLang; stem: string; hint: string | null }, orderedChoices: { id: string; text: string }[]): ClientQuestion {
  return clientQuestionSchema.parse({
    attemptId,
    type: q.type,
    lang: q.lang,
    stem: q.stem,
    hint: q.hint,
    choices: orderedChoices.map((c) => ({ id: clientChoiceId(attemptId, c.id), text: c.text })),
  });
}

/**
 * شرط «قابل للتقديم»: منشور، غير موقوف، وغير مخفي بمفتاح إخفاء تمارين الكتاب.
 * دالة متزامنة: إرجاع جزء استعلام من دالة async يُنفّذه (الأجزاء thenable).
 */
function servableCondition(db: Db, hideTextbookExercises: boolean) {
  return hideTextbookExercises
    ? db`q.status = 'published' and not q.paused and q.source_kind <> 'textbook_exercise'`
    : db`q.status = 'published' and not q.paused`;
}
async function hideTextbook(): Promise<boolean> {
  return (await getSettings()).hide_textbook_exercises;
}

export type ServableQuestion = { id: string; root_id: string; lesson_id: string; difficulty: 1 | 2 | 3; type: QuestionType };

/** الأسئلة القابلة للتقديم في مجموعة دروس (للاختيار ولمانع النشر لاحقًا) */
export async function servableQuestions(lessonIds: string[], db: Db = sql): Promise<ServableQuestion[]> {
  if (!lessonIds.length) return [];
  const cond = servableCondition(db, await hideTextbook());
  return db<ServableQuestion[]>`
    select q.id, q.root_id, q.lesson_id, q.difficulty, q.type from questions q
    where q.lesson_id = any(${lessonIds}::uuid[]) and ${cond}
    order by q.id
  `;
}

/** خلط حتمي من بذرة (mulberry32)، أو عشوائي إن لم تُعطَ */
function shuffled<T>(items: T[], seed?: number): T[] {
  const a = [...items];
  let s = seed === undefined ? randomInt(1, 2 ** 31) : seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class QuestionNotServableError extends Error {
  constructor() {
    super("QUESTION_NOT_SERVABLE");
  }
}

export type ServeInput = {
  userId: string;
  questionId: string;
  contextType: "game" | "questions_only" | "review" | "preview";
  gameRunId?: string | null;
  isChallenge?: boolean;
  seed?: number;
};

/** يسجّل محاولة جديدة ويعيد السؤال بالشكل المسموح فقط. «صح أو خطأ» بترتيب ثابت. */
export async function serveQuestion(input: ServeInput, db: Db = sql): Promise<ClientQuestion> {
  if (!UUID.test(input.questionId) || !UUID.test(input.userId) || (input.gameRunId != null && !UUID.test(input.gameRunId))) throw new QuestionNotServableError();
  const cond = servableCondition(db, await hideTextbook());
  const [q] = await db<{ id: string; type: QuestionType; lang: QuestionLang; stem: string; hint: string | null }[]>`
    select q.id, q.type, q.lang, q.stem, q.hint from questions q where q.id = ${input.questionId} and ${cond}
  `;
  if (!q) throw new QuestionNotServableError();
  const choices = await db<{ id: string; text: string }[]>`select id, text from question_choices where question_id = ${q.id} order by position`;
  const ordered = q.type === "true_false" ? choices : shuffled(choices, input.seed);
  const [attempt] = await db<{ id: string }[]>`
    insert into question_attempts (user_id, question_id, context_type, game_run_id, choice_order, is_challenge)
    values (${input.userId}, ${q.id}, ${input.contextType}, ${input.gameRunId ?? null}, ${ordered.map((c) => c.id)}::uuid[], ${input.isChallenge ?? false})
    returning id
  `;
  return toClientQuestion(attempt.id, q, ordered);
}

/** حدث الظهور: وقت الخادم، مرة واحدة، وقبل الإجابة فقط */
export async function markShown(attemptId: string, userId: string, db: Db = sql): Promise<boolean> {
  if (!UUID.test(attemptId) || !UUID.test(userId)) return false;
  const rows = await db`
    update question_attempts set shown_at = now()
    where id = ${attemptId} and user_id = ${userId} and shown_at is null and answered_at is null
    returning id
  `;
  return rows.length > 0;
}

export type GradeResult = {
  correct: boolean;
  correctChoiceId: string;
  chosenChoiceId: string;
  explanation: string;
  reference: string;
  isChallenge: boolean;
  firstAttempt: boolean;
};

/**
 * يصحح إجابة واحدة بتحديث ذري: إعادة الإرسال أو الإجابة الثانية تعيد null بلا أثر.
 * first_attempt = أول إجابة لهذا الطالب على هذا الإصدار إطلاقًا (للإحصاءات فقط).
 * response_ms = answered_at − shown_at مقيّدًا بين 0 وساعة، و null إن لم يصل حدث الظهور.
 */
export async function gradeAnswer(attemptId: string, userId: string, clientChoice: string, db: Db = sql): Promise<GradeResult | null> {
  if (!UUID.test(attemptId) || !UUID.test(userId) || typeof clientChoice !== "string" || !/^[A-Za-z0-9_-]{16}$/.test(clientChoice)) return null;
  const [a] = await db<{ question_id: string; choice_order: string[]; is_challenge: boolean; answered_at: Date | null }[]>`
    select question_id, choice_order, is_challenge, answered_at from question_attempts where id = ${attemptId} and user_id = ${userId}
  `;
  if (!a || a.answered_at) return null;
  const chosen = a.choice_order.find((id) => clientChoiceId(attemptId, id) === clientChoice);
  if (!chosen) return null;
  const choices = await db<{ id: string; is_correct: boolean }[]>`select id, is_correct from question_choices where question_id = ${a.question_id}`;
  const correctId = choices.find((c) => c.is_correct)?.id;
  if (!correctId) return null;
  const correct = chosen === correctId;
  const [updated] = await db<{ first_attempt: boolean }[]>`
    update question_attempts set
      chosen_choice_id = ${chosen}, is_correct = ${correct}, answered_at = now(),
      first_attempt = not exists (
        select 1 from question_attempts p where p.user_id = ${userId} and p.question_id = ${a.question_id} and p.answered_at is not null and p.id <> ${attemptId}
      ),
      response_ms = case when shown_at is null then null
                         else least(greatest((extract(epoch from (now() - shown_at)) * 1000)::int, 0), 3600000) end
    where id = ${attemptId} and user_id = ${userId} and answered_at is null
    returning first_attempt
  `;
  if (!updated) return null;
  const [q] = await db<{ explanation: string; lesson_id: string; page: number; exercise_ref: string | null }[]>`
    select explanation, lesson_id, page, exercise_ref from questions where id = ${a.question_id}
  `;
  const ctx = await lessonContext(q.lesson_id, db);
  return {
    correct,
    correctChoiceId: clientChoiceId(attemptId, correctId),
    chosenChoiceId: clientChoice,
    explanation: q.explanation,
    reference: ctx
      ? formatReference({
          subjectName: ctx.subject_name,
          gradeName: ctx.grade_name,
          term: ctx.term,
          unitNumber: ctx.unit_number,
          chapterNumber: ctx.chapter_number,
          lessonNumber: ctx.lesson_number,
          page: q.page,
          exerciseRef: q.exercise_ref,
        })
      : "",
    isChallenge: a.is_challenge,
    firstAttempt: updated.first_attempt,
  };
}

/** معاينة «كما يراه الطالب» للمالك والمعلم: المسلسل نفسه بمعرّف محاولة ثابت، بترتيب الإدخال */
export const PREVIEW_ATTEMPT_ID = "00000000-0000-4000-8000-000000000000";
export function previewClientQuestion(q: { type: QuestionType; lang: QuestionLang; stem: string; hint: string | null; choices: { id: string; text: string }[] }): ClientQuestion {
  return toClientQuestion(PREVIEW_ATTEMPT_ID, q, q.choices);
}
