import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrder, OrderError } from "@/server/commerce/orders";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createCoupon, createProduct, createUser } from "../helpers/factories";

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

async function buyers(n: number) {
  const list = [];
  for (let i = 0; i < n; i++) list.push(await createUser({ phone: "+96599887766" }));
  return list;
}

const issued = (couponId: string) => sql<{ n: number }[]>`select count(*)::int as n from orders where coupon_id = ${couponId}`.then(([r]) => r.n);

describe("a shared coupon under fifty orders at once", () => {
  it("never issues more than its limit", async () => {
    const coupon = await createCoupon({ maxRedemptions: 7, maxPerUser: 1, value: 10 });
    const product = await createProduct({ priceFils: 3000, withFile: false, withPreview: false });
    const users = await buyers(50);
    const results = await Promise.allSettled(users.map((user) => createOrder({ user, productIds: [product.id], couponCode: coupon.code, isTest: true })));
    const made = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(made).toHaveLength(7);
    expect(refused).toHaveLength(43);
    for (const r of refused) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(OrderError);
    expect(await issued(coupon.id)).toBe(7);
  }, 60_000);

  it("gives every buyer a place when there is no limit", async () => {
    const coupon = await createCoupon({ maxRedemptions: null, maxPerUser: 1, value: 10 });
    const product = await createProduct({ priceFils: 3000, withFile: false, withPreview: false });
    const users = await buyers(50);
    await Promise.all(users.map((user) => createOrder({ user, productIds: [product.id], couponCode: coupon.code, isTest: true })));
    expect(await issued(coupon.id)).toBe(50);
  }, 60_000);

  it("holds one buyer to the per-user limit, across different products", async () => {
    const coupon = await createCoupon({ maxRedemptions: null, maxPerUser: 1, value: 10 });
    const [user] = await buyers(1);
    const products = await Promise.all(Array.from({ length: 10 }, () => createProduct({ priceFils: 3000, withFile: false, withPreview: false })));
    const results = await Promise.allSettled(products.map((p) => createOrder({ user, productIds: [p.id], couponCode: coupon.code, isTest: true })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  }, 60_000);
});
