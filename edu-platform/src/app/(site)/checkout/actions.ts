"use server";

import { redirect } from "next/navigation";
import { getCartIds, writeCartIds } from "@/server/commerce/cart";
import { assertUser } from "@/server/auth/guards";
import { closeOrder, createOrder, completeFreeOrder, getUserOrder, OpenOrderExistsError, OrderError } from "@/server/commerce/orders";
import {
  OrderClosedError,
  OrderSettledError,
  PaymentInProgressError,
  PaymentModeMismatchError,
  checkOrderInvoices,
  paymentsConfig,
  resolveOpenOrderForCheckout,
  startPayment,
} from "@/server/payments/service";
import { MyFatoorahError } from "@/server/payments/myfatoorah";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { sql } from "@/server/db";
import type { ActionState } from "@/lib/action-state";

export async function placeOrderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await assertUser();
  const limit = await hitRateLimit(`checkout:${user.id}`, 20, 60 * 60);
  if (!limit.allowed) return { error: "محاولات كثيرة. حاول بعد قليل." };
  const ids = await getCartIds();
  const coupon = String(fd.get("coupon") ?? "").trim() || null;
  const methodRaw = String(fd.get("paymentMethodId") ?? "");
  const methodId = /^\d{1,6}$/.test(methodRaw) ? Number(methodRaw) : null;
  const cfg = paymentsConfig();
  const isTest = cfg.enabled && cfg.environment === "sandbox";

  // طلب مفتوح لنفس المنتج: نتحقق من فواتيره أولًا ثم نوجّه الطالب إليه، حتى لا ينشأ طلب ثانٍ يُدفع معه
  if (cfg.enabled) {
    const open = await resolveOpenOrderForCheckout({ userId: user.id, productIds: ids, isTest });
    if (open.kind === "paid") {
      await removeOrderItemsFromCart(open.orderId, ids);
      redirect(`/orders/${open.orderId}?from=payment`);
    }
    if (open.kind === "open") redirect(`/orders/${open.orderId}?from=open-order`);
  }

  let orderId: string;
  let paymentUrl: string | null = null;
  try {
    const order = await createOrder({
      user,
      productIds: ids,
      couponCode: coupon,
      isTest,
      // لا نترك طلبًا معلّقًا لا يمكن دفعه؛ الطلبات المجانية تكتمل كالمعتاد
      paidCheckoutBlockedReason: cfg.enabled ? undefined : "الدفع الإلكتروني غير متاح حاليًا. تبقى المنتجات في سلتك لتعود إليها لاحقًا.",
      refuseOverlappingOpenOrders: cfg.enabled,
    });
    orderId = order.id;
    if (order.total_fils === 0) {
      await completeFreeOrder(order.id, user.id);
      await removeOrderItemsFromCart(order.id, ids);
    } else {
      const res = await startPayment(order, methodId);
      paymentUrl = res.url;
    }
  } catch (err) {
    if (err instanceof OpenOrderExistsError) redirect(`/orders/${err.orderId}?from=open-order`);
    if (err instanceof OrderError) return { error: err.userMessage };
    if (err instanceof OrderClosedError && err.reason === "already_owned") return { error: "أصبح أحد المنتجات في مكتبتك، فلم ننشئ طلبًا لتجنب الدفع مرتين." };
    if (err instanceof MyFatoorahError) {
      console.error("[checkout] payment init failed", err.message);
      return { error: "تعذر بدء عملية الدفع حاليًا. حاول مرة أخرى بعد قليل." };
    }
    throw err;
  }
  redirect(paymentUrl ?? `/orders/${orderId}?from=checkout`);
}

async function removeOrderItemsFromCart(orderId: string, cart: string[]) {
  const items = await sql<{ product_id: string }[]>`select product_id from order_items where order_id = ${orderId}`;
  const paidIds = new Set(items.map((p) => p.product_id));
  await writeCartIds(cart.filter((x) => !paidIds.has(x)));
}

/** إعادة محاولة الدفع لطلب قائم لم يُدفع */
export async function retryPaymentAction(fd: FormData) {
  const user = await assertUser();
  const found = await getUserOrder(String(fd.get("orderId") ?? ""), user.id);
  if (!found || (found.order.status !== "pending" && found.order.status !== "failed")) redirect("/account");
  const limit = await hitRateLimit(`retry:${user.id}`, 10, 60 * 60);
  if (!limit.allowed) redirect(`/orders/${found.order.id}?error=rate`);
  let url: string;
  try {
    url = (await startPayment(found.order, null)).url;
  } catch (err) {
    if (err instanceof OrderSettledError) redirect(`/orders/${found.order.id}`);
    const code = err instanceof PaymentModeMismatchError ? "mode" : err instanceof OrderClosedError ? "closed" : err instanceof PaymentInProgressError ? "inprogress" : "payment";
    redirect(`/orders/${found.order.id}?error=${code}`);
  }
  redirect(url);
}

/** تحديث حالة طلب معلّق عبر الاستعلام من البوابة */
export async function refreshOrderStatusAction(fd: FormData) {
  const user = await assertUser();
  const found = await getUserOrder(String(fd.get("orderId") ?? ""), user.id);
  if (!found) redirect("/account");
  const limit = await hitRateLimit(`refresh:${user.id}`, 20, 60 * 10);
  if (!limit.allowed) redirect(`/orders/${found.order.id}?error=rate`);
  if (found.order.status === "pending" || found.order.status === "failed") {
    const walk = await checkOrderInvoices(found.order.id);
    if (!walk.allChecked) {
      console.error("[refresh-order] incomplete", walk.error);
      redirect(`/orders/${found.order.id}?error=check`);
    }
  }
  redirect(`/orders/${found.order.id}`);
}

/**
 * إلغاء الطالب لطلبه غير المدفوع، حتى يستطيع البدء من جديد دون انتظار انتهاء عمر الطلب.
 * لا يُلغى قبل التأكد من كل فواتيره لدى البوابة، وعند التعذر أو وجود عملية جارية يبقى الطلب كما هو.
 */
export async function cancelOrderAction(fd: FormData) {
  const user = await assertUser();
  const found = await getUserOrder(String(fd.get("orderId") ?? ""), user.id);
  if (!found) redirect("/account");
  const orderUrl = `/orders/${found.order.id}`;
  if (found.order.status !== "pending" && found.order.status !== "failed") redirect(orderUrl);
  const limit = await hitRateLimit(`cancel-order:${user.id}`, 10, 60 * 10);
  if (!limit.allowed) redirect(`${orderUrl}?error=rate`);
  const walk = await checkOrderInvoices(found.order.id);
  if (!walk.allChecked) redirect(`${orderUrl}?error=check`);
  if (walk.inProgressInvoiceIds.length) redirect(`${orderUrl}?error=inprogress`);
  await sql.begin((db) => closeOrder(db, { orderId: found.order.id, reason: "student_cancelled", actorId: user.id }));
  redirect(orderUrl);
}
