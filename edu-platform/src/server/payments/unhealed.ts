import "server-only";
import { sql } from "../db";
import { audit } from "../platform/audit";
import { runScheduledJob } from "../platform/scheduled-jobs";
import { unverifiedDue } from "./invoice-queue";
import { reconcileFailure, runPaymentReconciliation, type ReconcileReport } from "./reconcile";
import { paymentsConfig } from "./service";

/**
 * ما يراه المالك في صفحة صحة المنصة: مال لم يتحول إلى وصول، وفواتير لم يتأكد مصيرها بعد.
 * لا أسماء ولا بريد: رقم الطلب والعمر فقط، والتفاصيل في صفحة الطلب.
 */
const LIST_LIMIT = 30;
/** أصغر من هذا يكون المشتري على صفحة الدفع أو في طريقه إلى فحص الزيارة، فلا يُعد متأخرًا */
const UNVERIFIED_MIN_AGE_MINUTES = 15;
/** فحص أثقل على كل الطلبات المدفوعة، فهو محدود بما يمكن أن يفتحه المالك فعلًا */
const NO_ACCESS_LOOKBACK_DAYS = 90;
/** لا تتجاوز maxDuration لصفحة صحة المنصة (٦٠ ثانية) */
const OWNER_RUN_BUDGET_MS = 40_000;

export type PaidNotGrantedReason = "payment_not_applied" | "needs_decision" | "no_access";

/** unknown_at_gateway: أجابت البوابة الحالية أنها لا تعرف هذه الفاتورة (F28)، فالسؤال عن الحساب أو المفتاح لا عن الدفع */
export type UnhealedRow = { order_id: string; order_number: string; is_test: boolean; amount_fils: number; since: Date; last_checked_at: Date | null; unknown_at_gateway?: boolean };

export type UnhealedOrders = {
  paidNotGranted: (UnhealedRow & { reason: PaidNotGrantedReason })[];
  unverified: UnhealedRow[];
  unverifiedTotal: number;
};

export async function unhealedOrders(): Promise<UnhealedOrders> {
  const cfg = paymentsConfig();
  const [paidNotGranted, unverified, [{ n }]] = await Promise.all([
    sql<UnhealedOrders["paidNotGranted"]>`
      select o.id as order_id, o.number as order_number, o.is_test, o.total_fils as amount_fils, x.since, x.reason, null::timestamptz as last_checked_at
      from (
        select p.order_id, 'payment_not_applied' as reason, coalesce(p.paid_at, p.created_at) as since
        from payments p join orders ord on ord.id = p.order_id
        where p.status = 'paid' and ord.status in ('pending', 'failed')
        union all
        select e.order_id, 'needs_decision', e.created_at from payment_extras e
        where e.state = 'open' and e.kind in ('late_review', 'amount_mismatch')
        union all
        select ord.id, 'no_access', ord.paid_at from orders ord
        where ord.status = 'paid' and ord.paid_at > now() - make_interval(days => ${NO_ACCESS_LOOKBACK_DAYS})
          and exists (
            select 1 from order_items oi
            where oi.order_id = ord.id and oi.product_id is not null and not exists (select 1 from entitlements en where en.user_id = ord.user_id and en.product_id = oi.product_id)
          )
      ) x join orders o on o.id = x.order_id
      order by x.since asc limit ${LIST_LIMIT}
    `,
    cfg.enabled
      ? sql<UnhealedRow[]>`
          select o.id as order_id, o.number as order_number, o.is_test, q.amount_fils, q.created_at as since, q.last_checked_at,
            q.gateway_unknown_last_at is not null as unknown_at_gateway
          from payments q join orders o on o.id = q.order_id
          where o.status in ('pending', 'failed') and q.created_at < now() - make_interval(mins => ${UNVERIFIED_MIN_AGE_MINUTES})
            and ${unverifiedDue(sql, cfg.environment)}
          order by (q.gateway_unknown_last_at is not null) asc, q.created_at asc limit ${LIST_LIMIT}
        `
      : Promise.resolve([] as UnhealedRow[]),
    cfg.enabled
      ? sql<{ n: number }[]>`
          select count(*)::int as n
          from payments q join orders o on o.id = q.order_id
          where o.status in ('pending', 'failed') and q.created_at < now() - make_interval(mins => ${UNVERIFIED_MIN_AGE_MINUTES})
            and ${unverifiedDue(sql, cfg.environment)}
        `
      : Promise.resolve([{ n: 0 }]),
  ]);
  return { paidNotGranted: [...paidNotGranted], unverified: [...unverified], unverifiedTotal: n };
}

export type ReconcileNowOutcome = { state: "done"; report: ReconcileReport } | { state: "failed"; report?: ReconcileReport } | { state: "overlapped" };

/**
 * زر «افحص الآن». عقد الوظيفة نفسه يمنع جولتين معًا، والمطالبة بالفواتير ومنح الطلب يحميان حتى لو تداخلا، فالضغطتان لا تمنحان مرتين.
 * الجولة تُسجَّل في نبض الوظيفة كأي جولة، وتُدقق باسم من ضغط.
 */
export async function reconcileNow(actor: { adminId: string; ip: string | null }): Promise<ReconcileNowOutcome> {
  const run = await runScheduledJob("reconcile-payments", () => runPaymentReconciliation({ budgetMs: OWNER_RUN_BUDGET_MS }), reconcileFailure);
  const report = run.state === "overlapped" ? null : (run.report ?? null);
  await audit({
    actorId: actor.adminId,
    action: "payments.reconcile_now",
    entityType: "payment",
    entityId: "reconcile",
    metadata: { state: run.state, claimed: report?.claimed ?? 0, checked: report?.checked ?? 0, paid: report?.paid ?? 0, errors: report?.errors ?? 0, stoppedEarly: report?.stoppedEarly ?? false },
    ip: actor.ip,
  });
  if (run.state === "overlapped") return { state: "overlapped" };
  return run.state === "done" ? { state: "done", report: run.report } : { state: "failed", report: run.report };
}
