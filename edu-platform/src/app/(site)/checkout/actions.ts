"use server";

import { redirect } from "next/navigation";
import { getCartIds, writeCartIds } from "@/server/commerce/cart";
import { assertUser } from "@/server/auth/guards";
import { createOrder, completeFreeOrder, getUserOrder, OrderError } from "@/server/commerce/orders";
import { PaymentModeMismatchError, paymentsConfig, startPayment, verifyAndApplyPayment } from "@/server/payments/service";
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

  let orderId: string;
  let paymentUrl: string | null = null;
  try {
    const order = await createOrder({
      user,
      productIds: ids,
      couponCode: coupon,
      isTest: cfg.enabled && cfg.environment === "sandbox",
      // لا نترك طلبًا معلّقًا لا يمكن دفعه؛ الطلبات المجانية تكتمل كالمعتاد
      paidCheckoutBlockedReason: cfg.enabled ? undefined : "الدفع الإلكتروني غير متاح حاليًا. تبقى المنتجات في سلتك لتعود إليها لاحقًا.",
    });
    orderId = order.id;
    if (order.total_fils === 0) {
      await completeFreeOrder(order.id, user.id);
      const paid = await sql<{ product_id: string }[]>`select product_id from order_items where order_id = ${order.id}`;
      const paidIds = new Set(paid.map((p) => p.product_id));
      await writeCartIds(ids.filter((x) => !paidIds.has(x)));
    } else {
      const res = await startPayment(order, methodId);
      paymentUrl = res.url;
    }
  } catch (err) {
    if (err instanceof OrderError) return { error: err.userMessage };
    if (err instanceof MyFatoorahError) {
      console.error("[checkout] payment init failed", err.message);
      return { error: "تعذر بدء عملية الدفع حاليًا. حاول مرة أخرى بعد قليل." };
    }
    throw err;
  }
  redirect(paymentUrl ?? `/orders/${orderId}?from=checkout`);
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
    redirect(`/orders/${found.order.id}?error=${err instanceof PaymentModeMismatchError ? "mode" : "payment"}`);
  }
  redirect(url);
}

/** تحديث حالة طلب معلّق عبر الاستعلام من البوابة */
export async function refreshOrderStatusAction(fd: FormData) {
  const user = await assertUser();
  const found = await getUserOrder(String(fd.get("orderId") ?? ""), user.id);
  if (!found) redirect("/account");
  const limit = await hitRateLimit(`refresh:${user.id}`, 20, 60 * 10);
  if (limit.allowed && found.order.status === "pending") {
    const [p] = await sql<{ gateway_invoice_id: string | null }[]>`
      select gateway_invoice_id from payments where order_id = ${found.order.id} and provider = 'myfatoorah' and gateway_invoice_id is not null
      order by created_at desc limit 1
    `;
    if (p?.gateway_invoice_id) {
      try {
        await verifyAndApplyPayment({ invoiceId: p.gateway_invoice_id });
      } catch (err) {
        console.error("[refresh-order] verify failed", err);
      }
    }
  }
  redirect(`/orders/${found.order.id}`);
}
