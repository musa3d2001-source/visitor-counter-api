import "server-only";
import { sql } from "../db";
import { LESSON_BEAT_MIN_GAP_SECONDS } from "@/lib/lesson-beat";

/**
 * نبضة التقدم: أكثر طلب يتكرر في المنصة، فكلفتها أمر SQL واحد ورفضها شبه مجاني.
 *
 * الأمر الواحد يتحقق من الجلسة، ويحسب حد الحساب، ويكتب الموضع إن مر الفاصل، ويخبر بالنتيجة.
 * يكفي للطالب لأن وجود صف التقدم هو الإذن: الصف لا يُنشأ إلا بعد فحص صلاحية كامل (أول نبضة في المسار البطيء).
 * من سُحبت صلاحيته بعد ذلك يستطيع فقط تغيير رقم موضعه هو، ولا يفتح ذلك أي محتوى: المحتوى يفحصه رابط التضمين ومسار البث.
 *
 * الذاكرة هنا مرشح رخيص لكل نسخة خادم: لا تُملأ إلا بعد رد من قاعدة البيانات لهذه الجلسة، فلا يمر بها رمز مزور،
 * وأسوأ أثر لاختلاف النسخ أمر واحد زائد. قاعدة البيانات هي الحكم.
 */
export const BEAT_LIMIT_PER_MINUTE = 30;
export const BEAT_WINDOW_SECONDS = 60;
/** مداخل كل نسخة، والأقدم يُنسى أولًا: الذاكرة محدودة مهما زاد المشاهدون */
const MAX_TRACKED = 20_000;

type Memo = { until: number; completed: boolean };
const accepted = new Map<string, Memo>();
const limited = new Map<string, number>();

const memoKey = (sessionId: string, lessonId: string) => `${sessionId}:${lessonId}`;

function put<V>(map: Map<string, V>, key: string, value: V) {
  map.delete(key);
  if (map.size >= MAX_TRACKED) map.delete(map.keys().next().value!);
  map.set(key, value);
}

export function resetBeatMemory() {
  accepted.clear();
  limited.clear();
}

export type BeatRefusal = { kind: "early" } | { kind: "limited"; retryAfterSeconds: number };

/** رفض بلا قاعدة بيانات. اكتمال لم يُحفظ بعد يمر دائمًا إلى قاعدة البيانات */
export function refusedFromMemory(sessionId: string, lessonId: string, completed: boolean, now = Date.now()): BeatRefusal | null {
  const limitedUntil = limited.get(sessionId);
  if (limitedUntil !== undefined) {
    if (limitedUntil > now) return { kind: "limited", retryAfterSeconds: Math.max(1, Math.ceil((limitedUntil - now) / 1000)) };
    limited.delete(sessionId);
  }
  const key = memoKey(sessionId, lessonId);
  const memo = accepted.get(key);
  if (!memo) return null;
  if (memo.until <= now) {
    accepted.delete(key);
    return null;
  }
  return completed && !memo.completed ? null : { kind: "early" };
}

/** nextInSeconds: متى يقبل الخادم النبضة التالية لهذا المشاهد والدرس */
export function rememberBeat(sessionId: string, lessonId: string, completed: boolean, nextInSeconds: number, now = Date.now()) {
  put(accepted, memoKey(sessionId, lessonId), { until: now + nextInSeconds * 1000, completed });
}

export function rememberLimited(sessionId: string, retryAfterSeconds: number, now = Date.now()) {
  put(limited, sessionId, now + retryAfterSeconds * 1000);
}

export type BeatOutcome = {
  /** الجلسة موجودة أصلًا: رمز مزور يُرفض هنا بلا أي عمل إضافي */
  known: boolean;
  /** طالب بجلسة سارية. غيره (المدير والمعلم) له قواعد جلسة أخرى فيأخذ المسار الكامل */
  viewer: boolean;
  admitted: boolean;
  saved: boolean;
  hasRow: boolean;
  nextInSeconds: number;
  retryAfterSeconds: number;
};

/** الأمر الواحد. كل ما فيه على لقطة واحدة، والعداد والموضع يُكتبان معًا أو لا يُكتبان */
export async function recordBeat(sessionId: string, lessonId: string, position: number, completed: boolean): Promise<BeatOutcome> {
  const [row] = await sql<{ known: boolean; viewer: boolean; admitted: boolean; saved: boolean; has_row: boolean; next_in: number | null; retry_after: number | null }[]>`
    with viewer as (
      select u.id from sessions s join users u on u.id = s.user_id
      where s.id = ${sessionId} and s.expires_at > now() and u.role = 'student' and u.is_active and not u.must_change_password
    ),
    gate as (
      insert into rate_limits as r (key, count, reset_at)
      select 'beat:' || v.id::text, 1, now() + make_interval(secs => ${BEAT_WINDOW_SECONDS}) from viewer v
      on conflict (key) do update set
        count = case when r.reset_at < now() then 1 else r.count + 1 end,
        reset_at = case when r.reset_at < now() then now() + make_interval(secs => ${BEAT_WINDOW_SECONDS}) else r.reset_at end
      where r.reset_at < now() or r.count < ${BEAT_LIMIT_PER_MINUTE}
      returning count
    ),
    saved as (
      update lesson_progress p set
        position_seconds = ${position},
        completed = p.completed or ${completed}::boolean,
        updated_at = now()
      from viewer v, gate g
      where p.user_id = v.id and p.lesson_id = ${lessonId}
        and (p.updated_at <= now() - make_interval(secs => ${LESSON_BEAT_MIN_GAP_SECONDS}) or (${completed}::boolean and not p.completed))
      returning 1
    ),
    current_row as (
      select p.updated_at from lesson_progress p join viewer v on p.user_id = v.id where p.lesson_id = ${lessonId}
    )
    select
      exists (select 1 from sessions s where s.id = ${sessionId}) as known,
      exists (select 1 from viewer) as viewer,
      exists (select 1 from gate) as admitted,
      exists (select 1 from saved) as saved,
      exists (select 1 from current_row) as has_row,
      (select greatest(1, ceil(extract(epoch from c.updated_at + make_interval(secs => ${LESSON_BEAT_MIN_GAP_SECONDS}) - now())))::int from current_row c) as next_in,
      (select greatest(1, ceil(extract(epoch from r.reset_at - now())))::int from rate_limits r join viewer v on r.key = 'beat:' || v.id::text) as retry_after
  `;
  return {
    known: row.known,
    viewer: row.viewer,
    admitted: row.admitted,
    saved: row.saved,
    hasRow: row.has_row,
    nextInSeconds: row.next_in ?? 1,
    retryAfterSeconds: row.retry_after ?? 1,
  };
}

/** المسار البطيء بعد فحص الصلاحية: أول نبضة للدرس، ونبضات المدير والمعلم. true: حُفظت */
export async function saveBeatAfterAccessCheck(userId: string, lessonId: string, position: number, completed: boolean): Promise<boolean> {
  const rows = await sql`
    insert into lesson_progress as p (user_id, lesson_id, position_seconds, completed, updated_at)
    values (${userId}, ${lessonId}, ${position}, ${completed}, now())
    on conflict (user_id, lesson_id) do update set
      position_seconds = excluded.position_seconds,
      completed = p.completed or excluded.completed,
      updated_at = now()
    where p.updated_at <= now() - make_interval(secs => ${LESSON_BEAT_MIN_GAP_SECONDS}) or (excluded.completed and not p.completed)
    returning 1
  `;
  return rows.length > 0;
}
