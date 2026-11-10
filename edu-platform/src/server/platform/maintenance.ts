import "server-only";
import { IP_SIGNAL } from "../admin/access-signals";
import { pruneRateLimits } from "../auth/rate-limit";
import { LONG_JOB_STATEMENT_MS, sql, withDbDeadline } from "../db";
import { env } from "../env";
import { STAMPED_CACHE_BUDGET_BYTES, STAMPED_COPY_IDLE_DAYS, sweepDoomedCopies } from "../access/delivery";
import { sweepUploadTickets } from "../admin/uploads";
import { dailyVideoCheck, type DailyVideoReport } from "../video/service";
import { reportError } from "./report-error";
import { SATURATION_RETENTION_DAYS } from "./saturation";

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
/** Bunny يتوقف عن إعادة الإرسال بعد نحو 4 ساعات، فبصمة الإشعار لا حاجة لها بعد ذلك بكثير */
export const VIDEO_EVENT_RETENTION_DAYS = 30;
/** روابط ورموز انتهت: وجودها كغيابها عند الفتح، فلا سبب لبقائها بعد يوم */
export const EXPIRED_TOKEN_GRACE_DAYS = 1;
export const PRUNE_BATCH_SIZE = 2_000;
const MAX_ROUNDS = 10;
const TIME_BUDGET_MS = 30_000;

const deleted = (query: PromiseLike<{ count: number }>) => query.then((result) => result.count);

export type PruneReport = {
  rateLimits: number;
  sessions: number;
  accessLogs: number;
  errorEvents: number;
  /** نسخ PDF مختومة حُذفت من التخزين (بلا استخدام، أو لملف تغير أو حُذف، أو لحساب أُغلق) */
  stampedCopies: number;
  /** كائنات رُفعت ولم يُؤكد رفعها خلال يوم */
  unconfirmedUploads: number;
  videoEvents: number;
  /** روابط استعادة وتأكيد بريد وخطوات دخول انتهت */
  expiredTokens: number;
  saturationCounters: number;
  /** جولة الفيديو: الدروس المعلقة وفحص الدروس الجاهزة */
  videos: DailyVideoReport;
  finished: boolean;
};

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
  const videoEvents = await inBatches(
    () => deleted(sql`
      with batch as materialized (
        select id from video_events where received_at < now() - make_interval(days => ${VIDEO_EVENT_RETENTION_DAYS})
        limit ${PRUNE_BATCH_SIZE} for update skip locked
      )
      delete from video_events e using batch where e.id = batch.id
    `),
  );
  // جداول صغيرة، وأسماؤها من هذه القائمة الثابتة وحدها
  let expiredTokens = 0;
  for (const table of ["password_reset_tokens", "email_verification_tokens", "login_challenges"] as const) {
    expiredTokens += await inBatches(
      () => deleted(sql`
        with batch as materialized (
          select id from ${sql(table)} where expires_at < now() - make_interval(days => ${EXPIRED_TOKEN_GRACE_DAYS})
          limit ${PRUNE_BATCH_SIZE} for update skip locked
        )
        delete from ${sql(table)} t using batch where t.id = batch.id
      `),
    );
  }
  const saturationCounters = await inBatches(
    () => deleted(sql`
      with batch as materialized (
        select hour, kind from saturation_counters where hour < now() - make_interval(days => ${SATURATION_RETENTION_DAYS})
        limit ${PRUNE_BATCH_SIZE} for update skip locked
      )
      delete from saturation_counters c using batch where c.hour = batch.hour and c.kind = batch.kind
    `),
  );
  // التخزين قد يتعثر: يُسجل للمالك ويكمل التنظيف غدًا، ولا يُفشل ما سبق من حذف
  const stampedCopies = await pruneStampedCopies(inBatches, () => Date.now() - started > TIME_BUDGET_MS).catch(async (err) => {
    await reportError("prune:stamped-copies", err);
    return { removed: 0, finished: false };
  });
  if (!stampedCopies.finished) finished = false;

  const uploads = await sweepUploadTickets({ batch: 200, deadline: started + TIME_BUDGET_MS }).catch(async (err) => {
    await reportError("prune:upload-tickets", err);
    return { removed: 0, forgotten: 0, finished: false };
  });
  if (!uploads.finished) finished = false;

  // في الآخر بميزانية وقتها: تعطل Bunny لا يأخذ من وقت التنظيف، ولا يُفشل ما سبق
  const videos = await dailyVideoCheck().catch(async (err): Promise<DailyVideoReport> => {
    await reportError("prune:videos", err);
    return { checked: 0, failed: 0, held: 0, finished: false };
  });
  if (!videos.finished) finished = false;

  return { rateLimits, sessions, accessLogs, errorEvents, stampedCopies: stampedCopies.removed, unconfirmedUploads: uploads.removed, videoEvents, expiredTokens, saturationCounters, videos, finished };
}

/**
 * النسخ المختومة بيانات شخصية: تُعلَّم للحذف ثم تُحذف كائناتها وصفوفها.
 * تُعلَّم: ما لم يُفتح منذ STAMPED_COPY_IDLE_DAYS، وما يخص ملفًا حُذف أو تغير مفتاحه، وما يخص حسابًا معطلًا أو محذوف البيانات،
 * وختمًا مات قبل أن يكتمل، وما زاد على ميزانية التخزين (الأقدم استعمالًا أولًا).
 */
async function pruneStampedCopies(inBatches: (statement: () => PromiseLike<number>) => Promise<number>, outOfTime: () => boolean): Promise<{ removed: number; finished: boolean }> {
  await inBatches(
    () => deleted(sql`
      with batch as materialized (
        select c.id from stamped_copies c
        where c.state <> 'doomed' and (
          (c.state = 'ready' and c.last_used_at < now() - make_interval(days => ${STAMPED_COPY_IDLE_DAYS}))
          or (c.state = 'stamping' and c.lease_until < now() - interval '1 hour')
          or not exists (select 1 from product_files f where f.id = c.file_id and f.storage_key = c.file_version)
          or not exists (select 1 from users u where u.id = c.user_id and u.is_active and u.anonymized_at is null)
        )
        limit ${PRUNE_BATCH_SIZE} for update of c skip locked
      )
      update stamped_copies c set state = 'doomed' from batch where c.id = batch.id
    `),
  );
  const budget = env().STORAGE_PLAN === "paid" ? STAMPED_CACHE_BUDGET_BYTES.paid : STAMPED_CACHE_BUDGET_BYTES.free;
  await inBatches(
    () => deleted(sql`
      with batch as materialized (
        select c.id from stamped_copies c
        where c.state = 'ready' and c.id in (
          select id from (
            select id, sum(size_bytes) over (order by last_used_at desc, id) as running from stamped_copies where state = 'ready'
          ) ranked where running > ${budget}
        )
        limit ${PRUNE_BATCH_SIZE} for update of c skip locked
      )
      update stamped_copies c set state = 'doomed' from batch where c.id = batch.id
    `),
  );
  let removed = 0;
  for (let round = 0; round < MAX_ROUNDS * 5; round++) {
    if (outOfTime()) return { removed, finished: false };
    const n = await sweepDoomedCopies(100);
    removed += n;
    if (n < 100) return { removed, finished: true };
  }
  return { removed, finished: false };
}
