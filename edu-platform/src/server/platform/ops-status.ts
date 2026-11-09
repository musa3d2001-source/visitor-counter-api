import "server-only";
import { sql } from "../db";
import { env, opsAlertEmail } from "../env";
import { paymentsConfig } from "../payments/service";
import { jobStatusOf, listJobHeartbeats, reconcileCadence, type JobHeartbeat, type JobStatus } from "./scheduled-jobs";

/**
 * ما يعرضه المالك عن تشغيل المنصة. المتغيرات التشغيلية الأحدث لا توقف الموقع أبدًا،
 * فهذه الصفحة هي مكان ظهور نقصها، مع وظيفة مرفوضة بدل موقع متوقف.
 */
const MIN_CRON_SECRET_LENGTH = 16;

export type OpsConfig = {
  cronConfigured: boolean;
  alertEmailConfigured: boolean;
  mailIsReal: boolean;
  /** الدفع الحقيقي مفعّل وجدول التسوية ما زال يوميًا: الدفعة التي ضاع إشعارها تنتظر يومًا كاملًا */
  liveWithDailyReconcile: boolean;
};

export function opsConfig(): OpsConfig {
  const e = env();
  const cfg = paymentsConfig();
  return {
    cronConfigured: (e.CRON_SECRET?.length ?? 0) >= MIN_CRON_SECRET_LENGTH,
    alertEmailConfigured: opsAlertEmail() !== null,
    mailIsReal: e.MAIL_DRIVER === "smtp",
    liveWithDailyReconcile: cfg.enabled && cfg.environment === "live" && reconcileCadence() === "daily",
  };
}

export type JobView = JobHeartbeat & { status: JobStatus };

export async function jobViews(): Promise<JobView[]> {
  const rows = await listJobHeartbeats();
  return rows.map((row) => ({ ...row, status: jobStatusOf(row) }));
}

export type OpsSummary = OpsConfig & { jobsNeedingAttention: number; errorsLast24h: number };

/** ما يكفي للتحذير في الصفحة الرئيسية للوحة المالك */
export async function opsSummary(): Promise<OpsSummary> {
  const [jobs, [{ n }]] = await Promise.all([jobViews(), sql<{ n: number }[]>`select count(*)::int as n from error_events where last_seen_at > now() - interval '24 hours'`]);
  return { ...opsConfig(), jobsNeedingAttention: jobs.filter((job) => job.status === "failed" || job.status === "late").length, errorsLast24h: n };
}
