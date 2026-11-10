import { NextResponse, type NextRequest } from "next/server";
import { paymentsConfig, verifyAndApplyPayment, type VerifyResult } from "@/server/payments/service";
import { readPaymentReturnRef } from "@/server/payments/return-ref";
import { unknownReturnRefused } from "@/server/payments/webhook-gate";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { getCurrentUser } from "@/server/auth/session";
import { ipFromHeaders } from "@/server/http";
import { sql } from "@/server/db";
import { parseCartCookie } from "@/server/commerce/cart";
import { env } from "@/server/env";
import { reportError } from "@/server/platform/report-error";
import { withBusyGuard } from "@/server/busy-response";
import { isDatabaseBusy } from "@/server/db-busy";

/** البوابة قد تأخذ ٢٠ ثانية للرد، وبعدها كتابة الدفعة والبريد. لا نترك للمنصة أن تقطع طلبًا دفع صاحبه للتو */
export const maxDuration = 60;

/** فحوص الفاتورة الواحدة لدى البوابة في ١٠ دقائق. الحد على الفاتورة لا على العنوان، ولا يصل إليه إلا من يحمل مرجعها */
const CHECKS_PER_PAYMENT = 30;
const CHECKS_WINDOW_SECONDS = 10 * 60;
const GATEWAY_ID = /^[0-9A-Za-z-]{1,64}$/;

type Target = { id: string; order_id: string; gateway_invoice_id: string; user_id: string };
type Outcome = { kind: "verified"; result: VerifyResult } | { kind: "not_checked" } | { kind: "gateway_failed" };

/** استعلام واحد على فهرس فريد: كل ما يكلفه رقم مجهول */
async function findTarget(rowId: string | null, ids: string[]): Promise<Target | null> {
  if (rowId === null && ids.length === 0) return null;
  const [row] = await sql<Target[]>`
    select p.id, p.order_id, p.gateway_invoice_id, o.user_id
    from payments p join orders o on o.id = p.order_id
    where p.provider = 'myfatoorah' and p.gateway_invoice_id is not null
      and (p.id = ${rowId}::uuid or p.gateway_invoice_id = any(${ids}::text[]) or p.gateway_payment_id = any(${ids}::text[]))
    limit 1
  `;
  return row ?? null;
}

/**
 * صفحة العودة من بوابة الدفع (CallBackUrl / ErrorUrl). طلب GET بلا جلسة يغيّر الحالة، بتصميم البوابة نفسها. لذلك:
 *  - الوصول إليها ليس دليلًا على الدفع: نسأل البوابة من الخادم، وعن فاتورتنا نحن فقط.
 *  - رقم لا يخص فاتورة عندنا يكلف استعلامًا واحدًا ولا يصل إلى البوابة أبدًا، وهو وحده يخضع لحد العنوان.
 *  - رقم حقيقي يُتحقق منه دائمًا: مدرسة أو شبكة جوال خلف عنوان واحد لا تُحجب.
 *  - لا يعرف رقم الطلب إلا صاحبه. أي زائر آخر يرى صفحة محايدة، والدفعة تُطبق في الحالتين.
 *  - بعد تسجيل الدفعة لا يقدر شيء على قلب الصفحة إلى خطأ: ما يأتي بعدها كله داخل حماية.
 */
async function handleGET(req: NextRequest) {
  const url = req.nextUrl;
  const base = env().APP_URL.replace(/\/$/, "");
  const neutral = (kind: "checked" | "invalid" | "rate" | "error") => NextResponse.redirect(`${base}/account?payment=${kind}`, 303);

  const ref = url.searchParams.get("ref");
  const paymentId = url.searchParams.get("paymentId") ?? url.searchParams.get("PaymentId");
  const invoiceId = url.searchParams.get("Id");
  if (!ref && !paymentId && !invoiceId) return neutral("invalid");
  if (!paymentsConfig().enabled) return neutral("checked");

  const rowId = readPaymentReturnRef(ref);
  const ids = [paymentId, invoiceId].filter((v): v is string => v !== null && GATEWAY_ID.test(v));
  let target: Target | null;
  try {
    target = await findTarget(rowId, rowId ? [] : ids);
  } catch (err) {
    if (isDatabaseBusy(err)) throw err;
    await reportError("payment-return:lookup", err);
    return neutral("error");
  }
  if (!target) return neutral(unknownReturnRefused(ipFromHeaders(req.headers)) ? "rate" : "checked");

  let outcome: Outcome;
  try {
    outcome = await verifyTarget(target, paymentId !== null && GATEWAY_ID.test(paymentId) ? paymentId : undefined);
  } catch (err) {
    // انشغال مؤقت: صفحة تعيد المحاولة وحدها، فيُعاد التحقق من البوابة بدل رسالة خطأ
    if (isDatabaseBusy(err)) throw err;
    await reportError("payment-return:verify", err);
    outcome = { kind: "gateway_failed" };
  }
  return land(req, target, outcome, base, neutral);
}

async function verifyTarget(target: Target, focusPaymentId: string | undefined): Promise<Outcome> {
  let allowed = true;
  try {
    allowed = (await hitRateLimit(`payreturn:${target.id}`, CHECKS_PER_PAYMENT, CHECKS_WINDOW_SECONDS)).allowed;
  } catch (err) {
    // فشل العداد لا يقف بين المشتري والتحقق: التحقق نفسه idempotent
    if (isDatabaseBusy(err)) throw err;
    await reportError("payment-return:limit", err);
  }
  if (!allowed) return { kind: "not_checked" };
  // بفاتورتنا نحن دائمًا، فالرقم القادم في الرابط لا يوجّه سؤالًا إلى البوابة. يفيد فقط في معرفة أي محاولة يقصد
  return { kind: "verified", result: await verifyAndApplyPayment({ invoiceId: target.gateway_invoice_id }, { focusPaymentId }) };
}

/** كل ما بعد تسجيل الدفعة. لا يرمي: فشل قراءة الجلسة أو السلة يترك المشتري على صفحة صالحة */
async function land(req: NextRequest, target: Target, outcome: Outcome, base: string, neutral: (kind: "checked") => NextResponse): Promise<NextResponse> {
  let owner = false;
  try {
    owner = (await getCurrentUser())?.id === target.user_id;
  } catch (err) {
    await reportError("payment-return:session", err);
  }
  if (!owner) return neutral("checked");

  const suffix = outcome.kind === "gateway_failed" ? "?error=check" : outcome.kind === "verified" && outcome.result.state === "invalid" ? "?error=review" : "?from=payment";
  const res = NextResponse.redirect(`${base}/orders/${target.order_id}${suffix}`, 303);
  // دفعة سُجلت للمراجعة أو طلب مسترد لا يعنيان أن الطالب امتلك المنتج، فتبقى سلته كما هي
  if (outcome.kind === "verified" && outcome.result.state === "paid") {
    try {
      const items = await sql<{ product_id: string }[]>`select product_id from order_items where order_id = ${target.order_id}`;
      const paid = new Set(items.map((i) => i.product_id));
      const current = parseCartCookie(req.cookies.get("cart")?.value ?? "");
      res.cookies.set("cart", encodeURIComponent(JSON.stringify(current.filter((x) => !paid.has(x)))), {
        httpOnly: true,
        sameSite: "lax",
        secure: env().NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    } catch (err) {
      // السلة تُنظف عند فتحها لاحقًا إن لزم، والدفعة سُجلت
      await reportError("payment-return:cart", err);
    }
  }
  return res;
}

/** انشغال قاعدة البيانات: 503 مع Retry-After بدل خطأ أو تعليق */
export const GET = withBusyGuard(handleGET, "html");
