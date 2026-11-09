import "server-only";
import { sql, type Db } from "../db";
import { computeCart } from "./cart";
import { evaluateCoupon } from "./coupons";
import { grantProduct, revokeProduct } from "../access/entitlements";
import { audit } from "../platform/audit";
import { recordEarnings, reverseEarnings } from "./earnings";
import { sendOrderConfirmationEmail } from "./order-mail";
import { INVOICE_TTL_MINUTES, ORDER_LIFETIME_HOURS } from "../payments/limits";
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
  closed_at: Date | null;
  closed_reason: OrderClosedReason | null;
};

export type OrderClosedReason = "expired" | "student_cancelled" | "already_owned" | "coupon_unavailable" | "product_ended";

export type OrderItemRow = { id: string; product_id: string; title: string; product_type: string; unit_price_fils: number; slug: string | null };

export class OrderError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "OrderError";
  }
}

/** لدى الطالب طلب مفتوح يغطي منتجًا من سلته: يُوجَّه إليه بدل إنشاء طلب ثانٍ يمكن أن يُدفع معه */
export class OpenOrderExistsError extends OrderError {
  constructor(public readonly orderId: string) {
    super("لديك طلب مفتوح لهذا المنتج.");
    this.name = "OpenOrderExistsError";
  }
}

/**
 * الطلبات المفتوحة (بانتظار الدفع أو فشل دفعها، خلال عمرها) لنفس الطالب ونفس الوضع التي تتقاطع مع المنتجات المطلوبة،
 * مع فتح محتويات الباقات في الطرفين بأي عمق: شراء باقة فيها دورة في طلب مفتوح يتقاطع مع شراء الدورة وحدها. الأحدث أولًا.
 */
export async function findOpenOrdersCovering(db: Db, input: { userId: string; productIds: string[]; isTest: boolean }): Promise<{ id: string }[]> {
  if (input.productIds.length === 0) return [];
  return db<{ id: string }[]>`
    with recursive wanted(product_id) as (
      select unnest(${input.productIds}::uuid[])
      union
      select bi.product_id from wanted w join bundle_items bi on bi.bundle_id = w.product_id
    ),
    open_orders as (
      select o.id, o.created_at from orders o
      where o.user_id = ${input.userId} and o.status in ('pending', 'failed') and o.is_test = ${input.isTest}
        and o.created_at > now() - make_interval(hours => ${ORDER_LIFETIME_HOURS})
    ),
    covered(order_id, product_id) as (
      select oi.order_id, oi.product_id from order_items oi join open_orders oo on oo.id = oi.order_id
      union
      select c.order_id, bi.product_id from covered c join bundle_items bi on bi.bundle_id = c.product_id
    )
    select oo.id from open_orders oo
    where exists (select 1 from covered c join wanted w on w.product_id = c.product_id where c.order_id = oo.id)
    order by oo.created_at desc
  `;
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
  /** صفحة الشراء تفعّله: طلب مفتوح يغطي نفس المنتج يرفض الإنشاء بـ OpenOrderExistsError */
  refuseOverlappingOpenOrders?: boolean;
}): Promise<OrderRow> {
  const cart = await computeCart(input.productIds, input.user.id);
  if (cart.payableLines.length === 0) {
    throw new OrderError(cart.lines.some((l) => l.saleEnded) ? "انتهى بيع ما تبقى في سلتك، فلم ننشئ طلبًا." : cart.lines.length ? "كل المنتجات في سلتك موجودة في مكتبتك مسبقًا." : "سلتك فارغة.");
  }
  return sql.begin(async (tx) => {
    if (input.refuseOverlappingOpenOrders) {
      // قفل صف الطالب يجعل تبويبين يضغطان الشراء معًا يصطفان، فيرى الثاني طلب الأول. FOR NO KEY UPDATE لا يتعارض مع مفاتيح الجداول المرتبطة
      await tx`select id from users where id = ${input.user.id} for no key update`;
      const [open] = await findOpenOrdersCovering(tx, { userId: input.user.id, productIds: cart.payableLines.map((l) => l.id), isTest: input.isTest });
      if (open) throw new OpenOrderExistsError(open.id);
    }
    let discountFils = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (input.couponCode) {
      const check = await evaluateCoupon(input.couponCode, input.user.id, cart.subtotalFils, tx, { lock: true });
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

/** منتجات الطلب التي انتهى تاريخ إتاحتها: لا تُفوتر ولا تُمنح */
export async function endedProductsInOrder(db: Db, orderId: string): Promise<string[]> {
  const rows = await db<{ product_id: string }[]>`
    select oi.product_id from order_items oi join products p on p.id = oi.product_id
    where oi.order_id = ${orderId} and p.access_mode = 'until_date' and p.access_until is not null and p.access_until <= now()
  `;
  return rows.map((r) => r.product_id);
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
 * الطلب المغلق (cancelled) لا يُكمَل إلا بقرار صريح allowClosed بعد فحص أنه ما زال صالحًا، انظر applyConfirmedPayment.
 */
export async function markOrderPaid(
  db: Db,
  input: { orderId: string; paidAmountFils: number; paymentRowId?: string | null; allowClosed?: boolean },
): Promise<{ changed: boolean; order: OrderRow }> {
  const [order] = await db<OrderRow[]>`select * from orders where id = ${input.orderId} for update`;
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status === "paid") return { changed: false, order };
  if (order.status === "refunded") throw new Error("ORDER_ALREADY_REFUNDED");
  if (order.status === "cancelled" && !input.allowClosed) throw new Error("ORDER_CLOSED");
  if (input.paidAmountFils !== order.total_fils) throw new Error("AMOUNT_MISMATCH");

  const [updated] = await db<OrderRow[]>`
    update orders set status = 'paid', paid_at = now(), closed_at = null, closed_reason = null where id = ${order.id} returning *
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

/**
 * إغلاق طلب غير مدفوع. لا يتحقق من البوابة: على المستدعي أن يكون قد تحقق من كل الفواتير.
 * شرط الحالة في UPDATE هو الحارس، فالتشغيل المتزامن أو المكرر يغلق ويدقق مرة واحدة ولا يلمس طلبًا دُفع للتو.
 * الفاتورة التي لم تنتهِ بعد تبقى كما هي: وظيفة التسوية تتابعها، ودفعة متأخرة عليها تُعالج ولا تضيع.
 */
export async function closeOrder(db: Db, input: { orderId: string; reason: OrderClosedReason; actorId: string | null; ip?: string }): Promise<boolean> {
  const [closed] = await db<{ id: string }[]>`
    update orders set status = 'cancelled', closed_at = now(), closed_reason = ${input.reason}
    where id = ${input.orderId} and status in ('pending', 'failed')
    returning id
  `;
  if (!closed) return false;
  await db`
    update payments set status = 'failed', error_message = 'أُغلق الطلب قبل إنشاء رابط الدفع'
    where order_id = ${input.orderId} and status = 'initiated' and gateway_invoice_id is null
  `;
  await db`
    update payments set status = 'expired'
    where order_id = ${input.orderId} and status = 'pending'
      and coalesce(expires_at, created_at + make_interval(mins => ${INVOICE_TTL_MINUTES})) <= now()
  `;
  await audit({ actorId: input.actorId, action: "order.closed", entityType: "order", entityId: input.orderId, metadata: { reason: input.reason }, ip: input.ip ?? null }, db);
  return true;
}

/** إتمام طلب مجاني (الإجمالي صفر بعد الخصم) دون المرور ببوابة الدفع */
export async function completeFreeOrder(orderId: string, userId: string) {
  const out = await sql.begin(async (tx) => {
    const [order] = await tx<OrderRow[]>`select * from orders where id = ${orderId} and user_id = ${userId} for update`;
    if (!order) throw new OrderError("الطلب غير موجود");
    if (order.total_fils !== 0) throw new OrderError("هذا الطلب ليس مجانيًا");
    const [payment] = await tx<{ id: string }[]>`
      insert into payments (order_id, provider, environment, status, amount_fils, paid_at)
      values (${order.id}, 'free', 'none', 'paid', 0, now()) returning id
    `;
    return markOrderPaid(tx, { orderId: order.id, paidAmountFils: 0, paymentRowId: payment.id });
  });
  if (out.changed) await sendOrderConfirmationEmail(orderId);
  return out;
}

/**
 * أثر الاسترداد على الطلب: حالته وحالة دفعته وسحب صلاحياته وعكس أرباحه، كلها داخل معاملة المستدعي.
 * لا تُستدعى إلا بعد قبول البوابة أو تأكيدها (انظر payments/refunds.ts)، وعلى المستدعي أن يكون قد قفل صف الطلب وتأكد أنه paid.
 * الدفعة الزائدة لها سجلها وأمر استردادها الخاص: هذا الأثر يخص الدفعة التي أكملت الطلب فقط.
 */
export async function applyRefundToOrder(
  db: Db,
  input: { order: OrderRow; paymentId: string | null; refundId: string; amountFils: number; reason: string; actorId: string | null; ip?: string | null; gatewayRefundId?: string | null },
): Promise<{ revoked: number; reversedEarnings: number }> {
  const { order } = input;
  await db`update orders set status = 'refunded' where id = ${order.id}`;
  if (input.paymentId) await db`update payments set status = 'refunded' where id = ${input.paymentId}`;
  const items = await db<{ product_id: string }[]>`select product_id from order_items where order_id = ${order.id}`;
  let revoked = 0;
  for (const it of items) {
    // نسحب فقط الصلاحيات المرتبطة بهذا الطلب
    const rows = await db<{ id: string }[]>`
      select id from entitlements where user_id = ${order.user_id} and product_id = ${it.product_id} and order_id = ${order.id} and revoked_at is null
    `;
    if (rows.length) revoked += await revokeProduct(db, { userId: order.user_id, productId: it.product_id, revokedBy: input.actorId, reason: `استرداد: ${input.reason}` });
  }
  const reversedEarnings = await reverseEarnings(db, order.id, input.reason);
  await audit(
    {
      actorId: input.actorId,
      action: "order.refund",
      entityType: "order",
      entityId: order.id,
      reason: input.reason,
      metadata: { amountFils: input.amountFils, revoked, refundId: input.refundId, reversedEarnings, gatewayRefundId: input.gatewayRefundId ?? null },
      ip: input.ip ?? null,
    },
    db,
  );
  return { revoked, reversedEarnings };
}

/**
 * عكس applyRefundToOrder عندما تلغي البوابة استردادًا قبلته: المال لم يخرج، فيعود الطلب مدفوعًا والوصول والأرباح كما كانت.
 * نعيد فقط ما سحبه هذا الاسترداد بالضبط: revoked_at يساوي accepted_at لأنهما كُتبا بـ now() في معاملة واحدة.
 * صلاحية جُددت بعد السحب (شراء جديد أو منح يدوي) لا تطابق ولا تُمس.
 */
export async function undoRefundOnOrder(
  db: Db,
  input: { order: OrderRow; paymentId: string | null; refundId: string; actorId: string | null; gatewayRefundId?: string | null },
): Promise<{ restored: number; restoredEarnings: number }> {
  const { order } = input;
  await db`update orders set status = 'paid' where id = ${order.id} and status = 'refunded'`;
  if (input.paymentId) await db`update payments set status = 'paid' where id = ${input.paymentId} and status = 'refunded'`;
  const restored = await db<{ id: string }[]>`
    update entitlements e set revoked_at = null, revoked_by = null, revoke_reason = null
    from refunds r
    where r.id = ${input.refundId} and e.user_id = ${order.user_id} and e.revoked_at = r.accepted_at and e.revoke_reason = 'استرداد: ' || r.reason
    returning e.id
  `;
  const earnings = await db<{ id: string }[]>`
    update teacher_earnings set status = 'active', reversed_at = null, reversal_reason = null
    where order_id = ${order.id} and status = 'reversed'
    returning id
  `;
  await audit(
    { actorId: input.actorId, action: "order.refund_undone", entityType: "order", entityId: order.id, metadata: { refundId: input.refundId, restored: restored.length, restoredEarnings: earnings.length, gatewayRefundId: input.gatewayRefundId ?? null } },
    db,
  );
  return { restored: restored.length, restoredEarnings: earnings.length };
}
