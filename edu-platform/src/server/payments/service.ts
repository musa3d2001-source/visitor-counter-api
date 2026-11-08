import "server-only";
import { createHash } from "node:crypto";
import { sql } from "../db";
import { env, type Env } from "../env";
import { filsToKwdString, kwdNumberToFils } from "@/lib/money";
import { markOrderPaid, type OrderRow } from "../commerce/orders";
import {
  MyFatoorahClient,
  MyFatoorahError,
  interpretPaymentStatus,
  isKuwaitiDinarDisplay,
  sanitizeCustomerName,
  verifyWebhookV2Signature,
  webhookV2SigningString,
  type MfPaymentMethod,
  type WebhookV2Body,
} from "./myfatoorah";
import { WEBHOOK_STALE_CLAIM_MINUTES, raiseDisputeAlert, recordWebhookRejection, type WebhookRejectionReason } from "./monitoring";

/**
 * خدمة الدفع — قواعد حاسمة:
 * 1) العودة لصفحة النجاح ليست دليلًا على الدفع: نستعلم دائمًا GetPaymentStatus من الخادم.
 * 2) Webhook يُتحقق من توقيعه، ثم نعيد الاستعلام من البوابة ولا نثق بمحتواه.
 * 3) منح الصلاحيات ذرّي وidempotent (قفل الطلب + قيود فريدة).
 * 4) وضع الإنتاج لا يعمل إلا بمفاتيح حقيقية وتأكيد صريح MYFATOORAH_LIVE_CONFIRMED=true.
 */

const DEFAULT_URLS = { sandbox: "https://apitest.myfatoorah.com", live: "https://api.myfatoorah.com" } as const;

export type PaymentsConfig =
  | { enabled: true; environment: "sandbox" | "live"; baseUrl: string; apiKey: string; webhookSecret: string }
  | { enabled: false; environment: "none"; reason: string };

/** كلمات تدل بوضوح على نشر اختباري في الجزء الأول من النطاق. لا نضيف "preview": نطاق الإنتاج الحالي darb-preview.vercel.app */
const TEST_HOST_WORDS = new Set(["sandbox", "staging", "test", "testing", "dev", "qa"]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isObviousTestHost(appUrl: string, vercelEnv: string | undefined): boolean {
  const host = hostOf(appUrl);
  if (!host) return false;
  if (host.split(".")[0].split("-").some((word) => TEST_HOST_WORDS.has(word))) return true;
  // APP_URL الافتراضي هو localhost: على نشر Vercel Production لا يُعد دليلًا على بيئة اختبار
  if (vercelEnv === "production") return false;
  return host === "localhost" || host.endsWith(".localhost") || host.startsWith("127.") || host === "[::1]" || /\.(test|invalid|example|local)$/.test(host);
}

/**
 * الوضع التجريبي لا يعمل على نشر إنتاجي بلا دليل واضح أنه نشر اختباري:
 * ALLOW_SANDBOX_ON_PRODUCTION=true، أو معاينة Vercel، أو نطاق اختباري صريح.
 */
function sandboxBlockedOnProduction(e: Env): boolean {
  if (e.NODE_ENV !== "production" || e.ALLOW_SANDBOX_ON_PRODUCTION) return false;
  if (e.VERCEL_ENV === "preview" || e.VERCEL_ENV === "development") return false;
  return !isObviousTestHost(e.APP_URL, e.VERCEL_ENV);
}

/** أي خادم MyFatoorah غير apitest ينقل أموالًا حقيقية بينما تقول الواجهة إنه لا خصم */
function isLiveGatewayHost(baseUrl: string): boolean {
  const host = hostOf(baseUrl);
  return Boolean(host && host !== "apitest.myfatoorah.com" && (host === "myfatoorah.com" || host.endsWith(".myfatoorah.com")));
}

export function paymentsConfig(): PaymentsConfig {
  const e = env();
  if (e.PAYMENTS_MODE === "disabled") return { enabled: false, environment: "none", reason: "الدفع الإلكتروني غير مفعّل حاليًا" };
  if (!e.MYFATOORAH_API_KEY) return { enabled: false, environment: "none", reason: "مفتاح بوابة الدفع غير مضبوط" };
  if (e.PAYMENTS_MODE === "live") {
    if (!e.MYFATOORAH_LIVE_CONFIRMED) return { enabled: false, environment: "none", reason: "وضع الإنتاج يتطلب تأكيدًا صريحًا" };
    if (!e.MYFATOORAH_WEBHOOK_SECRET) return { enabled: false, environment: "none", reason: "مفتاح توقيع Webhook مطلوب في الإنتاج" };
  } else if (!e.MYFATOORAH_WEBHOOK_SECRET) {
    return { enabled: false, environment: "none", reason: "مفتاح توقيع Webhook مطلوب حتى في الوضع التجريبي" };
  }
  const webhookSecret = e.MYFATOORAH_WEBHOOK_SECRET as string;
  const environment = e.PAYMENTS_MODE;
  const baseUrl = e.MYFATOORAH_BASE_URL ?? DEFAULT_URLS[environment];
  if (environment === "live" && /apitest\./.test(baseUrl)) {
    return { enabled: false, environment: "none", reason: "رابط بوابة الدفع لا يطابق وضع الإنتاج" };
  }
  if (environment === "sandbox") {
    if (isLiveGatewayHost(baseUrl)) return { enabled: false, environment: "none", reason: "رابط بوابة الدفع لا يطابق الوضع التجريبي" };
    if (sandboxBlockedOnProduction(e)) {
      return { enabled: false, environment: "none", reason: "الوضع التجريبي محظور على نشر الإنتاج. استخدم PAYMENTS_MODE=live أو اضبط ALLOW_SANDBOX_ON_PRODUCTION=true" };
    }
  }
  return { enabled: true, environment, baseUrl, apiKey: e.MYFATOORAH_API_KEY, webhookSecret };
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

/** طلب أُنشئ في وضع دفع (تجريبي/حقيقي) لا يطابق الوضع الحالي للخادم */
export class PaymentModeMismatchError extends MyFatoorahError {
  constructor() {
    super("وضع الطلب لا يطابق وضع الدفع الحالي");
    this.name = "PaymentModeMismatchError";
  }
}

/** بدء الدفع: إنشاء سجل دفع ثم فاتورة لدى MyFatoorah وإرجاع رابط صفحة الدفع */
export async function startPayment(order: OrderRow, paymentMethodId: number | null): Promise<{ url: string }> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) throw new MyFatoorahError(cfg.reason);
  if (order.status !== "pending" && order.status !== "failed") throw new MyFatoorahError("حالة الطلب لا تسمح بالدفع");
  if (order.total_fils <= 0) throw new MyFatoorahError("قيمة الطلب غير صالحة للدفع الإلكتروني");
  // طلب تجريبي لا يُدفع في وضع حقيقي (وإلا مُنح بدفع حقيقي ووُسم تجريبيًا)، والعكس
  if (order.is_test !== (cfg.environment === "sandbox")) throw new PaymentModeMismatchError();
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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * معالجة Webhook V2 من MyFatoorah:
 * - رفض أي طلب بتوقيع غير صحيح، مع تسجيل الرفض في حلقة ثابتة الحجم (دون جسم الطلب)
 * - الوثائق لا تذكر ترويسة إصدار: غيابها مقبول، ونرفض فقط قيمة صريحة غير v2
 * - منع المعالجة المكررة لنفس الحدث (event_key فريد) بمطالبة ذرّية،
 *   والحدث الذي تعطلت معالجته أكثر من ٥ دقائق يمكن إعادة معالجته
 * - إعادة الاستعلام من البوابة لتحديد الحالة الفعلية
 */
export async function handleMyFatoorahWebhook(
  rawBody: string,
  headers: Headers,
): Promise<{ status: number; result: string }> {
  const reject = async (reason: WebhookRejectionReason, status: number, result: string, parsed?: unknown) => {
    await recordWebhookRejection({ reason, httpStatus: status, rawBody, headers, parsed });
    return { status, result };
  };

  const cfg = paymentsConfig();
  if (!cfg.enabled) return reject("payments_disabled", 503, "payments disabled");
  const signature = headers.get("myfatoorah-signature");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return reject("invalid_json", 400, "invalid json");
  }
  const version = (headers.get("myfatoorah-webhook-version") ?? "").trim().toLowerCase();
  if (version && version !== "v2") return reject("unsupported_version", 400, "unsupported webhook", parsed);
  if (!isRecord(parsed) || !isRecord(parsed.Event) || !isRecord(parsed.Data)) {
    // حدث V1 يأتي بـ Event نصي أو EventType
    const v1 = isRecord(parsed) && (typeof parsed.Event === "string" || "EventType" in parsed);
    return reject(v1 ? "unsupported_version" : "unsupported_shape", 400, "unsupported webhook", parsed);
  }
  const body = parsed as WebhookV2Body;

  if (!signature?.trim()) return reject("missing_signature", 401, "invalid signature", body);
  if (webhookV2SigningString(body) === null) return reject("unsupported_event", 401, "invalid signature", body);
  if (!verifyWebhookV2Signature(body, signature, cfg.webhookSecret)) {
    console.warn("[webhook] invalid signature");
    return reject("invalid_signature", 401, "invalid signature", body);
  }

  const eventKey = createHash("sha256").update(`${body.Event.Code}|${signature}|${rawBody}`).digest("hex");
  // مطالبة ذرّية: نسخة واحدة فقط تعالج الحدث، ويمكن إعادة المطالبة بحدث عالق منذ أكثر من ٥ دقائق
  const claimed = await sql<{ id: string }[]>`
    insert into payment_events (provider, event_key, event_name, payload, signature_valid, claimed_at)
    values ('myfatoorah', ${eventKey}, ${String(body.Event.Name ?? body.Event.Code)}, ${sql.json(body as never)}, true, now())
    on conflict (event_key) do update set claimed_at = now(), result = null
      where payment_events.processed_at is null
        and (payment_events.claimed_at is null or payment_events.claimed_at < now() - make_interval(mins => ${WEBHOOK_STALE_CLAIM_MINUTES}))
    returning id
  `;
  if (claimed.length === 0) {
    const [existing] = await sql<{ processed_at: Date | null }[]>`select processed_at from payment_events where event_key = ${eventKey}`;
    if (existing?.processed_at) return { status: 200, result: "duplicate ignored" };
    // ليس 200: البوابة تتوقف عن الإرسال عند النجاح، ولو تعطلت المعالجة الجارية لضاع الحدث
    return { status: 409, result: "in progress" };
  }
  const eventId = claimed[0].id;

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
    } else if (Number(body.Event.Code) === 6) {
      result = await raiseDisputeAlert(body, eventKey);
    }
  } catch (err) {
    result = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
    // نُبقي الحدث ونحرر المطالبة كي تنجح إعادة إرسال البوابة فورًا
    await sql`update payment_events set result = ${result}, claimed_at = null where id = ${eventId}`;
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
