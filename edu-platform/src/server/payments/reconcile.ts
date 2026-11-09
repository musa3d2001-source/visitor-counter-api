import "server-only";
import { sql } from "../db";
import { closeOrder } from "../commerce/orders";
import { INVOICE_TTL_MINUTES, ORDER_LIFETIME_HOURS } from "./limits";
import { reportError } from "../platform/report-error";
import { paymentsConfig, recheckExtraPayment, recheckOrderRefund, verifyAndApplyPayment } from "./service";

/**
 * وظيفة التسوية (A7, A8): شبكة الأمان عندما لا يصلنا Webhook ولا يعود الطالب من صفحة الدفع.
 * آمنة للتشغيل المتزامن والمكرر، لأن Vercel قد يكرر الاستدعاء أو يفوّته:
 *  - المطالبة بالدفعة بقفل SKIP LOCKED مع عقد مؤقت، فلا تعالج نسختان الفاتورة نفسها.
 *  - تطبيق النتيجة محمي أصلًا بقفل الطلب، وإعادة التطبيق لا تغير شيئًا.
 *  - الإغلاق محروس بشرط الحالة، فيُغلق الطلب ويُدقق مرة واحدة.
 * الفشل يتوقف بأمان: انقطاع البوابة يوقف الجولة، وما لم يُفحص يُعاد في الجولة التالية، ولا يُغلق طلب لم تُفحص فواتيره.
 */

/** أصغر من أن يقترب من مهلة الدالة حتى لو ردت البوابة ببطء */
export const RECONCILE_BATCH_SIZE = 25;
const RECHECK_AFTER_MINUTES = 10;
const CLAIM_LEASE_MINUTES = 5;
const TIME_BUDGET_MS = 45_000;
const CALL_TIMEOUT_MS = 8_000;
const STOP_AFTER_FAILURES = 3;
const CLOSE_BATCH_SIZE = 50;
const CLOSE_TIME_BUDGET_MS = 45_000;
const ABANDONED_CLAIM_MINUTES = 60;
const ABANDONED_CLAIM_BATCH = 200;
/** فاتورة طلب أُغلق تُتابَع حتى هذه المدة بعد انتهاء رابطها، لالتقاط دفعة تأخر تأكيدها */
const LINK_STILL_PAYABLE_HOURS = 3;
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
  skipped: number;
  stoppedEarly: boolean;
  closed: number;
  abandonedClaims: number;
  refundsChecked: number;
  refundsResolved: number;
  refundErrors: number;
};

export async function runPaymentReconciliation(): Promise<ReconcileReport> {
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
    const claimed = await sql<{ id: string; gateway_invoice_id: string }[]>`
      update payments set reconcile_claimed_at = now()
      where id in (
        select q.id from payments q
        join orders o on o.id = q.order_id
        where q.provider = 'myfatoorah' and q.gateway_invoice_id is not null
          and q.environment = ${cfg.environment}
          and (
            (q.status in ('initiated', 'pending', 'failed', 'expired') and o.status in ('pending', 'failed'))
            -- فاتورة مدفوعة تبقى ضمن المتابعة طوال عمر رابطها: عملية ثانية عليها لا يكشفها غير البوابة إن ضاع Webhook
            or (q.status in ('initiated', 'pending', 'failed', 'expired', 'paid', 'refunded') and coalesce(q.expires_at, q.created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) > now() - make_interval(hours => ${LINK_STILL_PAYABLE_HOURS}))
          )
          and (q.last_checked_at is null or q.last_checked_at < now() - make_interval(mins => ${RECHECK_AFTER_MINUTES}))
          and (q.reconcile_claimed_at is null or q.reconcile_claimed_at < now() - make_interval(mins => ${CLAIM_LEASE_MINUTES}))
        order by (o.status in ('pending', 'failed') and o.created_at <= now() - make_interval(hours => ${ORDER_LIFETIME_HOURS})) desc,
          greatest(q.last_checked_at, q.reconcile_claimed_at) asc nulls first
        limit ${RECONCILE_BATCH_SIZE}
        for update of q skip locked
      )
      returning id, gateway_invoice_id
    `;
    report.claimed = claimed.length;
    let consecutiveFailures = 0;
    for (const [index, row] of claimed.entries()) {
      if (Date.now() - started > TIME_BUDGET_MS || consecutiveFailures >= STOP_AFTER_FAILURES) {
        report.skipped = claimed.length - index;
        report.stoppedEarly = true;
        break;
      }
      try {
        const result = await verifyAndApplyPayment({ invoiceId: row.gateway_invoice_id }, { timeoutMs: CALL_TIMEOUT_MS });
        consecutiveFailures = 0;
        if (result.state === "invalid") report.invalid++;
        else report.checked++;
        if (result.state === "paid" && result.changed) report.paid++;
        if (result.state === "flagged") report.flagged++;
      } catch (err) {
        report.errors++;
        consecutiveFailures++;
        await reportError("reconcile:invoice", err);
      }
    }

    // الاستردادات بعد الفواتير: مال وصل للتو أولى بالوقت. المطالبة بعقد مؤقت حتى لا تكررها نسخة متزامنة، وما لم يُفحص يُعاد في الجولة التالية
    const budgetLeft = () => Date.now() - started <= TIME_BUDGET_MS && consecutiveFailures < STOP_AFTER_FAILURES;
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
        update refunds set swept_at = now()
        where id in (
          select r.id from refunds r join payments p on p.id = r.payment_id
          where r.status = 'requested' and p.environment = ${cfg.environment}
            and coalesce(r.accepted_at, r.created_at) < now() - make_interval(hours => ${REFUND_SWEEP_HOURS})
            and (r.swept_at is null or r.swept_at < now() - make_interval(hours => ${REFUND_SWEEP_HOURS}))
          order by r.swept_at asc nulls first
          limit ${REFUND_SWEEP_BATCH}
          for update of r skip locked
        )
        returning id
      `;
      await sweep(
        refunds.map((r) => r.id),
        (ids) => sql`update refunds set swept_at = null where id = any(${ids}::uuid[])`,
        async (refundId) => (await recheckOrderRefund({ refundId, adminId: null }, { timeoutMs: CALL_TIMEOUT_MS })).state !== "requested",
      );
    }
    if (budgetLeft()) {
      const extras = await sql<{ id: string }[]>`
        update payment_extras set swept_at = now()
        where id in (
          select e.id from payment_extras e join payments p on p.id = e.payment_id
          where e.state = 'refund_requested' and p.environment = ${cfg.environment}
            and coalesce(e.refund_requested_at, e.created_at) < now() - make_interval(hours => ${REFUND_SWEEP_HOURS})
            and (e.swept_at is null or e.swept_at < now() - make_interval(hours => ${REFUND_SWEEP_HOURS}))
          order by e.swept_at asc nulls first
          limit ${REFUND_SWEEP_BATCH}
          for update of e skip locked
        )
        returning id
      `;
      await sweep(
        extras.map((e) => e.id),
        (ids) => sql`update payment_extras set swept_at = null where id = any(${ids}::uuid[])`,
        async (extraId) => (await recheckExtraPayment({ extraId, adminId: null }, { timeoutMs: CALL_TIMEOUT_MS })).state !== "refund_requested",
      );
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

  const abandoned = await sql`
    update payments set status = 'failed', error_message = 'لم تكتمل محاولة إنشاء رابط الدفع'
    where id in (
      select id from payments
      where provider = 'myfatoorah' and status = 'initiated' and gateway_invoice_id is null
        and created_at < now() - make_interval(mins => ${ABANDONED_CLAIM_MINUTES})
      order by created_at asc
      limit ${ABANDONED_CLAIM_BATCH}
      for update skip locked
    )
    returning id
  `;
  return { closed, abandonedClaims: abandoned.length, finished };
}
