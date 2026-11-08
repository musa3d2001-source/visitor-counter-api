import "server-only";
import { createHash } from "node:crypto";
import { sql } from "../db";
import { env } from "../env";
import { filsToKwdString, kwdNumberToFils } from "@/lib/money";
import { markOrderPaid, type OrderRow } from "../commerce/orders";
import {
  MyFatoorahClient,
  MyFatoorahError,
  interpretPaymentStatus,
  isKuwaitiDinarDisplay,
  sanitizeCustomerName,
  verifyWebhookV2Signature,
  type MfPaymentMethod,
  type WebhookV2Body,
} from "./myfatoorah";

/**
 * خدمة الدفع — قواعد حاسمة:
 * 1) العودة لصفحة النجاح ليست دليلًا على الدفع: نستعلم دائمًا GetPaymentStatus من الخادم.
 * 2) Webhook يُتحقق من توقيعه، ثم نعيد الاستعلام من البوابة ولا نثق بمحتواه.
 * 3) منح الصلاحيات ذرّي وidempotent (قفل الطلب + قيود فريدة).
 * 4) وضع الإنتاج لا يعمل إلا بمفاتيح حقيقية وتأكيد صريح MYFATOORAH_LIVE_CONFIRMED=true.
 */

const DEFAULT_URLS = { sandbox: "https://apitest.myfatoorah.com", live: "https://api.myfatoorah.com" } as const;

export type PaymentsConfig =
  | { enabled: true; environment: "sandbox" | "live"; baseUrl: string; apiKey: string; webhookSecret: string | null }
  | { enabled: false; environment: "none"; reason: string };

export function paymentsConfig(): PaymentsConfig {
  const e = env();
  if (e.PAYMENTS_MODE === "disabled") return { enabled: false, environment: "none", reason: "الدفع الإلكتروني غير مفعّل حاليًا" };
  if (!e.MYFATOORAH_API_KEY) return { enabled: false, environment: "none", reason: "مفتاح بوابة الدفع غير مضبوط" };
  if (e.PAYMENTS_MODE === "live") {
    if (!e.MYFATOORAH_LIVE_CONFIRMED) return { enabled: false, environment: "none", reason: "وضع الإنتاج يتطلب تأكيدًا صريحًا" };
    if (!e.MYFATOORAH_WEBHOOK_SECRET) return { enabled: false, environment: "none", reason: "مفتاح توقيع Webhook مطلوب في الإنتاج" };
  }
  const environment = e.PAYMENTS_MODE;
  const baseUrl = e.MYFATOORAH_BASE_URL ?? DEFAULT_URLS[environment];
  if (environment === "live" && /apitest\./.test(baseUrl)) {
    return { enabled: false, environment: "none", reason: "رابط بوابة الدفع لا يطابق وضع الإنتاج" };
  }
  return { enabled: true, environment, baseUrl, apiKey: e.MYFATOORAH_API_KEY, webhookSecret: e.MYFATOORAH_WEBHOOK_SECRET ?? null };
}

function client(cfg: Extract<PaymentsConfig, { enabled: true }>) {
  return new MyFatoorahClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });
}

// ذاكرة مؤقتة لوسائل الدفع (10 دقائق)
let methodsCache: { at: number; methods: MfPaymentMethod[] } | null = null;

export type PaymentMethodOption = { id: number; nameAr: string; code: string; imageUrl: string };

/** وسائل الدفع المفعّلة فعليًا في حساب التاجر (كي نت، بطاقات، Apple Pay...) */
export async function getPaymentMethods(amountFils: number): Promise<PaymentMethodOption[]> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return [];
  if (!methodsCache || Date.now() - methodsCache.at > 10 * 60_000) {
    const methods = await client(cfg).initiatePayment(filsToKwdString(Math.max(amountFils, 100)));
    methodsCache = { at: Date.now(), methods };
  }
  return methodsCache.methods
    .filter((m) => !m.IsDirectPayment)
    .map((m) => ({ id: m.PaymentMethodId, nameAr: m.PaymentMethodAr || m.PaymentMethodEn, code: m.PaymentMethodCode, imageUrl: m.ImageUrl }));
}

export function resetPaymentMethodsCache() {
  methodsCache = null;
}

/** بدء الدفع: إنشاء سجل دفع ثم فاتورة لدى MyFatoorah وإرجاع رابط صفحة الدفع */
export async function startPayment(order: OrderRow, paymentMethodId: number | null): Promise<{ url: string }> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) throw new MyFatoorahError(cfg.reason);
  if (order.status !== "pending" && order.status !== "failed") throw new MyFatoorahError("حالة الطلب لا تسمح بالدفع");
  if (order.total_fils <= 0) throw new MyFatoorahError("قيمة الطلب غير صالحة للدفع الإلكتروني");
  // إعادة المحاولة بعد فشل سابق
  if (order.status === "failed") await sql`update orders set status = 'pending' where id = ${order.id} and status = 'failed'`;

  const [payment] = await sql<{ id: string }[]>`
    insert into payments (order_id, provider, environment, status, amount_fils)
    values (${order.id}, 'myfatoorah', ${cfg.environment}, 'initiated', ${order.total_fils})
    returning id
  `;
  const appUrl = env().APP_URL.replace(/\/$/, "");
  const phone = order.customer_phone?.replace(/^\+965/, "");
  const input = {
    InvoiceValue: Number(filsToKwdString(order.total_fils)),
    DisplayCurrencyIso: "KWD" as const,
    CustomerName: sanitizeCustomerName(order.customer_name),
    CustomerEmail: order.customer_email || null,
    ...(phone ? { MobileCountryCode: "+965", CustomerMobile: phone } : {}),
    CustomerReference: order.number,
    UserDefinedField: payment.id,
    Language: "AR" as const,
    CallBackUrl: `${appUrl}/payment/return`,
    ErrorUrl: `${appUrl}/payment/return`,
    SourceInfo: "edu-platform",
  };
  try {
    const mf = client(cfg);
    const res = paymentMethodId
      ? await mf.executePayment({ ...input, PaymentMethodId: paymentMethodId })
      : await mf.sendPayment(input);
    const url = "PaymentURL" in res ? res.PaymentURL : res.InvoiceURL;
    await sql`
      update payments set status = 'pending', gateway_invoice_id = ${String(res.InvoiceId)}, payment_url = ${url},
        payment_method = ${paymentMethodId ? String(paymentMethodId) : "all"}
      where id = ${payment.id}
    `;
    return { url };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`update payments set status = 'failed', error_message = ${message.slice(0, 500)} where id = ${payment.id}`;
    throw err;
  }
}

export type VerifyResult =
  | { state: "paid"; orderId: string; changed: boolean }
  | { state: "failed"; orderId: string; error: string }
  | { state: "pending"; orderId: string }
  | { state: "invalid"; error: string };

/**
 * التحقق من الدفع عبر الخادم (من صفحة العودة أو Webhook) وتطبيق النتيجة.
 * يتحقق من: الفاتورة تخص سجل دفع لدينا، الرقم المرجعي = رقم الطلب، المبلغ والعملة مطابقان.
 */
export async function verifyAndApplyPayment(key: { paymentId?: string; invoiceId?: string }): Promise<VerifyResult> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return { state: "invalid", error: cfg.reason };
  const keyValue = key.paymentId ?? key.invoiceId;
  if (!keyValue || !/^[0-9A-Za-z-]{1,64}$/.test(keyValue)) return { state: "invalid", error: "مرجع دفع غير صالح" };

  const status = await client(cfg).getPaymentStatus(keyValue, key.paymentId ? "PaymentId" : "InvoiceId");
  const [payment] = await sql<{ id: string; order_id: string; amount_fils: number; status: string; environment: string }[]>`
    select id, order_id, amount_fils, status, environment from payments
    where provider = 'myfatoorah' and gateway_invoice_id = ${String(status.InvoiceId)}
  `;
  if (!payment) return { state: "invalid", error: "فاتورة غير معروفة" };
  if (payment.environment !== cfg.environment) return { state: "invalid", error: "بيئة الدفع لا تطابق" };
  const [order] = await sql<OrderRow[]>`select * from orders where id = ${payment.order_id}`;
  if (!order) return { state: "invalid", error: "الطلب غير موجود" };

  if (status.CustomerReference && status.CustomerReference !== order.number) {
    return { state: "invalid", error: "الفاتورة لا تخص هذا الطلب" };
  }
  const invoiceFils = kwdNumberToFils(Number(status.InvoiceValue));
  if (invoiceFils !== order.total_fils || invoiceFils !== payment.amount_fils || !isKuwaitiDinarDisplay(status.InvoiceDisplayValue)) {
    await sql`update payments set error_message = 'amount/currency mismatch', last_gateway_status = ${sql.json(status as never)} where id = ${payment.id}`;
    return { state: "invalid", error: "المبلغ لا يطابق الطلب" };
  }

  const result = interpretPaymentStatus(status, key.paymentId);
  const tx = result.transaction;

  if (result.state === "paid") {
    const out = await sql.begin(async (db) => {
      await db`
        update payments set status = 'paid', paid_at = coalesce(paid_at, now()),
          gateway_payment_id = coalesce(gateway_payment_id, ${tx?.PaymentId ?? null}),
          payment_method = coalesce(${tx?.PaymentGateway ?? null}, payment_method),
          last_gateway_status = ${db.json(status as never)}, error_message = null
        where id = ${payment.id}
      `;
      return markOrderPaid(db, { orderId: order.id, paidAmountFils: invoiceFils, paymentRowId: payment.id });
    });
    return { state: "paid", orderId: order.id, changed: out.changed };
  }

  if (result.state === "failed") {
    await sql.begin(async (db) => {
      await db`
        update payments set status = case when status = 'paid' then status else 'failed' end,
          error_message = ${result.error}, last_gateway_status = ${db.json(status as never)}
        where id = ${payment.id}
      `;
      await db`update orders set status = 'failed' where id = ${order.id} and status = 'pending'`;
    });
    return { state: "failed", orderId: order.id, error: result.error ?? "فشل الدفع" };
  }

  await sql`update payments set last_gateway_status = ${sql.json(status as never)} where id = ${payment.id}`;
  return { state: "pending", orderId: order.id };
}

/**
 * معالجة Webhook V2 من MyFatoorah:
 * - رفض أي طلب بتوقيع غير صحيح
 * - منع المعالجة المكررة لنفس الحدث (event_key فريد)
 * - إعادة الاستعلام من البوابة لتحديد الحالة الفعلية
 */
export async function handleMyFatoorahWebhook(
  rawBody: string,
  headers: Headers,
): Promise<{ status: number; result: string }> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return { status: 503, result: "payments disabled" };
  const version = (headers.get("myfatoorah-webhook-version") ?? "").toLowerCase();
  const signature = headers.get("myfatoorah-signature");
  let body: WebhookV2Body;
  try {
    body = JSON.parse(rawBody) as WebhookV2Body;
  } catch {
    return { status: 400, result: "invalid json" };
  }
  if (version !== "v2" || !body?.Event || !body?.Data) return { status: 400, result: "unsupported webhook" };

  const secret = cfg.webhookSecret;
  const valid = secret ? verifyWebhookV2Signature(body, signature, secret) : false;
  if (!valid) {
    console.warn("[webhook] invalid signature");
    return { status: 401, result: "invalid signature" };
  }

  const eventKey = createHash("sha256").update(`${body.Event.Code}|${signature}|${rawBody}`).digest("hex");
  const inserted = await sql<{ id: string }[]>`
    insert into payment_events (provider, event_key, event_name, payload, signature_valid)
    values ('myfatoorah', ${eventKey}, ${String(body.Event.Name ?? body.Event.Code)}, ${sql.json(body as never)}, true)
    on conflict (event_key) do nothing
    returning id
  `;
  if (inserted.length === 0) return { status: 200, result: "duplicate ignored" };
  const eventId = inserted[0].id;

  let result = "ignored";
  try {
    if (Number(body.Event.Code) === 1) {
      const data = body.Data as { Invoice?: { Id?: string | number }; Transaction?: { PaymentId?: string } };
      const paymentId = data.Transaction?.PaymentId ? String(data.Transaction.PaymentId) : undefined;
      const invoiceId = data.Invoice?.Id ? String(data.Invoice.Id) : undefined;
      const r = await verifyAndApplyPayment(paymentId ? { paymentId } : { invoiceId });
      result = r.state === "paid" ? `paid${r.changed ? "" : " (already)"}` : r.state;
    } else if (Number(body.Event.Code) === 2) {
      const data = body.Data as { Refund?: { Id?: string | number; Status?: string }; ReferencedInvoice?: { Id?: string | number } };
      const refundStatus = String(data.Refund?.Status ?? "").toUpperCase();
      if (data.ReferencedInvoice?.Id && data.Refund?.Id) {
        await sql`
          update refunds r set status = ${refundStatus === "REFUNDED" ? "completed" : refundStatus === "CANCELED" ? "failed" : "requested"}
          from payments p
          where r.payment_id = p.id and p.gateway_invoice_id = ${String(data.ReferencedInvoice.Id)}
            and (r.gateway_refund_id = ${String(data.Refund.Id)} or r.gateway_refund_id is null)
        `;
      }
      result = `refund ${refundStatus}`;
    }
  } catch (err) {
    result = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
    await sql`update payment_events set result = ${result}, processed_at = now() where id = ${eventId}`;
    // نسمح بإعادة المحاولة من البوابة بحذف قيد التكرار لهذا الحدث
    await sql`delete from payment_events where id = ${eventId}`;
    return { status: 500, result };
  }
  await sql`update payment_events set result = ${result}, processed_at = now() where id = ${eventId}`;
  return { status: 200, result };
}

/** طلب استرداد فعلي لدى البوابة (اختياري — بعد تسجيله محليًا) */
export async function requestGatewayRefund(input: { refundId: string; paymentRowId: string; amountFils: number; comment: string }) {
  const cfg = paymentsConfig();
  if (!cfg.enabled) throw new MyFatoorahError(cfg.reason);
  const [p] = await sql<{ gateway_payment_id: string | null; gateway_invoice_id: string | null }[]>`
    select gateway_payment_id, gateway_invoice_id from payments where id = ${input.paymentRowId}
  `;
  if (!p?.gateway_payment_id && !p?.gateway_invoice_id) throw new MyFatoorahError("لا يوجد مرجع دفع لدى البوابة");
  const res = await client(cfg).makeRefund({
    key: (p.gateway_payment_id ?? p.gateway_invoice_id)!,
    keyType: p.gateway_payment_id ? "PaymentId" : "InvoiceId",
    amountKwd: filsToKwdString(input.amountFils),
    comment: input.comment.slice(0, 200),
  });
  await sql`update refunds set status = 'requested', gateway_refund_id = ${String(res.RefundId)} where id = ${input.refundId}`;
  return res;
}
