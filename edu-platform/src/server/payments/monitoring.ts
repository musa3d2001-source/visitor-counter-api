import "server-only";
import { createHash } from "node:crypto";
import { sql, type Db } from "../db";
import { audit } from "../platform/audit";
import type { WebhookV2Body } from "./myfatoorah";

/**
 * مراقبة Webhook البوابة وتنبيهات الدفع للمالك:
 *  - الإشعارات المرفوضة تُسجَّل في حلقة ثابتة الحجم (٢٠٠ صف) ولا يُخزن جسم الطلب غير الموثق أبدًا
 *  - webhookDeliveryStatus تجيب عن السؤال الأهم: هل تصلنا إشعارات صحيحة من البوابة فعلًا؟
 *  - النزاعات (الحدث 6) تُنشئ تنبيهًا مرئيًا للمالك دون أي تغيير تلقائي على الطلب أو الصلاحيات
 */

export const WEBHOOK_REJECTION_REASONS = [
  "payments_disabled",
  "body_too_large",
  "invalid_json",
  "unsupported_version",
  "unsupported_shape",
  "missing_signature",
  "unsupported_event",
  "invalid_signature",
] as const;
export type WebhookRejectionReason = (typeof WEBHOOK_REJECTION_REASONS)[number];

/** المعالجة العالقة أقدم من هذه المدة يمكن إعادة المطالبة بها */
export const WEBHOOK_STALE_CLAIM_MINUTES = 5;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** نص من مصدر غير موثق: بلا محارف تحكم وبطول محدود */
function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
  return text || null;
}

function eventCode(value: unknown): number | null {
  const code = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(code) && code >= 0 && code <= 9999 ? code : null;
}

/** البيانات الوصفية المحدودة التي نحتفظ بها من طلب مرفوض */
function describeDelivery(parsed: unknown) {
  if (!isRecord(parsed)) return { code: null, name: null, reference: null, invoiceId: null };
  const event = parsed.Event;
  const data = parsed.Data;
  const invoice = isRecord(data) ? data.Invoice : null;
  return {
    code: isRecord(event) ? eventCode(event.Code) : eventCode(parsed.EventType),
    name: clip(isRecord(event) ? event.Name : event, 64),
    reference: isRecord(event) ? clip(event.Reference, 64) : null,
    invoiceId: isRecord(invoice) ? clip(invoice.Id, 64) : null,
  };
}

/** تسجيل إشعار مرفوض — لا يغيّر رد HTTP أبدًا حتى لو فشل التسجيل */
export async function recordWebhookRejection(input: { reason: WebhookRejectionReason; httpStatus: number; rawBody: string; headers: Headers; parsed?: unknown }): Promise<void> {
  try {
    const { code, name, reference, invoiceId } = describeDelivery(input.parsed);
    const version = clip(input.headers.get("myfatoorah-webhook-version"), 16);
    const sha256 = createHash("sha256").update(input.rawBody, "utf8").digest("hex");
    const bytes = Buffer.byteLength(input.rawBody, "utf8");
    await sql`
      insert into payment_webhook_rejections (slot, reason, http_status, event_code, event_name, event_reference, invoice_id, version_header, body_bytes, body_sha256)
      values (nextval('payment_webhook_rejection_slot'), ${input.reason}, ${input.httpStatus}, ${code}, ${name}, ${reference}, ${invoiceId}, ${version}, ${bytes}, ${sha256})
      on conflict (slot) do update set
        provider = excluded.provider, reason = excluded.reason, http_status = excluded.http_status, event_code = excluded.event_code,
        event_name = excluded.event_name, event_reference = excluded.event_reference, invoice_id = excluded.invoice_id,
        version_header = excluded.version_header, body_bytes = excluded.body_bytes, body_sha256 = excluded.body_sha256, received_at = now()
    `;
  } catch (err) {
    console.error("[webhook] could not record a rejected delivery", err);
  }
}

export type WebhookDeliveryStatus = {
  /** آخر إشعار تحقق توقيعه — null يعني أن البوابة لم تصلنا منها أي رسالة صحيحة بعد */
  lastValid: { at: Date; eventName: string; result: string | null } | null;
  rejectedLast24h: number;
  lastRejected: { at: Date; reason: WebhookRejectionReason; httpStatus: number } | null;
  /** أحداث بدأت معالجتها ولم تكتمل منذ أكثر من ٥ دقائق وتنتظر إعادة إرسال البوابة */
  stuckEvents: number;
};

/** حالة استقبال Webhook للمالك (صفحة الإعدادات وصفحة الإطلاق) */
export async function webhookDeliveryStatus(): Promise<WebhookDeliveryStatus> {
  const [[valid], [rejected], [last], [stuck]] = await Promise.all([
    sql<{ received_at: Date; event_name: string; result: string | null }[]>`
      select received_at, event_name, result from payment_events where signature_valid order by received_at desc limit 1
    `,
    sql<{ n: number }[]>`select count(*)::int as n from payment_webhook_rejections where received_at > now() - interval '24 hours'`,
    sql<{ received_at: Date; reason: WebhookRejectionReason; http_status: number }[]>`
      select received_at, reason, http_status from payment_webhook_rejections order by received_at desc limit 1
    `,
    sql<{ n: number }[]>`
      select count(*)::int as n from payment_events
      where processed_at is null and coalesce(claimed_at, received_at) < now() - make_interval(mins => ${WEBHOOK_STALE_CLAIM_MINUTES})
    `,
  ]);
  return {
    lastValid: valid ? { at: valid.received_at, eventName: valid.event_name, result: valid.result } : null,
    rejectedLast24h: rejected.n,
    lastRejected: last ? { at: last.received_at, reason: last.reason, httpStatus: last.http_status } : null,
    stuckEvents: stuck.n,
  };
}

export type DisputeDetails = {
  disputeTransactionId: string | null;
  status: string | null;
  type: string | null;
  reason: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  amount: string | null;
  currency: string | null;
};

/** لماذا لم يُطبق حدث استرداد تلقائيًا */
export type RefundAlertReason = "unknown_invoice" | "other_environment" | "not_confirmed" | "amount_mismatch" | "order_not_paid" | "conflicting_refund" | "cancelled_after_completion" | "cancelled_unknown" | "extra_mismatch";

export type RefundAlertDetails = {
  refundId: string;
  status: string;
  invoiceId: string;
  amountFils: number | null;
  reason: RefundAlertReason;
};

type AlertBase = {
  id: string;
  order_id: string | null;
  order_number: string | null;
  order_is_test: boolean | null;
  created_at: Date;
  updated_at: Date;
};

export type PaymentAlert = AlertBase & ({ kind: "refund_unmatched"; details: RefundAlertDetails } | { kind: "dispute"; details: DisputeDetails });

/**
 * تنبيه حدث استرداد موقّع لم نستطع تطبيقه تلقائيًا (استرداد جزئي من لوحة البوابة، أو طلب غير مدفوع...).
 * لا يغيّر الطلب ولا الوصول: القرار للمالك. تكرار الحدث نفسه لا يعيد فتح تنبيه أُغلق.
 */
export async function raiseRefundAlert(db: Db, input: { orderId: string | null; paymentId: string | null; details: RefundAlertDetails }): Promise<void> {
  const { details } = input;
  const dedupeKey = `refund:${details.refundId}:${details.status}`.slice(0, 128);
  await db`
    insert into payment_alerts (kind, dedupe_key, order_id, payment_id, details)
    values ('refund_unmatched', ${dedupeKey}, ${input.orderId}, ${input.paymentId}, ${db.json(details as never)})
    on conflict (dedupe_key) do update set details = excluded.details, updated_at = now()
  `;
}

/**
 * تنبيه نزاع على دفعة (الحدث 6 بعد التحقق من توقيعه).
 * نخزن تفاصيل النزاع فقط، دون بيانات العميل أو البطاقة، ولا نلمس الطلب أو الصلاحيات أو الأرباح.
 * إعادة إرسال الحدث نفسه تحدّث التنبيه، وتغيّر حالة النزاع يعيد فتح تنبيه أُغلق.
 */
export async function raiseDisputeAlert(body: WebhookV2Body, eventKey: string): Promise<string> {
  const data = body.Data as { Dispute?: Record<string, unknown>; Invoice?: Record<string, unknown>; Transaction?: Record<string, unknown>; Amount?: Record<string, unknown> };
  const details: DisputeDetails = {
    disputeTransactionId: clip(data.Dispute?.DisputeTransactionId, 64),
    status: clip(data.Dispute?.Status, 32)?.toUpperCase() ?? null,
    type: clip(data.Dispute?.Type, 32)?.toUpperCase() ?? null,
    reason: clip(data.Dispute?.Reason, 120),
    invoiceId: clip(data.Invoice?.Id, 64),
    paymentId: clip(data.Transaction?.PaymentId, 64),
    amount: clip(data.Amount?.ValueInBaseCurrency, 32),
    currency: clip(data.Amount?.BaseCurrency, 8),
  };
  const [payment] = details.invoiceId
    ? await sql<{ id: string; order_id: string }[]>`select id, order_id from payments where provider = 'myfatoorah' and gateway_invoice_id = ${details.invoiceId} limit 1`
    : [];
  const dedupeKey = `dispute:${details.disputeTransactionId ?? eventKey}`;
  await sql`
    insert into payment_alerts (kind, dedupe_key, order_id, payment_id, details)
    values ('dispute', ${dedupeKey}, ${payment?.order_id ?? null}, ${payment?.id ?? null}, ${sql.json(details as never)})
    on conflict (dedupe_key) do update set
      details = excluded.details,
      order_id = coalesce(payment_alerts.order_id, excluded.order_id),
      payment_id = coalesce(payment_alerts.payment_id, excluded.payment_id),
      updated_at = now(),
      resolved_at = case when payment_alerts.details->>'status' is distinct from excluded.details->>'status' then null else payment_alerts.resolved_at end,
      resolved_by = case when payment_alerts.details->>'status' is distinct from excluded.details->>'status' then null else payment_alerts.resolved_by end
  `;
  return `dispute ${details.status ?? "UNKNOWN"}`;
}

/** التنبيهات المفتوحة، الأحدث أولًا (اختياريًا لطلب واحد) */
export async function openPaymentAlerts(opts: { orderId?: string; limit?: number } = {}): Promise<PaymentAlert[]> {
  const orderId = opts.orderId ?? null;
  return sql<PaymentAlert[]>`
    select a.id, a.kind, a.order_id, o.number as order_number, o.is_test as order_is_test, a.details, a.created_at, a.updated_at
    from payment_alerts a left join orders o on o.id = a.order_id
    where a.resolved_at is null and (${orderId}::uuid is null or a.order_id = ${orderId}::uuid)
    order by a.created_at desc limit ${opts.limit ?? 50}
  `;
}

export async function openPaymentAlertCount(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from payment_alerts where resolved_at is null`;
  return n;
}

/** إغلاق التنبيه بعد مراجعة المالك — لا يغيّر شيئًا في الطلب، ويُسجَّل في سجل التدقيق */
export async function resolvePaymentAlert(input: { alertId: string; adminId: string; ip?: string }): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; kind: string; order_id: string | null }[]>`
      update payment_alerts set resolved_at = now(), resolved_by = ${input.adminId}, updated_at = now()
      where id = ${input.alertId} and resolved_at is null
      returning id, kind, order_id
    `;
    if (!row) return false;
    await audit({ actorId: input.adminId, action: "payment_alert.resolved", entityType: "payment_alert", entityId: row.id, metadata: { kind: row.kind, orderId: row.order_id }, ip: input.ip ?? null }, tx);
    return true;
  });
}
