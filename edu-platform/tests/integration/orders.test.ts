import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { completeFreeOrder, createOrder, getUserOrder, markOrderPaid, OrderError } from "@/server/commerce/orders";
import { computeCart } from "@/server/commerce/cart";
import { evaluateCoupon } from "@/server/commerce/coupons";
import { grantProduct } from "@/server/access/entitlements";
import { closeDb, resetDb, sql } from "../helpers/db";
import { activeEntitlements, createBundle, createCoupon, createProduct, createUser } from "../helpers/factories";

beforeAll(resetDb);
afterAll(closeDb);

async function payOrder(orderId: string, amount: number) {
  return sql.begin((tx) => markOrderPaid(tx, { orderId, paidAmountFils: amount }));
}

describe("createOrder", () => {
  it("uses prices from the database (never from the client) and snapshots them", async () => {
    const user = await createUser();
    const a = await createProduct({ priceFils: 3000 });
    const b = await createProduct({ priceFils: 1500, subjectSlug: "science" });
    await sql`update products set price_fils = 3250 where id = ${a.id}`;
    const order = await createOrder({ user, productIds: [a.id, b.id], isTest: true });
    expect(order).toMatchObject({ status: "pending", subtotal_fils: 4750, discount_fils: 0, total_fils: 4750, currency: "KWD", is_test: true });
    expect(order.number).toMatch(/^ORD-\d+$/);
    const items = await sql<{ product_id: string; unit_price_fils: number }[]>`select product_id, unit_price_fils from order_items where order_id = ${order.id} order by unit_price_fils`;
    expect(items).toEqual([
      { product_id: b.id, unit_price_fils: 1500 },
      { product_id: a.id, unit_price_fils: 3250 },
    ]);
    // تغيير السعر لاحقًا لا يغيّر الطلب
    await sql`update products set price_fils = 9999 where id = ${a.id}`;
    const again = await getUserOrder(order.id, user.id);
    expect(again!.order.total_fils).toBe(4750);
  });

  it("excludes unpublished products", async () => {
    const user = await createUser();
    const pub = await createProduct({ priceFils: 1000 });
    const draft = await createProduct({ priceFils: 2000, status: "draft" });
    const hidden = await createProduct({ priceFils: 2000, status: "hidden" });
    const order = await createOrder({ user, productIds: [pub.id, draft.id, hidden.id], isTest: false });
    expect(order.total_fils).toBe(1000);
  });

  it("excludes products the student already owns (directly or via bundle)", async () => {
    const user = await createUser();
    const owned = await createProduct({ priceFils: 1000 });
    const viaBundle = await createProduct({ priceFils: 1200 });
    const fresh = await createProduct({ priceFils: 700 });
    const bundle = await createBundle({ items: [viaBundle.id], priceFils: 1000 });
    await grantProduct(sql, { userId: user.id, productId: owned.id, source: "manual" });
    await grantProduct(sql, { userId: user.id, productId: bundle.id, source: "manual" });
    const cart = await computeCart([owned.id, viaBundle.id, fresh.id], user.id);
    expect(cart.payableLines.map((l) => l.id)).toEqual([fresh.id]);
    expect(cart.notices.length).toBeGreaterThanOrEqual(2);
    const order = await createOrder({ user, productIds: [owned.id, viaBundle.id, fresh.id], isTest: false });
    expect(order.total_fils).toBe(700);
  });

  it("refuses an order when everything is already owned, or the cart is empty", async () => {
    const user = await createUser();
    const p = await createProduct();
    await grantProduct(sql, { userId: user.id, productId: p.id, source: "manual" });
    await expect(createOrder({ user, productIds: [p.id], isTest: false })).rejects.toBeInstanceOf(OrderError);
    await expect(createOrder({ user, productIds: [], isTest: false })).rejects.toThrow("سلتك فارغة");
  });

  it("does not charge twice for items covered by a bundle in the same cart", async () => {
    const user = await createUser();
    const p1 = await createProduct({ priceFils: 3000 });
    const p2 = await createProduct({ priceFils: 3000, subjectSlug: "arabic" });
    const bundle = await createBundle({ items: [p1.id, p2.id], priceFils: 5000 });
    const order = await createOrder({ user, productIds: [p1.id, bundle.id, p2.id], isTest: false });
    expect(order.total_fils).toBe(5000);
    const items = await sql<{ product_id: string }[]>`select product_id from order_items where order_id = ${order.id}`;
    expect(items.map((i) => i.product_id)).toEqual([bundle.id]);
  });
});

describe("coupons", () => {
  it("applies a percent coupon computed on the server", async () => {
    const user = await createUser();
    const p = await createProduct({ priceFils: 3333 });
    const c = await createCoupon({ kind: "percent", value: 10 });
    const order = await createOrder({ user, productIds: [p.id], couponCode: c.code.toLowerCase(), isTest: false });
    expect(order).toMatchObject({ subtotal_fils: 3333, discount_fils: 333, total_fils: 3000, coupon_id: c.id });
  });

  it("fixed coupon never exceeds subtotal", async () => {
    const p = await createProduct({ priceFils: 1000 });
    const c = await createCoupon({ kind: "fixed", value: 5000 });
    const r = await evaluateCoupon(c.code, null, 1000);
    expect(r).toMatchObject({ ok: true, discountFils: 1000 });
    expect(p).toBeTruthy();
  });

  it("rejects inactive, not-started, expired, below-minimum and malformed codes", async () => {
    const inactive = await createCoupon({ isActive: false });
    const future = await createCoupon({ startsAt: new Date(Date.now() + 86400_000) });
    const expired = await createCoupon({ startsAt: new Date(Date.now() - 2 * 86400_000), endsAt: new Date(Date.now() - 86400_000) });
    const minimum = await createCoupon({ minOrderFils: 10_000 });
    expect(await evaluateCoupon(inactive.code, null, 5000)).toMatchObject({ ok: false });
    expect(await evaluateCoupon(future.code, null, 5000)).toMatchObject({ ok: false, error: "كود الخصم لم يبدأ بعد" });
    expect(await evaluateCoupon(expired.code, null, 5000)).toMatchObject({ ok: false, error: "انتهت صلاحية كود الخصم" });
    expect(await evaluateCoupon(minimum.code, null, 5000)).toMatchObject({ ok: false });
    expect(await evaluateCoupon("x' or 1=1 --", null, 5000)).toMatchObject({ ok: false });
    expect(await evaluateCoupon("DOESNOTEXIST", null, 5000)).toMatchObject({ ok: false });
    const user = await createUser();
    const p = await createProduct({ priceFils: 5000 });
    await expect(createOrder({ user, productIds: [p.id], couponCode: expired.code, isTest: false })).rejects.toBeInstanceOf(OrderError);
  });

  it("enforces per-user limit (paid orders and the student's own open orders)", async () => {
    const user = await createUser();
    const p1 = await createProduct({ priceFils: 2000 });
    const p2 = await createProduct({ priceFils: 2000 });
    const c = await createCoupon({ kind: "percent", value: 50, maxPerUser: 1 });
    const o1 = await createOrder({ user, productIds: [p1.id], couponCode: c.code, isTest: false });
    // A9: الطلب المفتوح يحجز الكود لصاحبه، فلا يستخدمه في طلب ثانٍ قبل أن يكتمل الأول أو يُغلق
    expect(await evaluateCoupon(c.code, user.id, 2000)).toMatchObject({ ok: false, error: "لديك طلب مفتوح يستخدم هذا الكود. أكمله أو ألغه أولًا" });
    await payOrder(o1.id, o1.total_fils);
    expect(await evaluateCoupon(c.code, user.id, 2000)).toMatchObject({ ok: false, error: "سبق لك استخدام هذا الكود" });
    await expect(createOrder({ user, productIds: [p2.id], couponCode: c.code, isTest: false })).rejects.toThrow("سبق لك استخدام هذا الكود");
    // مستخدم آخر ما زال يستطيع
    expect(await evaluateCoupon(c.code, (await createUser()).id, 2000)).toMatchObject({ ok: true });
  });

  it("enforces global max redemptions", async () => {
    const c = await createCoupon({ kind: "fixed", value: 500, maxRedemptions: 1, maxPerUser: 5 });
    const u1 = await createUser();
    const p = await createProduct({ priceFils: 2000 });
    const o = await createOrder({ user: u1, productIds: [p.id], couponCode: c.code, isTest: false });
    await payOrder(o.id, o.total_fils);
    expect(await evaluateCoupon(c.code, (await createUser()).id, 2000)).toMatchObject({ ok: false, error: "انتهى عدد مرات استخدام هذا الكود" });
  });
});

describe("markOrderPaid (atomic, idempotent fulfillment)", () => {
  it("is idempotent: second call changes nothing", async () => {
    const user = await createUser();
    const p = await createProduct({ priceFils: 2500 });
    const c = await createCoupon({ kind: "fixed", value: 500 });
    const order = await createOrder({ user, productIds: [p.id], couponCode: c.code, isTest: false });
    const first = await payOrder(order.id, 2000);
    const second = await payOrder(order.id, 2000);
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(await activeEntitlements(user.id)).toEqual([p.id]);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from coupon_redemptions where order_id = ${order.id}`;
    expect(n).toBe(1);
    const [o] = await sql<{ status: string; paid_at: Date | null }[]>`select status, paid_at from orders where id = ${order.id}`;
    expect(o.status).toBe("paid");
    expect(o.paid_at).not.toBeNull();
  });

  it("concurrent confirmations (callback + webhook race) grant exactly once", async () => {
    const user = await createUser();
    const p1 = await createProduct({ priceFils: 1000 });
    const p2 = await createProduct({ priceFils: 1000 });
    const order = await createOrder({ user, productIds: [p1.id, p2.id], isTest: false });
    const results = await Promise.all(Array.from({ length: 5 }, () => payOrder(order.id, 2000)));
    expect(results.filter((r) => r.changed)).toHaveLength(1);
    const ents = await sql<{ n: number }[]>`select count(*)::int as n from entitlements where user_id = ${user.id}`;
    expect(ents[0].n).toBe(2);
    const audits = await sql<{ n: number }[]>`select count(*)::int as n from audit_logs where action = 'order.paid' and entity_id = ${order.id}`;
    expect(audits[0].n).toBe(1);
  });

  it("rejects a paid amount that does not match the order total", async () => {
    const user = await createUser();
    const p = await createProduct({ priceFils: 3000 });
    const order = await createOrder({ user, productIds: [p.id], isTest: false });
    await expect(payOrder(order.id, 2999)).rejects.toThrow("AMOUNT_MISMATCH");
    const [o] = await sql<{ status: string }[]>`select status from orders where id = ${order.id}`;
    expect(o.status).toBe("pending");
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("free orders (100% coupon) complete without the gateway, only for the owner", async () => {
    const user = await createUser();
    const other = await createUser();
    const p = await createProduct({ priceFils: 2000 });
    const c = await createCoupon({ kind: "percent", value: 100 });
    const order = await createOrder({ user, productIds: [p.id], couponCode: c.code, isTest: false });
    expect(order.total_fils).toBe(0);
    await expect(completeFreeOrder(order.id, other.id)).rejects.toBeInstanceOf(OrderError);
    const r = await completeFreeOrder(order.id, user.id);
    expect(r.changed).toBe(true);
    const [e] = await sql<{ source: string }[]>`select source from entitlements where user_id = ${user.id} and product_id = ${p.id}`;
    expect(e.source).toBe("free");
    const [pay] = await sql<{ provider: string; status: string }[]>`select provider, status from payments where order_id = ${order.id}`;
    expect(pay).toMatchObject({ provider: "free", status: "paid" });
  });

  it("non-free orders cannot be completed as free", async () => {
    const user = await createUser();
    const p = await createProduct({ priceFils: 2000 });
    const order = await createOrder({ user, productIds: [p.id], isTest: false });
    await expect(completeFreeOrder(order.id, user.id)).rejects.toThrow("هذا الطلب ليس مجانيًا");
  });

  it("getUserOrder prevents IDOR (other users get null)", async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const p = await createProduct();
    const order = await createOrder({ user: owner, productIds: [p.id], isTest: false });
    expect(await getUserOrder(order.id, attacker.id)).toBeNull();
    expect(await getUserOrder("not-a-uuid", owner.id)).toBeNull();
    expect((await getUserOrder(order.id, owner.id))?.items).toHaveLength(1);
  });
});
