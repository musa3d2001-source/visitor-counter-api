import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOrder, markOrderPaid, refundOrder, type OrderRow } from "@/server/commerce/orders";
import { listEarnings, recordPayout, teacherBalance, teacherSalesSummary } from "@/server/commerce/earnings";
import { saveSettings } from "@/server/platform/settings";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createCoupon, createProduct, createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";

let owner: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await resetDb();
  owner = await createUser({ role: "admin" });
});
afterAll(async () => {
  await closeDb();
});
beforeEach(async () => {
  await saveSettings({ fee_percent_bps: 0, fee_fixed_fils: 0 }, owner.id);
});

async function pay(order: OrderRow) {
  return sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));
}

type EarningRow = {
  teacher_id: string;
  teacher_name: string;
  product_title: string;
  gross_fils: number;
  discount_fils: number;
  fee_fils: number;
  net_fils: number;
  share_bps: number;
  teacher_fils: number;
  platform_fils: number;
  status: string;
  is_test: boolean;
};

async function earningsOf(orderId: string) {
  return sql<EarningRow[]>`
    select teacher_id, teacher_name, product_title, gross_fils, discount_fils, fee_fils, net_fils, share_bps, teacher_fils, platform_fils, status, is_test
    from teacher_earnings where order_id = ${orderId}
  `;
}

describe("أرباح المعلمين: التسجيل عند تأكيد الدفع", () => {
  let teacher: TestTeacher;

  beforeAll(async () => {
    teacher = await createTeacher({ mode: "self_managed", shareBps: 4000, displayName: "أ. أحمد الفيزيائي" });
  });

  it("coupon discount + approved fees → exact ledger row only for the teacher's item", async () => {
    await saveSettings({ fee_percent_bps: 250, fee_fixed_fils: 100 }, owner.id);
    const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 4000 });
    const pdf = await createProduct({ level: 7, subjectSlug: "science", priceFils: 3000 });
    const coupon = await createCoupon({ kind: "percent", value: 10 });
    const student = await createUser();
    const order = await createOrder({ user: student, productIds: [unit.id, pdf.id], couponCode: coupon.code, isTest: false });
    expect(order).toMatchObject({ subtotal_fils: 7000, discount_fils: 700, total_fils: 6300 });
    // لقطة المعلم في عنصر الطلب
    const items = await sql<{ product_id: string; teacher_id: string | null; teacher_name: string | null }[]>`
      select product_id, teacher_id, teacher_name from order_items where order_id = ${order.id}
    `;
    expect(items.find((i) => i.product_id === unit.id)).toMatchObject({ teacher_id: teacher.id, teacher_name: "أ. أحمد الفيزيائي" });
    expect(items.find((i) => i.product_id === pdf.id)).toMatchObject({ teacher_id: null, teacher_name: null });
    // قبل الدفع: لا سجلات
    expect(await earningsOf(order.id)).toHaveLength(0);

    await pay(order);
    const rows = await earningsOf(order.id);
    expect(rows).toHaveLength(1);
    // الرسوم = round(6300 × 2.5%) + 100 = 258 موزعة 147/111 ؛ الخصم 400/300
    expect(rows[0]).toMatchObject({
      teacher_id: teacher.id,
      gross_fils: 4000,
      discount_fils: 400,
      fee_fils: 147,
      net_fils: 3453,
      share_bps: 4000,
      teacher_fils: 1381,
      platform_fils: 2072,
      status: "active",
      is_test: false,
    });
    const r = rows[0];
    expect(r.net_fils).toBe(r.gross_fils - r.discount_fils - r.fee_fils);
    expect(r.teacher_fils + r.platform_fils).toBe(r.net_fils);
  });

  it("confirming the same payment twice does not duplicate ledger rows", async () => {
    const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 2500 });
    const order = await createOrder({ user: await createUser(), productIds: [unit.id], isTest: false });
    await pay(order);
    const again = await pay(order);
    expect(again.changed).toBe(false);
    // تزامن: محاولتان متوازيتان
    await Promise.all([pay(order), pay(order)]);
    expect(await earningsOf(order.id)).toHaveLength(1);
  });

  it("products without a teacher, or teachers without a configured share, produce no rows", async () => {
    const noShare = await createTeacher({ shareBps: null });
    const a = await createVideoProduct({ teacherId: noShare.id, priceFils: 2000 });
    const b = await createProduct({ level: 7, subjectSlug: "science", priceFils: 1500 });
    const order = await createOrder({ user: await createUser(), productIds: [a.id, b.id], isTest: false });
    await pay(order);
    expect(await earningsOf(order.id)).toHaveLength(0);
  });

  it("free orders (100% coupon) record zero-value rows without fees", async () => {
    await saveSettings({ fee_percent_bps: 250, fee_fixed_fils: 100 }, owner.id);
    const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 2000 });
    const coupon = await createCoupon({ kind: "percent", value: 100 });
    const order = await createOrder({ user: await createUser(), productIds: [unit.id], couponCode: coupon.code, isTest: false });
    expect(order.total_fils).toBe(0);
    await pay(order);
    const [row] = await earningsOf(order.id);
    expect(row).toMatchObject({ gross_fils: 2000, discount_fils: 2000, fee_fils: 0, net_fils: 0, teacher_fils: 0, platform_fils: 0 });
  });
});

describe("الاسترداد، التسوية اليدوية والرصيد", () => {
  it("refund reverses earnings; payouts reduce the balance (can go negative after a refund)", async () => {
    const teacher = await createTeacher({ shareBps: 5000 });
    const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 4000 });
    const order = await createOrder({ user: await createUser(), productIds: [unit.id], isTest: false });
    await pay(order);
    expect(await teacherBalance(teacher.id)).toEqual({ earnedFils: 2000, reversedFils: 0, paidFils: 0, balanceFils: 2000, salesCount: 1 });

    const payoutId = await recordPayout({ teacherId: teacher.id, amountFils: 2000, method: "bank_transfer", reference: "TRX-1", note: "تسوية نوفمبر", ownerId: owner.id });
    expect(payoutId).toMatch(/[0-9a-f-]{36}/);
    expect((await teacherBalance(teacher.id)).balanceFils).toBe(0);
    const [log] = await sql<{ action: string; actor_id: string }[]>`select action, actor_id from audit_logs where entity_id = ${teacher.id} and action = 'teacher.payout'`;
    expect(log).toEqual({ action: "teacher.payout", actor_id: owner.id });

    await refundOrder({ orderId: order.id, adminId: owner.id, reason: "طلب العميل" });
    const [row] = await earningsOf(order.id);
    expect(row.status).toBe("reversed");
    expect(await teacherBalance(teacher.id)).toEqual({ earnedFils: 0, reversedFils: 2000, paidFils: 2000, balanceFils: -2000, salesCount: 0 });
  });

  it("rejects invalid payout amounts", async () => {
    const teacher = await createTeacher({ shareBps: 5000 });
    await expect(recordPayout({ teacherId: teacher.id, amountFils: 0, method: "cash", reference: "", note: "", ownerId: owner.id })).rejects.toThrow();
    await expect(recordPayout({ teacherId: teacher.id, amountFils: 10.5, method: "cash", reference: "", note: "", ownerId: owner.id })).rejects.toThrow();
  });

  it("sandbox (test) orders are excluded from balances and sales by default", async () => {
    const teacher = await createTeacher({ shareBps: 3000 });
    const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 1000 });
    const testOrder = await createOrder({ user: await createUser(), productIds: [unit.id], isTest: true });
    await pay(testOrder);
    expect((await earningsOf(testOrder.id))[0].is_test).toBe(true);
    expect((await teacherBalance(teacher.id)).earnedFils).toBe(0);
    expect((await teacherBalance(teacher.id, { includeTest: true })).earnedFils).toBe(300);
    expect(await teacherSalesSummary(teacher.id)).toEqual({ orders: 0, items: 0, grossFils: 0 });
    expect(await teacherSalesSummary(teacher.id, { includeTest: true })).toEqual({ orders: 1, items: 1, grossFils: 1000 });
    expect(await listEarnings(teacher.id)).toHaveLength(0);
    expect(await listEarnings(teacher.id, { includeTest: true })).toHaveLength(1);
  });

  it("teacher identity on past orders does not change when the profile is edited", async () => {
    const teacher = await createTeacher({ shareBps: 4000, displayName: "أ. سارة" });
    const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 3000 });
    const order = await createOrder({ user: await createUser(), productIds: [unit.id], isTest: false });
    await pay(order);
    await sql`update teachers set display_name = 'أ. سارة العلي — محدث' where id = ${teacher.id}`;
    const [item] = await sql<{ teacher_name: string }[]>`select teacher_name from order_items where order_id = ${order.id}`;
    expect(item.teacher_name).toBe("أ. سارة");
    expect((await earningsOf(order.id))[0].teacher_name).toBe("أ. سارة");
    // ولا يتغير حتى بعد تغيير النسبة
    await sql`update teachers set revenue_share_bps = 9000 where id = ${teacher.id}`;
    expect((await earningsOf(order.id))[0].share_bps).toBe(4000);
  });

  it("each teacher sees only their own ledger", async () => {
    const t1 = await createTeacher({ shareBps: 5000 });
    const t2 = await createTeacher({ shareBps: 5000 });
    const p1 = await createVideoProduct({ teacherId: t1.id, priceFils: 1000 });
    const p2 = await createVideoProduct({ teacherId: t2.id, priceFils: 2000 });
    const order = await createOrder({ user: await createUser(), productIds: [p1.id, p2.id], isTest: false });
    await pay(order);
    const e1 = await listEarnings(t1.id);
    const e2 = await listEarnings(t2.id);
    expect(e1.map((e) => e.teacher_fils)).toEqual([500]);
    expect(e2.map((e) => e.teacher_fils)).toEqual([1000]);
    expect((await teacherSalesSummary(t1.id)).grossFils).toBe(1000);
  });
});
