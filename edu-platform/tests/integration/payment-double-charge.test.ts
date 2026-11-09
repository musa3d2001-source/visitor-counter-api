import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOrder, createOrder } from "@/server/commerce/orders";
import { OrderClosedError, OrderSettledError, PaymentInProgressError, checkOrderInvoices, resetPaymentMethodsCache, startPayment, verifyAndApplyPayment } from "@/server/payments/service";
import { MyFatoorahError } from "@/server/payments/myfatoorah";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { asOtherServer, confirmPaid, expireInvoice, expireLocally, invoiceIdOf, invoicesCreated, makeStale, newOrder, orderRow, pause, paymentRows, statusCalls } from "../helpers/payment-flow";
import { createBundle, createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ user: null as unknown, admin: null as unknown, cart: [] as string[], redirected: [] as string[] }));

vi.mock("@/server/auth/guards", async (original) => ({
  ...(await original<typeof import("@/server/auth/guards")>()),
  assertUser: async () => ctx.user,
  assertAdmin: async () => ctx.admin,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    ctx.redirected.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const { refreshOrderStatusAction, retryPaymentAction } = await import("@/app/(site)/checkout/actions");
const { reverifyPaymentAction } = await import("@/app/admin/orders/actions");

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

const fd = (values: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  return form;
};

async function redirectOf(run: Promise<unknown>) {
  await expect(run).rejects.toThrow(/NEXT_REDIRECT/);
  return ctx.redirected.at(-1);
}

describe("a retry checks every existing invoice first", () => {
  it("reuses a still-open link instead of creating a second payable invoice", async () => {
    const { order } = await newOrder();
    const first = await startPayment(order, null);
    expect(first.reused).toBe(false);
    const second = await startPayment(await orderRow(order.id), null);
    expect(second).toEqual({ url: first.url, reused: true });
    expect(invoicesCreated(sim)).toBe(1);
    expect(await paymentRows(order.id)).toHaveLength(1);
  });

  it("asks the gateway about the invoice before reusing it", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    sim.state.requests.length = 0;
    await startPayment(await orderRow(order.id), null);
    expect(sim.state.requests.filter((r) => r.path === "/v2/GetPaymentStatus").map((r) => (r.body as { Key: string }).Key)).toEqual([String(invoiceIdOf(url))]);
  });

  it("does not hand out a link about to expire", async () => {
    const { order } = await newOrder();
    const first = await startPayment(order, null);
    await sql`update payments set expires_at = now() + interval '4 minutes' where order_id = ${order.id}`;
    const second = await startPayment(await orderRow(order.id), null);
    expect(second.url).not.toBe(first.url);
    expect(invoicesCreated(sim)).toBe(2);
  });

  it("a link that expired at the gateway is replaced, and the old row is marked expired", async () => {
    const { order } = await newOrder();
    const first = await startPayment(order, null);
    await expireInvoice(sim, invoiceIdOf(first.url));
    const second = await startPayment(await orderRow(order.id), null);
    expect(second.url).not.toBe(first.url);
    expect((await paymentRows(order.id)).map((p) => p.status)).toEqual(["expired", "pending"]);
  });

  it("an older invoice that was paid completes the order and no new invoice is created", async () => {
    const { order } = await newOrder();
    const first = await startPayment(order, null);
    await expireLocally(invoiceIdOf(first.url));
    const second = await startPayment(await orderRow(order.id), null);
    await expireLocally(invoiceIdOf(second.url));
    await sim.pay(invoiceIdOf(first.url), "success");
    sim.state.requests.length = 0;

    await expect(startPayment(await orderRow(order.id), null)).rejects.toBeInstanceOf(OrderSettledError);
    expect(invoicesCreated(sim)).toBe(0);
    expect(statusCalls(sim)).toBeGreaterThanOrEqual(2);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("an invoice whose attempt failed is still checked, because the student can pay it again", async () => {
    const { order } = await newOrder();
    const first = await startPayment(order, 1);
    const id = invoiceIdOf(first.url);
    const failed = await sim.pay(id, "fail");
    await verifyAndApplyPayment({ paymentId: failed.paymentId });
    expect((await orderRow(order.id)).status).toBe("failed");
    await sim.pay(id, "success");

    await expect(startPayment(await orderRow(order.id), 1)).rejects.toBeInstanceOf(OrderSettledError);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("creates nothing when the gateway does not answer about one invoice", async () => {
    const { order } = await newOrder();
    const first = await startPayment(order, null);
    await expireLocally(invoiceIdOf(first.url));
    sim.setStatusFault(invoiceIdOf(first.url), true);
    sim.state.requests.length = 0;

    await expect(startPayment(await orderRow(order.id), null)).rejects.toBeInstanceOf(MyFatoorahError);
    expect(invoicesCreated(sim)).toBe(0);
    expect(await paymentRows(order.id)).toHaveLength(1);
  });

  it("creates nothing when the gateway is unreachable", async () => {
    const { order } = await newOrder();
    await startPayment(order, null);
    sim.setFault("/v2/GetPaymentStatus", "down");
    sim.state.requests.length = 0;
    await expect(startPayment(await orderRow(order.id), null)).rejects.toBeInstanceOf(MyFatoorahError);
    expect(invoicesCreated(sim)).toBe(0);
  });

  it("creates nothing when an invoice comes back invalid", async () => {
    const { order } = await newOrder();
    await startPayment(order, null);
    sim.setAmountTamper(500);
    sim.state.requests.length = 0;
    await expect(startPayment(await orderRow(order.id), null)).rejects.toBeInstanceOf(MyFatoorahError);
    expect(invoicesCreated(sim)).toBe(0);
  });
});

describe("two tabs pressing pay at once", () => {
  it("creates one invoice and gives both the same link", async () => {
    const { order } = await newOrder();
    sim.setDelay("/v2/SendPayment", 300);
    const results = await Promise.all([startPayment(order, null), startPayment(order, null)]);
    expect(invoicesCreated(sim)).toBe(1);
    expect(results[0].url).toBe(results[1].url);
    expect(results.map((r) => r.reused).sort()).toEqual([false, true]);
    expect((await paymentRows(order.id)).map((p) => p.status)).toEqual(["pending"]);
  });

  it("holds for five tabs", async () => {
    const { order } = await newOrder();
    sim.setDelay("/v2/SendPayment", 300);
    const results = await Promise.all(Array.from({ length: 5 }, () => startPayment(order, null)));
    expect(invoicesCreated(sim)).toBe(1);
    expect(new Set(results.map((r) => r.url)).size).toBe(1);
  });

  it("no transaction stays open during the gateway call, so a webhook for the same order is not blocked", async () => {
    const { order } = await newOrder();
    sim.setDelay("/v2/SendPayment", 800);
    const paying = startPayment(order, null);
    await new Promise((r) => setTimeout(r, 300));
    const started = Date.now();
    await sql.begin(async (tx) => {
      await tx`select id from orders where id = ${order.id} for update`;
    });
    expect(Date.now() - started).toBeLessThan(400);
    await paying;
  });

  it("waits for the order lock, so another server's claim is seen and no second invoice is made", async () => {
    const { order } = await newOrder();
    const { paying, claimId } = await asOtherServer(async (tx) => {
      await tx`select id from orders where id = ${order.id} for update`;
      const paying = startPayment(order, null).catch((e: unknown) => e);
      await pause();
      expect(invoicesCreated(sim)).toBe(0);
      const [claim] = await tx<{ id: string }[]>`
        insert into payments (order_id, provider, environment, status, amount_fils, expires_at)
        values (${order.id}, 'myfatoorah', 'sandbox', 'initiated', ${order.total_fils}, now() + interval '60 minutes') returning id
      `;
      return { paying, claimId: claim.id };
    });
    await pause(100);
    await sql`update payments set status = 'failed' where id = ${claimId}`;
    expect(await paying).toBeInstanceOf(PaymentInProgressError);
    expect(invoicesCreated(sim)).toBe(0);
  });

  it("the waiting tab does not create an invoice when the first one fails", async () => {
    const { order } = await newOrder();
    sim.setDelay("/v2/SendPayment", 300);
    sim.setFault("/v2/SendPayment", "error");
    const results = await Promise.allSettled([startPayment(order, null), startPayment(order, null)]);
    expect(invoicesCreated(sim)).toBe(1);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(results.some((r) => r.status === "rejected" && r.reason instanceof PaymentInProgressError)).toBe(true);
    expect((await paymentRows(order.id)).map((p) => p.status)).toEqual(["failed"]);
  });

  it("an abandoned claim does not block forever, and is closed", async () => {
    const { order } = await newOrder();
    await sql`insert into payments (order_id, provider, environment, status, amount_fils, created_at) values (${order.id}, 'myfatoorah', 'sandbox', 'initiated', ${order.total_fils}, now() - interval '2 minutes')`;
    const { url } = await startPayment(order, null);
    expect(url).toBeTruthy();
    expect((await paymentRows(order.id)).map((p) => p.status)).toEqual(["failed", "pending"]);
  });

  it("a fresh claim is honoured even though no link exists yet", async () => {
    const { order } = await newOrder();
    await sql`insert into payments (order_id, provider, environment, status, amount_fils) values (${order.id}, 'myfatoorah', 'sandbox', 'initiated', ${order.total_fils})`;
    await expect(startPayment(order, null)).rejects.toBeInstanceOf(PaymentInProgressError);
    expect(invoicesCreated(sim)).toBe(0);
  }, 20_000);

  it("if the order closes during the gateway call, no link is handed out", async () => {
    const { order } = await newOrder();
    sim.setDelay("/v2/SendPayment", 400);
    const paying = startPayment(order, null);
    await new Promise((r) => setTimeout(r, 150));
    await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason: "student_cancelled", actorId: null }));
    await expect(paying).rejects.toBeInstanceOf(OrderSettledError);
    const [row] = await paymentRows(order.id);
    expect(row.status).toBe("failed");
    expect(row.payment_url).toBeNull();
  });
});

describe("short invoices, 72 hour orders", () => {
  it.each([
    ["SendPayment", null, "/v2/SendPayment"],
    ["ExecutePayment", 1, "/v2/ExecutePayment"],
  ])("%s carries a 60 minute ExpiryDate as documented: Kuwait time with no offset", async (_n, method, path) => {
    const { order } = await newOrder();
    await startPayment(order, method);
    const body = sim.state.requests.find((r) => r.path === path)!.body as { ExpiryDate: string };
    expect(body.ExpiryDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    const expiresAt = Date.parse(`${body.ExpiryDate}+03:00`);
    const minutes = (expiresAt - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(58);
    expect(minutes).toBeLessThanOrEqual(60);
    const [row] = await paymentRows(order.id);
    expect(Math.abs(new Date(row.expires_at!).getTime() - expiresAt)).toBeLessThan(1000);
  });

  it("an order past 72 hours is closed instead of billed", async () => {
    const { order } = await newOrder();
    await makeStale(order.id);
    const err = await startPayment(order, null).catch((e) => e);
    expect(err).toBeInstanceOf(OrderClosedError);
    expect(err.reason).toBe("expired");
    expect(invoicesCreated(sim)).toBe(0);
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "expired" });
  });

  it("an order younger than 72 hours is still billed", async () => {
    const { order } = await newOrder();
    await makeStale(order.id, 71);
    await expect(startPayment(order, null)).resolves.toMatchObject({ reused: false });
  });

  it("an order whose product was bought another way is closed instead of billed", async () => {
    const user = await createUser();
    const product = await createProduct({ priceFils: 2000 });
    const open = await createOrder({ user, productIds: [product.id], isTest: true });
    const other = await createOrder({ user, productIds: [product.id], isTest: true });
    await confirmPaid(other);
    const err = await startPayment(open, null).catch((e) => e);
    expect(err).toBeInstanceOf(OrderClosedError);
    expect(err.reason).toBe("already_owned");
    expect(invoicesCreated(sim)).toBe(0);
    expect(await orderRow(open.id)).toMatchObject({ status: "cancelled", closed_reason: "already_owned" });
  });

  it("ownership through a bundle counts too", async () => {
    const user = await createUser();
    const product = await createProduct({ priceFils: 2000 });
    const bundle = await createBundle({ items: [product.id], priceFils: 4000 });
    const open = await createOrder({ user, productIds: [product.id], isTest: true });
    await confirmPaid(await createOrder({ user, productIds: [bundle.id], isTest: true }));
    await expect(startPayment(open, null)).rejects.toBeInstanceOf(OrderClosedError);
    expect(invoicesCreated(sim)).toBe(0);
  });

  it("an unfinished attempt on an ended link blocks a new invoice until the grace period ends", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    sim.startTransaction(invoiceIdOf(url));
    await sql`update payments set expires_at = now() - interval '5 minutes' where order_id = ${order.id}`;
    sim.state.requests.length = 0;
    await expect(startPayment(await orderRow(order.id), null)).rejects.toBeInstanceOf(PaymentInProgressError);
    expect(invoicesCreated(sim)).toBe(0);

    await sql`update payments set expires_at = now() - interval '20 minutes' where order_id = ${order.id}`;
    await expect(startPayment(await orderRow(order.id), null)).resolves.toMatchObject({ reused: false });
  });

  it("a bank page abandoned on a still-open method link does not trap the student", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, 1);
    sim.startTransaction(invoiceIdOf(url));
    sim.state.requests.length = 0;
    const retry = await startPayment(await orderRow(order.id), null);
    expect(retry.reused).toBe(false);
    expect(retry.url).not.toBe(url);
    expect(sim.state.requests.filter((r) => r.path === "/v2/SendPayment")).toHaveLength(1);
  });

  it("a method link nobody has opened is reused like any other", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, 1);
    await expect(startPayment(await orderRow(order.id), null)).resolves.toEqual({ url, reused: true });
    expect(invoicesCreated(sim)).toBe(1);
  });

  it("an unfinished attempt on an open all-methods link keeps that link", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    sim.startTransaction(invoiceIdOf(url));
    await expect(startPayment(await orderRow(order.id), null)).resolves.toEqual({ url, reused: true });
    expect(invoicesCreated(sim)).toBe(1);
  });
});

describe("a declined attempt on an all-methods link", () => {
  async function declined() {
    const { user, order, product } = await newOrder();
    const first = await startPayment(order, null);
    const invoice = invoiceIdOf(first.url);
    const { paymentId } = await sim.pay(invoice, "fail");
    await expect(verifyAndApplyPayment({ paymentId })).resolves.toMatchObject({ state: "failed" });
    expect((await orderRow(order.id)).status).toBe("failed");
    return { user, order, product, url: first.url, invoice, paymentId };
  }

  it("a retry gets the same link back, with no second invoice", async () => {
    const { order, url } = await declined();
    sim.state.requests.length = 0;
    await expect(startPayment(await orderRow(order.id), null)).resolves.toEqual({ url, reused: true });
    expect(invoicesCreated(sim)).toBe(0);
    expect((await orderRow(order.id)).status).toBe("pending");
    expect((await paymentRows(order.id)).map((p) => p.status)).toEqual(["pending"]);
  });

  it("reading the old decline again leaves the retried order pending", async () => {
    const { order, invoice, paymentId } = await declined();
    await startPayment(await orderRow(order.id), null);

    await expect(verifyAndApplyPayment({ paymentId })).resolves.toEqual({ state: "pending", orderId: order.id });
    await expect(verifyAndApplyPayment({ invoiceId: String(invoice) })).resolves.toEqual({ state: "pending", orderId: order.id });
    await expect(checkOrderInvoices(order.id)).resolves.toMatchObject({ allChecked: true });
    expect((await orderRow(order.id)).status).toBe("pending");
    expect((await paymentRows(order.id))[0].status).toBe("pending");
  });

  it("a new decline on the same link fails the order again", async () => {
    const { order, invoice } = await declined();
    await startPayment(await orderRow(order.id), null);
    const second = await sim.pay(invoice, "fail");
    await expect(verifyAndApplyPayment({ paymentId: second.paymentId })).resolves.toMatchObject({ state: "failed" });
    expect((await orderRow(order.id)).status).toBe("failed");
  });

  it("the older of two declines is history and changes nothing", async () => {
    const { order, invoice, paymentId } = await declined();
    await startPayment(await orderRow(order.id), null);
    await sim.pay(invoice, "fail");
    const row = (await paymentRows(order.id))[0];
    await expect(verifyAndApplyPayment({ paymentId })).resolves.toEqual({ state: "pending", orderId: order.id });
    expect((await paymentRows(order.id))[0].status).toBe(row.status);
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("the retried link can still be paid", async () => {
    const { user, order, product, invoice } = await declined();
    await startPayment(await orderRow(order.id), null);
    const paid = await sim.pay(invoice, "success");
    await expect(verifyAndApplyPayment({ paymentId: paid.paymentId })).resolves.toEqual({ state: "paid", orderId: order.id, changed: true });
    expect(await sql`select product_id from entitlements where user_id = ${user.id}`).toEqual([{ product_id: product.id }]);
  });

  it("a method link that was declined is not offered again", async () => {
    const { order } = await newOrder();
    const first = await startPayment(order, 1);
    const { paymentId } = await sim.pay(invoiceIdOf(first.url), "fail");
    await verifyAndApplyPayment({ paymentId });
    const retry = await startPayment(await orderRow(order.id), null);
    expect(retry.reused).toBe(false);
    expect(retry.url).not.toBe(first.url);
  });

  it("does not fail an order that has another open invoice", async () => {
    const { order } = await newOrder();
    const first = await startPayment(order, 1);
    sim.startTransaction(invoiceIdOf(first.url));
    const second = await startPayment(await orderRow(order.id), null);
    expect(second.reused).toBe(false);
    const { paymentId } = await sim.pay(invoiceIdOf(first.url), "fail");
    await expect(verifyAndApplyPayment({ paymentId })).resolves.toMatchObject({ state: "failed" });
    expect((await orderRow(order.id)).status).toBe("pending");
    expect((await paymentRows(order.id)).map((p) => p.status)).toEqual(["failed", "pending"]);
  });

  it("takes the order lock before the payment row, like every other payment path", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    const { paymentId } = await sim.pay(invoiceIdOf(url), "fail");
    const { verifying, rowFree } = await asOtherServer(async (tx) => {
      await tx`select id from orders where id = ${order.id} for update`;
      const verifying = verifyAndApplyPayment({ paymentId });
      await pause();
      // المعالج ينتظر قفل الطلب، فلا يجوز أن يكون ممسكًا بصف الدفع: الترتيب المعاكس هو سبب الجمود المتبادل
      const rowFree = await sql`select id from payments where order_id = ${order.id} for update nowait`.then(
        () => true,
        () => false,
      );
      return { verifying, rowFree };
    });
    expect(rowFree).toBe(true);
    await expect(verifying).resolves.toMatchObject({ state: "failed" });
  });
});

describe("reading an invoice's state", () => {
  it("Canceled at the gateway expires the invoice and leaves the order alone", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    sim.cancelInvoice(invoiceIdOf(url));
    await expect(verifyAndApplyPayment({ invoiceId: String(invoiceIdOf(url)) })).resolves.toEqual({ state: "expired", orderId: order.id });
    expect((await paymentRows(order.id))[0].status).toBe("expired");
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("a Pending answer inside the link's life keeps the row pending and records the check", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    await expect(verifyAndApplyPayment({ invoiceId: String(invoiceIdOf(url)) })).resolves.toEqual({ state: "pending", orderId: order.id });
    const [row] = await paymentRows(order.id);
    expect(row.status).toBe("pending");
    expect(row.last_checked_at).not.toBeNull();
  });

  it("a Pending answer long after the link ended marks the row expired, and an InProgress one does not", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    const id = String(invoiceIdOf(url));
    sim.startTransaction(Number(id));
    await sql`update payments set expires_at = now() - interval '20 minutes' where order_id = ${order.id}`;
    await expect(verifyAndApplyPayment({ invoiceId: id })).resolves.toEqual({ state: "pending", orderId: order.id, inProgress: true });
    expect((await paymentRows(order.id))[0].status).toBe("pending");

    sim.state.invoices.get(Number(id))!.Transactions.length = 0;
    await verifyAndApplyPayment({ invoiceId: id });
    expect((await paymentRows(order.id))[0].status).toBe("expired");
  });

  it("the walk reports what it could not check", async () => {
    const { order } = await newOrder();
    const first = await startPayment(order, null);
    await expireLocally(invoiceIdOf(first.url));
    const second = await startPayment(await orderRow(order.id), null);
    sim.setStatusFault(invoiceIdOf(first.url), true);
    sim.state.requests.length = 0;
    const walk = await checkOrderInvoices(order.id);
    expect(walk).toMatchObject({ total: 2, checked: 1, allChecked: false, anyPaid: false });
    const stopped = await checkOrderInvoices(order.id, { stopOnError: true });
    expect(stopped).toMatchObject({ total: 2, checked: 0, allChecked: false });
    expect(sim.state.requests.filter((r) => r.path === "/v2/GetPaymentStatus").map((r) => (r.body as { Key: string }).Key)).toEqual([String(invoiceIdOf(first.url)), String(invoiceIdOf(second.url)), String(invoiceIdOf(first.url))]);
  });

  it("the walk refuses to claim success for an invoice from another payment mode", async () => {
    const { order } = await newOrder();
    await startPayment(order, null);
    await sql`update payments set environment = 'live' where order_id = ${order.id}`;
    await expect(checkOrderInvoices(order.id)).resolves.toMatchObject({ total: 1, checked: 0, allChecked: false });
  });
});

describe("the student's refresh and retry buttons", () => {
  async function twoInvoices() {
    const { user, order } = await newOrder();
    ctx.user = user;
    const first = await startPayment(order, null);
    await expireLocally(invoiceIdOf(first.url));
    const second = await startPayment(await orderRow(order.id), null);
    return { order, first: invoiceIdOf(first.url), second: invoiceIdOf(second.url) };
  }

  it("refresh finds a payment on an older invoice, not only the latest", async () => {
    const { order, first } = await twoInvoices();
    await sim.pay(first, "success");
    expect(await redirectOf(refreshOrderStatusAction(fd({ orderId: order.id })))).toBe(`/orders/${order.id}`);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("refresh on a failed order still checks every invoice", async () => {
    const { order, first } = await twoInvoices();
    await sql`update orders set status = 'failed' where id = ${order.id}`;
    await sim.pay(first, "success");
    await redirectOf(refreshOrderStatusAction(fd({ orderId: order.id })));
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("refresh says so when an invoice could not be checked", async () => {
    const { order, first } = await twoInvoices();
    sim.setStatusFault(first, true);
    expect(await redirectOf(refreshOrderStatusAction(fd({ orderId: order.id })))).toBe(`/orders/${order.id}?error=check`);
  });

  it("retry on an order that turns out to be paid goes to the order, with no error", async () => {
    const { order, first } = await twoInvoices();
    await sim.pay(first, "success");
    expect(await redirectOf(retryPaymentAction(fd({ orderId: order.id })))).toBe(`/orders/${order.id}`);
  });

  it("retry reports a transaction in progress", async () => {
    const { order, second } = await twoInvoices();
    await expireLocally(second);
    sim.startTransaction(second);
    await sql`update payments set expires_at = now() - interval '5 minutes' where gateway_invoice_id = ${String(second)}`;
    expect(await redirectOf(retryPaymentAction(fd({ orderId: order.id })))).toBe(`/orders/${order.id}?error=inprogress`);
  });

  it("retry reports a closed order", async () => {
    const { order } = await twoInvoices();
    await makeStale(order.id);
    expect(await redirectOf(retryPaymentAction(fd({ orderId: order.id })))).toBe(`/orders/${order.id}?error=closed`);
  });

  it("the owner's re-verify checks every invoice and is audited", async () => {
    const { order, first, second } = await twoInvoices();
    ctx.admin = await createUser({ role: "admin" });
    await sim.pay(first, "success");
    sim.state.requests.length = 0;
    const out = await reverifyPaymentAction({}, fd({ orderId: order.id }));
    expect(out).toMatchObject({ ok: true, message: expect.stringContaining("الدفع مؤكد") });
    expect(
      sim.state.requests
        .filter((r) => r.path === "/v2/GetPaymentStatus")
        .map((r) => (r.body as { Key: string }).Key)
        .sort(),
    ).toEqual([String(first), String(second)].sort());
    expect((await orderRow(order.id)).status).toBe("paid");
    const [log] = await sql<{ metadata: { total: number; checked: number } }[]>`select metadata from audit_logs where action = 'order.reverify' and entity_id = ${order.id}`;
    expect(log.metadata).toMatchObject({ total: 2, checked: 2 });
  });

  it("the owner's re-verify reports an incomplete check as an error", async () => {
    const { order, first } = await twoInvoices();
    ctx.admin = await createUser({ role: "admin" });
    sim.setStatusFault(first, true);
    const out = await reverifyPaymentAction({}, fd({ orderId: order.id }));
    expect(out?.error).toContain("تعذر التحقق من كل الفواتير");
  });
});
