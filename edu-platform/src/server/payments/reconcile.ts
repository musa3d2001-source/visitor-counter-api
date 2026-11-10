import "server-only";
import { sql } from "../db";
import { closeOrder } from "../commerce/orders";
import { ORDER_LIFETIME_HOURS } from "./limits";
import { isDatabaseBusy } from "../db-busy";
import { reportError } from "../platform/report-error";
import { claimDueInvoices, releaseClaims } from "./invoice-queue";
import { paymentsConfig, recheckExtraPayment, recheckOrderRefund, verifyAndApplyPayment } from "./service";

/**
 * وظيفة التسوية (A7, A8): شبكة الأمان عندما لا يصلنا Webhook ولا يعود الطالب من صفحة الدفع.
 * آمنة للتشغيل المتزامن والمكرر، لأن Vercel قد يكرر الاستدعاء أو يفوّته:
 *  - المطالبة بالدفعة بقفل SKIP LOCKED مع عقد مؤقت، فلا تعالج نسختان الفاتورة نفسها.
 *  - تطبيق النتيجة محمي أصلًا بقفل الطلب، وإعادة التطبيق لا تغير شيئًا.
 *  - الإغلاق محروس بشرط الحالة، فيُغلق الطلب ويُدقق مرة واحدة.
 * الجولة تعمل حتى ينفد وقتها لا حتى عدد ثابت، وما يدخل الطابور معرّف في invoice-queue.ts.
 * الفشل يتوقف بأمان: انقطاع البوابة يوقف الجولة ويحرر كل ما لم يُفحص، ولا يُغلق طلب لم تُفحص فواتيره.
 */

/** حجم كل مطالبة: صغير حتى لا يبقى عند التوقف المبكر إلا القليل، والجولة تطالب من جديد حتى ينفد الطابور أو الوقت */
export const RECONCILE_BATCH_SIZE = 12;
/** فحوص متزامنة: البوابة تأخذ نحو ثانية للرد، وعلى جدول يومي يجب أن يفرغ الطابور في جولة واحدة. لا اتصال قاعدة بيانات محجوز أثناء انتظار البوابة */
const RECONCILE_WORKERS = 4;
/**
 * وقت الجولة كله. maxDuration للمسار ١٢٠ ثانية (الحد على Hobby مع Fluid ٣٠٠ ثانية، وثائق Vercel 2026-08):
 * ما يُبدأ قبل نفاد الوقت قد يأخذ مهلة نداء كاملة بعده، ويبقى هامش لتسجيل النبض.
 */
export const RECONCILE_BUDGET_MS = 100_000;
export const CALL_TIMEOUT_MS = 8_000;
const INVOICES_SHARE = 0.7;
const SWEEPS_SHARE = 0.85;
const STOP_AFTER_FAILURES = 3;
const CLOSE_BATCH_SIZE = 50;
const CLOSE_TIME_BUDGET_MS = 45_000;
const ABANDONED_CLAIM_MINUTES = 60;
const ABANDONED_CLAIM_BATCH = 200;
/** استرداد قبلته البوابة ولم يُحسم بعد هذه المدة نسأل عنه، ثم مرة كل هذه المدة: نتيجته لا يصح أن تعتمد على Webhook واحد */
const REFUND_SWEEP_HOURS = 3;
const REFUND_SWEEP_BATCH = 15;

export type ReconcileReport = {
  mode: "sandbox" | "live" | "none";
  claimed: number;
  checked: number;
  paid: number;
  flagged: number;
  invalid: number;
  errors: number;
  /** مُطالب بها ولم تُفحص، وأُعيدت إلى الطابور */
  skipped: number;
  stoppedEarly: boolean;
  closed: number;
  abandonedClaims: number;
  refundsChecked: number;
  refundsResolved: number;
  refundErrors: number;
};

/** نص الفشل، أو null: فشل الجولة يعني أن البوابة لم تجب عن شيء مما سُئلت عنه. جولة لا شيء مستحق فيها نجاح */
export function reconcileFailure(report: ReconcileReport): string | null {
  const failed = report.errors + report.refundErrors;
  const answered = report.checked + report.invalid + report.refundsChecked - report.refundErrors;
  return failed > 0 && answered === 0 ? "لم تجب بوابة الدفع عن أي فاتورة" : null;
}

type EnabledConfig = Extract<ReturnType<typeof paymentsConfig>, { enabled: true }>;

/**
 * يطالب ويفحص حتى يفرغ المسار أو ينفد الوقت أو تتعطل البوابة.
 * عند التوقف المبكر يحرر كل ما لم تُعرف نتيجته، فلا ينتظر بعده خمس دقائق عقدًا لم يُستعمل، والجولة التالية أو زر المالك تبدأ منه.
 * فاتورة واحدة لم تُجب في جولة مستمرة تبقى بعقدها: لا تُعاد المطالبة بها في الجولة نفسها.
 * الناتج: هل فرغ المسار فعلًا.
 */
async function drainLane(cfg: EnabledConfig, lane: "unverified" | "settled", report: ReconcileReport, deadline: number, failures: { consecutive: number }): Promise<boolean> {
  const halted = () => Date.now() > deadline || failures.consecutive >= STOP_AFTER_FAILURES;
  while (!halted()) {
    const claimed = await claimDueInvoices(cfg.environment, lane, RECONCILE_BATCH_SIZE);
    if (claimed.length === 0) return true;
    report.claimed += claimed.length;
    let next = 0;
    const unanswered: string[] = [];
    let busy: unknown = null;
    const worker = async () => {
      while (next < claimed.length && !halted() && busy === null) {
        const row = claimed[next++];
        try {
          const result = await verifyAndApplyPayment({ invoiceId: row.gateway_invoice_id }, { timeoutMs: CALL_TIMEOUT_MS });
          failures.consecutive = 0;
          if (result.state === "invalid") report.invalid++;
          else report.checked++;
          if (result.state === "paid" && result.changed) report.paid++;
          if (result.state === "flagged") report.flagged++;
        } catch (err) {
          unanswered.push(row.id);
          if (isDatabaseBusy(err)) {
            busy = err;
            return;
          }
          report.errors++;
          failures.consecutive++;
          await reportError("reconcile:invoice", err);
        }
      }
    };
    await Promise.all(Array.from({ length: RECONCILE_WORKERS }, worker));
    const unreached = claimed.slice(next).map((row) => row.id);
    if (busy !== null) {
      await releaseClaims([...unreached, ...unanswered]).catch(() => undefined);
      throw busy;
    }
    if (unreached.length || halted()) {
      report.skipped += unreached.length;
      report.stoppedEarly = true;
      await releaseClaims([...unreached, ...unanswered]);
      return false;
    }
  }
  report.stoppedEarly = true;
  return false;
}

export async function runPaymentReconciliation(opts: { budgetMs?: number } = {}): Promise<ReconcileReport> {
  const cfg = paymentsConfig();
  const report: ReconcileReport = {
    mode: cfg.enabled ? cfg.environment : "none",
    claimed: 0,
    checked: 0,
    paid: 0,
    flagged: 0,
    invalid: 0,
    errors: 0,
    skipped: 0,
    stoppedEarly: false,
    closed: 0,
    abandonedClaims: 0,
    refundsChecked: 0,
    refundsResolved: 0,
    refundErrors: 0,
  };

  if (cfg.enabled) {
    const started = Date.now();
    const budget = opts.budgetMs ?? RECONCILE_BUDGET_MS;
    const failures = { consecutive: 0 };
    const drained = await drainLane(cfg, "unverified", report, started + budget * INVOICES_SHARE, failures);

    let consecutiveFailures = failures.consecutive;
    const sweepsDeadline = started + budget * SWEEPS_SHARE;

    // الاستردادات بعد الفواتير: مال وصل للتو أولى بالوقت. المطالبة بعقد مؤقت حتى لا تكررها نسخة متزامنة، وما لم يُفحص يُعاد في الجولة التالية
    const budgetLeft = () => Date.now() <= sweepsDeadline && consecutiveFailures < STOP_AFTER_FAILURES;
    const sweep = async (ids: string[], release: (ids: string[]) => Promise<unknown>, check: (id: string) => Promise<boolean>) => {
      for (const [index, id] of ids.entries()) {
        if (!budgetLeft()) {
          report.stoppedEarly = true;
          await release(ids.slice(index));
          return;
        }
        try {
          report.refundsChecked++;
          if (await check(id)) report.refundsResolved++;
          consecutiveFailures = 0;
        } catch (err) {
          report.refundErrors++;
          consecutiveFailures++;
          await reportError("reconcile:refund", err);
        }
      }
    };
    if (budgetLeft()) {
      const refunds = await sql<{ id: string }[]>`
        with batch as materialized (
          select r.id from refunds r join payments p on p.id = r.payment_id
          where r.status = 'requested' and p.environment = ${cfg.environment}
            and coalesce(r.accepted_at, r.created_at) < now() - make_interval(hours => ${REFUND_SWEEP_HOURS})
            and (r.swept_at is null or r.swept_at < now() - make_interval(hours => ${REFUND_SWEEP_HOURS}))
          order by r.swept_at asc nulls first
          limit ${REFUND_SWEEP_BATCH}
          for update of r skip locked
        )
        update refunds r set swept_at = now()
        from batch where r.id = batch.id
        returning r.id
      `;
      await sweep(
        refunds.map((r) => r.id),
        (ids) => sql`update refunds set swept_at = null where id = any(${ids}::uuid[])`,
        async (refundId) => (await recheckOrderRefund({ refundId, adminId: null }, { timeoutMs: CALL_TIMEOUT_MS })).state !== "requested",
      );
    }
    if (budgetLeft()) {
      const extras = await sql<{ id: string }[]>`
        with batch as materialized (
          select e.id from payment_extras e join payments p on p.id = e.payment_id
          where e.state = 'refund_requested' and p.environment = ${cfg.environment}
            and coalesce(e.refund_requested_at, e.created_at) < now() - make_interval(hours => ${REFUND_SWEEP_HOURS})
            and (e.swept_at is null or e.swept_at < now() - make_interval(hours => ${REFUND_SWEEP_HOURS}))
          order by e.swept_at asc nulls first
          limit ${REFUND_SWEEP_BATCH}
          for update of e skip locked
        )
        update payment_extras e set swept_at = now()
        from batch where e.id = batch.id
        returning e.id
      `;
      await sweep(
        extras.map((e) => e.id),
        (ids) => sql`update payment_extras set swept_at = null where id = any(${ids}::uuid[])`,
        async (extraId) => (await recheckExtraPayment({ extraId, adminId: null }, { timeoutMs: CALL_TIMEOUT_MS })).state !== "refund_requested",
      );
    }
    // آخر الأولويات: المال الذي لم يصل والاستردادات المعلقة قبل الفحص الأخير لفاتورة مدفوعة
    if (drained && budgetLeft()) {
      failures.consecutive = consecutiveFailures;
      await drainLane(cfg, "settled", report, sweepsDeadline, failures);
    }
  }

  const closing = await closeExpiredOrders();
  report.closed = closing.closed;
  report.abandonedClaims = closing.abandonedClaims;
  return report;
}

export type CloseReport = { closed: number; abandonedClaims: number; finished: boolean };

/**
 * إغلاق الطلبات التي انقضى عمرها، ومحاولات إنشاء رابط الدفع التي لم تكتمل. محدود بعدد الجولات وبالوقت، وما تبقى يُغلق في الجولة التالية.
 * لا يعتمد على جولة التسوية: يكفي أن كل فاتورة ردت عنها البوابة بعد انقضاء عمر الطلب، فلا يمكن أن يخفي دفعة.
 * عند إيقاف الدفع لا نستطيع السؤال، فلا يُغلق إلا طلب لم يصل البوابة أصلًا. وفواتير sandbox لا تعيق الإغلاق في وضع live لأنها لن تُفحص أبدًا.
 */
export async function closeExpiredOrders(opts: { rounds?: number } = {}): Promise<CloseReport> {
  const cfg = paymentsConfig();
  const environment = cfg.enabled ? cfg.environment : "none";
  const rounds = opts.rounds ?? 1;
  const started = Date.now();
  let closed = 0;
  let finished = true;

  for (let round = 0; round < rounds; round++) {
    if (Date.now() - started > CLOSE_TIME_BUDGET_MS) {
      finished = false;
      break;
    }
    const closable = await sql<{ id: string }[]>`
      select o.id from orders o
      where o.status in ('pending', 'failed')
        and o.created_at <= now() - make_interval(hours => ${ORDER_LIFETIME_HOURS})
        and not exists (
          select 1 from payments p
          where p.order_id = o.id and p.provider = 'myfatoorah' and p.gateway_invoice_id is not null
            and not (${environment} = 'live' and p.environment = 'sandbox')
            and (${environment} = 'none' or p.last_checked_at is null or p.last_checked_at < o.created_at + make_interval(hours => ${ORDER_LIFETIME_HOURS}))
        )
      order by o.created_at asc
      limit ${CLOSE_BATCH_SIZE}
    `;
    let closedThisRound = 0;
    for (const { id } of closable) {
      const done = await sql.begin((db) => closeOrder(db, { orderId: id, reason: "expired", actorId: null }));
      if (done) closedThisRound++;
    }
    closed += closedThisRound;
    if (closable.length < CLOSE_BATCH_SIZE) break;
    // دفعة كاملة ولم يُغلق منها شيء: نسخة متزامنة تعمل عليها، فلا نكرر السؤال نفسه
    if (closedThisRound === 0 || round === rounds - 1) finished = false;
    if (closedThisRound === 0) break;
  }

  // الدفعة MATERIALIZED تُحسب مرة واحدة: داخل IN قد يعيد المخطط تنفيذها لكل صف، فيتخطى القفل ما حدّثه الأمر نفسه ويتجاوز الحد
  const abandoned = await sql`
    with batch as materialized (
      select id from payments
      where provider = 'myfatoorah' and status = 'initiated' and gateway_invoice_id is null
        and created_at < now() - make_interval(mins => ${ABANDONED_CLAIM_MINUTES})
      order by created_at asc
      limit ${ABANDONED_CLAIM_BATCH}
      for update skip locked
    )
    update payments p set status = 'failed', error_message = 'لم تكتمل محاولة إنشاء رابط الدفع'
    from batch where p.id = batch.id
    returning p.id
  `;
  return { closed, abandonedClaims: abandoned.length, finished };
}
