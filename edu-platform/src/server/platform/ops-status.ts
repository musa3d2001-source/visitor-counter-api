import "server-only";
import { sql } from "../db";
import { configWarnings, env, opsAlertEmail } from "../env";
import { paymentsConfig } from "../payments/service";
import { bunnyConfigured } from "../video/bunny";
import { paidVideoWithoutStreaming } from "../video/policy";
import { SATURATION_KINDS, type SaturationKind } from "./saturation";
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
  /** متغيرات اختيارية بقيمة لا تُقرأ، تعمل بقيمتها الافتراضية. الأسماء وحدها */
  unreadableVariables: string[];
};

export function opsConfig(): OpsConfig {
  const e = env();
  const cfg = paymentsConfig();
  return {
    cronConfigured: (e.CRON_SECRET?.length ?? 0) >= MIN_CRON_SECRET_LENGTH,
    alertEmailConfigured: opsAlertEmail() !== null,
    mailIsReal: e.MAIL_DRIVER === "smtp",
    liveWithDailyReconcile: cfg.enabled && cfg.environment === "live" && reconcileCadence() === "daily",
    unreadableVariables: configWarnings(),
  };
}

/** هل فشلت آخر رسالة تنبيه حاول الخادم إرسالها؟ عنوان صحيح وSMTP مضبوط لا يثبتان أن الرسائل تصل */
export async function lastAlertSendFailed(): Promise<boolean> {
  const [last] = await sql<{ status: string }[]>`select status from email_log where template = 'ops_alert' order by id desc limit 1`;
  return last?.status === "failed";
}

export type AlertDelivery = "sent" | "failed" | "logged" | "none";

/**
 * مصير آخر رسالة تنبيه أو تجربة إلى البريد المضبوط الآن. sent وحدها تعني أن خادم البريد قبلها.
 * رسالة إلى عنوان سابق لا تُحسب: تغيير OPS_ALERT_EMAIL يعيد الخطوة مفتوحة حتى تخرج رسالة إلى الجديد.
 */
export async function alertDelivery(): Promise<AlertDelivery> {
  const to = opsAlertEmail();
  if (!to) return "none";
  const [last] = await sql<{ status: "sent" | "failed" | "logged" }[]>`
    select status from email_log
    where template in ('ops_alert', 'ops_alert_test') and lower(to_email) = lower(${to})
    order by id desc limit 1
  `;
  return last?.status ?? "none";
}

export type JobView = JobHeartbeat & { status: JobStatus };

export async function jobViews(): Promise<JobView[]> {
  const rows = await listJobHeartbeats();
  return rows.map((row) => ({ ...row, status: jobStatusOf(row) }));
}

export type HeldVideo = { lesson_id: string; lesson_title: string; product_id: string; product_title: string };

/** دروس تغيّر فيديوها بعد اعتمادها وتنتظر قرار المالك */
export async function heldVideoLessons(): Promise<HeldVideo[]> {
  return sql<HeldVideo[]>`
    select l.id as lesson_id, l.title as lesson_title, p.id as product_id, p.title as product_title
    from lessons l join products p on p.id = l.product_id
    where l.processing_status = 'held'
    order by l.status_checked_at desc nulls last limit 50
  `;
}

/** منتجات مدفوعة منشورة يُشاهَد فيديوها بلا مزود بث */
export function paidRawVideoCount(): Promise<number> {
  return paidVideoWithoutStreaming(sql, env().VIDEO_PROVIDER === "bunny" && bunnyConfigured());
}

export type SaturationView = { kind: SaturationKind; lastDay: number; lastWeek: number };

/** كم مرة امتلأ كل شيء في آخر ٢٤ ساعة وآخر ٧ أيام، بترتيب ثابت. نوع لم يحدث يظهر بصفر */
export async function saturationViews(): Promise<SaturationView[]> {
  const rows = await sql<{ kind: SaturationKind; last_day: number; last_week: number }[]>`
    select kind,
      least(coalesce(sum(count) filter (where hour > date_trunc('hour', now()) - interval '24 hours'), 0), 2000000000)::int as last_day,
      least(sum(count), 2000000000)::int as last_week
    from saturation_counters
    where hour > date_trunc('hour', now()) - interval '7 days'
    group by kind
  `;
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  return SATURATION_KINDS.map((kind) => ({ kind, lastDay: byKind.get(kind)?.last_day ?? 0, lastWeek: byKind.get(kind)?.last_week ?? 0 }));
}

export type OpsSummary = OpsConfig & { jobsNeedingAttention: number; errorsLast24h: number };

/** ما يكفي للتحذير في الصفحة الرئيسية للوحة المالك */
export async function opsSummary(): Promise<OpsSummary> {
  const [jobs, [{ n }]] = await Promise.all([jobViews(), sql<{ n: number }[]>`select count(*)::int as n from error_events where last_seen_at > now() - interval '24 hours'`]);
  return { ...opsConfig(), jobsNeedingAttention: jobs.filter((job) => job.status === "failed" || job.status === "late").length, errorsLast24h: n };
}
