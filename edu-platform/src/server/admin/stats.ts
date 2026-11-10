import "server-only";
import { sql } from "../db";
import { saleLines } from "../commerce/earnings";

/**
 * إحصاءات لوحة الإدارة والتقارير — من قاعدة البيانات فقط (لا أرقام وهمية).
 * الطلبات التجريبية (is_test) مستبعدة افتراضيًا.
 */

export async function dashboardTotals(includeTest: boolean) {
  const [row] = await sql<{ sales: string; paid: number; students: number; published: number; pending: number; test_paid: number }[]>`
    select
      (select coalesce(sum(total_fils), 0)::bigint from orders where status = 'paid' and (${includeTest} or not is_test)) as sales,
      (select count(*)::int from orders where status = 'paid' and (${includeTest} or not is_test)) as paid,
      (select count(*)::int from users where role = 'student' and anonymized_at is null) as students,
      (select count(*)::int from products where status = 'published') as published,
      (select count(*)::int from orders where status = 'pending' and (${includeTest} or not is_test) and created_at > now() - interval '2 days') as pending,
      (select count(*)::int from orders where status = 'paid' and is_test) as test_paid
  `;
  return {
    salesFils: Number(row.sales),
    paidOrders: row.paid,
    students: row.students,
    publishedProducts: row.published,
    pendingOrders: row.pending,
    testPaidOrders: row.test_paid,
  };
}

export async function latestOrders(limit: number, includeTest: boolean) {
  return sql<{ id: string; number: string; status: string; total_fils: number; customer_name: string; is_test: boolean; created_at: Date }[]>`
    select id, number, status, total_fils, customer_name, is_test, created_at
    from orders where (${includeTest} or not is_test)
    order by created_at desc limit ${limit}
  `;
}

export async function topProducts(limit: number, includeTest: boolean, from?: Date, to?: Date) {
  return sql<{ product_id: string; title: string; type: string; sold: number; revenue: string }[]>`
    select oi.product_id, max(oi.title) as title, max(oi.product_type) as type, count(*)::int as sold,
      sum(oi.unit_price_fils)::bigint as revenue
    from order_items oi join orders o on o.id = oi.order_id
    where o.status = 'paid' and (${includeTest} or not o.is_test)
      ${from ? sql`and o.paid_at >= ${from}` : sql``}
      ${to ? sql`and o.paid_at < ${to}` : sql``}
    group by oi.product_id
    order by sold desc, revenue desc
    limit ${limit}
  `;
}

/** المبيعات اليومية بتوقيت الكويت لعدد أيام محدد (أيام بلا مبيعات = صفر) */
export async function salesByDay(days: number, includeTest: boolean) {
  const rows = await sql<{ day: string; orders: number; revenue: string }[]>`
    with series as (
      select generate_series(
        (now() at time zone 'Asia/Kuwait')::date - (${days - 1}::int),
        (now() at time zone 'Asia/Kuwait')::date,
        interval '1 day'
      )::date as day
    )
    select to_char(s.day, 'YYYY-MM-DD') as day,
      count(o.id)::int as orders,
      coalesce(sum(o.total_fils), 0)::bigint as revenue
    from series s
    left join orders o on o.status = 'paid' and (${includeTest} or not o.is_test)
      and (o.paid_at at time zone 'Asia/Kuwait')::date = s.day
    group by s.day order by s.day
  `;
  return rows.map((r) => ({ day: r.day, orders: r.orders, revenueFils: Number(r.revenue) }));
}

// ---------------------------------------------------------------------------
// التقارير
// ---------------------------------------------------------------------------

export type ReportRange = { from: Date; to: Date; includeTest: boolean };

export async function reportSummary(r: ReportRange) {
  const [row] = await sql<{ orders: number; revenue: string; discounts: string; subtotal: string }[]>`
    select count(*)::int as orders, coalesce(sum(total_fils), 0)::bigint as revenue,
      coalesce(sum(discount_fils), 0)::bigint as discounts, coalesce(sum(subtotal_fils), 0)::bigint as subtotal
    from orders
    where status in ('paid', 'refunded') and paid_at >= ${r.from} and paid_at < ${r.to} and (${r.includeTest} or not is_test)
  `;
  const [ref] = await sql<{ refunds: string; n: number }[]>`
    select coalesce(sum(rf.amount_fils), 0)::bigint as refunds, count(*)::int as n
    from refunds rf join orders o on o.id = rf.order_id
    where rf.status in ('recorded', 'requested', 'completed')
      and coalesce(rf.accepted_at, rf.created_at) >= ${r.from} and coalesce(rf.accepted_at, rf.created_at) < ${r.to} and (${r.includeTest} or not o.is_test)
  `;
  return {
    orders: row.orders,
    revenueFils: Number(row.revenue),
    discountsFils: Number(row.discounts),
    subtotalFils: Number(row.subtotal),
    refundsFils: Number(ref.refunds),
    refundsCount: ref.n,
    netFils: Number(row.revenue) - Number(ref.refunds),
  };
}

export async function reportByDay(r: ReportRange) {
  const rows = await sql<{ day: string; orders: number; revenue: string; discounts: string }[]>`
    select to_char((paid_at at time zone 'Asia/Kuwait')::date, 'YYYY-MM-DD') as day, count(*)::int as orders,
      sum(total_fils)::bigint as revenue, sum(discount_fils)::bigint as discounts
    from orders
    where status in ('paid', 'refunded') and paid_at >= ${r.from} and paid_at < ${r.to} and (${r.includeTest} or not is_test)
    group by 1 order by 1
  `;
  return rows.map((x) => ({ day: x.day, orders: x.orders, revenueFils: Number(x.revenue), discountsFils: Number(x.discounts) }));
}

export async function reportByProduct(r: ReportRange) {
  const rows = await sql<{ product_id: string; title: string; type: string; sold: number; revenue: string }[]>`
    select oi.product_id, max(oi.title) as title, max(oi.product_type) as type, count(*)::int as sold, sum(oi.unit_price_fils)::bigint as revenue
    from order_items oi join orders o on o.id = oi.order_id
    where o.status in ('paid', 'refunded') and o.paid_at >= ${r.from} and o.paid_at < ${r.to} and (${r.includeTest} or not o.is_test)
    group by oi.product_id order by revenue desc, sold desc
  `;
  return rows.map((x) => ({ ...x, revenueFils: Number(x.revenue) }));
}

export async function reportByGrade(r: ReportRange) {
  const rows = await sql<{ grade_name: string; level: number; sold: number; revenue: string }[]>`
    select g.name as grade_name, g.level, count(*)::int as sold, sum(oi.unit_price_fils)::bigint as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    join grades g on g.id = p.grade_id
    where o.status in ('paid', 'refunded') and o.paid_at >= ${r.from} and o.paid_at < ${r.to} and (${r.includeTest} or not o.is_test)
    group by g.name, g.level order by g.level
  `;
  return rows.map((x) => ({ ...x, revenueFils: Number(x.revenue) }));
}

/** شروط التصدير في مكان واحد: العدد المعلن في سجل التدقيق يطابق ما تعيده الصفحات */
export async function countReportOrders(r: ReportRange): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from orders o
    where o.status in ('paid', 'refunded') and o.paid_at >= ${r.from} and o.paid_at < ${r.to} and (${r.includeTest} or not o.is_test)
  `;
  return row.n;
}

/**
 * صفحة واحدة من طلبات التصدير. المؤشر (وقت الدفع، المعرّف) لا يتكرر ولا يتخطى طلبين دُفعا في اللحظة نفسها.
 * الوقت يعود نصًا كاملًا: Date في JavaScript يقص الميكروثانية فيعيد صفوفًا أو يتخطاها.
 */
export async function reportOrdersPage(r: ReportRange, after: { paidAt: string; id: string } | null, limit: number) {
  return sql<
    {
      id: string;
      paid_cursor: string;
      number: string;
      paid_at: Date;
      customer_name: string;
      customer_email: string;
      status: string;
      subtotal_fils: number;
      discount_fils: number;
      total_fils: number;
      coupon_code: string | null;
      is_test: boolean;
      items: string;
    }[]
  >`
    select o.id, o.paid_at::text as paid_cursor, o.number, o.paid_at, o.customer_name, o.customer_email, o.status, o.subtotal_fils, o.discount_fils, o.total_fils,
      o.coupon_code, o.is_test,
      (select string_agg(oi.title, ' | ' order by oi.created_at) from order_items oi where oi.order_id = o.id) as items
    from orders o
    where o.status in ('paid', 'refunded') and o.paid_at >= ${r.from} and o.paid_at < ${r.to} and (${r.includeTest} or not o.is_test)
      ${after ? sql`and (o.paid_at, o.id) > (${after.paidAt}::timestamptz, ${after.id}::uuid)` : sql``}
    order by o.paid_at, o.id
    limit ${limit}
  `;
}

export async function auditLog(filters: { action?: string; entityType?: string; limit?: number }) {
  return sql<
    { id: string; action: string; entity_type: string; entity_id: string | null; reason: string | null; metadata: unknown; ip: string | null; created_at: Date; actor_name: string | null; actor_email: string | null }[]
  >`
    select a.id::text, a.action, a.entity_type, a.entity_id, a.reason, a.metadata, a.ip, a.created_at,
      u.full_name as actor_name, u.email as actor_email
    from audit_logs a left join users u on u.id = a.actor_id
    where true
      ${filters.action ? sql`and a.action ilike ${filters.action + "%"}` : sql``}
      ${filters.entityType ? sql`and a.entity_type = ${filters.entityType}` : sql``}
    order by a.created_at desc
    limit ${filters.limit ?? 200}
  `;
}

/** تحويل تاريخ yyyy-mm-dd (بتوقيت الكويت) إلى بداية اليوم UTC */
export function kuwaitDayStart(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function kuwaitToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date());
}

export function parseRange(sp: { from?: string; to?: string; test?: string }): ReportRange & { fromDay: string; toDay: string } {
  const toDay = sp.to && kuwaitDayStart(sp.to) ? sp.to : kuwaitToday();
  const defaultFrom = new Date(kuwaitDayStart(toDay)!.getTime() - 29 * 86400_000);
  const fromDay = sp.from && kuwaitDayStart(sp.from) ? sp.from : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(defaultFrom);
  let from = kuwaitDayStart(fromDay)!;
  let to = new Date(kuwaitDayStart(toDay)!.getTime() + 86400_000);
  if (from > to) [from, to] = [new Date(to.getTime() - 86400_000), new Date(from.getTime() + 86400_000)];
  return { from, to, includeTest: sp.test === "1", fromDay, toDay };
}

/**
 * المبيعات حسب المعلم (للمالك): أسطر الطلبات المدفوعة المنسوبة لكل معلم وقت الشراء،
 * وبند الباقة بأجزائه + الأرباح المحتسبة من السجل المحاسبي.
 */
export async function reportByTeacher(r: ReportRange) {
  const rows = await sql<{ teacher_id: string | null; teacher_name: string | null; sold: number; revenue: string; teacher_share: string; platform_share: string }[]>`
    select l.teacher_id, coalesce(max(t.display_name), max(l.teacher_name)) as teacher_name,
      count(*)::int as sold, coalesce(sum(l.gross_fils), 0)::bigint as revenue,
      coalesce(sum(te.teacher_fils) filter (where te.status = 'active'), 0)::bigint as teacher_share,
      coalesce(sum(te.platform_fils) filter (where te.status = 'active'), 0)::bigint as platform_share
    from ${saleLines()} l
    join orders o on o.id = l.order_id
    left join teachers t on t.id = l.teacher_id
    left join teacher_earnings te on te.order_item_id = l.line_id or te.order_item_part_id = l.line_id
    where o.status = 'paid' and o.paid_at >= ${r.from} and o.paid_at < ${r.to} and (${r.includeTest} or not o.is_test)
    group by l.teacher_id
    order by revenue desc
  `;
  return rows.map((x) => ({
    teacherId: x.teacher_id,
    teacherName: x.teacher_id ? (x.teacher_name ?? "—") : "محتوى المنصة",
    sold: x.sold,
    revenueFils: Number(x.revenue),
    teacherShareFils: Number(x.teacher_share),
    platformShareFils: Number(x.platform_share),
  }));
}

/** أفضل المعلمين مبيعًا خلال آخر N يومًا (للوحة المالك) */
export async function topTeachers(days: number, includeTest: boolean, limit = 6) {
  const rows = await sql<{ teacher_id: string; teacher_name: string; sold: number; revenue: string }[]>`
    select l.teacher_id, coalesce(max(t.display_name), max(l.teacher_name)) as teacher_name, count(*)::int as sold,
      coalesce(sum(l.gross_fils), 0)::bigint as revenue
    from ${saleLines()} l join orders o on o.id = l.order_id left join teachers t on t.id = l.teacher_id
    where o.status = 'paid' and l.teacher_id is not null and (${includeTest} or not o.is_test)
      and o.paid_at >= now() - make_interval(days => ${days})
    group by l.teacher_id order by revenue desc limit ${limit}
  `;
  return rows.map((x) => ({ teacherId: x.teacher_id, teacherName: x.teacher_name, sold: x.sold, revenueFils: Number(x.revenue) }));
}
