import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeOrder, createOrder, type OrderRow } from "@/server/commerce/orders";
import { handleMyFatoorahWebhook, refundExtraPayment, requestOrderRefund, resetPaymentMethodsCache, startPayment, verifyAndApplyPayment } from "@/server/payments/service";
import { openExtraPayments } from "@/server/payments/extras";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { asOtherServer, invoiceIdOf, moneySnapshot, newOrder, orderRow, pause, paymentRows } from "../helpers/payment-flow";
import { activeEntitlements, createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

/** الرابط نفسه يُعاد لكل تبويب (D3)، فقد ينجح الدفع عليه مرتين. كل عملية ناجحة مال مستقل له سجله واسترداده */
let sim: Simulator;
let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
  admin = await createUser({ role: "admin" });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(async () => {
  sim.state.requests.length = 0;
  await sql`delete from payment_alerts`;
});
afterEach(() => {
  sim.clearFaults();
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

type Extra = { id: string; kind: string; state: string; amount_fils: number; gateway_payment_id: string | null; gateway_refund_id: string | null };
const extrasOf = (orderId: string) => sql<Extra[]>`select id, kind, state, amount_fils, gateway_payment_id, gateway_refund_id from payment_extras where order_id = ${orderId} order by created_at`;
const alertReasons = async (orderId: string) => (await sql<{ details: { reason: string } }[]>`select details from payment_alerts where order_id = ${orderId}`).map((a) => a.details.reason);
const refundCalls = () => sim.state.requests.filter((r) => r.path === "/v2/MakeRefund").map((r) => r.body as { Key: string; KeyType: string });
const verify = (invoice: number) => verifyAndApplyPayment({ invoiceId: String(invoice) });

/** طلب أُكمل بعملية، ثم نجحت عملية ثانية على الرابط نفسه من تبويب آخر ولم تُقرأ بعد */
async function bothTabsPaid() {
  const made = await newOrder();
  const { url } = await startPayment(made.order, null);
  const invoice = invoiceIdOf(url);
  const first = await sim.pay(invoice, "success");
  await expect(verifyAndApplyPayment({ paymentId: first.paymentId })).resolves.toMatchObject({ state: "paid", changed: true });
  const second = await sim.pay(invoice, "success");
  return { ...made, invoice, first: first.paymentId, second: second.paymentId };
}

async function flagged() {
  const made = await bothTabsPaid();
  await verifyAndApplyPayment({ paymentId: made.second });
  const [extra] = await extrasOf(made.order.id);
  return { ...made, extra };
}

describe("two tabs both completing payment on one link", () => {
  it("records the second charge under its own PaymentId and leaves the order alone", async () => {
    const { order, invoice, first, second } = await bothTabsPaid();
    const before = await moneySnapshot(order.id);
    await expect(verifyAndApplyPayment({ paymentId: second })).resolves.toEqual({ state: "flagged", orderId: order.id, kind: "duplicate" });
    expect(await extrasOf(order.id)).toMatchObject([{ kind: "duplicate", state: "open", amount_fils: order.total_fils, gateway_payment_id: second }]);
    expect(await moneySnapshot(order.id)).toBe(before);
    expect(await paymentRows(order.id)).toMatchObject([{ status: "paid", gateway_payment_id: first, gateway_invoice_id: String(invoice) }]);
  });

  it("is not recorded twice, however often it is re-read", async () => {
    const { order, invoice, second } = await bothTabsPaid();
    await verifyAndApplyPayment({ paymentId: second });
    await verifyAndApplyPayment({ paymentId: second });
    await verify(invoice);
    await Promise.all([verify(invoice), verify(invoice)]);
    expect(await extrasOf(order.id)).toHaveLength(1);
  });

  it("is reported through the webhook", async () => {
    const { order, invoice, second } = await bothTabsPaid();
    const { body, headers } = sim.buildWebhook(invoice, second);
    await expect(handleMyFatoorahWebhook(body, headers)).resolves.toMatchObject({ status: 200, result: "flagged duplicate" });
    expect(await extrasOf(order.id)).toMatchObject([{ gateway_payment_id: second }]);
  });

  it("when both are seen at once, the order completes on the first and the second is still recorded", async () => {
    const { user, product, order } = await newOrder();
    const { url } = await startPayment(order, null);
    const first = await sim.pay(invoiceIdOf(url), "success");
    const second = await sim.pay(invoiceIdOf(url), "success");
    await expect(verify(invoiceIdOf(url))).resolves.toEqual({ state: "paid", orderId: order.id, changed: true });
    expect((await paymentRows(order.id))[0].gateway_payment_id).toBe(first.paymentId);
    expect(await extrasOf(order.id)).toMatchObject([{ kind: "duplicate", gateway_payment_id: second.paymentId }]);
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it("reads DuplicatePayment the same way", async () => {
    const { order, invoice, second } = await bothTabsPaid();
    sim.reportDuplicatePayment(invoice);
    await expect(verify(invoice)).resolves.toEqual({ state: "flagged", orderId: order.id, kind: "duplicate" });
    expect(await extrasOf(order.id)).toMatchObject([{ gateway_payment_id: second }]);
  });

  it("a third charge gets its own record", async () => {
    const { order, invoice, second } = await bothTabsPaid();
    const third = await sim.pay(invoice, "success");
    await verify(invoice);
    expect((await extrasOf(order.id)).map((e) => e.gateway_payment_id).sort()).toEqual([second, third.paymentId].sort());
  });

  it("shows the owner the second charge's own reference", async () => {
    const { order, second } = await flagged();
    const row = (await openExtraPayments()).find((e) => e.order_id === order.id)!;
    expect(row.gateway_payment_id).toBe(second);
  });

  it("is after_refund when the order was already refunded", async () => {
    const { order, invoice } = await bothTabsPaid();
    await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
    await verify(invoice);
    expect(await extrasOf(order.id)).toMatchObject([{ kind: "after_refund" }]);
  });

  it("is late_review when the order was closed and cannot be completed", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason: "product_ended", actorId: null }));
    await sim.pay(invoiceIdOf(url), "success");
    const second = await sim.pay(invoiceIdOf(url), "success");
    await expect(verify(invoiceIdOf(url))).resolves.toMatchObject({ state: "flagged", kind: "late_review" });
    expect((await extrasOf(order.id)).map((e) => [e.kind, e.gateway_payment_id])).toEqual([
      ["late_review", null],
      ["late_review", second.paymentId],
    ]);
  });

  it("a second charge on an invoice that did not match the order is recorded too", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    sim.setAmountTamper(500);
    await sim.pay(invoiceIdOf(url), "success");
    const second = await sim.pay(invoiceIdOf(url), "success");
    await verify(invoiceIdOf(url));
    sim.setAmountTamper(null);
    expect((await extrasOf(order.id)).map((e) => [e.kind, e.gateway_payment_id])).toEqual([
      ["amount_mismatch", null],
      ["amount_mismatch", second.paymentId],
    ]);
  });
});

describe("refunding the second charge", () => {
  const refund = (extraId: string) => refundExtraPayment({ extraId, adminId: admin.id, reason: "دفعة مكررة" });

  it("targets that PaymentId alone, and the order and its payment stay as they were", async () => {
    const { order, extra, second } = await flagged();
    const before = await moneySnapshot(order.id);
    await expect(refund(extra.id)).resolves.toEqual({ state: "refund_requested" });
    expect(refundCalls()).toMatchObject([{ Key: second, KeyType: "PaymentId" }]);
    expect(await moneySnapshot(order.id)).toBe(before);
    expect((await paymentRows(order.id))[0].status).toBe("paid");
  });

  it("the gateway's completed event closes that record without touching the payment row", async () => {
    const { order, invoice, extra } = await flagged();
    await refund(extra.id);
    const [{ gateway_refund_id }] = await extrasOf(order.id);
    const { body, headers } = sim.buildRefundWebhook(invoice, Number(gateway_refund_id), "REFUNDED");
    await handleMyFatoorahWebhook(body, headers);
    expect((await extrasOf(order.id))[0].state).toBe("refunded");
    expect((await paymentRows(order.id))[0].status).toBe("paid");
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("an event that beats the MakeRefund reply is matched through our external identifier", async () => {
    const { order, invoice, extra } = await flagged();
    let during = "";
    sim.setBeforeRefundReply(async (r) => {
      const { body, headers } = sim.buildRefundWebhook(invoice, r.RefundId, "CANCELED");
      await handleMyFatoorahWebhook(body, headers);
      during = (await extrasOf(order.id))[0].state;
    });
    await refund(extra.id);
    expect(during).toBe("refund_failed");
  });

  it("with two extra charges, an event closes only the one it belongs to", async () => {
    const { order, invoice } = await bothTabsPaid();
    await sim.pay(invoice, "success");
    await verify(invoice);
    const [a, b] = await extrasOf(order.id);
    await refund(a.id);
    const [{ gateway_refund_id }] = (await extrasOf(order.id)).filter((e) => e.id === a.id);
    const { body, headers } = sim.buildRefundWebhook(invoice, Number(gateway_refund_id), "REFUNDED");
    await handleMyFatoorahWebhook(body, headers);
    const after = await extrasOf(order.id);
    expect(after.find((e) => e.id === a.id)!.state).toBe("refunded");
    expect(after.find((e) => e.id === b.id)!.state).toBe("open");
  });

  it("the order itself can still be refunded by the payment that completed it", async () => {
    const { order, first } = await flagged();
    await expect(requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" })).resolves.toEqual({ state: "requested" });
    expect(refundCalls()).toMatchObject([{ Key: first, KeyType: "PaymentId" }]);
  });

  it("a portal refund on such an invoice cannot be told apart, so it alerts and takes nothing away", async () => {
    const { user, product, order, invoice } = await flagged();
    const portal = sim.portalRefund(invoice, order.total_fils);
    const { body, headers } = sim.buildRefundWebhook(invoice, portal.RefundId, "REFUNDED");
    await expect(handleMyFatoorahWebhook(body, headers)).resolves.toMatchObject({ status: 200 });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    expect((await extrasOf(order.id))[0].state).toBe("open");
    expect(await alertReasons(order.id)).toEqual(["extra_ambiguous"]);
  });

  it("once the second charge is settled, a portal refund is applied to the order as usual", async () => {
    const { order, invoice, extra } = await flagged();
    await sql`update payment_extras set state = 'dismissed' where id = ${extra.id}`;
    const portal = sim.portalRefund(invoice, order.total_fils);
    const { body, headers } = sim.buildRefundWebhook(invoice, portal.RefundId, "REFUNDED");
    await handleMyFatoorahWebhook(body, headers);
    expect((await orderRow(order.id)).status).toBe("refunded");
  });
});

describe("a payment on an open order for something the student already owns", () => {
  /** طلب أُلغي وبقي رابطه قابلًا للدفع، وطلب ثانٍ للمنتج نفسه */
  async function twoOrdersOneProduct() {
    const user = await createUser();
    const product = await createProduct({ priceFils: 3000 });
    const cancelled = await createOrder({ user, productIds: [product.id], isTest: true });
    const a = await startPayment(cancelled, null);
    await sql.begin((tx) => closeOrder(tx, { orderId: cancelled.id, reason: "student_cancelled", actorId: null }));
    const open: OrderRow = await createOrder({ user, productIds: [product.id], isTest: true });
    const b = await startPayment(open, null);
    return { user, product, cancelled, open, invoiceA: invoiceIdOf(a.url), invoiceB: invoiceIdOf(b.url) };
  }
  const earningsOf = (orderId: string) => sql`select id from teacher_earnings where order_id = ${orderId}`;

  it("does not complete it: no second earnings, and the money is flagged for return", async () => {
    const { user, product, cancelled, open, invoiceA, invoiceB } = await twoOrdersOneProduct();
    await sim.pay(invoiceA, "success");
    await expect(verify(invoiceA)).resolves.toMatchObject({ state: "paid", changed: true });
    await sim.pay(invoiceB, "success");
    await expect(verify(invoiceB)).resolves.toEqual({ state: "flagged", orderId: open.id, kind: "late_review" });

    expect(await orderRow(open.id)).toMatchObject({ status: "cancelled", closed_reason: "already_owned" });
    expect(await earningsOf(open.id)).toHaveLength(0);
    expect((await extrasOf(open.id)).map((e) => e.kind)).toEqual(["late_review"]);
    const [{ details }] = await sql<{ details: { blockers: string[] } }[]>`select details from payment_extras where order_id = ${open.id}`;
    expect(details.blockers).toEqual([`owned:${product.id}`]);
    expect((await orderRow(cancelled.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it("a payment on a student's other product is not affected", async () => {
    const { order, invoice } = await (async () => {
      const made = await newOrder();
      const other = await createProduct({ priceFils: 2000 });
      const ownedOrder = await createOrder({ user: made.user, productIds: [other.id], isTest: true });
      const paid = await startPayment(ownedOrder, null);
      await sim.pay(invoiceIdOf(paid.url), "success");
      await verify(invoiceIdOf(paid.url));
      const { url } = await startPayment(made.order, null);
      return { order: made.order, invoice: invoiceIdOf(url) };
    })();
    await sim.pay(invoice, "success");
    await expect(verify(invoice)).resolves.toMatchObject({ state: "paid", changed: true });
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("two payments for one student wait their turn, so the second sees what the first granted", async () => {
    const { user, cancelled, invoiceA } = await twoOrdersOneProduct();
    await sim.pay(invoiceA, "success");
    const { verifying, whileHeld } = await asOtherServer(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`payment-owner:${user.id}`}, 0))`;
      const verifying = verify(invoiceA);
      await pause();
      return { verifying, whileHeld: (await orderRow(cancelled.id)).status };
    });
    expect(whileHeld).toBe("cancelled");
    await expect(verifying).resolves.toMatchObject({ state: "paid", changed: true });
  });
});
