import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { OrderError, closeOrder, completeFreeOrder, createOrder, type OrderRow } from "@/server/commerce/orders";
import { evaluateCoupon } from "@/server/commerce/coupons";
import { OrderClosedError, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { asOtherServer, confirmPaid, invoiceIdOf, invoicesCreated, makeStale, orderRow, pause, startPayment } from "../helpers/payment-flow";
import { activeEntitlements, createCoupon, createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const HELD = "هذا الكود محجوز الآن في طلبات لم تكتمل. جرّب لاحقًا";
const USED_UP = "انتهى عدد مرات استخدام هذا الكود";
const OWN_OPEN_ORDER = "لديك طلب مفتوح يستخدم هذا الكود. أكمله أو ألغه أولًا";

let sim: Simulator;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
afterEach(() => {
  sim.clearFaults();
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

const users = (n: number) => Promise.all(Array.from({ length: n }, () => createUser()));
const buy = (user: Awaited<ReturnType<typeof createUser>>, productId: string, couponCode: string) => createOrder({ user, productIds: [productId], couponCode, isTest: true });
const fulfilled = <T>(results: PromiseSettledResult<T>[]) => results.filter((r): r is PromiseFulfilledResult<T> => r.status === "fulfilled");
const rejected = <T>(results: PromiseSettledResult<T>[]) => results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
const redemptions = (couponId: string) => sql`select 1 from coupon_redemptions where coupon_id = ${couponId}`;
const refusedWith = async (work: Promise<unknown>, message: string) => {
  await expect(work).rejects.toBeInstanceOf(OrderError);
  await expect(work).rejects.toMatchObject({ userMessage: message });
};

describe("simultaneous checkouts on a limited code", () => {
  it("a paid code: no more than the limit get an order", async () => {
    const coupon = await createCoupon({ kind: "percent", value: 20, maxRedemptions: 3 });
    const product = await createProduct({ priceFils: 5000 });
    const results = await Promise.allSettled((await users(12)).map((u) => buy(u, product.id, coupon.code)));
    expect(fulfilled(results)).toHaveLength(3);
    expect(rejected(results)).toHaveLength(9);
    for (const r of rejected(results)) expect(r.reason).toMatchObject({ userMessage: HELD });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from orders where coupon_id = ${coupon.id}`;
    expect(n).toBe(3);
  });

  it("a 100% code that completes immediately: no more than the limit get the product", async () => {
    const coupon = await createCoupon({ kind: "percent", value: 100, maxRedemptions: 2 });
    const product = await createProduct({ priceFils: 5000 });
    const buyers = await users(12);
    const results = await Promise.allSettled(
      buyers.map(async (u) => {
        const order = await buy(u, product.id, coupon.code);
        expect(order.total_fils).toBe(0);
        return completeFreeOrder(order.id, u.id);
      }),
    );
    expect(fulfilled(results)).toHaveLength(2);
    for (const r of rejected(results)) expect(r.reason).toBeInstanceOf(OrderError);
    expect(await redemptions(coupon.id)).toHaveLength(2);
    const owners = (await Promise.all(buyers.map((u) => activeEntitlements(u.id)))).filter((e) => e.length);
    expect(owners).toHaveLength(2);
  });

  it("one student racing several checkouts stays within the per-student limit", async () => {
    const coupon = await createCoupon({ kind: "fixed", value: 500, maxPerUser: 2 });
    const student = await createUser();
    const products = await Promise.all(Array.from({ length: 8 }, () => createProduct({ priceFils: 2000 })));
    const results = await Promise.allSettled(products.map((p) => buy(student, p.id, coupon.code)));
    expect(fulfilled(results)).toHaveLength(2);
    for (const r of rejected(results)) expect(r.reason).toMatchObject({ userMessage: OWN_OPEN_ORDER });
  });

  it("one student racing a 100% code gets it once", async () => {
    const coupon = await createCoupon({ kind: "percent", value: 100, maxPerUser: 1 });
    const student = await createUser();
    const products = await Promise.all(Array.from({ length: 6 }, () => createProduct({ priceFils: 2000 })));
    const results = await Promise.allSettled(
      products.map(async (p) => {
        const order = await buy(student, p.id, coupon.code);
        return completeFreeOrder(order.id, student.id);
      }),
    );
    expect(fulfilled(results)).toHaveLength(1);
    expect(await activeEntitlements(student.id)).toHaveLength(1);
    expect(await redemptions(coupon.id)).toHaveLength(1);
  });

  it("the second checkout really waits for the first one's decision", async () => {
    const coupon = await createCoupon({ maxRedemptions: 1 });
    const product = await createProduct();
    const [first, second] = await users(2);
    // نسخة خادم أخرى تمسك صف الكود وتأخذ آخر مرة استخدام قبل أن تلتزم
    const out = await asOtherServer(async (tx) => {
      await tx`select id from coupons where id = ${coupon.id} for update`;
      const waiting = buy(second, product.id, coupon.code).then(
        () => "created",
        (e: OrderError) => e.userMessage,
      );
      await pause(300);
      const settledEarly = await Promise.race([waiting, Promise.resolve("still waiting")]);
      await tx`
        insert into orders (user_id, subtotal_fils, discount_fils, total_fils, coupon_id, coupon_code, is_test, customer_name, customer_email)
        values (${first.id}, 3000, 300, 2700, ${coupon.id}, ${coupon.code}, true, 'طالب', ${first.email})
      `;
      return { settledEarly, waiting };
    });
    expect(out.settledEarly).toBe("still waiting");
    await expect(out.waiting).resolves.toBe(HELD);
  });
});

describe("what holds a code", () => {
  it("an open order holds it from other students", async () => {
    const coupon = await createCoupon({ maxRedemptions: 1 });
    const product = await createProduct();
    const [a, b] = await users(2);
    await buy(a, product.id, coupon.code);
    await refusedWith(buy(b, product.id, coupon.code), HELD);
  });

  it("an open order counts toward the student's own limit", async () => {
    const coupon = await createCoupon({ maxPerUser: 1 });
    const student = await createUser();
    await buy(student, (await createProduct()).id, coupon.code);
    await refusedWith(buy(student, (await createProduct()).id, coupon.code), OWN_OPEN_ORDER);
  });

  it("a paid order is counted once, not as a redemption and a hold", async () => {
    const coupon = await createCoupon({ maxRedemptions: 2 });
    const product = await createProduct();
    const [a, b, c] = await users(3);
    await confirmPaid(await buy(a, product.id, coupon.code));
    await buy(b, product.id, coupon.code);
    await refusedWith(buy(c, product.id, coupon.code), HELD);
    await confirmPaid((await sql<OrderRow[]>`select * from orders where user_id = ${b.id}`)[0]);
    await refusedWith(buy(c, product.id, coupon.code), USED_UP);
  });

  it("the cart preview agrees with checkout, without taking a lock", async () => {
    const coupon = await createCoupon({ maxRedemptions: 1 });
    const product = await createProduct({ priceFils: 3000 });
    const [a, b] = await users(2);
    expect(await evaluateCoupon(coupon.code, b.id, 3000)).toMatchObject({ ok: true });
    await buy(a, product.id, coupon.code);
    expect(await evaluateCoupon(coupon.code, b.id, 3000)).toEqual({ ok: false, error: HELD });
  });
});

describe("what releases a code", () => {
  const released = async (release: (order: OrderRow) => Promise<unknown>) => {
    const coupon = await createCoupon({ maxRedemptions: 1, maxPerUser: 1 });
    const product = await createProduct();
    const [a, b] = await users(2);
    const order = await buy(a, product.id, coupon.code);
    await refusedWith(buy(b, product.id, coupon.code), HELD);
    await release(order);
    await expect(buy(b, product.id, coupon.code)).resolves.toMatchObject({ coupon_id: coupon.id });
  };

  it("a failed order", () => released((o) => sql`update orders set status = 'failed' where id = ${o.id}`));
  it("a pending order past its 72 hours, even before the sweep closes it", () => released((o) => makeStale(o.id)));
  it("an order closed as expired", () => released((o) => sql.begin((tx) => closeOrder(tx, { orderId: o.id, reason: "expired", actorId: null }))));
  it("an order the student cancelled", () => released((o) => sql.begin((tx) => closeOrder(tx, { orderId: o.id, reason: "student_cancelled", actorId: null }))));

  it("an order still inside its 72 hours keeps holding", async () => {
    const coupon = await createCoupon({ maxRedemptions: 1 });
    const product = await createProduct();
    const [a, b] = await users(2);
    const order = await buy(a, product.id, coupon.code);
    await makeStale(order.id, 71);
    await refusedWith(buy(b, product.id, coupon.code), HELD);
  });

  it("the student's own failed order lets them use the code again", async () => {
    const coupon = await createCoupon({ maxPerUser: 1 });
    const student = await createUser();
    const first = await buy(student, (await createProduct()).id, coupon.code);
    await sql`update orders set status = 'failed' where id = ${first.id}`;
    await expect(buy(student, (await createProduct()).id, coupon.code)).resolves.toMatchObject({ coupon_id: coupon.id });
  });
});

describe("retrying a failed order that carries a code", () => {
  async function failedOrder(limits: { maxRedemptions?: number; maxPerUser?: number }) {
    const coupon = await createCoupon({ kind: "percent", value: 10, ...limits });
    const product = await createProduct({ priceFils: 3000 });
    const student = await createUser();
    const order = await buy(student, product.id, coupon.code);
    await sql`update orders set status = 'failed' where id = ${order.id}`;
    return { coupon, product, student, order: await orderRow(order.id) };
  }

  it("waits for a checkout holding the code, and closes when that checkout took the last use", async () => {
    const { coupon, order } = await failedOrder({ maxRedemptions: 1 });
    const [other] = await users(1);
    // نسخة خادم أخرى تمسك صف الكود وتأخذ آخر مرة استخدام قبل أن تلتزم
    const out = await asOtherServer(async (tx) => {
      await tx`select id from coupons where id = ${coupon.id} for no key update`;
      const retrying = startPayment(order, null).then(
        () => "started",
        (e: OrderClosedError) => e.reason,
      );
      await pause(300);
      const settledEarly = await Promise.race([retrying, Promise.resolve("still waiting")]);
      await tx`
        insert into orders (user_id, subtotal_fils, discount_fils, total_fils, coupon_id, coupon_code, is_test, customer_name, customer_email)
        values (${other.id}, 3000, 300, 2700, ${coupon.id}, ${coupon.code}, true, 'طالب', ${other.email})
      `;
      return { settledEarly, retrying };
    });
    expect(out.settledEarly).toBe("still waiting");
    await expect(out.retrying).resolves.toBe("coupon_unavailable");
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "coupon_unavailable" });
  });

  it("takes the code back when it is still free, and holds it again", async () => {
    const { coupon, product, order } = await failedOrder({ maxRedemptions: 1 });
    await expect(startPayment(order, null)).resolves.toMatchObject({ reused: false });
    expect((await orderRow(order.id)).status).toBe("pending");
    const [other] = await users(1);
    await refusedWith(buy(other, product.id, coupon.code), HELD);
  });

  it("is closed without an invoice when someone else took the last use", async () => {
    const { coupon, product, order } = await failedOrder({ maxRedemptions: 1 });
    const [other] = await users(1);
    await buy(other, product.id, coupon.code);
    sim.state.requests.length = 0;
    const err = await startPayment(order, null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OrderClosedError);
    expect(err).toMatchObject({ reason: "coupon_unavailable" });
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "coupon_unavailable" });
    expect(invoicesCreated(sim)).toBe(0);
  });

  it("is closed when the student has since used the code on another order", async () => {
    const { coupon, student, order } = await failedOrder({ maxPerUser: 1 });
    await buy(student, (await createProduct()).id, coupon.code);
    await expect(startPayment(order, null)).rejects.toMatchObject({ reason: "coupon_unavailable" });
  });

  describe("after a decline, while the same link can still be paid", () => {
    async function declined() {
      const coupon = await createCoupon({ kind: "percent", value: 10, maxRedemptions: 1, maxPerUser: 1 });
      const product = await createProduct({ priceFils: 3000 });
      const student = await createUser();
      const order = await buy(student, product.id, coupon.code);
      const { url } = await startPayment(order, null);
      const { paymentId } = await sim.pay(invoiceIdOf(url), "fail");
      await verifyAndApplyPayment({ paymentId });
      expect((await orderRow(order.id)).status).toBe("failed");
      return { coupon, product, student, order: await orderRow(order.id), url };
    }

    it("keeps the code held, because a payment on that link would consume it", async () => {
      const { coupon, product } = await declined();
      const [other] = await users(1);
      await refusedWith(buy(other, product.id, coupon.code), HELD);
    });

    it("the student's own retry is not refused by its own hold", async () => {
      const { order, url } = await declined();
      await expect(startPayment(order, null)).resolves.toEqual({ url, reused: true });
      expect((await orderRow(order.id)).status).toBe("pending");
    });

    it("releases the code once the link has ended", async () => {
      const { coupon, product, order } = await declined();
      await sql`update payments set expires_at = now() - interval '1 minute' where order_id = ${order.id}`;
      const [other] = await users(1);
      await expect(buy(other, product.id, coupon.code)).resolves.toMatchObject({ coupon_id: coupon.id });
    });
  });

  it("an order without a code retries as before", async () => {
    const product = await createProduct();
    const [student] = await users(1);
    const order = await createOrder({ user: student, productIds: [product.id], isTest: true });
    await sql`update orders set status = 'failed' where id = ${order.id}`;
    await expect(startPayment(await orderRow(order.id), null)).resolves.toMatchObject({ reused: false });
  });
});
