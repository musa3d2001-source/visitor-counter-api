import "server-only";
import { IP_SIGNAL } from "../admin/access-signals";
import { pruneRateLimits } from "../auth/rate-limit";
import { sql } from "../db";

/**
 * تنظيف يومي للجداول التي تكبر مع الزيارات، بدفعات صغيرة حتى لا يطول قفل أو تتجاوز الدالة مهلتها.
 * ما لم ينتهِ اليوم يكمل غدًا. الحذف بشرط العمر وحده، فالتكرار والتداخل لا يغيران النتيجة، و SKIP LOCKED يمنع انتظار نسخة أخرى.
 */

/** ٩٠ يومًا تكفي لمراجعة مشاركة الحسابات. الحد الأدنى الفعلي في runDataPruning يحمي مؤشر العناوين الكثيرة */
export const ACCESS_LOG_RETENTION_DAYS = 90;
export const ERROR_EVENT_RETENTION_DAYS = 30;
export const PRUNE_BATCH_SIZE = 2_000;
const MAX_ROUNDS = 10;
const TIME_BUDGET_MS = 30_000;

const deleted = (query: PromiseLike<{ count: number }>) => query.then((result) => result.count);

export type PruneReport = { rateLimits: number; sessions: number; accessLogs: number; errorEvents: number; finished: boolean };

export async function runDataPruning(): Promise<PruneReport> {
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

  const rateLimits = await inBatches(() => pruneRateLimits(PRUNE_BATCH_SIZE));
  const sessions = await inBatches(
    () => deleted(sql`
      delete from sessions where id in (
        select id from sessions
        where expires_at < now() and created_at < now() - make_interval(days => ${signalDays})
        limit ${PRUNE_BATCH_SIZE} for update skip locked
      )
    `),
  );
  const accessLogs = await inBatches(
    () => deleted(sql`
      delete from access_logs where id in (
        select id from access_logs where created_at < now() - make_interval(days => ${accessDays})
        limit ${PRUNE_BATCH_SIZE} for update skip locked
      )
    `),
  );
  const errorEvents = await inBatches(
    () => deleted(sql`
      delete from error_events where id in (
        select id from error_events where last_seen_at < now() - make_interval(days => ${ERROR_EVENT_RETENTION_DAYS})
        limit ${PRUNE_BATCH_SIZE} for update skip locked
      )
    `),
  );
  return { rateLimits, sessions, accessLogs, errorEvents, finished };
}
