import "server-only";
import { after, NextResponse } from "next/server";
import { scrubForOps } from "@/lib/redact";
import vercelConfig from "../../../vercel.json";
import { sql } from "../db";
import { isCronAuthorized } from "./cron-auth";
import { flushSuppressedAlerts, sendOpsAlert } from "./ops-alerts";
import { reportError } from "./report-error";

/**
 * الوظائف المجدولة: تسجل نبضها، ولا تتداخل، وكل جولة محدودة العمل.
 * Vercel لا يعيد المحاولة عند الفشل، وتسليمه غير مضمون فقد يفوّت التشغيل أو يكرره، فكل وظيفة هنا آمنة للتكرار والجولة التالية تكمل ما فات.
 * الجدول في vercel.json، وشرحه وتغييره بعد الترقية إلى Pro في README.
 */
export const SCHEDULED_JOBS = ["reconcile-payments", "expire-orders", "prune-data"] as const;
export type JobName = (typeof SCHEDULED_JOBS)[number];

export const JOB_LABELS: Record<JobName, { title: string; description: string }> = {
  "reconcile-payments": { title: "تسوية المدفوعات", description: "تسأل بوابة الدفع عن الفواتير المفتوحة والاستردادات التي لم تُحسم." },
  "expire-orders": { title: "إغلاق الطلبات المنتهية", description: "تغلق الطلبات غير المدفوعة بعد انتهاء مدتها، ولا تغلق طلبًا لم تُفحص فواتيره." },
  "prune-data": { title: "تنظيف البيانات القديمة", description: "تحذف حدود المحاولات والجلسات المنتهية وسجلات الوصول القديمة." },
};

/** ليست عقد الدالة وحدها: أطول من maxDuration بهامش، فموت الدالة يحرر الوظيفة في الجولة التالية */
const LEASE_MINUTES = 5;
/** الجدول اليومي على Hobby يقع في أي دقيقة من الساعة، فأقصى فجوة طبيعية ٢٤ ساعة و٥٩ دقيقة */
export const JOB_STALE_AFTER_HOURS = 30;
const WATCHDOG_EVERY_MS = 5 * 60_000;
/** طلب الاسترداد ينتهي خلال دقائق، فما بقي بلا نتيجة بعد هذه المدة عالق فعلًا ويحتاج إلى «إعادة التحقق» */
const REFUND_STUCK_MINUTES = 30;

export type JobRun<R> = { state: "done"; report: R } | { state: "failed"; report?: R; error: string } | { state: "overlapped" };

async function claimLease(job: JobName): Promise<boolean> {
  const rows = await sql`
    insert into job_heartbeats as h (job, last_started_at, lease_until)
    values (${job}, now(), now() + make_interval(mins => ${LEASE_MINUTES}))
    on conflict (job) do update set last_started_at = now(), lease_until = excluded.lease_until
    where h.lease_until is null or h.lease_until < now()
    returning job
  `;
  return rows.length === 1;
}

/** تسجيل النتيجة لا يصح أن يغيّر نتيجة الوظيفة نفسها */
async function recordOutcome(job: JobName, outcome: { error: string | null; report: unknown }): Promise<void> {
  try {
    const report = outcome.report === undefined ? null : sql.json(outcome.report as never);
    if (outcome.error === null) {
      await sql`update job_heartbeats set last_success_at = now(), last_report = ${report}, lease_until = null where job = ${job}`;
    } else {
      await sql`update job_heartbeats set last_error_at = now(), last_error = ${outcome.error.slice(0, 500)}, last_report = ${report}, lease_until = null where job = ${job}`;
    }
  } catch (err) {
    console.error("[cron] heartbeat not saved", job, err instanceof Error ? err.name : "unknown");
  }
}

/**
 * تشغيل وظيفة مرة واحدة: عقد يمنع التداخل، ثم العمل، ثم النبض.
 * failedWhen لنتيجة لم ترمِ خطأ لكنها فشل فعلي، مثل بوابة لم تجب عن أي فاتورة.
 */
export async function runScheduledJob<R>(job: JobName, work: () => Promise<R>, failedWhen?: (report: R) => string | null): Promise<JobRun<R>> {
  let claimed: boolean;
  try {
    claimed = await claimLease(job);
  } catch (err) {
    await reportError(`cron:${job}`, err);
    return { state: "failed", error: "تعذر بدء الوظيفة" };
  }
  if (!claimed) return { state: "overlapped" };

  try {
    const report = await work();
    const problem = failedWhen?.(report) ?? null;
    if (problem === null) {
      await recordOutcome(job, { error: null, report });
      return { state: "done", report };
    }
    await recordOutcome(job, { error: problem, report });
    await sendOpsAlert("job_failed");
    return { state: "failed", report, error: problem };
  } catch (err) {
    const error = scrubForOps(err instanceof Error ? err.message : String(err)) || "خطأ غير معروف";
    await reportError(`cron:${job}`, err);
    await recordOutcome(job, { error, report: undefined });
    await sendOpsAlert("job_failed");
    return { state: "failed", error };
  }
}

/** صلب كل مسار /api/cron/*: التحقق أولًا، والرد لا يحمل غير أرقام التقرير */
export async function serveCron<R>(req: Request, job: JobName, work: () => Promise<R>, failedWhen?: (report: R) => string | null): Promise<NextResponse> {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    // استدعاء Vercel المرفوض (CRON_SECRET ناقص أو تغير) هو بالضبط حين يجب أن يصل تنبيه «لم تعمل في موعدها».
    // الفحص محدود بمرة كل ٥ دقائق في كل نسخة، و/api/health يتيحه أصلًا لأي أحد، فلا يفتح هذا شيئًا جديدًا
    await runOpsWatchdog();
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const run = await runScheduledJob(job, work, failedWhen);
  await runOpsWatchdog({ force: true });
  if (run.state === "overlapped") return NextResponse.json({ skipped: "already_running" });
  if (run.state === "done") return NextResponse.json(run.report);
  return run.report === undefined ? NextResponse.json({ error: "job failed" }, { status: 500 }) : NextResponse.json(run.report, { status: 502 });
}

export type JobHeartbeat = { job: string; last_started_at: Date | null; last_success_at: Date | null; last_error_at: Date | null; last_error: string | null; created_at: Date };

export type JobStatus = "ok" | "failed" | "late" | "never";

export function jobStatusOf(row: Pick<JobHeartbeat, "last_started_at" | "last_success_at" | "last_error_at" | "created_at">, now = Date.now()): JobStatus {
  const staleBefore = now - JOB_STALE_AFTER_HOURS * 3600_000;
  if (row.last_error_at && (!row.last_success_at || row.last_error_at > row.last_success_at)) return "failed";
  if (row.last_success_at) return row.last_success_at.getTime() < staleBefore ? "late" : "ok";
  // لم تنجح قط: بداية العد هي أول مرة رأينا فيها الوظيفة، حتى لا يصل تنبيه مع أول نشر
  return row.created_at.getTime() < staleBefore ? "late" : "never";
}

async function ensureJobRows(): Promise<void> {
  await sql`insert into job_heartbeats (job) select unnest(${[...SCHEDULED_JOBS]}::text[]) on conflict (job) do nothing`;
}

export async function listJobHeartbeats(): Promise<JobHeartbeat[]> {
  await ensureJobRows();
  const rows = await sql<JobHeartbeat[]>`select job, last_started_at, last_success_at, last_error_at, last_error, created_at from job_heartbeats`;
  return SCHEDULED_JOBS.flatMap((name) => rows.filter((row) => row.job === name));
}

let lastWatchdogAt = 0;

export function resetOpsWatchdogForTests() {
  lastWatchdogAt = 0;
}

/**
 * يبحث عما لا يُبلغ عن نفسه: وظيفة لم تعمل، أو استرداد علق بلا نتيجة.
 * يعمل بعد كل وظيفة مجدولة، وعند رفض استدعاء مجدول، ومن /api/health ولوحة المالك وصفحة صحة المنصة،
 * حتى يكشف توقف الوظائف كلها معًا: فورًا مع مراقب خارجي يفحص /api/health، أو حين يفتح المالك لوحته.
 * لا يرمي أبدًا، وكل رسالة خلفها حد نوعها في قاعدة البيانات.
 */
export async function runOpsWatchdog(opts: { force?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (!opts.force && now - lastWatchdogAt < WATCHDOG_EVERY_MS) return;
  lastWatchdogAt = now;
  try {
    const heartbeats = await listJobHeartbeats();
    if (heartbeats.some((row) => jobStatusOf(row, now) === "late")) await sendOpsAlert("job_stale");
    const [{ stuck }] = await sql<{ stuck: number }[]>`
      select (
        select count(*) from refunds
        where status in ('unknown', 'sending') and coalesce(claimed_at, created_at) < now() - make_interval(mins => ${REFUND_STUCK_MINUTES})
      )::int + (
        select count(*) from payment_extras
        where state in ('refund_unknown', 'refund_sending') and coalesce(refund_claimed_at, created_at) < now() - make_interval(mins => ${REFUND_STUCK_MINUTES})
      )::int as stuck
    `;
    if (stuck > 0) await sendOpsAlert("refund_unknown");
    await flushSuppressedAlerts();
  } catch (err) {
    console.error("[ops-watchdog] failed", err instanceof Error ? err.name : "unknown");
  }
}

/**
 * الفحص بعد إرسال صفحة المالك: إن توقفت الوظائف كلها ولا مراقب خارجي، يصل التنبيه حين يفتح المالك لوحته.
 * محدود كبقية الاستدعاءات، ولا يؤخر الصفحة. خارج سياق الطلب (الاختبارات) يعمل مباشرة
 */
export async function runOpsWatchdogAfterResponse(): Promise<void> {
  try {
    after(() => runOpsWatchdog());
  } catch {
    await runOpsWatchdog();
  }
}

/** جدول وظيفة التسوية في هذا النشر: daily حتى الترقية إلى Pro، وfrequent بعد التعديل الموثق في README */
export function reconcileCadence(): "daily" | "frequent" {
  const schedule = vercelConfig.crons.find((cron) => cron.path === "/api/cron/reconcile-payments")?.schedule ?? "";
  return schedule.split(" ")[0]?.includes("/") ? "frequent" : "daily";
}
