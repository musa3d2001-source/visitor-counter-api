import "server-only";
import { sql } from "../db";
import { closeOrder } from "../commerce/orders";
import { INVOICE_TTL_MINUTES, ORDER_LIFETIME_HOURS } from "./limits";
import { paymentsConfig, verifyAndApplyPayment } from "./service";

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
const ABANDONED_CLAIM_MINUTES = 60;
/** فاتورة طلب أُغلق تُتابَع حتى هذه المدة بعد انتهاء رابطها، لالتقاط دفعة تأخر تأكيدها */
const LINK_STILL_PAYABLE_HOURS = 3;

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
        console.error("[reconcile] invoice check failed", row.id, err instanceof Error ? err.message : String(err));
      }
    }
  }

  // الإغلاق لا يعتمد على هذه الجولة: يكفي أن كل فاتورة ردت عنها البوابة بعد انقضاء عمر الطلب، فلا يمكن أن يخفي دفعة.
  // عند إيقاف الدفع لا نستطيع السؤال، فلا يُغلق إلا طلب لم يصل البوابة أصلًا. وفواتير sandbox لا تعيق الإغلاق في وضع live لأنها لن تُفحص أبدًا.
  const environment = cfg.enabled ? cfg.environment : "none";
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
  for (const { id } of closable) {
    const done = await sql.begin((db) => closeOrder(db, { orderId: id, reason: "expired", actorId: null }));
    if (done) report.closed++;
  }

  const abandoned = await sql`
    update payments set status = 'failed', error_message = 'لم تكتمل محاولة إنشاء رابط الدفع'
    where provider = 'myfatoorah' and status = 'initiated' and gateway_invoice_id is null
      and created_at < now() - make_interval(mins => ${ABANDONED_CLAIM_MINUTES})
    returning id
  `;
  report.abandonedClaims = abandoned.length;
  return report;
}
