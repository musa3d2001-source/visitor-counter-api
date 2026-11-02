import "server-only";
import { sql } from "../db";

/** استعلامات الإدارة: الطلبات، الطلاب، الكوبونات */

export type AdminOrderRow = {
  id: string;
  number: string;
  status: string;
  total_fils: number;
  discount_fils: number;
  customer_name: string;
  customer_email: string;
  is_test: boolean;
  created_at: Date;
  paid_at: Date | null;
  item_count: number;
  last_payment_status: string | null;
};

export async function listAdminOrders(f: { q?: string; status?: string; test?: string }, limit = 200) {
  const q = f.q?.trim();
  return sql<AdminOrderRow[]>`
    select o.id, o.number, o.status, o.total_fils, o.discount_fils, o.customer_name, o.customer_email, o.is_test, o.created_at, o.paid_at,
      (select count(*)::int from order_items oi where oi.order_id = o.id) as item_count,
      (select p.status from payments p where p.order_id = o.id order by p.created_at desc limit 1) as last_payment_status
    from orders o
    where true
      ${q ? sql`and (o.number ilike ${"%" + q + "%"} or o.customer_email ilike ${"%" + q + "%"} or o.customer_name ilike ${"%" + q + "%"})` : sql``}
      ${f.status ? sql`and o.status = ${f.status}` : sql``}
      ${f.test === "real" ? sql`and not o.is_test` : f.test === "test" ? sql`and o.is_test` : sql``}
    order by o.created_at desc
    limit ${limit}
  `;
}

export async function getAdminOrder(id: string) {
  const [order] = await sql<
    {
      id: string;
      number: string;
      user_id: string;
      status: string;
      subtotal_fils: number;
      discount_fils: number;
      total_fils: number;
      coupon_code: string | null;
      is_test: boolean;
      customer_name: string;
      customer_email: string;
      customer_phone: string | null;
      paid_at: Date | null;
      created_at: Date;
    }[]
  >`select * from orders where id = ${id}`;
  if (!order) return null;
  const items = await sql<{ id: string; product_id: string; title: string; product_type: string; unit_price_fils: number }[]>`
    select id, product_id, title, product_type, unit_price_fils from order_items where order_id = ${id} order by created_at
  `;
  const payments = await sql<
    {
      id: string;
      provider: string;
      environment: string;
      status: string;
      amount_fils: number;
      gateway_invoice_id: string | null;
      gateway_payment_id: string | null;
      payment_method: string | null;
      error_message: string | null;
      paid_at: Date | null;
      created_at: Date;
    }[]
  >`
    select id, provider, environment, status, amount_fils, gateway_invoice_id, gateway_payment_id, payment_method, error_message, paid_at, created_at
    from payments where order_id = ${id} order by created_at desc
  `;
  const invoiceIds = payments.map((p) => p.gateway_invoice_id).filter((x): x is string => Boolean(x));
  const events = invoiceIds.length
    ? await sql<{ id: string; event_name: string; result: string | null; received_at: Date; signature_valid: boolean }[]>`
        select id, event_name, result, received_at, signature_valid from payment_events
        where payload #>> '{Data,Invoice,Id}' = any(${invoiceIds}::text[])
           or payload #>> '{Data,ReferencedInvoice,Id}' = any(${invoiceIds}::text[])
        order by received_at desc limit 50
      `
    : [];
  const refunds = await sql<{ id: string; amount_fils: number; reason: string; status: string; gateway_refund_id: string | null; payment_id: string | null; created_at: Date; admin_name: string | null }[]>`
    select r.id, r.amount_fils, r.reason, r.status, r.gateway_refund_id, r.payment_id, r.created_at, u.full_name as admin_name
    from refunds r left join users u on u.id = r.created_by where r.order_id = ${id} order by r.created_at desc
  `;
  return { order, items, payments, events, refunds };
}

export type AdminStudentRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: Date;
  last_login_at: Date | null;
  grade_name: string | null;
  paid_orders: number;
  active_entitlements: number;
};

export async function listStudents(q: string | undefined, limit = 200) {
  const s = q?.trim();
  return sql<AdminStudentRow[]>`
    select u.id, u.full_name, u.email, u.phone, u.is_active, u.created_at, u.last_login_at, g.name as grade_name,
      (select count(*)::int from orders o where o.user_id = u.id and o.status = 'paid') as paid_orders,
      (select count(*)::int from entitlements e where e.user_id = u.id and e.revoked_at is null) as active_entitlements
    from users u left join grades g on g.id = u.grade_id
    where u.role = 'student'
      ${s ? sql`and (u.full_name ilike ${"%" + s + "%"} or u.email ilike ${"%" + s + "%"} or coalesce(u.phone, '') ilike ${"%" + s + "%"})` : sql``}
    order by u.created_at desc
    limit ${limit}
  `;
}

export async function getStudent(id: string) {
  const [user] = await sql<
    { id: string; full_name: string; email: string; phone: string | null; role: string; is_active: boolean; created_at: Date; last_login_at: Date | null; grade_name: string | null }[]
  >`
    select u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.created_at, u.last_login_at, g.name as grade_name
    from users u left join grades g on g.id = u.grade_id where u.id = ${id}
  `;
  if (!user) return null;
  const orders = await sql<{ id: string; number: string; status: string; total_fils: number; is_test: boolean; created_at: Date }[]>`
    select id, number, status, total_fils, is_test, created_at from orders where user_id = ${id} order by created_at desc limit 50
  `;
  const entitlements = await sql<
    {
      id: string;
      product_id: string;
      title: string;
      type: string;
      source: string;
      order_number: string | null;
      via_bundle_title: string | null;
      grant_reason: string | null;
      granted_at: Date;
      revoked_at: Date | null;
      revoke_reason: string | null;
      granted_by_name: string | null;
    }[]
  >`
    select e.id, e.product_id, p.title, p.type, e.source, o.number as order_number, vb.title as via_bundle_title,
      e.grant_reason, e.granted_at, e.revoked_at, e.revoke_reason, gu.full_name as granted_by_name
    from entitlements e
    join products p on p.id = e.product_id
    left join orders o on o.id = e.order_id
    left join products vb on vb.id = e.via_bundle_id
    left join users gu on gu.id = e.granted_by
    where e.user_id = ${id}
    order by e.revoked_at nulls first, e.granted_at desc
  `;
  const access = await sql<{ id: string; action: string; title: string | null; ip: string | null; created_at: Date }[]>`
    select a.id::text, a.action, p.title, a.ip, a.created_at
    from access_logs a left join products p on p.id = a.product_id
    where a.user_id = ${id} order by a.created_at desc limit 30
  `;
  const auditTrail = await sql<{ id: string; action: string; reason: string | null; metadata: unknown; created_at: Date; actor_name: string | null }[]>`
    select a.id::text, a.action, a.reason, a.metadata, a.created_at, u.full_name as actor_name
    from audit_logs a left join users u on u.id = a.actor_id
    where a.entity_type = 'user' and a.entity_id = ${id}
    order by a.created_at desc limit 50
  `;
  return { user, orders, entitlements, access, auditTrail };
}

/** المنتجات القابلة للمنح يدويًا (كل المنتجات غير المؤرشفة) */
export async function grantableProducts() {
  return sql<{ id: string; title: string; type: string; grade_name: string; status: string }[]>`
    select p.id, p.title, p.type, g.name as grade_name, p.status
    from products p join grades g on g.id = p.grade_id
    where p.status <> 'archived'
    order by g.level, p.type = 'bundle' desc, p.title
  `;
}

export type CouponAdminRow = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  min_order_fils: number;
  max_redemptions: number | null;
  max_per_user: number;
  starts_at: Date | null;
  ends_at: Date | null;
  is_active: boolean;
  note: string;
  redemptions: number;
  created_at: Date;
};

export async function listCoupons() {
  return sql<CouponAdminRow[]>`
    select c.*, (select count(*)::int from coupon_redemptions r where r.coupon_id = c.id) as redemptions
    from coupons c order by c.is_active desc, c.created_at desc
  `;
}

export async function getCoupon(id: string) {
  const [c] = await sql<CouponAdminRow[]>`
    select c.*, (select count(*)::int from coupon_redemptions r where r.coupon_id = c.id) as redemptions
    from coupons c where c.id = ${id}
  `;
  return c ?? null;
}
