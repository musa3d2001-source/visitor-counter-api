import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOrder, markOrderPaid, undoRefundOnOrder, type OrderRow } from "@/server/commerce/orders";
import { listEarnings, recordEarnings, teacherBalance, teacherSalesSummary } from "@/server/commerce/earnings";
import { reportByTeacher } from "@/server/admin/stats";
import { saveSettings } from "@/server/platform/settings";
import { applyAcceptedRefund, orderRow } from "../helpers/payment-flow";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createContainer, createCoupon, createProduct, createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";

let owner: Awaited<ReturnType<typeof createUser>>;
let t1: TestTeacher;
let t2: TestTeacher;

beforeAll(async () => {
  await resetDb();
  owner = await createUser({ role: "admin" });
  t1 = await createTeacher({ shareBps: 4000 });
  t2 = await createTeacher({ shareBps: 5000 });
});
afterAll(async () => {
  await closeDb();
});
beforeEach(async () => {
  await saveSettings({ fee_percent_bps: 0, fee_fixed_fils: 0 }, owner.id);
});

const pay = (order: OrderRow) => sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));
const parts = (orderId: string) => sql<{ product_id: string; teacher_id: string | null; list_price_fils: number; gross_fils: number }[]>`
  select p.product_id, p.teacher_id, p.list_price_fils, p.gross_fils from order_item_parts p
  join bundle_items bi on bi.product_id = p.product_id
  where p.order_id = ${orderId} order by bi.sort_order
`;
type Row = { teacher_id: string; product_id: string; order_item_id: string | null; gross_fils: number; discount_fils: number; fee_fils: number; net_fils: number; teacher_fils: number; platform_fils: number; share_bps: number; status: string };
const rows = (orderId: string) => sql<Row[]>`select teacher_id, product_id, order_item_id, gross_fils, discount_fils, fee_fils, net_fils, teacher_fils, platform_fils, share_bps, status from teacher_earnings where order_id = ${orderId}`;
const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

async function threeItemBundle(price: number, prices: [number, number, number]) {
  const a = await createVideoProduct({ teacherId: t1.id, priceFils: prices[0] });
  const b = await createVideoProduct({ teacherId: t2.id, priceFils: prices[1] });
  const c = await createProduct({ level: 7, subjectSlug: "science", priceFils: prices[2] });
  const bundle = await createBundle({ items: [a.id, b.id, c.id], priceFils: price });
  return { a, b, c, bundle };
}

describe("توزيع الباقة على المعلمين", () => {
  it("an odd bundle price splits by list price, to the exact fils, including the teacherless item", async () => {
    const { a, b, c, bundle } = await threeItemBundle(1001, [1000, 2000, 3000]);
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id], isTest: false });
    await pay(order);

    const p = await parts(order.id);
    expect(p.map((x) => x.gross_fils)).toEqual([167, 334, 500]);
    expect(p.map((x) => x.list_price_fils)).toEqual([1000, 2000, 3000]);
    expect(p.map((x) => x.teacher_id)).toEqual([t1.id, t2.id, null]);
    expect(total(p.map((x) => x.gross_fils))).toBe(1001);

    // لا سطر للمحتوى بلا معلم، وسطر لكل معلم بحصته
    const e = await rows(order.id);
    expect(e).toHaveLength(2);
    expect(e.some((x) => x.product_id === c.id)).toBe(false);
    expect(e.find((x) => x.product_id === a.id)).toMatchObject({ teacher_id: t1.id, gross_fils: 167, net_fils: 167, teacher_fils: 66, platform_fils: 101, share_bps: 4000, order_item_id: null });
    expect(e.find((x) => x.product_id === b.id)).toMatchObject({ teacher_id: t2.id, gross_fils: 334, net_fils: 334, teacher_fils: 167, platform_fils: 167, share_bps: 5000, order_item_id: null });
  });

  it("a three-way remainder tie gives the extra fils to the first item in the bundle's order", async () => {
    const { bundle } = await threeItemBundle(100, [500, 500, 500]);
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id], isTest: false });
    await pay(order);
    expect((await parts(order.id)).map((x) => x.gross_fils)).toEqual([34, 33, 33]);
  });

  it("a zero-priced item takes nothing and the others carry the whole price", async () => {
    const a = await createVideoProduct({ teacherId: t1.id, priceFils: 900 });
    const b = await createVideoProduct({ teacherId: t2.id, priceFils: 0 });
    const c = await createVideoProduct({ teacherId: t2.id, priceFils: 300 });
    const bundle = await createBundle({ items: [a.id, b.id, c.id], priceFils: 701 });
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id], isTest: false });
    await pay(order);
    const p = await parts(order.id);
    expect(p.map((x) => x.gross_fils)).toEqual([526, 0, 175]);
    expect(total(p.map((x) => x.gross_fils))).toBe(701);
    const e = await rows(order.id);
    expect(e.find((x) => x.product_id === b.id)).toMatchObject({ gross_fils: 0, net_fils: 0, teacher_fils: 0 });
  });

  it("coupon discount and fees land on the parts and every ledger row balances", async () => {
    await saveSettings({ fee_percent_bps: 250, fee_fixed_fils: 100 }, owner.id);
    const { a, b, bundle } = await threeItemBundle(7001, [1000, 2000, 3000]);
    const plain = await createVideoProduct({ teacherId: t2.id, priceFils: 2999 });
    const coupon = await createCoupon({ kind: "percent", value: 10 });
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id, plain.id], couponCode: coupon.code, isTest: false });
    expect(order).toMatchObject({ subtotal_fils: 10000, discount_fils: 1000, total_fils: 9000 });
    await pay(order);

    // الأجزاء: 1167 / 2334 / 3500 + بند مباشر 2999
    // الخصم بالقيمة: 117 / 233 / 350 / 300. الرسوم: round(9000 × 2.5%) + 100 = 325 موزعة على ما بعد الخصم
    const e = await rows(order.id);
    expect(e).toHaveLength(3);
    const ra = e.find((x) => x.product_id === a.id)!;
    const rb = e.find((x) => x.product_id === b.id)!;
    const rp = e.find((x) => x.product_id === plain.id)!;
    expect(ra).toMatchObject({ gross_fils: 1167, discount_fils: 117, fee_fils: 38 });
    expect(rb).toMatchObject({ gross_fils: 2334, discount_fils: 233, fee_fils: 76 });
    expect(rp).toMatchObject({ gross_fils: 2999, discount_fils: 300, fee_fils: 97 });
    expect(rp.order_item_id).not.toBeNull();
    for (const r of e) {
      expect(r.net_fils).toBe(r.gross_fils - r.discount_fils - r.fee_fils);
      expect(r.teacher_fils + r.platform_fils).toBe(r.net_fils);
      expect(r.teacher_fils).toBe(Math.floor((r.net_fils * r.share_bps) / 10000));
    }
    // ما يخص المحتوى بلا معلم هو المتبقي بالضبط: الخصم 350 والرسوم 114
    expect(total(e.map((r) => r.discount_fils))).toBe(1000 - 350);
    expect(total(e.map((r) => r.fee_fils))).toBe(325 - 114);
  });

  it("a refund reverses every part, the balance returns to zero, and undoing it brings back the same rows", async () => {
    const teacher = await createTeacher({ shareBps: 5000 });
    const a = await createVideoProduct({ teacherId: teacher.id, priceFils: 1000 });
    const b = await createVideoProduct({ teacherId: t2.id, priceFils: 1000 });
    const bundle = await createBundle({ items: [a.id, b.id], priceFils: 1501 });
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id], isTest: false });
    await pay(order);
    const before = await teacherBalance(teacher.id);
    expect(before.earnedFils).toBe(375);
    const activeRows = await rows(order.id);

    const { refundId } = await applyAcceptedRefund(order.id, owner.id, "طلب العميل");
    const after = await rows(order.id);
    expect(after).toHaveLength(2);
    expect(after.every((r) => r.status === "reversed")).toBe(true);
    const reversed = await teacherBalance(teacher.id);
    expect(reversed.earnedFils).toBe(0);
    expect(reversed.reversedFils).toBe(375);
    expect(total((await parts(order.id)).map((x) => x.gross_fils))).toBe(1501);

    // تراجع البوابة عن الاسترداد: تعود الأسطر نفسها بالمبالغ نفسها، ولا تُكتب أسطر جديدة
    const refunded = await orderRow(order.id);
    const undone = await sql.begin((tx) => undoRefundOnOrder(tx, { order: refunded, paymentId: null, refundId, actorId: owner.id }));
    expect(undone.restoredEarnings).toBe(2);
    const restored = await rows(order.id);
    const byProduct = (list: Row[]) => [...list].sort((x, y) => x.product_id.localeCompare(y.product_id));
    expect(byProduct(restored)).toEqual(byProduct(activeRows));
    expect(restored.every((r) => r.status === "active")).toBe(true);
    expect(await teacherBalance(teacher.id)).toEqual(before);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("recording twice changes nothing, and a later price or content change does not re-split a paid order", async () => {
    const { a, bundle } = await threeItemBundle(1001, [1000, 2000, 3000]);
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id], isTest: false });
    await pay(order);
    const first = await parts(order.id);
    await sql`update products set price_fils = 9000 where id = ${a.id}`;
    await sql.begin((tx) => recordEarnings(tx, { id: order.id, total_fils: order.total_fils, discount_fils: order.discount_fils, is_test: false }));
    expect(await parts(order.id)).toEqual(first);
    expect(await rows(order.id)).toHaveLength(2);
  });

  it("a bundle with no teacher inside writes parts and no ledger rows", async () => {
    const a = await createProduct({ level: 7, subjectSlug: "science", priceFils: 1000 });
    const b = await createProduct({ level: 7, subjectSlug: "math", priceFils: 1001 });
    const bundle = await createBundle({ items: [a.id, b.id], priceFils: 1000 });
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id], isTest: false });
    await pay(order);
    const p = await parts(order.id);
    expect(total(p.map((x) => x.gross_fils))).toBe(1000);
    expect(await rows(order.id)).toHaveLength(0);
  });

  // تغيّر عمدًا (K011): النسبة تُلتقط عند إنشاء الطلب. المسار القديم يبقى لطلب فُتح قبل اللقطة وحده
  it("a share cancelled after the order was created still pays what was agreed", async () => {
    const noShare = await createTeacher({ shareBps: 5000 });
    const a = await createVideoProduct({ teacherId: noShare.id, priceFils: 1000 });
    const b = await createVideoProduct({ teacherId: t1.id, priceFils: 1000 });
    const bundle = await createBundle({ items: [a.id, b.id], priceFils: 1000 });
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id], isTest: false });
    await sql`update teachers set revenue_share_bps = null where id = ${noShare.id}`;
    await pay(order);
    expect((await rows(order.id)).map((e) => e.teacher_id).sort()).toEqual([noShare.id, t1.id].sort());
  });

  it("on an order from before the snapshot, a teacher with no agreed share gets a part but no ledger row", async () => {
    const noShare = await createTeacher({ shareBps: 5000 });
    const a = await createVideoProduct({ teacherId: noShare.id, priceFils: 1000 });
    const b = await createVideoProduct({ teacherId: t1.id, priceFils: 1000 });
    const bundle = await createBundle({ items: [a.id, b.id], priceFils: 1000 });
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id], isTest: false });
    await sql`update orders set earnings_snapshot_at = null where id = ${order.id}`;
    await sql`update teachers set revenue_share_bps = null where id = ${noShare.id}`;
    await pay({ ...order, earnings_snapshot_at: null });
    expect((await parts(order.id)).find((x) => x.product_id === a.id)).toMatchObject({ teacher_id: noShare.id, gross_fils: 500 });
    const e = await rows(order.id);
    expect(e).toHaveLength(1);
    expect(e[0].teacher_id).toBe(t1.id);
  });

  it("a one-teacher course stays a single direct line", async () => {
    const unit = await createVideoProduct({ teacherId: t1.id, priceFils: 1000 });
    const course = await createContainer({ type: "video_course", items: [unit.id], priceFils: 1500, teacherId: t1.id });
    const order = await createOrder({ user: await createUser(), productIds: [course.id], isTest: false });
    await pay(order);
    expect(await sql`select 1 from order_item_parts where order_id = ${order.id}`).toHaveLength(0);
    const e = await rows(order.id);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ product_id: course.id, gross_fils: 1500, teacher_fils: 600 });
    expect(e[0].order_item_id).not.toBeNull();
  });

  it("each teacher's reports show their part of the bundle and the bundle's total is not double counted", async () => {
    const teacher = await createTeacher({ shareBps: 5000 });
    const other = await createTeacher({ shareBps: 5000 });
    const a = await createVideoProduct({ teacherId: teacher.id, priceFils: 1000 });
    const b = await createVideoProduct({ teacherId: other.id, priceFils: 3000 });
    const bundle = await createBundle({ items: [a.id, b.id], priceFils: 2000 });
    const order = await createOrder({ user: await createUser(), productIds: [bundle.id], isTest: false });
    await pay(order);

    expect(await teacherSalesSummary(teacher.id)).toEqual({ orders: 1, items: 1, grossFils: 500 });
    expect(await teacherSalesSummary(other.id)).toEqual({ orders: 1, items: 1, grossFils: 1500 });

    const report = await reportByTeacher({ from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 3_600_000), includeTest: false });
    expect(report.find((r) => r.teacherId === teacher.id)).toMatchObject({ sold: 1, revenueFils: 500, teacherShareFils: 250, platformShareFils: 250 });
    expect(report.find((r) => r.teacherId === other.id)).toMatchObject({ sold: 1, revenueFils: 1500, teacherShareFils: 750, platformShareFils: 750 });

    const ledger = await listEarnings(teacher.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].bundle_title).toMatch(/^باقة /);
  });
});
