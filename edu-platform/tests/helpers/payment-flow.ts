import postgres from "postgres";
import { applyRefundToOrder, createOrder, markOrderPaid, type OrderRow } from "@/server/commerce/orders";
import type { SessionUser } from "@/server/auth/session";
import type { Simulator } from "../mocks/myfatoorah-simulator";
import { sql } from "./db";
import { createProduct, createUser, type TestProduct } from "./factories";
import { TEST_DATABASE_URL } from "../test-env";

export type PaymentRow = {
  id: string;
  status: string;
  gateway_invoice_id: string | null;
  gateway_payment_id: string | null;
  payment_url: string | null;
  expires_at: Date | null;
  last_checked_at: Date | null;
  amount_fils: number;
  error_message: string | null;
};

export const invoiceIdOf = (url: string) => Number(new URL(url).pathname.split("/").pop());

export async function newOrder(priceFils = 3000): Promise<{ user: SessionUser; product: TestProduct; order: OrderRow }> {
  const user = await createUser({ phone: "+96599887766" });
  const product = await createProduct({ priceFils });
  const order = await createOrder({ user, productIds: [product.id], isTest: true });
  return { user, product, order };
}

export async function orderRow(id: string): Promise<OrderRow> {
  const [o] = await sql<OrderRow[]>`select * from orders where id = ${id}`;
  return o;
}

export function paymentRows(orderId: string): Promise<PaymentRow[]> {
  return sql<PaymentRow[]>`select * from payments where order_id = ${orderId} order by created_at asc`;
}

/** عدد طلبات إنشاء فاتورة وصلت إلى البوابة منذ آخر تصفير لسجل الطلبات */
export const invoicesCreated = (sim: Simulator) => sim.state.requests.filter((r) => r.path === "/v2/SendPayment" || r.path === "/v2/ExecutePayment").length;

export const statusCalls = (sim: Simulator) => sim.state.requests.filter((r) => r.path === "/v2/GetPaymentStatus").length;

/** نجعل الفاتورة منتهية لدى البوابة وعندنا */
export async function expireInvoice(sim: Simulator, invoiceId: number) {
  sim.expireInvoice(invoiceId);
  await expireLocally(invoiceId);
}

/** الفاتورة منتهية في سجلنا فقط: البوابة ما زالت تقبل الدفع عليها */
export async function expireLocally(invoiceId: number) {
  await sql`update payments set expires_at = now() - interval '1 hour' where gateway_invoice_id = ${String(invoiceId)}`;
}

export async function makeStale(orderId: string, hours = 73) {
  await sql`update orders set created_at = now() - make_interval(hours => ${hours}) where id = ${orderId}`;
}

export const confirmPaid = (order: OrderRow) => sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));

/** الأثر المحلي لاسترداد قبلته البوابة، لاختبارات الوصول والأرباح التي لا علاقة لها بالبوابة نفسها */
export function applyAcceptedRefund(orderId: string, adminId: string, reason: string) {
  return sql.begin(async (tx) => {
    const [order] = await tx<OrderRow[]>`select * from orders where id = ${orderId} for update`;
    const [refund] = await tx<{ id: string }[]>`
      insert into refunds (order_id, amount_fils, reason, status, attempt, created_by, accepted_at)
      values (${order.id}, ${order.total_fils}, ${reason}, 'requested', 1, ${adminId}, now()) returning id
    `;
    const applied = await applyRefundToOrder(tx, { order, paymentId: null, refundId: refund.id, amountFils: order.total_fils, reason, actorId: adminId });
    return { refundId: refund.id, ...applied };
  });
}

/** لقطة لكل ما يجب ألا يتغير عند معالجة دفعة زائدة: الطلب والوصول والأرباح */
export async function moneySnapshot(orderId: string) {
  const [[order], entitlements, earnings, refunds] = await Promise.all([
    sql`select status, total_fils, paid_at from orders where id = ${orderId}`,
    sql`select id, product_id, revoked_at from entitlements where order_id = ${orderId} order by id`,
    sql`select * from teacher_earnings where order_id = ${orderId} order by id`,
    sql`select id, status, amount_fils from refunds where order_id = ${orderId} order by id`,
  ]);
  return JSON.stringify({ order, entitlements, earnings, refunds });
}

export function auditCount(action: string, entityId: string) {
  return sql<{ n: number }[]>`select count(*)::int as n from audit_logs where action = ${action} and entity_id = ${entityId}`.then(([r]) => r.n);
}

export const pause = (ms = 250) => new Promise((r) => setTimeout(r, ms));

/**
 * اتصال مستقل يمثل نسخة أخرى من الخادم، يمسك أقفاله حتى ينتهي body.
 * السباق بين وعدين في العملية نفسها قد ينجح صدفة لأن فتح الاتصال الثاني أبطأ من المعاملة الأولى، وهنا التشابك مضمون.
 * أعد الوعود داخل كائن حتى لا تنتظرها المعاملة قبل تحرير القفل.
 */
export async function asOtherServer<T extends object>(body: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  const other = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    return (await other.begin((tx) => body(tx))) as T;
  } finally {
    await other.end({ timeout: 5 });
  }
}

export { createUser, createProduct };
