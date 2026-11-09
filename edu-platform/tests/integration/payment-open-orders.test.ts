import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrder, OpenOrderExistsError, type OrderRow } from "@/server/commerce/orders";
import { resolveOpenOrderForCheckout, resetPaymentMethodsCache } from "@/server/payments/service";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { asOtherServer, auditCount, confirmPaid, invoiceIdOf, invoicesCreated, makeStale, orderRow, pause, paymentRows, startPayment, statusCalls } from "../helpers/payment-flow";
import { createBundle, createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ user: null as unknown, cart: [] as string[], redirected: [] as string[] }));

vi.mock("@/server/auth/guards", async (original) => ({ ...(await original<typeof import("@/server/auth/guards")>()), assertUser: async () => ctx.user }));
vi.mock("@/server/commerce/cart", async (original) => ({
  ...(await original<typeof import("@/server/commerce/cart")>()),
  getCartIds: async () => ctx.cart,
  writeCartIds: async (ids: string[]) => {
    ctx.cart = ids;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    ctx.redirected.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const { cancelOrderAction, placeOrderAction, refreshOrderStatusAction, retryPaymentAction } = await import("@/app/(site)/checkout/actions");

let sim: Simulator;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(() => {
  sim.state.requests.length = 0;
});
afterEach(() => {
  sim.clearFaults();
  sim.setAmountTamper(null);
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
  ctx.redirected.length = 0;
});

const fd = (values: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  return form;
};

async function checkout() {
  await expect(placeOrderAction({}, fd({ guardianDeclaration: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
  return ctx.redirected.at(-1)!;
}

async function student(productIds: string[]) {
  const user = await createUser();
  ctx.user = user;
  ctx.cart = productIds;
  return user;
}

const orderCount = async (userId: string) => (await sql<{ n: number }[]>`select count(*)::int as n from orders where user_id = ${userId}`)[0].n;

describe("checkout with an open order for the same product", () => {
  it("verifies it first and sends the student there without creating an order", async () => {
    const product = await createProduct({ priceFils: 3000 });
    const user = await student([product.id]);
    const open = await createOrder({ user, productIds: [product.id], isTest: true });
    await startPayment(open, null);
    sim.state.requests.length = 0;

    expect(await checkout()).toBe(`/orders/${open.id}?from=open-order`);
    expect(statusCalls(sim)).toBe(1);
    expect(invoicesCreated(sim)).toBe(0);
    expect(await orderCount(user.id)).toBe(1);
  });

  it("if that order was actually paid, it is completed and the student goes to it", async () => {
    const product = await createProduct({ priceFils: 3000 });
    const other = await createProduct({ priceFils: 1000 });
    const user = await student([product.id, other.id]);
    const open = await createOrder({ user, productIds: [product.id], isTest: true });
    const { url } = await startPayment(open, null);
    await sim.pay(invoiceIdOf(url), "success");
    sim.state.requests.length = 0;

    expect(await checkout()).toBe(`/orders/${open.id}?from=payment`);
    expect((await orderRow(open.id)).status).toBe("paid");
    expect(invoicesCreated(sim)).toBe(0);
    expect(await orderCount(user.id)).toBe(1);
    expect(ctx.cart).toEqual([other.id]);
  });

  it("overlap through a bundle in the open order counts", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const bundle = await createBundle({ items: [product.id], priceFils: 4000 });
    const user = await student([product.id]);
    const open = await createOrder({ user, productIds: [bundle.id], isTest: true });
    expect(await checkout()).toBe(`/orders/${open.id}?from=open-order`);
  });

  it("overlap through a bundle in the cart counts", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const bundle = await createBundle({ items: [product.id], priceFils: 4000 });
    const user = await student([bundle.id]);
    const open = await createOrder({ user, productIds: [product.id], isTest: true });
    expect(await checkout()).toBe(`/orders/${open.id}?from=open-order`);
  });

  it("a failed order is open too", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const user = await student([product.id]);
    const open = await createOrder({ user, productIds: [product.id], isTest: true });
    await sql`update orders set status = 'failed' where id = ${open.id}`;
    expect(await checkout()).toBe(`/orders/${open.id}?from=open-order`);
  });

  it("a different product makes a new order", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const other = await createProduct({ priceFils: 1000 });
    const user = await student([other.id]);
    await createOrder({ user, productIds: [product.id], isTest: true });
    const target = await checkout();
    expect(target).toMatch(/\/pay\/\d+$/);
    expect(await orderCount(user.id)).toBe(2);
  });

  it("another student's open order is ignored", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const someone = await createUser();
    await createOrder({ user: someone, productIds: [product.id], isTest: true });
    await student([product.id]);
    expect(await checkout()).toMatch(/\/pay\/\d+$/);
  });

  it("a closed order, or one past its 72 hours, does not count", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const user = await student([product.id]);
    const stale = await createOrder({ user, productIds: [product.id], isTest: true });
    await makeStale(stale.id);
    const cancelled = await createOrder({ user, productIds: [product.id], isTest: true });
    await sql`update orders set status = 'cancelled', closed_reason = 'student_cancelled', closed_at = now() where id = ${cancelled.id}`;
    expect(await checkout()).toMatch(/\/pay\/\d+$/);
  });

  it("an order from the other payment mode is not treated as open", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const user = await student([product.id]);
    await createOrder({ user, productIds: [product.id], isTest: false });
    await expect(resolveOpenOrderForCheckout({ userId: user.id, productIds: [product.id], isTest: true })).resolves.toEqual({ kind: "none" });
  });

  it("two tabs creating an order at once end with one order", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const user = await createUser();
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => createOrder({ user, productIds: [product.id], isTest: true, refuseOverlappingOpenOrders: true })));
    const ok = results.filter((r): r is PromiseFulfilledResult<OrderRow> => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(OpenOrderExistsError);
    expect(await orderCount(user.id)).toBe(1);
  });

  it("waits for the student's lock on another server, then sees that server's order", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const user = await createUser();
    const { second } = await asOtherServer(async (tx) => {
      await tx`select id from users where id = ${user.id} for no key update`;
      const second = createOrder({ user, productIds: [product.id], isTest: true, refuseOverlappingOpenOrders: true }).catch((e: unknown) => e);
      await pause();
      await createOrder({ user, productIds: [product.id], isTest: true });
      return { second };
    });
    expect(await second).toBeInstanceOf(OpenOrderExistsError);
    expect(await orderCount(user.id)).toBe(1);
  });

  it("checkout itself turns that guard on, so a race past the first check still ends at the open order", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const user = await student([product.id]);
    const { placing, firstId } = await asOtherServer(async (tx) => {
      await tx`select id from users where id = ${user.id} for no key update`;
      const placing = placeOrderAction({}, fd({ guardianDeclaration: "on" })).catch((e: unknown) => e);
      await pause();
      const first = await createOrder({ user, productIds: [product.id], isTest: true });
      return { placing, firstId: first.id };
    });
    expect(String(((await placing) as Error).message)).toBe(`NEXT_REDIRECT /orders/${firstId}?from=open-order`);
    expect(invoicesCreated(sim)).toBe(0);
    expect(await orderCount(user.id)).toBe(1);
  });

  it("the guard is off unless asked for, so other callers are unchanged", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const user = await createUser();
    await createOrder({ user, productIds: [product.id], isTest: true });
    await expect(createOrder({ user, productIds: [product.id], isTest: true })).resolves.toBeTruthy();
  });

  it("the guard refuses an overlapping order even when the checks before it were skipped", async () => {
    const product = await createProduct({ priceFils: 2000 });
    const user = await createUser();
    const open = await createOrder({ user, productIds: [product.id], isTest: true });
    const err = await createOrder({ user, productIds: [product.id], isTest: true, refuseOverlappingOpenOrders: true }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenOrderExistsError);
    expect(err.orderId).toBe(open.id);
  });

  it("while payment is off, checkout is not blocked by an old open order for a free item", async () => {
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    const paidProduct = await createProduct({ priceFils: 0 });
    const user = await student([paidProduct.id]);
    await createOrder({ user, productIds: [paidProduct.id], isTest: false });
    const target = await checkout();
    expect(target).toMatch(/\/orders\/[0-9a-f-]+\?from=checkout$/);
  });
});

describe("a student cancelling their own order", () => {
  async function openOrder() {
    const product = await createProduct({ priceFils: 2000 });
    const user = await student([product.id]);
    const order = await createOrder({ user, productIds: [product.id], isTest: true });
    const { url } = await startPayment(order, null);
    return { order, invoice: invoiceIdOf(url) };
  }

  async function cancel(orderId: string) {
    await expect(cancelOrderAction(fd({ orderId }))).rejects.toThrow(/NEXT_REDIRECT/);
    return ctx.redirected.at(-1)!;
  }

  it("closes it after checking the gateway, once", async () => {
    const { order } = await openOrder();
    sim.state.requests.length = 0;
    expect(await cancel(order.id)).toBe(`/orders/${order.id}`);
    expect(statusCalls(sim)).toBe(1);
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "student_cancelled" });
    expect(await auditCount("order.closed", order.id)).toBe(1);
    await cancel(order.id);
    expect(await auditCount("order.closed", order.id)).toBe(1);
  });

  it("does not cancel an order that was actually paid", async () => {
    const { order, invoice } = await openOrder();
    await sim.pay(invoice, "success");
    await cancel(order.id);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("leaves the order alone when the gateway cannot answer", async () => {
    const { order, invoice } = await openOrder();
    sim.setStatusFault(invoice, true);
    expect(await cancel(order.id)).toBe(`/orders/${order.id}?error=check`);
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("leaves the order alone while an unfinished attempt is inside its link's life and grace", async () => {
    const { order, invoice } = await openOrder();
    sim.startTransaction(invoice);
    expect(await cancel(order.id)).toBe(`/orders/${order.id}?error=inprogress`);
    expect((await orderRow(order.id)).status).toBe("pending");
    await sql`update payments set expires_at = now() - interval '5 minutes' where order_id = ${order.id}`;
    expect(await cancel(order.id)).toBe(`/orders/${order.id}?error=inprogress`);
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  describe("an invoice that waiting will not resolve", () => {
    const act = async (action: (f: FormData) => Promise<unknown>, orderId: string) => {
      await expect(action(fd({ orderId }))).rejects.toThrow(/NEXT_REDIRECT/);
      return ctx.redirected.at(-1)!;
    };
    async function otherMode() {
      const made = await openOrder();
      await sql`update payments set environment = 'live' where order_id = ${made.order.id}`;
      return made;
    }
    async function mismatched() {
      const made = await openOrder();
      sim.setAmountTamper(500);
      return made;
    }

    it("from another payment mode: Refresh says so instead of asking the student to wait", async () => {
      const { order } = await otherMode();
      expect(await act(refreshOrderStatusAction, order.id)).toBe(`/orders/${order.id}?error=mode`);
    });

    it("from another payment mode: Retry says so too", async () => {
      const { order } = await otherMode();
      expect(await act(retryPaymentAction, order.id)).toBe(`/orders/${order.id}?error=mode`);
    });

    it("from another payment mode: the student can still cancel", async () => {
      const { order } = await otherMode();
      expect(await act(cancelOrderAction, order.id)).toBe(`/orders/${order.id}`);
      expect((await orderRow(order.id)).status).toBe("cancelled");
    });

    it("that does not match the order: Refresh and Retry both say it needs review", async () => {
      const { order } = await mismatched();
      expect(await act(refreshOrderStatusAction, order.id)).toBe(`/orders/${order.id}?error=review`);
      expect(await act(retryPaymentAction, order.id)).toBe(`/orders/${order.id}?error=review`);
    });

    it("that does not match the order: the student can still cancel", async () => {
      const { order } = await mismatched();
      expect(await act(cancelOrderAction, order.id)).toBe(`/orders/${order.id}`);
      expect((await orderRow(order.id)).status).toBe("cancelled");
    });

    it("a gateway that does not answer is still reported as try again, and blocks the cancel", async () => {
      const { order } = await openOrder();
      sim.setFault("/v2/GetPaymentStatus", "error");
      expect(await act(refreshOrderStatusAction, order.id)).toBe(`/orders/${order.id}?error=check`);
      expect(await act(cancelOrderAction, order.id)).toBe(`/orders/${order.id}?error=check`);
      expect((await orderRow(order.id)).status).toBe("pending");
    });
  });

  it("an attempt abandoned past the grace period no longer traps the order", async () => {
    const { order, invoice } = await openOrder();
    sim.startTransaction(invoice);
    await sql`update payments set expires_at = now() - interval '20 minutes' where order_id = ${order.id}`;
    expect(await cancel(order.id)).toBe(`/orders/${order.id}`);
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "student_cancelled" });
  });

  it("cannot cancel someone else's order", async () => {
    const { order } = await openOrder();
    ctx.user = await createUser();
    expect(await cancel(order.id)).toBe("/account");
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("cannot cancel a paid order", async () => {
    const { order } = await openOrder();
    await confirmPaid(order);
    expect(await cancel(order.id)).toBe(`/orders/${order.id}`);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect((await paymentRows(order.id)).length).toBe(1);
  });
});
