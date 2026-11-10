import "server-only";
import { IP_SIGNAL } from "../admin/access-signals";
import { pruneRateLimits } from "../auth/rate-limit";
import { LONG_JOB_STATEMENT_MS, sql, withDbDeadline } from "../db";

/**
 * تنظيف يومي للجداول التي تكبر مع الزيارات، بدفعات صغيرة حتى لا يطول قفل أو تتجاوز الدالة مهلتها.
 * ما لم ينتهِ اليوم يكمل غدًا. الحذف بشرط العمر وحده، فالتكرار والتداخل لا يغيران النتيجة، و SKIP LOCKED يمنع انتظار نسخة أخرى.
 */

/** ٩٠ يومًا تكفي لمراجعة مشاركة الحسابات. الحد الأدنى الفعلي في runDataPruning يحمي مؤشر العناوين الكثيرة */
export const ACCESS_LOG_RETENTION_DAYS = 90;
/**
 * أقصى مدة لنسخ المالك الاحتياطية على جهازه (pg_dump ومجلد storage:backup)، كما تعد بها سياسة الخصوصية.
 * لا يحذفها النظام: الحذف إجراء المالك في README، فلا تغيّر الرقم دون تغيير الإجراء.
 */
export const OWNER_BACKUP_KEEP_DAYS = 90;
export const ERROR_EVENT_RETENTION_DAYS = 30;
export const PRUNE_BATCH_SIZE = 2_000;
const MAX_ROUNDS = 10;
const TIME_BUDGET_MS = 30_000;

const deleted = (query: PromiseLike<{ count: number }>) => query.then((result) => result.count);

export type PruneReport = { rateLimits: number; sessions: number; accessLogs: number; errorEvents: number; finished: boolean };

/** مهمة طويلة صريحة: مهلة الأمر الواحد فيها أطول من مهلة الطلبات العادية، ويبقى لها حد */
export function runDataPruning(): Promise<PruneReport> {
  return withDbDeadline(LONG_JOB_STATEMENT_MS, prune);
}

async function prune(): Promise<PruneReport> {
  const started = Date.now();
  let finished = true;

  /** يكرر الحذف حتى تنفد الدفعة أو ينتهي الوقت أو عدد الجولات */
  const inBatches = async (statement: () => PromiseLike<number>): Promise<number> => {
    let total = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        finished = false;
        return total;
      }
      const count = await statement();
      total += count;
      if (count < PRUNE_BATCH_SIZE) return total;
    }
    finished = false;
    return total;
  };

  // مؤشر العناوين الكثيرة يقرأ access_logs و sessions لآخر IP_SIGNAL.windowDays: لا يُحذف شيء داخل نافذته مهما تغيرت مدة الاحتفاظ
  const signalDays = IP_SIGNAL.windowDays + 1;
  const accessDays = Math.max(ACCESS_LOG_RETENTION_DAYS, signalDays);

  // كل دفعة MATERIALIZED تُحسب مرة واحدة: داخل IN قد يعيد المخطط تنفيذها لكل صف، فيتخطى القفل ما حذفه الأمر نفسه ويتجاوز الحد
  const rateLimits = await inBatches(() => pruneRateLimits(PRUNE_BATCH_SIZE));
  const sessions = await inBatches(
    () => deleted(sql`
      with batch as materialized (
        select id from sessions
        where expires_at < now() and created_at < now() - make_interval(days => ${signalDays})
        limit ${PRUNE_BATCH_SIZE} for update skip locked
      )
      delete from sessions s using batch where s.id = batch.id
    `),
  );
  const accessLogs = await inBatches(
    () => deleted(sql`
      with batch as materialized (
        select id from access_logs where created_at < now() - make_interval(days => ${accessDays})
        limit ${PRUNE_BATCH_SIZE} for update skip locked
      )
      delete from access_logs l using batch where l.id = batch.id
    `),
  );
  const errorEvents = await inBatches(
    () => deleted(sql`
      with batch as materialized (
        select id from error_events where last_seen_at < now() - make_interval(days => ${ERROR_EVENT_RETENTION_DAYS})
        limit ${PRUNE_BATCH_SIZE} for update skip locked
      )
      delete from error_events e using batch where e.id = batch.id
    `),
  );
  return { rateLimits, sessions, accessLogs, errorEvents, finished };
}
