import "server-only";
import { sql, type Db } from "../db";
import { audit } from "../platform/audit";
import { CHARGE_CHECK_FRESH_MINUTES, IN_PROGRESS_GRACE_MINUTES, INVOICE_TTL_MINUTES, REFUND_STUCK_HOURS } from "./limits";

/**
 * الدفعات الزائدة: مال حقيقي أكدته البوابة ولا يكمل طلبًا.
 * تُسجل دائمًا ولا تضيع، وتظهر للمالك في قائمة. معالجتها (استرداد أو إغلاق) لا تمس الطلب ولا الوصول ولا الأرباح.
 * هذا الملف قاعدة بيانات فقط، أما الاستدعاء الفعلي للبوابة ففي service.ts.
 */

export type ExtraPaymentKind = "duplicate" | "after_refund" | "late_review" | "amount_mismatch";
export type ExtraPaymentState = "open" | "refund_sending" | "refund_unknown" | "refund_requested" | "refunded" | "refund_failed" | "dismissed";

export type ExtraPayment = {
  id: string;
  payment_id: string;
  order_id: string;
  order_number: string;
  order_is_test: boolean;
  kind: ExtraPaymentKind;
  state: ExtraPaymentState;
  amount_fils: number;
  details: { blockers?: string[]; source?: string; gatewayAmountFils?: number };
  gateway_invoice_id: string | null;
  gateway_payment_id: string | null;
  gateway_refund_id: string | null;
  refund_error: string | null;
  refund_reason: string | null;
  refund_requested_at: Date | null;
  created_at: Date;
};

/** الحالات التي تنتظر قرارًا من المالك الآن */
const NEEDS_OWNER = ["open", "refund_failed", "refund_unknown"];

/**
 * تسجيل دفعة زائدة مرة واحدة فقط (قيود فريدة)، فإعادة التحقق أو تكرار Webhook لا ينشئ سجلًا ثانيًا ولا تدقيقًا ثانيًا.
 * بلا gatewayPaymentId: الفاتورة كلها زائدة (سجل واحد للفاتورة). وبه: عملية ناجحة إضافية على فاتورة (سجل لكل عملية).
 */
export async function recordExtraPayment(db: Db, input: { paymentId: string; orderId: string; kind: ExtraPaymentKind; amountFils: number; gatewayPaymentId?: string | null; details?: Record<string, unknown> }): Promise<boolean> {
  const inserted = await db<{ id: string }[]>`
    insert into payment_extras (payment_id, order_id, kind, amount_fils, gateway_payment_id, details)
    values (${input.paymentId}, ${input.orderId}, ${input.kind}, ${input.amountFils}, ${input.gatewayPaymentId ?? null}, ${db.json((input.details ?? {}) as never)})
    on conflict do nothing
    returning id
  `;
  if (inserted.length === 0) return false;
  await audit(
    {
      actorId: null,
      action: "payment.extra_recorded",
      entityType: "payment_extra",
      entityId: inserted[0].id,
      metadata: { orderId: input.orderId, paymentId: input.paymentId, kind: input.kind, amountFils: input.amountFils, gatewayPaymentId: input.gatewayPaymentId ?? null, ...input.details },
    },
    db,
  );
  return true;
}

const listColumns = () => sql`
  e.id, e.payment_id, e.order_id, o.number as order_number, o.is_test as order_is_test, e.kind, e.state, e.amount_fils, e.details,
  p.gateway_invoice_id, coalesce(e.gateway_payment_id, p.gateway_payment_id) as gateway_payment_id, e.gateway_refund_id, e.refund_error, e.refund_reason, e.refund_requested_at, e.created_at
`;

/** القائمة المعروضة للمالك: كل ما لم يُحسم بعد، الأحدث أولًا */
export async function openExtraPayments(opts: { limit?: number } = {}): Promise<ExtraPayment[]> {
  return sql<ExtraPayment[]>`
    select ${listColumns()}
    from payment_extras e join orders o on o.id = e.order_id join payments p on p.id = e.payment_id
    where e.state not in ('refunded', 'dismissed')
    order by e.created_at desc limit ${opts.limit ?? 50}
  `;
}

/** كل الدفعات الزائدة لطلب واحد، المحسومة وغير المحسومة */
export async function orderExtraPayments(orderId: string): Promise<ExtraPayment[]> {
  return sql<ExtraPayment[]>`
    select ${listColumns()}
    from payment_extras e join orders o on o.id = e.order_id join payments p on p.id = e.payment_id
    where e.order_id = ${orderId}
    order by e.created_at desc
  `;
}

export async function extraPaymentsNeedingOwnerCount(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from payment_extras
    where state = any(${NEEDS_OWNER}::text[])
       or (state = 'refund_requested' and coalesce(refund_requested_at, created_at) < now() - make_interval(hours => ${REFUND_STUCK_HOURS}))
  `;
  return n;
}

/** إغلاق سجل دفعة زائدة بلا استرداد (مثل التسوية خارج البوابة). السبب إلزامي ويُحفظ في التدقيق */
export async function dismissExtraPayment(input: { extraId: string; adminId: string; reason: string; ip?: string }): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; order_id: string; kind: string }[]>`
      update payment_extras set state = 'dismissed', resolved_by = ${input.adminId}, resolved_at = now(), refund_reason = ${input.reason.slice(0, 500)}
      where id = ${input.extraId} and state in ('open', 'refund_failed')
      returning id, order_id, kind
    `;
    if (!row) return false;
    await audit(
      {
        actorId: input.adminId,
        action: "payment_extra.dismissed",
        entityType: "payment_extra",
        entityId: row.id,
        reason: input.reason,
        metadata: { orderId: row.order_id, kind: row.kind },
        ip: input.ip ?? null,
      },
      tx,
    );
    return true;
  });
}

/**
 * تطبيق حدث استرداد (Code 2) على دفعة زائدة. النتيجة مبنية على توقيع Webhook فقط، كما هو حال جدول refunds.
 * الاسترداد الذي لم نعرف رقمه بعد (أرسلناه وانقطع الرد، أو نفذه المالك من لوحة البوابة) لا يطابق إلا بالمبلغ كاملًا،
 * حتى لا يغلق استرداد جزئي سجل دفعة كاملة.
 * extraId لسجل عملية بعينها عرفناه من البوابة. وبدونه يطابق سجل الفاتورة الكاملة فقط:
 * صف الدفع لا يصير مستردًا لأن إحدى عمليتيه استُردت، والدفعة التي أكملت الطلب ما زالت قائمة.
 */
export async function applyExtraRefundEvent(db: Db, input: { invoiceId: string; refundId: string; status: string; amountFils: number | null; extraId?: string }): Promise<number> {
  const matches = await db<{ id: string; payment_id: string; state: ExtraPaymentState; order_id: string; gateway_payment_id: string | null }[]>`
    select e.id, e.payment_id, e.state, e.order_id, e.gateway_payment_id from payment_extras e
    join payments p on p.id = e.payment_id
    where p.gateway_invoice_id = ${input.invoiceId}
      and e.state not in ('refunded', 'dismissed')
      and ${input.extraId ? db`e.id = ${input.extraId}` : db`e.gateway_payment_id is null`}
      and (e.gateway_refund_id = ${input.refundId} or (e.gateway_refund_id is null and e.amount_fils = ${input.amountFils}))
    for update of e
  `;
  let applied = 0;
  for (const row of matches) {
    if (input.status === "REFUNDED") {
      await db`update payment_extras set state = 'refunded', gateway_refund_id = ${input.refundId}, resolved_at = now(), refund_claimed_at = null, refund_error = null where id = ${row.id}`;
      if (row.gateway_payment_id === null) await db`update payments set status = 'refunded' where id = ${row.payment_id}`;
      await audit({ actorId: null, action: "payment_extra.refund_completed", entityType: "payment_extra", entityId: row.id, metadata: { orderId: row.order_id, gatewayRefundId: input.refundId } }, db);
      applied++;
    } else if (input.status === "CANCELED" && row.state !== "open") {
      await db`update payment_extras set state = 'refund_failed', refund_error = 'ألغت البوابة طلب الاسترداد', refund_claimed_at = null where id = ${row.id}`;
      await audit({ actorId: null, action: "payment_extra.refund_cancelled", entityType: "payment_extra", entityId: row.id, metadata: { orderId: row.order_id, gatewayRefundId: input.refundId } }, db);
      applied++;
    }
  }
  return applied;
}

/**
 * هل يحق لنا أن نقول للطالب «لم يتم خصم أي مبلغ»؟ فقط إن لم تُؤكد أي دفعة ولم تُسجل دفعة زائدة،
 * ولا توجد محاولة لم تُحسم، وكل فاتورة أُنشئت على الطلب ردت عنها البوابة بعد إنشاء آخر فاتورة، وخلال نصف الساعة الأخيرة.
 * طلب بلا أي فاتورة لم يصل أصلًا إلى البوابة، فالجملة صحيحة.
 */
export async function canSayNothingWasCharged(orderId: string, db: Db = sql): Promise<boolean> {
  const [row] = await db<{ ok: boolean }[]>`
    select
      not exists (select 1 from payments where order_id = ${orderId} and status in ('paid', 'refunded'))
      and not exists (select 1 from payment_extras where order_id = ${orderId})
      and not exists (select 1 from payments p where p.order_id = ${orderId} and p.last_gateway_status @? '$.InvoiceTransactions[*] ? (@.TransactionStatus == "InProgress" || @.TransactionStatus == "Authorize")')
      and coalesce((
        select bool_and(p.last_checked_at is not null)
          and min(p.last_checked_at) >= max(p.created_at)
          and min(p.last_checked_at) > now() - make_interval(mins => ${CHARGE_CHECK_FRESH_MINUTES})
        from payments p where p.order_id = ${orderId} and p.gateway_invoice_id is not null
      ), true) as ok
  `;
  return row.ok;
}

/**
 * هل على الطلب محاولة لم تُحسم خلال عمر رابطها ومهلته؟ حينها ندعو الطالب إلى الانتظار بدل محاولة جديدة قد تخصم مرتين.
 * بعد المهلة تُعد صفحة بنك تُركت، فلا نطلب منه الانتظار، ويبقى منع جملة «لم يتم خصم أي مبلغ» قائمًا.
 */
export async function hasUnresolvedAttempt(orderId: string, db: Db = sql): Promise<boolean> {
  const [row] = await db<{ open: boolean }[]>`
    select exists (
      select 1 from payments p
      where p.order_id = ${orderId} and p.status not in ('paid', 'refunded')
        and p.last_gateway_status @? '$.InvoiceTransactions[*] ? (@.TransactionStatus == "InProgress" || @.TransactionStatus == "Authorize")'
        and coalesce(p.expires_at, p.created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) + make_interval(mins => ${IN_PROGRESS_GRACE_MINUTES}) > now()
    ) as open
  `;
  return row.open;
}
