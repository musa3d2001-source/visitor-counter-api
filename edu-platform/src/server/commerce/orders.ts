import "server-only";
import { sql, type Db } from "../db";
import { computeCart } from "./cart";
import { evaluateCoupon } from "./coupons";
import { grantProduct, revokeProduct } from "../access/entitlements";
import { audit } from "../platform/audit";
import { recordEarnings, reverseEarnings } from "./earnings";
import type { SessionUser } from "../auth/session";

export type OrderRow = {
  id: string;
  number: string;
  user_id: string;
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
  subtotal_fils: number;
  discount_fils: number;
  total_fils: number;
  currency: string;
  coupon_id: string | null;
  coupon_code: string | null;
  is_test: boolean;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type OrderItemRow = { id: string; product_id: string; title: string; product_type: string; unit_price_fils: number; slug: string | null };

export class OrderError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "OrderError";
  }
}

/**
 * إنشاء طلب من السلة — الأسعار تُقرأ من قاعدة البيانات داخل معاملة.
 * يستبعد ما يملكه الطالب وما هو مضمّن في باقة بنفس الطلب.
 */
export async function createOrder(input: {
  user: SessionUser;
  productIds: string[];
  couponCode?: string | null;
  isTest: boolean;
  /** إن وُجد: الدفع الإلكتروني غير متاح، فيُرفض كل طلب بقيمة أكبر من صفر برسالة للطالب ولا يُكتب شيء */
  paidCheckoutBlockedReason?: string;
}): Promise<OrderRow> {
  const cart = await computeCart(input.productIds, input.user.id);
  if (cart.payableLines.length === 0) {
    throw new OrderError(cart.lines.length ? "كل المنتجات في سلتك موجودة في مكتبتك مسبقًا." : "سلتك فارغة.");
  }
  return sql.begin(async (tx) => {
    let discountFils = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (input.couponCode) {
      const check = await evaluateCoupon(input.couponCode, input.user.id, cart.subtotalFils, tx);
      if (!check.ok) throw new OrderError(check.error);
      discountFils = check.discountFils;
      couponId = check.coupon.id;
      couponCode = check.coupon.code;
    }
    const total = cart.subtotalFils - discountFils;
    if (total > 0 && input.paidCheckoutBlockedReason) throw new OrderError(input.paidCheckoutBlockedReason);
    const [order] = await tx<OrderRow[]>`
      insert into orders (user_id, subtotal_fils, discount_fils, total_fils, coupon_id, coupon_code, is_test,
                          customer_name, customer_email, customer_phone)
      values (${input.user.id}, ${cart.subtotalFils}, ${discountFils}, ${total}, ${couponId}, ${couponCode}, ${input.isTest},
              ${input.user.fullName}, ${input.user.email}, ${input.user.phone})
      returning *
    `;
    // لقطة هوية المعلم وقت الشراء — لا تتغير بتعديل ملفه لاحقًا
    const teachers = await tx<{ id: string; teacher_id: string | null; teacher_name: string | null }[]>`
      select p.id, p.teacher_id, t.display_name as teacher_name
      from products p left join teachers t on t.id = p.teacher_id
      where p.id = any(${cart.payableLines.map((l) => l.id)}::uuid[])
    `;
    const byId = new Map(teachers.map((t) => [t.id, t]));
    for (const line of cart.payableLines) {
      const t = byId.get(line.id);
      await tx`
        insert into order_items (order_id, product_id, title, product_type, unit_price_fils, teacher_id, teacher_name)
        values (${order.id}, ${line.id}, ${line.title}, ${line.type}, ${line.priceFils}, ${t?.teacher_id ?? null}, ${t?.teacher_name ?? null})
      `;
    }
    return order;
  });
}

/** جلب طلب يخص المستخدم فقط (منع IDOR) */
export async function getUserOrder(orderId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const [order] = await sql<OrderRow[]>`select * from orders where id = ${orderId} and user_id = ${userId}`;
  if (!order) return null;
  const items = await getOrderItems(order.id);
  return { order, items };
}

export async function getOrderItems(orderId: string, db: Db = sql) {
  return db<OrderItemRow[]>`
    select oi.id, oi.product_id, oi.title, oi.product_type, oi.unit_price_fils, p.slug
    from order_items oi left join products p on p.id = oi.product_id
    where oi.order_id = ${orderId} order by oi.created_at
  `;
}

export async function listUserOrders(userId: string) {
  return sql<(OrderRow & { item_count: number })[]>`
    select o.*, (select count(*)::int from order_items oi where oi.order_id = o.id) as item_count
    from orders o where o.user_id = ${userId}
    order by o.created_at desc limit 100
  `;
}

/**
 * تأكيد الطلب ومنح الصلاحيات — ذرّي ومحمي من التكرار:
 * يقفل صف الطلب (FOR UPDATE)؛ إن كان مدفوعًا مسبقًا يعود دون أي تغيير.
 * يُستدعى فقط بعد تحقق الخادم من نجاح الدفع لدى البوابة (أو لطلب مجاني بقيمة صفر).
 */
export async function markOrderPaid(
  db: Db,
  input: { orderId: string; paidAmountFils: number; paymentRowId?: string | null },
): Promise<{ changed: boolean; order: OrderRow }> {
  const [order] = await db<OrderRow[]>`select * from orders where id = ${input.orderId} for update`;
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status === "paid") return { changed: false, order };
  if (order.status === "refunded") throw new Error("ORDER_ALREADY_REFUNDED");
  if (input.paidAmountFils !== order.total_fils) throw new Error("AMOUNT_MISMATCH");

  const [updated] = await db<OrderRow[]>`
    update orders set status = 'paid', paid_at = now() where id = ${order.id} returning *
  `;
  const items = await db<{ product_id: string }[]>`select product_id from order_items where order_id = ${order.id}`;
  for (const it of items) {
    await grantProduct(db, { userId: order.user_id, productId: it.product_id, source: order.total_fils === 0 ? "free" : "purchase", orderId: order.id });
  }
  await recordEarnings(db, updated);
  if (order.coupon_id) {
    await db`
      insert into coupon_redemptions (coupon_id, order_id, user_id)
      values (${order.coupon_id}, ${order.id}, ${order.user_id})
      on conflict (order_id) do nothing
    `;
  }
  await audit({ actorId: null, action: "order.paid", entityType: "order", entityId: order.id, metadata: { paymentRowId: input.paymentRowId ?? null } }, db);
  return { changed: true, order: updated };
}

/** إتمام طلب مجاني (الإجمالي صفر بعد الخصم) دون المرور ببوابة الدفع */
export async function completeFreeOrder(orderId: string, userId: string) {
  return sql.begin(async (tx) => {
    const [order] = await tx<OrderRow[]>`select * from orders where id = ${orderId} and user_id = ${userId} for update`;
    if (!order) throw new OrderError("الطلب غير موجود");
    if (order.total_fils !== 0) throw new OrderError("هذا الطلب ليس مجانيًا");
    const [payment] = await tx<{ id: string }[]>`
      insert into payments (order_id, provider, environment, status, amount_fils, paid_at)
      values (${order.id}, 'free', 'none', 'paid', 0, now()) returning id
    `;
    return markOrderPaid(tx, { orderId: order.id, paidAmountFils: 0, paymentRowId: payment.id });
  });
}

/** تسجيل استرداد من المدير وسحب صلاحيات الطلب */
export async function refundOrder(input: { orderId: string; adminId: string; reason: string; amountFils?: number; ip?: string }) {
  return sql.begin(async (tx) => {
    const [order] = await tx<OrderRow[]>`select * from orders where id = ${input.orderId} for update`;
    if (!order) throw new OrderError("الطلب غير موجود");
    if (order.status !== "paid") throw new OrderError("لا يمكن استرداد طلب غير مدفوع");
    const amount = input.amountFils ?? order.total_fils;
    if (amount <= 0 || amount > order.total_fils) throw new OrderError("مبلغ الاسترداد غير صحيح");
    const [payment] = await tx<{ id: string }[]>`
      select id from payments where order_id = ${order.id} and status = 'paid' order by created_at desc limit 1
    `;
    await tx`update orders set status = 'refunded' where id = ${order.id}`;
    if (payment) await tx`update payments set status = 'refunded' where id = ${payment.id}`;
    const [refund] = await tx<{ id: string }[]>`
      insert into refunds (order_id, payment_id, amount_fils, reason, status, created_by)
      values (${order.id}, ${payment?.id ?? null}, ${amount}, ${input.reason}, 'recorded', ${input.adminId})
      returning id
    `;
    const items = await tx<{ product_id: string }[]>`select product_id from order_items where order_id = ${order.id}`;
    let revoked = 0;
    for (const it of items) {
      // نسحب فقط الصلاحيات المرتبطة بهذا الطلب
      const rows = await tx<{ id: string }[]>`
        select id from entitlements where user_id = ${order.user_id} and product_id = ${it.product_id} and order_id = ${order.id} and revoked_at is null
      `;
      if (rows.length) revoked += await revokeProduct(tx, { userId: order.user_id, productId: it.product_id, revokedBy: input.adminId, reason: `استرداد: ${input.reason}` });
    }
    const reversedEarnings = await reverseEarnings(tx, order.id, input.reason);
    await audit(
      { actorId: input.adminId, action: "order.refund", entityType: "order", entityId: order.id, reason: input.reason, metadata: { amountFils: amount, revoked, refundId: refund.id, reversedEarnings }, ip: input.ip },
      tx,
    );
    return { refundId: refund.id, paymentId: payment?.id ?? null, revoked, amountFils: amount };
  });
}
