import "server-only";
import { createHash } from "node:crypto";
import { sql, type Db } from "../db";
import { env, type Env } from "../env";
import { filsToKwdString, kwdNumberToFils } from "@/lib/money";
import { closeOrder, endedProductsInOrder, findOpenOrdersCovering, markOrderPaid, type OrderClosedReason, type OrderRow } from "../commerce/orders";
import { reacquireCouponHold } from "../commerce/coupons";
import { computeCart } from "../commerce/cart";
import { accessibleProductIds } from "../access/entitlements";
import { audit } from "../platform/audit";
import {
  MyFatoorahClient,
  MyFatoorahError,
  gatewayExpiryDate,
  hasOpenTransaction,
  interpretPaymentStatus,
  isSuccessfulTransaction,
  isDefiniteGatewayRefusal,
  isKuwaitiDinarDisplay,
  sanitizeCustomerName,
  verifyWebhookV2Signature,
  webhookV2SigningString,
  type MfPaymentMethod,
  type MfPaymentStatus,
  type MfTransaction,
  type WebhookV2Body,
} from "./myfatoorah";
import { WEBHOOK_STALE_CLAIM_MINUTES, raiseDisputeAlert, recordWebhookRejection, type WebhookRejectionReason } from "./monitoring";
import { applyExtraRefundEvent, recordExtraPayment, type ExtraPaymentKind, type ExtraPaymentState } from "./extras";
import { CLAIM_STALE_SECONDS, INVOICE_REUSE_MARGIN_MINUTES, INVOICE_TTL_MINUTES, IN_PROGRESS_GRACE_MINUTES, ORDER_LIFETIME_HOURS, REFUND_SENDING_STALE_MINUTES } from "./limits";
import { RefundError, applyRefundEvent, recheckRefund, requestRefund, type RefundOutcome } from "./refunds";
import { sendExtraPaymentEmail, sendOrderConfirmationEmail } from "../commerce/order-mail";
import { EmailVerificationRequiredError, emailVerificationRequired } from "../auth/email-verification";
import { assertOrderConsent } from "../platform/consent";

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

function client(cfg: Extract<PaymentsConfig, { enabled: true }>, timeoutMs?: number) {
  return new MyFatoorahClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, timeoutMs });
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

/** الطلب لم يعد بانتظار الدفع: دُفع أو أُغلق أثناء التحقق من فواتيره */
export class OrderSettledError extends MyFatoorahError {
  constructor(public readonly orderId: string) {
    super("هذا الطلب لم يعد بانتظار الدفع");
    this.name = "OrderSettledError";
  }
}

/** فاتورة تُنشأ الآن من تبويب آخر، أو عملية جارية عند البنك: إنشاء فاتورة جديدة قد ينتهي بخصمين */
export class PaymentInProgressError extends MyFatoorahError {
  constructor() {
    super("عملية دفع جارية على هذا الطلب");
    this.name = "PaymentInProgressError";
  }
}

/** أُغلق الطلب بدل إنشاء فاتورة له: انتهت مدته أو أصبح منتجه مملوكًا */
/** على الطلب فاتورة لا تطابق بياناته: لن يحلها الانتظار، ويراجعها المالك */
export class InvoiceNeedsReviewError extends MyFatoorahError {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceNeedsReviewError";
  }
}

export class OrderClosedError extends MyFatoorahError {
  constructor(public readonly reason: OrderClosedReason) {
    super("أُغلق هذا الطلب");
    this.name = "OrderClosedError";
  }
}

export type InvoiceWalk = {
  total: number;
  checked: number;
  /** لم يتعذر أي فحص: كل فاتورة غير مؤكدة ردت عنها البوابة */
  allChecked: boolean;
  /** لماذا لم يُفحص ما لم يُفحص. تعذر الوصول قد يزول بالانتظار، أما الآخران فلا يزولان ويجب ألا يُطلب من الطالب أن ينتظر */
  unreachable: number;
  otherMode: number;
  invalid: number;
  anyPaid: boolean;
  anyFlagged: boolean;
  /** فواتير عليها عملية لم تُحسم عند البنك */
  inProgressInvoiceIds: string[];
  error: string | null;
};

/**
 * فحص كل فواتير الطلب غير المؤكدة لدى البوابة وتطبيق نتيجتها، بالتتابع ودون أي معاملة مفتوحة أثناء الاستدعاءات.
 * لا يرمي عند تعذر البوابة: النتيجة allChecked=false، والمستدعي هو من يقرر. stopOnError يوقف عند أول تعذر.
 */
export async function checkOrderInvoices(orderId: string, opts: { stopOnError?: boolean; timeoutMs?: number } = {}): Promise<InvoiceWalk> {
  const cfg = paymentsConfig();
  const rows = await sql<{ gateway_invoice_id: string; environment: string }[]>`
    select gateway_invoice_id, environment from payments
    where order_id = ${orderId} and provider = 'myfatoorah' and gateway_invoice_id is not null and status not in ('paid', 'refunded')
    order by created_at asc
  `;
  const walk: InvoiceWalk = { total: rows.length, checked: 0, allChecked: true, unreachable: 0, otherMode: 0, invalid: 0, anyPaid: false, anyFlagged: false, inProgressInvoiceIds: [], error: null };
  const note = (message: string) => {
    walk.allChecked = false;
    walk.error ??= message;
  };
  if (!cfg.enabled) {
    if (rows.length) note(cfg.reason);
    walk.unreachable = rows.length;
    return walk;
  }
  for (const row of rows) {
    if (row.environment !== cfg.environment) {
      walk.otherMode++;
      note("فاتورة من وضع دفع مختلف");
      if (opts.stopOnError) break;
      continue;
    }
    try {
      const result = await verifyAndApplyPayment({ invoiceId: row.gateway_invoice_id }, { timeoutMs: opts.timeoutMs });
      if (result.state === "invalid") {
        walk.invalid++;
        note(result.error);
        if (opts.stopOnError) break;
        continue;
      }
      walk.checked++;
      if (result.state === "paid") walk.anyPaid = true;
      if (result.state === "flagged") walk.anyFlagged = true;
      if (result.state === "pending" && result.inProgress) walk.inProgressInvoiceIds.push(row.gateway_invoice_id);
    } catch (err) {
      walk.unreachable++;
      note(err instanceof Error ? err.message : String(err));
      if (opts.stopOnError) break;
    }
  }
  return walk;
}

/**
 * قرار الدفع تحت قفل الطلب (D3). لماذا هكذا؟
 * - لا نُبقي معاملة مفتوحة أثناء استدعاء البوابة (حتى ٢٠ ثانية): على Supabase pooler ستحجز اتصالًا نادرًا وتوقف الـ Webhook المنتظر على القفل نفسه.
 * - لذلك القفل قصير: نقفل صف الطلب، نقرر، ونترك صف "initiated" كمطالبة قبل تحرير القفل.
 *   أي تبويب آخر يدخل بعدها يجد إما رابطًا جاهزًا فيعيده، أو المطالبة فينتظرها ولا ينشئ فاتورة ثانية.
 * - لو تعطل الخادم بعد إنشاء الفاتورة لدى البوابة وقبل حفظها: الرابط لم يصل لأحد فلا يمكن دفعه، والمطالبة تُعد متروكة بعد ٦٠ ثانية.
 * - لم نضف فهرسًا فريدًا على المطالبات: صفوف initiated القديمة قد تجعل الترحيل يفشل على قاعدة فيها بيانات، وقفل الطلب يكفي لأن كل مطالبة تمر به.
 * - ترتيب الأقفال دائمًا الطلب ثم صفوف الدفع، وهو نفس ترتيب تأكيد الدفع والاسترداد، فلا يحدث deadlock.
 */
type PaymentDecision =
  | { kind: "reuse"; url: string }
  | { kind: "wait"; claimId: string }
  | { kind: "closed"; reason: OrderClosedReason }
  | { kind: "blocked" }
  | { kind: "settled" }
  | { kind: "create"; order: OrderRow; claimId: string; expiresAt: Date };

async function decidePayment(orderId: string, environment: "sandbox" | "live", walk: InvoiceWalk): Promise<PaymentDecision> {
  return sql.begin(async (db): Promise<PaymentDecision> => {
    const [order] = await db<(OrderRow & { past_lifetime: boolean })[]>`
      select *, created_at <= now() - make_interval(hours => ${ORDER_LIFETIME_HOURS}) as past_lifetime from orders where id = ${orderId} for update
    `;
    if (!order || (order.status !== "pending" && order.status !== "failed")) return { kind: "settled" };
    if (order.past_lifetime) {
      await closeOrder(db, { orderId, reason: "expired", actorId: null });
      return { kind: "closed", reason: "expired" };
    }
    // ربما اشترى الطالب المنتج من طلب آخر بعد إنشاء هذا الطلب: لا نحاسبه مرتين
    const owned = await accessibleProductIds(order.user_id, db);
    const items = await db<{ product_id: string }[]>`select product_id from order_items where order_id = ${orderId}`;
    if (items.some((i) => owned.has(i.product_id))) {
      await closeOrder(db, { orderId, reason: "already_owned", actorId: null });
      return { kind: "closed", reason: "already_owned" };
    }
    // انتهى تاريخ إتاحة منتج بعد إنشاء الطلب: لا نصدر عليه فاتورة ولا نعيد رابطًا قديمًا
    if ((await endedProductsInOrder(db, orderId)).length) {
      await closeOrder(db, { orderId, reason: "product_ended", actorId: null });
      return { kind: "closed", reason: "product_ended" };
    }
    // الطلب الذي فشل دفعه حرر كوده، فيعيد حجزه تحت قفل الكود قبل أي فاتورة
    if (order.status === "failed" && order.coupon_id && !(await reacquireCouponHold(db, { couponId: order.coupon_id, userId: order.user_id, orderId }))) {
      await closeOrder(db, { orderId, reason: "coupon_unavailable", actorId: null });
      return { kind: "closed", reason: "coupon_unavailable" };
    }
    // الرفض لا يُنهي فاتورة الرابط العام: تبقى Pending لدى البوابة ويمكن إعادة المحاولة عليها، فنعيدها بدل فاتورة ثانية قابلة للدفع.
    // رابط وسيلة محددة (ExecutePayment) جلسة بنك لمرة واحدة: يُعاد فقط إن لم تبدأ عليه أي محاولة
    const [open] = await db<{ id: string; status: string; payment_url: string; last_attempt: string | null }[]>`
      select id, status, payment_url, last_gateway_status->'InvoiceTransactions'->-1->>'PaymentId' as last_attempt from payments
      where order_id = ${orderId} and provider = 'myfatoorah' and environment = ${environment}
        and gateway_invoice_id is not null and payment_url is not null
        and coalesce(expires_at, created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) > now() + make_interval(mins => ${INVOICE_REUSE_MARGIN_MINUTES})
        and (
          (status = 'pending' and (payment_method = 'all' or last_gateway_status->'InvoiceTransactions'->0 is null))
          or (status = 'failed' and payment_method = 'all' and last_gateway_status->>'InvoiceStatus' = 'Pending')
        )
      order by created_at desc limit 1
    `;
    if (open) {
      if (order.status === "failed") await db`update orders set status = 'pending' where id = ${orderId}`;
      // الطالب تجاوز هذا الرفض بإعادة المحاولة، فقراءته مرة أخرى (Webhook مكرر أو فحص) لا تعيد الطلب إلى فاشل
      if (open.status === "failed") await db`update payments set status = 'pending', error_message = null, acknowledged_failure_id = ${open.last_attempt} where id = ${open.id}`;
      return { kind: "reuse", url: open.payment_url };
    }
    const [claim] = await db<{ id: string }[]>`
      select id from payments
      where order_id = ${orderId} and status = 'initiated' and gateway_invoice_id is null and created_at > now() - make_interval(secs => ${CLAIM_STALE_SECONDS})
      order by created_at desc limit 1
    `;
    if (claim) return { kind: "wait", claimId: claim.id };
    await db`
      update payments set status = 'failed', error_message = 'لم تكتمل محاولة إنشاء رابط الدفع'
      where order_id = ${orderId} and status = 'initiated' and gateway_invoice_id is null
    `;
    if (walk.inProgressInvoiceIds.length) {
      // محاولة لم تُحسم على فاتورة انتهى رابطها: ننتظر بمهلة محدودة. رابط ما زال مفتوحًا لا يمنع فاتورة جديدة:
      // InProgress حسب الوثائق لا يعني خصمًا، وصفحة بنك تركها الطالب يجب ألا تحبسه ساعة كاملة
      const [blocking] = await db`
        select 1 from payments
        where order_id = ${orderId} and gateway_invoice_id = any(${walk.inProgressInvoiceIds}::text[])
          and coalesce(expires_at, created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) <= now() + make_interval(mins => ${INVOICE_REUSE_MARGIN_MINUTES})
          and coalesce(expires_at, created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) + make_interval(mins => ${IN_PROGRESS_GRACE_MINUTES}) > now()
        limit 1
      `;
      if (blocking) return { kind: "blocked" };
    }
    if (order.status === "failed") await db`update orders set status = 'pending' where id = ${orderId}`;
    const [created] = await db<{ id: string; expires_at: Date }[]>`
      insert into payments (order_id, provider, environment, status, amount_fils, expires_at)
      values (${orderId}, 'myfatoorah', ${environment}, 'initiated', ${order.total_fils}, now() + make_interval(mins => ${INVOICE_TTL_MINUTES}))
      returning id, expires_at
    `;
    return { kind: "create", order, claimId: created.id, expiresAt: created.expires_at };
  });
}

/**
 * هل تمنع محاولة لم تُحسم إغلاق الطلب؟ فقط خلال عمر رابطها ومهلة بعده، حتى لا يعلق الطالب بصفحة بنك تركها.
 * بعدها تتابع وظيفة التسوية الفاتورة، ودفعة متأخرة عليها تُعالج ولا تضيع.
 */
export async function attemptBlocksClosing(orderId: string, invoiceIds: string[]): Promise<boolean> {
  if (invoiceIds.length === 0) return false;
  const [row] = await sql`
    select 1 from payments
    where order_id = ${orderId} and gateway_invoice_id = any(${invoiceIds}::text[])
      and coalesce(expires_at, created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) + make_interval(mins => ${IN_PROGRESS_GRACE_MINUTES}) > now()
    limit 1
  `;
  return Boolean(row);
}

const CLAIM_WAIT_ATTEMPTS = 40;
const CLAIM_WAIT_STEP_MS = 250;

/** تبويب آخر يُنشئ الفاتورة الآن: ننتظر رابطه بدل إنشاء فاتورة ثانية قابلة للدفع */
async function waitForClaim(claimId: string): Promise<string> {
  for (let i = 0; i < CLAIM_WAIT_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, CLAIM_WAIT_STEP_MS));
    const [row] = await sql<{ status: string; payment_url: string | null }[]>`select status, payment_url from payments where id = ${claimId}`;
    if (row?.status === "pending" && row.payment_url) return row.payment_url;
    if (row?.status !== "initiated") break;
  }
  throw new PaymentInProgressError();
}

/**
 * بدء الدفع (D3): لا ينشئ فاتورة جديدة إلا بعد التأكد من كل الفواتير السابقة.
 * يفحص كل فاتورة لدى البوابة ويطبق أي دفعة (عند التعذر لا ينشئ شيئًا)، ثم يعيد رابطًا مفتوحًا إن وجد،
 * وأخيرًا ينشئ فاتورة بعمر قصير. انظر تعليق decidePayment عن التزامن.
 */
export async function startPayment(order: OrderRow, paymentMethodId: number | null): Promise<{ url: string; reused: boolean }> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) throw new MyFatoorahError(cfg.reason);
  if (order.status !== "pending" && order.status !== "failed") throw new MyFatoorahError("حالة الطلب لا تسمح بالدفع");
  if (order.total_fils <= 0) throw new MyFatoorahError("قيمة الطلب غير صالحة للدفع الإلكتروني");
  // طلب تجريبي لا يُدفع في وضع حقيقي (وإلا مُنح بدفع حقيقي ووُسم تجريبيًا)، والعكس
  if (order.is_test !== (cfg.environment === "sandbox")) throw new PaymentModeMismatchError();
  // كل طريق إلى صفحة الدفع يمر من هنا، فلا يفلت منه إعادة المحاولة ولا طلب قديم
  if (await emailVerificationRequired(order.user_id)) throw new EmailVerificationRequiredError();
  // نموذج مصنوع أو طلب قديم أو إعادة محاولة: لا فاتورة بلا إقرار مسجل لهذا الطلب
  await assertOrderConsent({ orderId: order.id, userId: order.user_id });

  const walk = await checkOrderInvoices(order.id, { stopOnError: true });
  if (walk.otherMode && !walk.unreachable) throw new PaymentModeMismatchError();
  if (walk.invalid && !walk.unreachable) throw new InvoiceNeedsReviewError(`فاتورة لا تطابق الطلب: ${walk.error}`);
  if (!walk.allChecked) throw new MyFatoorahError(`تعذر التحقق من فواتير الطلب: ${walk.error}`);
  if (walk.anyPaid) throw new OrderSettledError(order.id);

  const decision = await decidePayment(order.id, cfg.environment, walk);
  if (decision.kind === "settled") throw new OrderSettledError(order.id);
  if (decision.kind === "closed") throw new OrderClosedError(decision.reason);
  if (decision.kind === "blocked") throw new PaymentInProgressError();
  if (decision.kind === "reuse") return { url: decision.url, reused: true };
  if (decision.kind === "wait") return { url: await waitForClaim(decision.claimId), reused: true };

  const current = decision.order;
  const appUrl = env().APP_URL.replace(/\/$/, "");
  const phone = current.customer_phone?.replace(/^\+965/, "");
  const input = {
    InvoiceValue: Number(filsToKwdString(current.total_fils)),
    DisplayCurrencyIso: "KWD" as const,
    CustomerName: sanitizeCustomerName(current.customer_name),
    CustomerEmail: current.customer_email || null,
    ...(phone ? { MobileCountryCode: "+965", CustomerMobile: phone } : {}),
    CustomerReference: current.number,
    UserDefinedField: decision.claimId,
    Language: "AR" as const,
    CallBackUrl: `${appUrl}/payment/return`,
    ErrorUrl: `${appUrl}/payment/return`,
    SourceInfo: "edu-platform",
    ExpiryDate: gatewayExpiryDate(decision.expiresAt),
  };
  try {
    const mf = client(cfg);
    const res = paymentMethodId
      ? await mf.executePayment({ ...input, PaymentMethodId: paymentMethodId })
      : await mf.sendPayment(input);
    const url = "PaymentURL" in res ? res.PaymentURL : res.InvoiceURL;
    // الشرط على المطالبة: إن أُغلق الطلب أثناء الاستدعاء لا نسلّم رابطًا لطلب مغلق، والفاتورة لم يرها أحد فلا يمكن دفعها
    const saved = await sql`
      update payments set status = 'pending', gateway_invoice_id = ${String(res.InvoiceId)}, payment_url = ${url},
        payment_method = ${paymentMethodId ? String(paymentMethodId) : "all"}
      where id = ${decision.claimId} and status = 'initiated'
      returning id
    `;
    if (saved.length === 0) throw new OrderSettledError(current.id);
    return { url, reused: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`update payments set status = 'failed', error_message = ${message.slice(0, 500)} where id = ${decision.claimId} and status = 'initiated'`;
    throw err;
  }
}

/** توجيه الشراء: هل لدى الطالب طلب مفتوح يغطي ما في سلته؟ نتحقق من فواتيره أولًا، فقد يكون دُفع فعلًا */
export type OpenOrderResolution = { kind: "none" } | { kind: "paid"; orderId: string } | { kind: "open"; orderId: string };

const OPEN_ORDERS_WALK_LIMIT = 8;

export async function resolveOpenOrderForCheckout(input: { userId: string; productIds: string[]; isTest: boolean }): Promise<OpenOrderResolution> {
  const cart = await computeCart(input.productIds, input.userId);
  const open = await findOpenOrdersCovering(sql, { userId: input.userId, productIds: cart.payableLines.map((l) => l.id), isTest: input.isTest });
  let stillOpen: string | null = null;
  for (const { id } of open.slice(0, OPEN_ORDERS_WALK_LIMIT)) {
    const walk = await checkOrderInvoices(id);
    if (walk.error) console.error("[checkout] open order check incomplete", walk.error);
    const [row] = await sql<{ status: OrderRow["status"] }[]>`select status from orders where id = ${id}`;
    if (row?.status === "paid") return { kind: "paid", orderId: id };
    if (!stillOpen && (row?.status === "pending" || row?.status === "failed")) stillOpen = id;
  }
  return stillOpen ? { kind: "open", orderId: stillOpen } : { kind: "none" };
}

export type VerifyResult =
  | { state: "paid"; orderId: string; changed: boolean }
  | { state: "failed"; orderId: string; error: string }
  | { state: "pending"; orderId: string; inProgress?: true }
  | { state: "expired"; orderId: string }
  | { state: "refunded"; orderId: string }
  | { state: "flagged"; orderId: string; kind: ExtraPaymentKind }
  | { state: "invalid"; error: string };

/** صف دفع له أثر على طلب مغلق نقرأه تحت القفل */
type ConfirmedPayment = {
  orderId: string;
  paymentId: string;
  invoiceFils: number;
  status: MfPaymentStatus;
  transaction: MfTransaction | null;
};

/**
 * موانع إكمال طلب مغلق وصلته دفعة متأخرة. القرار:
 * نكمل الطلب فقط إن أُغلق بسبب انتهاء المدة أو إلغاء الطالب، وكل منتج ما زال منشورًا ومتاحًا،
 * وسعره اليوم لا يزيد عن السعر المدفوع (الزيادة تعني أنه يأخذه بأقل من ثمنه، والنقص لا يمنعه لأنه دفع ثمنه كاملًا)،
 * ولم يصبح مملوكًا له من طريق آخر (وإلا أصبح الخصم مكررًا).
 * القسيمة لا تُعاد مراجعتها: تحققنا منها عند إنشاء الطلب والمبلغ مطابق له، ولو تجاوزت الدفعة المتأخرة حد الكود فالمال وصل بالسعر الذي عُرض.
 * أي مانع يعني أن الدفعة تُسجل للمالك ولا يتغير الطلب.
 */
async function lateCompletionBlockers(db: Db, order: OrderRow): Promise<string[]> {
  const blockers: string[] = [];
  if (order.closed_reason !== "expired" && order.closed_reason !== "student_cancelled") blockers.push(`closed_reason:${order.closed_reason ?? "none"}`);
  const items = await db<{ product_id: string; unit_price_fils: number; status: string | null; price_fils: number | null; access_mode: string | null; access_until: Date | null }[]>`
    select oi.product_id, oi.unit_price_fils, p.status, p.price_fils, p.access_mode, p.access_until
    from order_items oi left join products p on p.id = oi.product_id
    where oi.order_id = ${order.id}
  `;
  const owned = await accessibleProductIds(order.user_id, db);
  for (const it of items) {
    if (it.status !== "published") blockers.push(`unavailable:${it.product_id}`);
    else if (it.price_fils === null || it.price_fils > it.unit_price_fils) blockers.push(`price:${it.product_id}`);
    else if (it.access_mode === "until_date" && it.access_until && new Date(it.access_until).getTime() <= Date.now()) blockers.push(`access_ended:${it.product_id}`);
    if (owned.has(it.product_id)) blockers.push(`owned:${it.product_id}`);
  }
  return blockers;
}

/**
 * عمليات نجحت على الفاتورة نفسها غير التي أكملت صف الدفع (الرابط نفسه دُفع من جهازين):
 * كل عملية مال مستقل يُسجل برقمها مرة واحدة، ويُسترد برقمها وحدها.
 */
async function recordOtherSuccesses(
  db: Db,
  p: { paymentId: string; orderId: string; settlingId: string | null; amountFils: number; status: MfPaymentStatus; kind: ExtraPaymentKind },
): Promise<{ found: boolean; recorded: boolean }> {
  const others = new Set((p.status.InvoiceTransactions ?? []).filter(isSuccessfulTransaction).map((t) => t.PaymentId).filter((id) => id && id !== p.settlingId));
  let recorded = false;
  for (const gatewayPaymentId of others) {
    if (await recordExtraPayment(db, { paymentId: p.paymentId, orderId: p.orderId, kind: p.kind, amountFils: p.amountFils, gatewayPaymentId, details: { source: "second_transaction" } })) recorded = true;
  }
  return { found: others.size > 0, recorded };
}

/**
 * تطبيق دفعة أكدتها البوابة، داخل معاملة واحدة ودون رمي استثناء: المال وصل، فلا تراجع ولا ضياع.
 * يقفل الطلب ثم صف الدفع (نفس ترتيب startPayment والاسترداد).
 *  - pending أو failed: تأكيد الطلب ومنح الوصول، إلا إن انتهت إتاحة منتج أو صار مملوكًا من طلب آخر فتُسجل late_review.
 *  - paid: الدفعة التي أكملته لا تتغير، وأي دفعة أخرى تُسجل duplicate.
 *  - refunded: الدفعة المستردة لا ترجع، وأي دفعة أخرى تُسجل after_refund.
 *  - cancelled: يكتمل الطلب إن لم يوجد مانع (انظر lateCompletionBlockers)، وإلا تُسجل late_review.
 * وفي كل الحالات تُسجل أي عملية ناجحة أخرى على الفاتورة نفسها. newExtra: هل سُجل مال زائد جديد في هذه المعاملة.
 */
async function applyConfirmedPayment(db: Db, p: ConfirmedPayment): Promise<{ result: VerifyResult; newExtra: boolean }> {
  const [order] = await db<OrderRow[]>`select * from orders where id = ${p.orderId} for update`;
  const [row] = await db<{ status: string; amount_fils: number; gateway_payment_id: string | null }[]>`select status, amount_fils, gateway_payment_id from payments where id = ${p.paymentId} for update`;
  const [extra] = await db<{ kind: ExtraPaymentKind }[]>`select kind from payment_extras where payment_id = ${p.paymentId} and gateway_payment_id is null`;
  // دفعتان لطلبين مختلفين للمنتج نفسه تتتابعان: الثانية ترى ما منحته الأولى، وإلا اكتمل الطلبان معًا وتكرر الخصم وأرباح المعلم
  await db`select pg_advisory_xact_lock(hashtextextended(${`payment-owner:${order.user_id}`}, 0))`;
  await db`
    update payments set status = case when status = 'refunded' then status else 'paid' end, paid_at = coalesce(paid_at, now()),
      gateway_payment_id = coalesce(gateway_payment_id, ${p.transaction?.PaymentId ?? null}),
      payment_method = coalesce(${p.transaction?.PaymentGateway ?? null}, payment_method),
      last_gateway_status = ${db.json(p.status as never)}, error_message = null, last_checked_at = now()
    where id = ${p.paymentId}
  `;

  let newExtra = false;
  const flag = async (kind: ExtraPaymentKind, details: Record<string, unknown> = {}): Promise<VerifyResult> => {
    if (await recordExtraPayment(db, { paymentId: p.paymentId, orderId: order.id, kind, amountFils: p.invoiceFils, details })) newExtra = true;
    return { state: "flagged", orderId: order.id, kind };
  };

  const settle = async (): Promise<VerifyResult> => {
    switch (order.status) {
      case "pending":
      case "failed": {
        // دفعة وصلت بعد انتهاء إتاحة المنتج: منحه الآن يعني وصولًا منتهيًا مقابل مال. تُسجل للمالك ليستردها
        const ended = await endedProductsInOrder(db, order.id);
        if (ended.length) {
          await closeOrder(db, { orderId: order.id, reason: "product_ended", actorId: null });
          return flag("late_review", { blockers: ended.map((id) => `access_ended:${id}`), closedReason: "product_ended" });
        }
        // صار المنتج مملوكًا من طلب آخر: إكمال هذا الطلب خصم مكرر وأرباح مكررة للمعلم
        const owned = await accessibleProductIds(order.user_id, db);
        const items = await db<{ product_id: string }[]>`select product_id from order_items where order_id = ${order.id}`;
        const alreadyOwned = items.filter((i) => owned.has(i.product_id));
        if (alreadyOwned.length) {
          await closeOrder(db, { orderId: order.id, reason: "already_owned", actorId: null });
          return flag("late_review", { blockers: alreadyOwned.map((i) => `owned:${i.product_id}`), closedReason: "already_owned" });
        }
        const out = await markOrderPaid(db, { orderId: order.id, paidAmountFils: p.invoiceFils, paymentRowId: p.paymentId });
        return { state: "paid", orderId: order.id, changed: out.changed };
      }
      case "paid":
        return row.status === "paid" ? { state: "paid", orderId: order.id, changed: false } : flag("duplicate");
      case "refunded":
        return row.status === "refunded" ? { state: "refunded", orderId: order.id } : flag("after_refund");
      case "cancelled": {
        const blockers = await lateCompletionBlockers(db, order);
        if (blockers.length) return flag("late_review", { blockers, closedReason: order.closed_reason });
        const out = await markOrderPaid(db, { orderId: order.id, paidAmountFils: p.invoiceFils, paymentRowId: p.paymentId, allowClosed: true });
        await audit({ actorId: null, action: "order.paid_after_close", entityType: "order", entityId: order.id, metadata: { paymentRowId: p.paymentId, closedReason: order.closed_reason, closedAt: order.closed_at } }, db);
        return { state: "paid", orderId: order.id, changed: out.changed };
      }
    }
  };

  const main: VerifyResult = extra ? { state: "flagged", orderId: order.id, kind: extra.kind } : await settle();
  const [after] = await db<{ status: string }[]>`select status from orders where id = ${order.id}`;
  const otherKind: ExtraPaymentKind = after.status === "paid" ? "duplicate" : after.status === "refunded" ? "after_refund" : "late_review";
  const others = await recordOtherSuccesses(db, {
    paymentId: p.paymentId,
    orderId: order.id,
    settlingId: row.gateway_payment_id ?? p.transaction?.PaymentId ?? null,
    amountFils: p.invoiceFils,
    status: p.status,
    kind: otherKind,
  });
  if (others.recorded) newExtra = true;
  // اكتمال الطلب الآن يبقى هو النتيجة حتى يصل بريد التأكيد. وفيما عدا ذلك فوجود مال زائد هو ما يهم من يقرأ النتيجة
  const flagged = others.found && main.state !== "flagged" && !(main.state === "paid" && main.changed);
  return { result: flagged ? { state: "flagged", orderId: order.id, kind: otherKind } : main, newExtra };
}

/**
 * التحقق من الدفع عبر الخادم (من صفحة العودة أو Webhook) وتطبيق النتيجة.
 * يتحقق من: الفاتورة تخص سجل دفع لدينا، الرقم المرجعي = رقم الطلب، المبلغ والعملة مطابقان.
 */
export async function verifyAndApplyPayment(key: { paymentId?: string; invoiceId?: string }, opts: { timeoutMs?: number } = {}): Promise<VerifyResult> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return { state: "invalid", error: cfg.reason };
  const keyValue = key.paymentId ?? key.invoiceId;
  if (!keyValue || !/^[0-9A-Za-z-]{1,64}$/.test(keyValue)) return { state: "invalid", error: "مرجع دفع غير صالح" };

  const status = await client(cfg, opts.timeoutMs).getPaymentStatus(keyValue, key.paymentId ? "PaymentId" : "InvoiceId");
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
  const result = interpretPaymentStatus(status, key.paymentId);
  const invoiceFils = kwdNumberToFils(Number(status.InvoiceValue));
  if (invoiceFils !== order.total_fils || invoiceFils !== payment.amount_fils || !isKuwaitiDinarDisplay(status.InvoiceDisplayValue)) {
    const newExtra = await sql.begin(async (db) => {
      await db`select id from orders where id = ${order.id} for update`;
      const [row] = await db<{ gateway_payment_id: string | null }[]>`
        update payments set error_message = 'amount/currency mismatch', last_gateway_status = ${db.json(status as never)}, last_checked_at = now(),
          gateway_payment_id = coalesce(gateway_payment_id, ${result.state === "paid" ? (result.transaction?.PaymentId ?? null) : null})
        where id = ${payment.id}
        returning gateway_payment_id
      `;
      // خُصم مبلغ لا يطابق الطلب: لا يكمل الطلب ولا يضيع، ويراجعه المالك
      if (result.state !== "paid") return false;
      const amountFils = Number.isInteger(invoiceFils) && invoiceFils > 0 ? invoiceFils : payment.amount_fils;
      const recorded = await recordExtraPayment(db, {
        paymentId: payment.id,
        orderId: order.id,
        kind: "amount_mismatch",
        amountFils,
        details: { gatewayAmountFils: Number.isInteger(invoiceFils) ? invoiceFils : null, gatewayDisplayValue: status.InvoiceDisplayValue ?? null },
      });
      const others = await recordOtherSuccesses(db, { paymentId: payment.id, orderId: order.id, settlingId: row.gateway_payment_id, amountFils, status, kind: "amount_mismatch" });
      return recorded || others.recorded;
    });
    if (newExtra) await sendExtraPaymentEmail(order.id);
    return { state: "invalid", error: "المبلغ لا يطابق الطلب" };
  }

  if (result.state === "paid") {
    const { result: applied, newExtra } = await sql.begin((db) => applyConfirmedPayment(db, { orderId: order.id, paymentId: payment.id, invoiceFils, status, transaction: result.transaction }));
    // بعد الالتزام، ولا يرمي: تعذر البريد لا يؤثر على الدفع
    if (applied.state === "paid" && applied.changed) await sendOrderConfirmationEmail(order.id);
    if (newExtra) await sendExtraPaymentEmail(order.id);
    return applied;
  }

  if (result.state === "expired") {
    await sql`
      update payments set status = case when status in ('paid', 'refunded') then status else 'expired' end,
        last_gateway_status = ${sql.json(status as never)}, last_checked_at = now()
      where id = ${payment.id}
    `;
    return { state: "expired", orderId: order.id };
  }

  if (result.state === "failed") {
    const declined = result.transaction?.PaymentId ?? null;
    const newest = (status.InvoiceTransactions ?? []).at(-1)?.PaymentId ?? null;
    const isCurrent = await sql.begin(async (db) => {
      // الترتيب نفسه في كل مسارات الدفع: الطلب ثم صف الدفع
      await db`select id from orders where id = ${order.id} for update`;
      const [row] = await db<{ status: string; acknowledged_failure_id: string | null }[]>`select status, acknowledged_failure_id from payments where id = ${payment.id} for update`;
      // رفض قديم: تجاوزه الطالب بإعادة المحاولة، أو جاءت بعده محاولة أحدث. إعادة قراءته لا تغيّر شيئًا
      if (declined !== null && (declined === row.acknowledged_failure_id || declined !== newest)) {
        await db`update payments set last_gateway_status = ${db.json(status as never)}, last_checked_at = now() where id = ${payment.id}`;
        return false;
      }
      await db`
        update payments set status = case when status in ('paid', 'refunded') then status else 'failed' end,
          error_message = ${result.error}, last_gateway_status = ${db.json(status as never)}, last_checked_at = now()
        where id = ${payment.id}
      `;
      if (row.status !== "pending") return true;
      // رفض على فاتورة واحدة لا يُفشل طلبًا عليه رابط آخر يمكن دفعه، أو فاتورة تُنشأ الآن من تبويب آخر
      const [live] = await db`
        select 1 from payments p
        where p.order_id = ${order.id} and p.id <> ${payment.id}
          and ((p.status = 'pending' and p.gateway_invoice_id is not null and coalesce(p.expires_at, p.created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) > now())
            or (p.status = 'initiated' and p.gateway_invoice_id is null and p.created_at > now() - make_interval(secs => ${CLAIM_STALE_SECONDS})))
        limit 1
      `;
      if (!live) await db`update orders set status = 'failed' where id = ${order.id} and status = 'pending'`;
      return true;
    });
    if (!isCurrent) return { state: "pending", orderId: order.id };
    return { state: "failed", orderId: order.id, error: result.error ?? "فشل الدفع" };
  }

  const inProgress = hasOpenTransaction(status);
  // الوثائق لا تذكر كيف تظهر الفاتورة بعد انتهاء رابطها. إن بقيت Pending بعد المهلة ولا عملية عليها، نعدها منتهية محليًا ونستمر في فحصها
  await sql`
    update payments set last_gateway_status = ${sql.json(status as never)}, last_checked_at = now(),
      status = case
        when status = 'pending' and not ${inProgress}
          and coalesce(expires_at, created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) + make_interval(mins => ${IN_PROGRESS_GRACE_MINUTES}) < now()
        then 'expired' else status end
    where id = ${payment.id}
  `;
  return inProgress ? { state: "pending", orderId: order.id, inProgress: true } : { state: "pending", orderId: order.id };
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
      result = r.state === "paid" ? `paid${r.changed ? "" : " (already)"}` : r.state === "flagged" ? `flagged ${r.kind}` : r.state;
    } else if (Number(body.Event.Code) === 2) {
      const data = body.Data as { Refund?: { Id?: string | number; Status?: string }; ReferencedInvoice?: { Id?: string | number }; Amount?: { ValueInBaseCurrency?: string | number } };
      const refundStatus = String(data.Refund?.Status ?? "").toUpperCase();
      if (data.ReferencedInvoice?.Id && data.Refund?.Id) {
        const refundAmount = Number(data.Amount?.ValueInBaseCurrency);
        await applyRefundEvent(client(cfg), cfg.environment, {
          invoiceId: String(data.ReferencedInvoice.Id),
          refundId: String(data.Refund.Id),
          status: refundStatus,
          amountFils: Number.isFinite(refundAmount) ? kwdNumberToFils(refundAmount) : null,
        });
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

function refundsConfig() {
  const cfg = paymentsConfig();
  if (!cfg.enabled) throw new RefundError(`بوابة الدفع غير مفعلة: ${cfg.reason}`);
  return cfg;
}

/** أمر استرداد الطلب من المالك: البوابة أولًا ثم الأثر المحلي. التفاصيل في refunds.ts */
export async function requestOrderRefund(input: { orderId: string; adminId: string; reason?: string; ip?: string }): Promise<RefundOutcome> {
  const cfg = refundsConfig();
  return requestRefund(client(cfg), cfg.environment, input);
}

/** سؤال البوابة عن طلب استرداد نتيجته غير مؤكدة، قبل أي إعادة إرسال */
export async function recheckOrderRefund(input: { refundId: string; adminId: string | null; ip?: string }, opts: { timeoutMs?: number } = {}): Promise<RefundOutcome> {
  const cfg = refundsConfig();
  return recheckRefund(client(cfg, opts.timeoutMs), cfg.environment, input);
}

export class ExtraPaymentRefundError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "ExtraPaymentRefundError";
  }
}

type ExtraRefundOutcome = { state: ExtraPaymentState; error?: string };

/**
 * استرداد دفعة زائدة واحدة لدى البوابة بأمر من المالك. يخص هذه الدفعة فقط: لا يلمس حالة الطلب ولا الوصول ولا الأرباح.
 * المشكلة التي يحلها: رد مقطوع قد يعني أن المال أُعيد فعلًا، وإعادة الإرسال العمياء تعني استردادًا مضاعفًا. لذلك:
 *  - صف الاسترداد يُطالب به تحت قفل، فلا يُرسل طلبان معًا.
 *  - نتيجة مجهولة (انقطاع، 5xx) تبقى refund_unknown وتعيد استخدام Idempotency-Key نفسه.
 *  - أي إعادة محاولة تسأل GetRefundStatus أولًا بمعرفنا الخارجي، وإن تعذر السؤال لا نرسل شيئًا.
 *  - الرفض الصريح فقط يستهلك رقم المحاولة ويولد مفتاحًا جديدًا.
 */
export async function refundExtraPayment(input: { extraId: string; adminId: string; reason: string; ip?: string }): Promise<ExtraRefundOutcome> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) throw new ExtraPaymentRefundError(`بوابة الدفع غير مفعلة: ${cfg.reason}`);
  const claim = await sql.begin(async (db) => {
    const [row] = await db<
      { id: string; order_id: string; state: ExtraPaymentState; amount_fils: number; refund_attempt: number; payment_id: string; gateway_payment_id: string | null; whole_invoice: boolean; gateway_invoice_id: string | null; environment: string; stale_sending: boolean }[]
    >`
      select e.id, e.order_id, e.state, e.amount_fils, e.refund_attempt, e.payment_id, coalesce(e.gateway_payment_id, p.gateway_payment_id) as gateway_payment_id, e.gateway_payment_id is null as whole_invoice, p.gateway_invoice_id, p.environment,
        coalesce(e.refund_claimed_at < now() - make_interval(mins => ${REFUND_SENDING_STALE_MINUTES}), true) as stale_sending
      from payment_extras e join payments p on p.id = e.payment_id
      where e.id = ${input.extraId}
      for update of e
    `;
    if (!row) throw new ExtraPaymentRefundError("الدفعة غير موجودة");
    const allowed = row.state === "open" || row.state === "refund_failed" || row.state === "refund_unknown" || (row.state === "refund_sending" && row.stale_sending);
    if (!allowed) throw new ExtraPaymentRefundError(row.state === "refund_sending" ? "يجري إرسال طلب الاسترداد الآن" : "لا يمكن طلب استرداد هذه الدفعة في حالتها الحالية");
    if (row.environment !== cfg.environment) throw new ExtraPaymentRefundError("هذه الدفعة من وضع دفع مختلف عن الوضع الحالي");
    if (!row.gateway_invoice_id) throw new ExtraPaymentRefundError("لا يوجد مرجع دفع لدى البوابة");
    const attempt = row.state === "open" || row.state === "refund_failed" ? row.refund_attempt + 1 : row.refund_attempt;
    await db`
      update payment_extras set state = 'refund_sending', refund_attempt = ${attempt}, refund_claimed_at = now(),
        refund_reason = ${input.reason.slice(0, 500)}, refund_requested_by = ${input.adminId}, refund_error = null
      where id = ${row.id}
    `;
    await audit({ actorId: input.adminId, action: "payment_extra.refund_started", entityType: "payment_extra", entityId: row.id, reason: input.reason, metadata: { orderId: row.order_id, attempt }, ip: input.ip ?? null }, db);
    return { ...row, attempt, hadPriorAttempt: row.refund_attempt > 0 };
  });

  const externalId = `extra:${claim.id}`;
  const mf = client(cfg);
  const finish = async (state: ExtraPaymentState, patch: { error?: string; refundId?: string; reference?: string }): Promise<ExtraRefundOutcome> =>
    sql.begin(async (db): Promise<ExtraRefundOutcome> => {
      // الحدث قد يسبق رد MakeRefund ويحسم السجل: ما حُفظ هو الحقيقة، ولا نكتب فوقه
      const [current] = await db<{ state: ExtraPaymentState; refund_error: string | null }[]>`select state, refund_error from payment_extras where id = ${claim.id} for update`;
      if (current.state !== "refund_sending") {
        await db`update payment_extras set gateway_refund_reference = coalesce(gateway_refund_reference, ${patch.reference ?? null}) where id = ${claim.id}`;
        return current.refund_error ? { state: current.state, error: current.refund_error } : { state: current.state };
      }
      await db`
        update payment_extras set state = ${state}, refund_claimed_at = null, refund_error = ${patch.error?.slice(0, 500) ?? null},
          gateway_refund_id = coalesce(${patch.refundId ?? null}, gateway_refund_id),
          gateway_refund_reference = coalesce(${patch.reference ?? null}, gateway_refund_reference),
          refund_requested_at = case when ${state} in ('refund_requested', 'refunded') then coalesce(refund_requested_at, now()) else refund_requested_at end,
          resolved_at = case when ${state} = 'refunded' then now() else resolved_at end
        where id = ${claim.id}
      `;
      if (state === "refunded" && claim.whole_invoice) await db`update payments set status = 'refunded' where id = ${claim.payment_id}`;
      await audit({ actorId: input.adminId, action: `payment_extra.${state}`, entityType: "payment_extra", entityId: claim.id, reason: input.reason, metadata: { orderId: claim.order_id, attempt: claim.attempt, gatewayRefundId: patch.refundId ?? null, error: patch.error?.slice(0, 200) ?? null }, ip: input.ip ?? null }, db);
      return patch.error ? { state, error: patch.error } : { state };
    });

  if (claim.hadPriorAttempt) {
    let existing;
    try {
      existing = await mf.getRefundStatus(claim.gateway_invoice_id!, "InvoiceId");
    } catch (err) {
      return finish("refund_unknown", { error: `تعذر التأكد من الاسترداد السابق: ${err instanceof Error ? err.message : String(err)}` });
    }
    const mine = existing.find((r) => r.ExternalIdentifier === externalId && r.RefundStatus !== "Canceled");
    if (mine) return finish(mine.RefundStatus === "Refunded" ? "refunded" : "refund_requested", { refundId: String(mine.RefundId), reference: mine.RefundReference });
  }

  try {
    const res = await mf.makeRefund({
      key: (claim.gateway_payment_id ?? claim.gateway_invoice_id)!,
      keyType: claim.gateway_payment_id ? "PaymentId" : "InvoiceId",
      amountKwd: filsToKwdString(claim.amount_fils),
      comment: input.reason.slice(0, 200),
      externalIdentifier: externalId,
      idempotencyKey: `extra-${claim.id}-${claim.attempt}`,
    });
    return finish("refund_requested", { refundId: String(res.RefundId), reference: res.RefundReference });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return finish(isDefiniteGatewayRefusal(err) ? "refund_failed" : "refund_unknown", { error: message });
  }
}

/**
 * سؤال البوابة عن استرداد دفعة زائدة أُرسل ولم يصلنا حسمه: من المالك أو من وظيفة التسوية.
 * لا يرسل شيئًا، والنتيجة تمر بما يمر به Webhook. وتعذر السؤال يرمي ولا يغيّر شيئًا.
 */
export async function recheckExtraPayment(input: { extraId: string; adminId: string | null; ip?: string }, opts: { timeoutMs?: number } = {}): Promise<{ state: ExtraPaymentState }> {
  const cfg = paymentsConfig();
  if (!cfg.enabled) throw new ExtraPaymentRefundError(`بوابة الدفع غير مفعلة: ${cfg.reason}`);
  const [row] = await sql<{ id: string; order_id: string; state: ExtraPaymentState; amount_fils: number; gateway_refund_id: string | null; gateway_invoice_id: string | null; environment: string }[]>`
    select e.id, e.order_id, e.state, e.amount_fils, e.gateway_refund_id, p.gateway_invoice_id, p.environment
    from payment_extras e join payments p on p.id = e.payment_id where e.id = ${input.extraId}
  `;
  if (!row) throw new ExtraPaymentRefundError("الدفعة غير موجودة");
  if (row.state !== "refund_requested") throw new ExtraPaymentRefundError("هذا السجل لا يحتاج إلى إعادة تحقق.");
  if (row.environment !== cfg.environment) throw new ExtraPaymentRefundError("هذه الدفعة من وضع دفع مختلف عن الوضع الحالي");
  if (!row.gateway_invoice_id) throw new ExtraPaymentRefundError("لا يوجد مرجع دفع لدى البوابة");
  const invoiceId = row.gateway_invoice_id;

  let list;
  try {
    list = await client(cfg, opts.timeoutMs).getRefundStatus(invoiceId, "InvoiceId");
  } catch (err) {
    throw new ExtraPaymentRefundError(`تعذر سؤال البوابة الآن ولم يتغير شيء: ${err instanceof Error ? err.message : String(err)}`);
  }
  const found = list.find((r) => String(r.RefundId) === row.gateway_refund_id) ?? list.find((r) => r.ExternalIdentifier === `extra:${row.id}`);
  const status = !found ? null : /^refunded$/i.test(found.RefundStatus) ? "REFUNDED" : /^cancell?ed$/i.test(found.RefundStatus) ? "CANCELED" : null;
  if (!found || !status) return { state: row.state };
  const refundId = String(found.RefundId);
  return sql.begin(async (db) => {
    await applyExtraRefundEvent(db, { invoiceId, refundId, status, amountFils: row.amount_fils, extraId: row.id });
    const [now] = await db<{ state: ExtraPaymentState }[]>`select state from payment_extras where id = ${row.id}`;
    await audit({ actorId: input.adminId, action: "payment_extra.refund_rechecked", entityType: "payment_extra", entityId: row.id, metadata: { orderId: row.order_id, gatewayRefundId: refundId, gatewayStatus: found.RefundStatus, state: now.state }, ip: input.ip ?? null }, db);
    return { state: now.state };
  });
}
