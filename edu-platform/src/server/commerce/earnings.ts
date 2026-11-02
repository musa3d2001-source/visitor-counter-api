import "server-only";
import { sql, type Db } from "../db";
import { audit } from "../platform/audit";
import { getSettings } from "../platform/settings";

/**
 * السجل المحاسبي لأرباح المعلمين (اختياري لكل معلم — يفعّله المالك بتحديد نسبة):
 *   قيمة البند − حصته من الخصم − حصته من الرسوم المعتمدة = الصافي المؤهل
 *   حصة المعلم = floor(الصافي × النسبة) ، حصة المنصة = الباقي
 * يُسجَّل لحظة تأكيد الدفع داخل نفس المعاملة (لا يتكرر — order_item_id فريد)،
 * ويُعكس عند الاسترداد. التسوية يدوية عبر teacher_payouts مع سجل تدقيق.
 */

/** توزيع مبلغ على أوزان بدقة الفلس (أكبر باقٍ) — مجموع النتيجة = المبلغ دائمًا */
export function allocateProportional(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new Error("total must be a non-negative integer");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map((x) => Math.floor(x));
  let remainder = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) out[order[k].i] += 1;
  return out;
}

/** الرسوم المعتمدة لطلب: نسبة + مبلغ ثابت، بحد أقصى قيمة الطلب */
export function computeOrderFee(totalFils: number, feeBps: number, feeFixedFils: number): number {
  if (totalFils <= 0) return 0;
  return Math.min(totalFils, Math.round((totalFils * feeBps) / 10000) + feeFixedFils);
}

export type EarningLine = {
  orderItemId: string;
  grossFils: number;
  discountFils: number;
  feeFils: number;
  netFils: number;
  shareBps: number | null;
  teacherFils: number;
  platformFils: number;
};

/** حساب الأسطر (دالة نقية قابلة للاختبار) */
export function computeEarningLines(
  items: { orderItemId: string; grossFils: number; shareBps: number | null }[],
  discountFils: number,
  feeFils: number,
): EarningLine[] {
  const discounts = allocateProportional(discountFils, items.map((i) => i.grossFils));
  const afterDiscount = items.map((i, k) => i.grossFils - discounts[k]);
  const fees = allocateProportional(Math.min(feeFils, afterDiscount.reduce((a, b) => a + b, 0)), afterDiscount);
  return items.map((i, k) => {
    const net = afterDiscount[k] - fees[k];
    const teacher = i.shareBps === null ? 0 : Math.floor((net * i.shareBps) / 10000);
    return {
      orderItemId: i.orderItemId,
      grossFils: i.grossFils,
      discountFils: discounts[k],
      feeFils: fees[k],
      netFils: net,
      shareBps: i.shareBps,
      teacherFils: teacher,
      platformFils: net - teacher,
    };
  });
}

/** تسجيل أرباح طلب مدفوع (idempotent) — يُستدعى داخل معاملة تأكيد الدفع */
export async function recordEarnings(db: Db, order: { id: string; total_fils: number; discount_fils: number; is_test: boolean }) {
  const items = await db<
    { id: string; product_id: string; title: string; unit_price_fils: number; teacher_id: string | null; teacher_name: string | null; share_bps: number | null }[]
  >`
    select oi.id, oi.product_id, oi.title, oi.unit_price_fils, oi.teacher_id, oi.teacher_name, t.revenue_share_bps as share_bps
    from order_items oi left join teachers t on t.id = oi.teacher_id
    where oi.order_id = ${order.id}
    order by oi.created_at, oi.id
  `;
  const eligible = items.some((i) => i.teacher_id && i.share_bps !== null);
  if (!eligible) return 0;
  const settings = await getSettings();
  const fee = computeOrderFee(order.total_fils, settings.fee_percent_bps, settings.fee_fixed_fils);
  const lines = computeEarningLines(
    items.map((i) => ({ orderItemId: i.id, grossFils: i.unit_price_fils, shareBps: i.teacher_id ? i.share_bps : null })),
    order.discount_fils,
    fee,
  );
  let n = 0;
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    const l = lines[k];
    if (!it.teacher_id || it.share_bps === null) continue;
    const rows = await db`
      insert into teacher_earnings (order_id, order_item_id, teacher_id, teacher_name, product_id, product_title,
        gross_fils, discount_fils, fee_fils, net_fils, share_bps, teacher_fils, platform_fils, is_test)
      values (${order.id}, ${it.id}, ${it.teacher_id}, ${it.teacher_name ?? ""}, ${it.product_id}, ${it.title},
        ${l.grossFils}, ${l.discountFils}, ${l.feeFils}, ${l.netFils}, ${it.share_bps}, ${l.teacherFils}, ${l.platformFils}, ${order.is_test})
      on conflict (order_item_id) do nothing
      returning id
    `;
    n += rows.length;
  }
  return n;
}

/** عكس أرباح طلب مسترد */
export async function reverseEarnings(db: Db, orderId: string, reason: string) {
  const rows = await db`
    update teacher_earnings set status = 'reversed', reversed_at = now(), reversal_reason = ${reason.slice(0, 500)}
    where order_id = ${orderId} and status = 'active'
    returning id
  `;
  return rows.length;
}

export type TeacherBalance = { earnedFils: number; reversedFils: number; paidFils: number; balanceFils: number; salesCount: number };

/** الرصيد: المستحق النشط − المسدد (قد يكون سالبًا إن حدث استرداد بعد التسوية) */
export async function teacherBalance(teacherId: string, opts: { includeTest?: boolean } = {}, db: Db = sql): Promise<TeacherBalance> {
  const includeTest = opts.includeTest ?? false;
  const [e] = await db<{ earned: string; reversed: string; sales: number }[]>`
    select
      coalesce(sum(teacher_fils) filter (where status = 'active'), 0)::bigint as earned,
      coalesce(sum(teacher_fils) filter (where status = 'reversed'), 0)::bigint as reversed,
      count(*) filter (where status = 'active')::int as sales
    from teacher_earnings where teacher_id = ${teacherId} and (${includeTest} or not is_test)
  `;
  const [p] = await db<{ paid: string }[]>`select coalesce(sum(amount_fils), 0)::bigint as paid from teacher_payouts where teacher_id = ${teacherId}`;
  const earned = Number(e.earned);
  const paid = Number(p.paid);
  return { earnedFils: earned, reversedFils: Number(e.reversed), paidFils: paid, balanceFils: earned - paid, salesCount: e.sales };
}

export type EarningRow = {
  id: string;
  order_id: string;
  order_number: string;
  product_title: string;
  teacher_name: string;
  gross_fils: number;
  discount_fils: number;
  fee_fils: number;
  net_fils: number;
  share_bps: number;
  teacher_fils: number;
  platform_fils: number;
  status: "active" | "reversed";
  is_test: boolean;
  created_at: Date;
  reversed_at: Date | null;
};

export async function listEarnings(teacherId: string, opts: { includeTest?: boolean; from?: Date; to?: Date; limit?: number } = {}, db: Db = sql) {
  return db<EarningRow[]>`
    select te.id, te.order_id, o.number as order_number, te.product_title, te.teacher_name, te.gross_fils, te.discount_fils, te.fee_fils,
      te.net_fils, te.share_bps, te.teacher_fils, te.platform_fils, te.status, te.is_test, te.created_at, te.reversed_at
    from teacher_earnings te join orders o on o.id = te.order_id
    where te.teacher_id = ${teacherId}
      and (${opts.includeTest ?? false} or not te.is_test)
      ${opts.from ? db`and te.created_at >= ${opts.from}` : db``}
      ${opts.to ? db`and te.created_at < ${opts.to}` : db``}
    order by te.created_at desc
    limit ${opts.limit ?? 500}
  `;
}

export async function listPayouts(teacherId: string, db: Db = sql) {
  return db<{ id: string; amount_fils: number; method: string; reference: string; note: string; paid_at: Date; created_by_name: string | null }[]>`
    select tp.id, tp.amount_fils, tp.method, tp.reference, tp.note, tp.paid_at, u.full_name as created_by_name
    from teacher_payouts tp left join users u on u.id = tp.created_by
    where tp.teacher_id = ${teacherId}
    order by tp.paid_at desc
  `;
}

/** تسجيل تسوية يدوية (تحويل بنكي/نقدي تم خارج المنصة) — للمالك فقط */
export async function recordPayout(input: {
  teacherId: string;
  amountFils: number;
  method: "bank_transfer" | "cash" | "other";
  reference: string;
  note: string;
  paidAt?: Date;
  ownerId: string;
  ip?: string;
}) {
  if (!Number.isInteger(input.amountFils) || input.amountFils <= 0) throw new Error("INVALID_AMOUNT");
  return sql.begin(async (tx) => {
    const [t] = await tx<{ id: string; display_name: string }[]>`select id, display_name from teachers where id = ${input.teacherId} for update`;
    if (!t) throw new Error("TEACHER_NOT_FOUND");
    const [row] = await tx<{ id: string }[]>`
      insert into teacher_payouts (teacher_id, amount_fils, method, reference, note, paid_at, created_by)
      values (${input.teacherId}, ${input.amountFils}, ${input.method}, ${input.reference}, ${input.note}, ${input.paidAt ?? new Date()}, ${input.ownerId})
      returning id
    `;
    await audit(
      {
        actorId: input.ownerId,
        action: "teacher.payout",
        entityType: "teacher",
        entityId: input.teacherId,
        reason: input.note || null,
        metadata: { payoutId: row.id, amountFils: input.amountFils, method: input.method, reference: input.reference },
        ip: input.ip,
      },
      tx,
    );
    return row.id;
  });
}

/** ملخص مبيعات معلم (للمالك وللمعلم نفسه) — من طلبات مدفوعة حقيقية فقط */
export async function teacherSalesSummary(teacherId: string, opts: { includeTest?: boolean; from?: Date; to?: Date } = {}, db: Db = sql) {
  const [r] = await db<{ orders: number; items: number; gross: string }[]>`
    select count(distinct o.id)::int as orders, count(oi.id)::int as items, coalesce(sum(oi.unit_price_fils), 0)::bigint as gross
    from order_items oi join orders o on o.id = oi.order_id
    where oi.teacher_id = ${teacherId} and o.status = 'paid'
      and (${opts.includeTest ?? false} or not o.is_test)
      ${opts.from ? db`and o.paid_at >= ${opts.from}` : db``}
      ${opts.to ? db`and o.paid_at < ${opts.to}` : db``}
  `;
  return { orders: r.orders, items: r.items, grossFils: Number(r.gross) };
}
