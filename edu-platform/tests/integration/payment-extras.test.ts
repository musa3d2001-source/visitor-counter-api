import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOrder, createOrder, markOrderPaid, type OrderRow } from "@/server/commerce/orders";
import { handleMyFatoorahWebhook, refundExtraPayment, requestOrderRefund, resetPaymentMethodsCache, verifyAndApplyPayment, ExtraPaymentRefundError } from "@/server/payments/service";
import { dismissExtraPayment, extraPaymentsNeedingOwnerCount, openExtraPayments } from "@/server/payments/extras";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { asOtherServer, auditCount, expireLocally, invoiceIdOf, moneySnapshot, newOrder, orderRow, pause, paymentRows, startPayment } from "../helpers/payment-flow";
import { activeEntitlements, createCoupon, createProduct, createUser, type TestProduct } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@/server/auth/guards", async (original) => ({
  ...(await original<typeof import("@/server/auth/guards")>()),
  assertAdmin: async () => {
    if (!ctx.admin) throw new Error("denied");
    return ctx.admin;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { dismissExtraPaymentAction, recheckExtraPaymentAction, refundExtraPaymentAction } = await import("@/app/admin/orders/actions");

let sim: Simulator;
let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
  admin = await createUser({ role: "admin" });
  ctx.admin = admin;
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
  sim.setDisplayCurrency(null);
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

type ExtraRow = {
  id: string;
  kind: string;
  state: string;
  amount_fils: number;
  details: { blockers?: string[] };
  refund_attempt: number;
  gateway_refund_id: string | null;
  refund_error: string | null;
};
const extraOf = async (orderId: string) => (await sql<ExtraRow[]>`select * from payment_extras where order_id = ${orderId}`)[0];
const refundCalls = () => sim.state.requests.filter((r) => r.path === "/v2/MakeRefund");
const verify = (invoice: number) => verifyAndApplyPayment({ invoiceId: String(invoice) });

/** طلب بفاتورتين مدفوعتين لدى البوابة: الأولى أكملته، والثانية لم تُطبق بعد */
async function paidTwice() {
  const made = await newOrder();
  const first = await startPayment(made.order, null);
  await expireLocally(invoiceIdOf(first.url));
  const second = await startPayment(await orderRow(made.order.id), null);
  await sim.pay(invoiceIdOf(first.url), "success");
  await verify(invoiceIdOf(first.url));
  await sim.pay(invoiceIdOf(second.url), "success");
  return { ...made, first: invoiceIdOf(first.url), second: invoiceIdOf(second.url) };
}

/** طلب فيه دفعة زائدة مسجلة وجاهزة للاسترداد */
async function flaggedOrder() {
  const made = await paidTwice();
  await verify(made.second);
  const extra = await extraOf(made.order.id);
  return { ...made, extra };
}

/** طلب مغلق وفاتورته مدفوعة لدى البوابة ولم تُطبق بعد */
async function closedAndPaid(reason: "expired" | "student_cancelled" | "already_owned" | null = "expired", price = 3000) {
  const made = await newOrder(price);
  const { url } = await startPayment(made.order, null);
  const invoice = invoiceIdOf(url);
  if (reason) await sql.begin((tx) => closeOrder(tx, { orderId: made.order.id, reason, actorId: null }));
  else await sql`update orders set status = 'cancelled' where id = ${made.order.id}`;
  await sim.pay(invoice, "success");
  return { ...made, invoice };
}

describe("a second paid invoice on a paid order", () => {
  it("is recorded and flagged, and the order, access and earnings do not change", async () => {
    const { order, second } = await paidTwice();
    const before = await moneySnapshot(order.id);
    await expect(verify(second)).resolves.toEqual({ state: "flagged", orderId: order.id, kind: "duplicate" });
    expect(await moneySnapshot(order.id)).toBe(before);
    expect(await extraOf(order.id)).toMatchObject({ kind: "duplicate", state: "open", amount_fils: order.total_fils });
    const statuses = (await paymentRows(order.id)).map((p) => p.status);
    expect(statuses).toEqual(["paid", "paid"]);
  });

  it("checking it again changes nothing and writes one audit entry", async () => {
    const { order, second } = await paidTwice();
    await verify(second);
    const { id } = await extraOf(order.id);
    await expect(verify(second)).resolves.toEqual({ state: "flagged", orderId: order.id, kind: "duplicate" });
    expect(await sql`select 1 from payment_extras where order_id = ${order.id}`).toHaveLength(1);
    expect(await auditCount("payment.extra_recorded", id)).toBe(1);
  });

  it("the invoice that completed the order stays the plain paid one", async () => {
    const { order, first, second } = await paidTwice();
    await verify(second);
    await expect(verify(first)).resolves.toEqual({ state: "paid", orderId: order.id, changed: false });
  });

  it("two checks of the same paid invoice at once grant once", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    await sim.pay(invoiceIdOf(url), "success");
    const results = await Promise.all([verify(invoiceIdOf(url)), verify(invoiceIdOf(url))]);
    expect(results.filter((r) => r.state === "paid" && r.changed)).toHaveLength(1);
    expect(await sql`select 1 from payment_extras where order_id = ${order.id}`).toHaveLength(0);
  });

  it("is reported to the owner through the webhook path too", async () => {
    const { order, second } = await paidTwice();
    const paymentId = sim.state.invoices.get(second)!.Transactions[0].PaymentId;
    const { body, headers } = sim.buildWebhook(second, paymentId);
    await expect(handleMyFatoorahWebhook(body, headers)).resolves.toMatchObject({ status: 200, result: "flagged duplicate" });
    expect((await openExtraPayments()).some((e) => e.order_id === order.id && e.kind === "duplicate")).toBe(true);
  });

  it("refunding the order touches the payment that completed it, not the extra one", async () => {
    const { order, second } = await paidTwice();
    await verify(second);
    const [firstRow, secondRow] = await paymentRows(order.id);
    await expect(requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" })).resolves.toEqual({ state: "requested" });
    const [refund] = await sql<{ payment_id: string }[]>`select payment_id from refunds where order_id = ${order.id}`;
    expect(refund.payment_id).toBe(firstRow.id);
    const rows = await paymentRows(order.id);
    expect(rows.find((r) => r.id === firstRow.id)!.status).toBe("refunded");
    expect(rows.find((r) => r.id === secondRow.id)!.status).toBe("paid");
  });
});

describe("a payment arriving on a refunded order", () => {
  it("is flagged, and the order stays refunded with no access", async () => {
    const { user, order, product, second } = await paidTwice();
    await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
    const before = await moneySnapshot(order.id);
    await expect(verify(second)).resolves.toEqual({ state: "flagged", orderId: order.id, kind: "after_refund" });
    expect(await moneySnapshot(order.id)).toBe(before);
    expect((await orderRow(order.id)).status).toBe("refunded");
    expect(await activeEntitlements(user.id)).not.toContain(product.id);
  });

  it("the refunded payment itself stays refunded even though the gateway still reports Paid", async () => {
    const { order, first } = await paidTwice();
    await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
    await expect(verify(first)).resolves.toEqual({ state: "refunded", orderId: order.id });
    expect((await paymentRows(order.id))[0].status).toBe("refunded");
    expect(await sql`select 1 from payment_extras where order_id = ${order.id}`).toHaveLength(0);
  });

  it("the webhook answers 200, so the gateway stops retrying", async () => {
    const { order, second } = await paidTwice();
    await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
    const paymentId = sim.state.invoices.get(second)!.Transactions[0].PaymentId;
    const { body, headers } = sim.buildWebhook(second, paymentId);
    await expect(handleMyFatoorahWebhook(body, headers)).resolves.toMatchObject({ status: 200, result: "flagged after_refund" });
  });
});

describe("a real payment arriving on a closed order", () => {
  it.each(["expired", "student_cancelled"] as const)("completes the purchase when closed as %s and still valid", async (reason) => {
    const { user, order, product, invoice } = await closedAndPaid(reason);
    await expect(verify(invoice)).resolves.toEqual({ state: "paid", orderId: order.id, changed: true });
    expect(await orderRow(order.id)).toMatchObject({ status: "paid", closed_at: null, closed_reason: null });
    expect(await activeEntitlements(user.id)).toContain(product.id);
    expect(await auditCount("order.paid_after_close", order.id)).toBe(1);
    expect(await extraOf(order.id)).toBeUndefined();
  });

  describe("when only the webhook reports it", () => {
    const deliver = (invoice: number) => {
      const paymentId = sim.state.invoices.get(invoice)!.Transactions[0].PaymentId;
      const { body, headers } = sim.buildWebhook(invoice, paymentId);
      return handleMyFatoorahWebhook(body, headers);
    };

    it.each(["expired", "student_cancelled"] as const)("completes an order closed as %s", async (reason) => {
      const { user, order, product, invoice } = await closedAndPaid(reason);
      await expect(deliver(invoice)).resolves.toMatchObject({ status: 200 });
      expect(await orderRow(order.id)).toMatchObject({ status: "paid", closed_at: null, closed_reason: null });
      expect(await activeEntitlements(user.id)).toContain(product.id);
      expect(await auditCount("order.paid_after_close", order.id)).toBe(1);
      expect(await extraOf(order.id)).toBeUndefined();
    });

    it.each(["expired", "student_cancelled"] as const)("records a charge it cannot complete on an order closed as %s", async (reason) => {
      const { user, order, product, invoice } = await closedAndPaid(reason);
      await sql`update products set price_fils = 9000 where id = ${product.id}`;
      await expect(deliver(invoice)).resolves.toMatchObject({ status: 200, result: "flagged late_review" });
      expect((await orderRow(order.id)).status).toBe("cancelled");
      expect(await activeEntitlements(user.id)).not.toContain(product.id);
      expect((await extraOf(order.id)).kind).toBe("late_review");
    });

    it("a repeated delivery changes nothing", async () => {
      const { order, invoice } = await closedAndPaid();
      await deliver(invoice);
      const before = await moneySnapshot(order.id);
      await expect(deliver(invoice)).resolves.toMatchObject({ status: 200 });
      expect(await moneySnapshot(order.id)).toBe(before);
      expect(await auditCount("order.paid_after_close", order.id)).toBe(1);
    });
  });

  it("a lower price today does not block it: the student paid in full", async () => {
    const { order, product, invoice } = await closedAndPaid();
    await sql`update products set price_fils = 1000 where id = ${product.id}`;
    await expect(verify(invoice)).resolves.toMatchObject({ state: "paid", changed: true });
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  async function expectLateReview(order: OrderRow, invoice: number, blocker: RegExp) {
    const before = await moneySnapshot(order.id);
    await expect(verify(invoice)).resolves.toEqual({ state: "flagged", orderId: order.id, kind: "late_review" });
    expect(await moneySnapshot(order.id)).toBe(before);
    const extra = await extraOf(order.id);
    expect(extra.kind).toBe("late_review");
    expect(extra.details.blockers!.join(",")).toMatch(blocker);
    expect((await orderRow(order.id)).status).toBe("cancelled");
    expect((await paymentRows(order.id))[0].status).toBe("paid");
  }

  it("a higher price today sends it to the owner", async () => {
    const { order, product, invoice } = await closedAndPaid();
    await sql`update products set price_fils = 9000 where id = ${product.id}`;
    await expectLateReview(order, invoice, /price:/);
  });

  it("an unpublished product sends it to the owner", async () => {
    const { order, product, invoice } = await closedAndPaid();
    await sql`update products set status = 'hidden' where id = ${product.id}`;
    await expectLateReview(order, invoice, /unavailable:/);
  });

  it("access that already ended sends it to the owner", async () => {
    const { order, product, invoice } = await closedAndPaid();
    await sql`update products set access_mode = 'until_date', access_until = now() - interval '1 day' where id = ${product.id}`;
    await expectLateReview(order, invoice, /access_ended:/);
  });

  it("a product the student now owns another way sends it to the owner", async () => {
    const { user, order, product, invoice } = await closedAndPaid();
    const other = await createOrder({ user, productIds: [product.id], isTest: true });
    await sql.begin((tx) => markOrderPaid(tx, { orderId: other.id, paidAmountFils: other.total_fils }));
    await expectLateReview(order, invoice, /owned:/);
  });

  it("an order closed as already owned sends it to the owner", async () => {
    const { order, invoice } = await closedAndPaid("already_owned");
    await expectLateReview(order, invoice, /closed_reason:already_owned/);
  });

  it("a cancellation with no recorded reason, such as the test purge, sends it to the owner", async () => {
    const { order, invoice } = await closedAndPaid(null);
    await expectLateReview(order, invoice, /closed_reason:none/);
  });

  it("markOrderPaid alone refuses a closed order: only the checked path may complete it", async () => {
    const { order } = await newOrder();
    await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason: "expired", actorId: null }));
    await expect(sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }))).rejects.toThrow("ORDER_CLOSED");
  });

  it("markOrderPaid still refuses a refunded order", async () => {
    const { order } = await newOrder();
    await sql`update orders set status = 'refunded' where id = ${order.id}`;
    await expect(sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }))).rejects.toThrow("ORDER_ALREADY_REFUNDED");
  });

  it("a coupon valid at order time is not re-judged: the student paid what the order said", async () => {
    const user = await createUser();
    const product = await createProduct({ priceFils: 3000 });
    const coupon = await createCoupon({ kind: "fixed", value: 1000 });
    const order = await createOrder({ user, productIds: [product.id], couponCode: coupon.code, isTest: true });
    expect(order.total_fils).toBe(2000);
    const { url } = await startPayment(order, null);
    await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason: "expired", actorId: null }));
    await sql`update coupons set is_active = false where id = ${coupon.id}`;
    await sim.pay(invoiceIdOf(url), "success");
    await expect(verify(invoiceIdOf(url))).resolves.toMatchObject({ state: "paid", changed: true });
    expect(await activeEntitlements(user.id)).toContain(product.id);
  });
});

describe("an amount that does not match the order", () => {
  it("paid with the wrong amount: recorded for the owner, and the order is not completed", async () => {
    const { user, order, product } = await newOrder();
    const { url } = await startPayment(order, null);
    await sim.pay(invoiceIdOf(url), "success");
    sim.setAmountTamper(500);
    await expect(verify(invoiceIdOf(url))).resolves.toEqual({ state: "invalid", error: "المبلغ لا يطابق الطلب" });
    expect(await extraOf(order.id)).toMatchObject({ kind: "amount_mismatch", amount_fils: 3500 });
    expect((await orderRow(order.id)).status).toBe("pending");
    expect((await paymentRows(order.id))[0].status).toBe("pending");
    expect(await activeEntitlements(user.id)).not.toContain(product.id);
  });

  it("checking the same wrong amount again records it once", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    await sim.pay(invoiceIdOf(url), "success");
    sim.setAmountTamper(500);
    await verify(invoiceIdOf(url));
    await expect(verify(invoiceIdOf(url))).resolves.toMatchObject({ state: "invalid" });
    const rows = await sql<{ id: string }[]>`select id from payment_extras where order_id = ${order.id}`;
    expect(rows).toHaveLength(1);
    expect(await auditCount("payment.extra_recorded", rows[0].id)).toBe(1);
  });

  it("paid in another currency is recorded as well", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    await sim.pay(invoiceIdOf(url), "success");
    sim.setDisplayCurrency("USD");
    await verify(invoiceIdOf(url));
    expect(await extraOf(order.id)).toMatchObject({ kind: "amount_mismatch", amount_fils: order.total_fils });
  });

  it("not paid: nothing to record", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, null);
    sim.setAmountTamper(500);
    await verify(invoiceIdOf(url));
    expect(await extraOf(order.id)).toBeUndefined();
  });
});

describe("refunding one extra payment", () => {
  it("sends the right request and leaves the order, access and earnings alone", async () => {
    const { order, second, extra } = await flaggedOrder();
    const before = await moneySnapshot(order.id);
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toEqual({ state: "refund_requested" });
    expect(await moneySnapshot(order.id)).toBe(before);

    const [call] = refundCalls();
    const paymentId = sim.state.invoices.get(second)!.Transactions[0].PaymentId;
    expect(call.body).toMatchObject({ Key: paymentId, KeyType: "PaymentId", Amount: order.total_fils / 1000, ExternalIdentifier: `extra:${extra.id}`, Comment: "دفعة مكررة" });
    expect(call.idempotencyKey).toBe(`extra-${extra.id}-1`);
    const after = await extraOf(order.id);
    expect(after.state).toBe("refund_requested");
    expect(after.gateway_refund_id).toBeTruthy();
    expect(await auditCount("payment_extra.refund_requested", extra.id)).toBe(1);
  });

  it("a definite refusal can be retried with a new key", async () => {
    const { order, extra } = await flaggedOrder();
    sim.state.invoices.get(Number((await paymentRows(order.id))[1].gateway_invoice_id))!.InvoiceStatus = "Pending";
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toMatchObject({ state: "refund_failed" });
    expect((await extraOf(order.id)).refund_error).toBeTruthy();

    sim.state.invoices.get(Number((await paymentRows(order.id))[1].gateway_invoice_id))!.InvoiceStatus = "Paid";
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toEqual({ state: "refund_requested" });
    expect(refundCalls().map((c) => c.idempotencyKey)).toEqual([`extra-${extra.id}-1`, `extra-${extra.id}-2`]);
  });

  it("a lost reply is never refunded twice: the retry asks first and finds it", async () => {
    const { order, second, extra } = await flaggedOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toMatchObject({ state: "refund_unknown" });
    expect(sim.state.invoices.get(second)!.Refunds).toHaveLength(1);
    expect((await extraOf(order.id)).state).toBe("refund_unknown");

    sim.clearFaults();
    sim.state.requests.length = 0;
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toEqual({ state: "refund_requested" });
    expect(refundCalls()).toHaveLength(0);
    expect(sim.state.requests.some((r) => r.path === "/v2/GetRefundStatus")).toBe(true);
    expect(sim.state.invoices.get(second)!.Refunds).toHaveLength(1);
    expect((await extraOf(order.id)).gateway_refund_id).toBe(String(sim.state.invoices.get(second)!.Refunds[0].RefundId));
  });

  it("a request that never arrived is resent with the same key", async () => {
    const { second, extra } = await flaggedOrder();
    sim.setFault("/v2/MakeRefund", "down");
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toMatchObject({ state: "refund_unknown" });
    expect(sim.state.invoices.get(second)!.Refunds).toHaveLength(0);

    sim.clearFaults();
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toEqual({ state: "refund_requested" });
    const keys = refundCalls().map((c) => c.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
  });

  it("if the check cannot be made, nothing is sent", async () => {
    const { second, extra } = await flaggedOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    sim.clearFaults();
    sim.setFault("/v2/GetRefundStatus", "down");
    sim.state.requests.length = 0;
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toMatchObject({ state: "refund_unknown" });
    expect(refundCalls()).toHaveLength(0);
    expect(sim.state.invoices.get(second)!.Refunds).toHaveLength(1);
  });

  it("a refund the gateway already completed is closed by the check", async () => {
    const { order, second, extra } = await flaggedOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    sim.clearFaults();
    sim.setRefundStatus(sim.state.invoices.get(second)!.Refunds[0].RefundId, "Refunded");
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toEqual({ state: "refunded" });
    expect((await extraOf(order.id)).state).toBe("refunded");
    expect((await paymentRows(order.id))[1].status).toBe("refunded");
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("a canceled earlier refund does not stop a new one", async () => {
    const { second, extra } = await flaggedOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    sim.clearFaults();
    sim.state.invoices.get(second)!.Refunds[0].Status = "Canceled";
    sim.state.invoices.get(second)!.Refunds[0].AmountFils = 0;
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toEqual({ state: "refund_requested" });
  });

  it("two presses at once send one request", async () => {
    const { second, extra } = await flaggedOrder();
    sim.setDelay("/v2/MakeRefund", 200);
    const results = await Promise.allSettled([
      refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" }),
      refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" }),
    ]);
    expect(refundCalls()).toHaveLength(1);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.some((r) => r.status === "rejected" && r.reason instanceof ExtraPaymentRefundError)).toBe(true);
    expect(sim.state.invoices.get(second)!.Refunds).toHaveLength(1);
  });

  it("waits for another server's claim on the row, then refuses instead of sending again", async () => {
    const { extra } = await flaggedOrder();
    const { refunding } = await asOtherServer(async (tx) => {
      await tx`select id from payment_extras where id = ${extra.id} for update`;
      const refunding = refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" }).catch((e: unknown) => e);
      await pause();
      await tx`update payment_extras set state = 'refund_sending', refund_attempt = 1, refund_claimed_at = now() where id = ${extra.id}`;
      return { refunding };
    });
    expect(await refunding).toBeInstanceOf(ExtraPaymentRefundError);
    expect(refundCalls()).toHaveLength(0);
  });

  it("a send interrupted long ago can be retried, one in progress cannot", async () => {
    const { extra } = await flaggedOrder();
    await sql`update payment_extras set state = 'refund_sending', refund_attempt = 1, refund_claimed_at = now() where id = ${extra.id}`;
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).rejects.toBeInstanceOf(ExtraPaymentRefundError);
    await sql`update payment_extras set refund_claimed_at = now() - interval '3 minutes' where id = ${extra.id}`;
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toEqual({ state: "refund_requested" });
  });

  it("a refund already requested cannot be sent again", async () => {
    const { extra } = await flaggedOrder();
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).rejects.toBeInstanceOf(ExtraPaymentRefundError);
    expect(refundCalls()).toHaveLength(1);
  });

  it("a payment from another mode is refused", async () => {
    const { order, extra } = await flaggedOrder();
    await sql`update payments set environment = 'live' where order_id = ${order.id}`;
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).rejects.toBeInstanceOf(ExtraPaymentRefundError);
    expect(refundCalls()).toHaveLength(0);
  });
});

describe("the gateway's refund events", () => {
  const send = async (invoice: number, status: "REFUNDED" | "CANCELED") => {
    const refund = sim.state.invoices.get(invoice)!.Refunds[0];
    const { body, headers } = sim.buildRefundWebhook(invoice, refund.RefundId, status);
    return handleMyFatoorahWebhook(body, headers);
  };

  it("REFUNDED closes it and marks the payment, without touching the order", async () => {
    const { order, second, extra } = await flaggedOrder();
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    const before = await moneySnapshot(order.id);
    await expect(send(second, "REFUNDED")).resolves.toMatchObject({ status: 200, result: "refund REFUNDED" });
    expect(await moneySnapshot(order.id)).toBe(before);
    expect((await extraOf(order.id)).state).toBe("refunded");
    expect((await paymentRows(order.id))[1].status).toBe("refunded");
    expect(await auditCount("payment_extra.refund_completed", extra.id)).toBe(1);
  });

  it("CANCELED lets the owner try again", async () => {
    const { order, second, extra } = await flaggedOrder();
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    await send(second, "CANCELED");
    expect(await extraOf(order.id)).toMatchObject({ state: "refund_failed", refund_error: expect.stringContaining("ألغت") });
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" })).resolves.toEqual({ state: "refund_requested" });
  });

  it("a partial refund made from the portal does not close a full extra payment", async () => {
    const { order, second } = await flaggedOrder();
    const portal = sim.portalRefund(second, 1000);
    const { body, headers } = sim.buildRefundWebhook(second, portal.RefundId, "REFUNDED");
    await handleMyFatoorahWebhook(body, headers);
    expect(await extraOf(order.id)).toMatchObject({ state: "open", gateway_refund_id: null });
    expect((await sql`select status from payments where gateway_invoice_id = ${String(second)}`)[0].status).not.toBe("refunded");
    expect((await sql<{ details: { reason: string } }[]>`select details from payment_alerts where order_id = ${order.id}`).map((a) => a.details.reason)).toEqual(["extra_mismatch"]);
  });

  it("a full refund made from the portal closes it", async () => {
    const { order, second } = await flaggedOrder();
    const portal = sim.portalRefund(second, order.total_fils);
    const { body, headers } = sim.buildRefundWebhook(second, portal.RefundId, "REFUNDED");
    await handleMyFatoorahWebhook(body, headers);
    expect((await extraOf(order.id)).state).toBe("refunded");
  });

  it("a forged refund event is refused", async () => {
    const { order, second, extra } = await flaggedOrder();
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    const refund = sim.state.invoices.get(second)!.Refunds[0];
    const { body, headers } = sim.buildRefundWebhook(second, refund.RefundId, "REFUNDED");
    headers.set("MyFatoorah-Signature", "AAAA");
    await expect(handleMyFatoorahWebhook(body, headers)).resolves.toMatchObject({ status: 401 });
    expect((await extraOf(order.id)).state).toBe("refund_requested");
  });
});

describe("a refund event that beats the MakeRefund reply", () => {
  const eventDuringSend = (invoice: number, status: "REFUNDED" | "CANCELED") =>
    sim.setBeforeRefundReply(async (r) => {
      const { body, headers } = sim.buildRefundWebhook(invoice, r.RefundId, status);
      await handleMyFatoorahWebhook(body, headers);
    });
  const send = (extraId: string) => refundExtraPayment({ extraId, adminId: admin.id, reason: "دفعة مكررة" });

  it("a completed refund is not written back to requested", async () => {
    const { order, second, extra } = await flaggedOrder();
    eventDuringSend(second, "REFUNDED");
    await expect(send(extra.id)).resolves.toEqual({ state: "refunded" });
    expect(await extraOf(order.id)).toMatchObject({ state: "refunded" });
    expect((await openExtraPayments()).map((e) => e.id)).not.toContain(extra.id);
  });

  it("a cancelled refund stays visible as cancelled, and can be sent again", async () => {
    const { order, second, extra } = await flaggedOrder();
    eventDuringSend(second, "CANCELED");
    await expect(send(extra.id)).resolves.toMatchObject({ state: "refund_failed", error: expect.stringContaining("ألغت") });
    expect(await extraOf(order.id)).toMatchObject({ state: "refund_failed" });
    sim.clearFaults();
    await expect(send(extra.id)).resolves.toEqual({ state: "refund_requested" });
  });

  it("the owner's message reports the stored result", async () => {
    const { second, extra } = await flaggedOrder();
    eventDuringSend(second, "REFUNDED");
    const f = new FormData();
    f.set("extraId", extra.id);
    f.set("reason", "دفعة مكررة");
    await expect(refundExtraPaymentAction({}, f)).resolves.toMatchObject({ ok: true, message: expect.stringContaining("مستردة") });
  });
});

describe("re-checking a refund the gateway accepted", () => {
  const form = (extraId: string) => {
    const f = new FormData();
    f.set("extraId", extraId);
    return f;
  };
  async function requested() {
    const made = await flaggedOrder();
    await refundExtraPayment({ extraId: made.extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    const row = await extraOf(made.order.id);
    sim.state.requests.length = 0;
    return { ...made, refundId: Number(row.gateway_refund_id) };
  }

  it("picks up a completed refund whose webhook was lost", async () => {
    const { order, extra, refundId } = await requested();
    const before = await moneySnapshot(order.id);
    sim.setRefundStatus(refundId, "Refunded");
    await expect(recheckExtraPaymentAction({}, form(extra.id))).resolves.toMatchObject({ ok: true, message: expect.stringContaining("تؤكد") });
    expect(await extraOf(order.id)).toMatchObject({ state: "refunded" });
    expect(await moneySnapshot(order.id)).toBe(before);
    expect(refundCalls()).toHaveLength(0);
    expect(await auditCount("payment_extra.refund_rechecked", extra.id)).toBe(1);
  });

  it("picks up a cancellation whose webhook was lost, so the owner can send it again", async () => {
    const { order, extra, refundId } = await requested();
    sim.setRefundStatus(refundId, "Canceled");
    await expect(recheckExtraPaymentAction({}, form(extra.id))).resolves.toMatchObject({ error: expect.stringContaining("ألغت") });
    expect(await extraOf(order.id)).toMatchObject({ state: "refund_failed" });
    await expect(refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "إعادة" })).resolves.toEqual({ state: "refund_requested" });
  });

  it("leaves a refund the gateway is still processing as it is", async () => {
    const { order, extra } = await requested();
    await expect(recheckExtraPaymentAction({}, form(extra.id))).resolves.toMatchObject({ ok: true, message: expect.stringContaining("بانتظار") });
    expect(await extraOf(order.id)).toMatchObject({ state: "refund_requested" });
  });

  it("changes nothing when the gateway cannot be asked", async () => {
    const { order, extra } = await requested();
    sim.setFault("/v2/GetRefundStatus", "error");
    await expect(recheckExtraPaymentAction({}, form(extra.id))).resolves.toMatchObject({ error: expect.stringContaining("ولم يتغير شيء") });
    expect(await extraOf(order.id)).toMatchObject({ state: "refund_requested" });
  });

  it("refuses a record that is not waiting on the gateway", async () => {
    const { extra } = await flaggedOrder();
    await expect(recheckExtraPaymentAction({}, form(extra.id))).resolves.toMatchObject({ error: expect.stringContaining("لا يحتاج") });
  });
});

describe("the owner's queue", () => {
  const form = (values: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(values)) f.set(k, v);
    return f;
  };

  it("brings a refund back after it has waited on the gateway too long", async () => {
    const before = await extraPaymentsNeedingOwnerCount();
    const { order, extra } = await flaggedOrder();
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    expect(await extraPaymentsNeedingOwnerCount()).toBe(before);
    await sql`update payment_extras set refund_requested_at = now() - interval '73 hours' where order_id = ${order.id}`;
    expect(await extraPaymentsNeedingOwnerCount()).toBe(before + 1);
  });

  it("lists what is undecided and counts only what needs a decision", async () => {
    const before = await extraPaymentsNeedingOwnerCount();
    const { order, extra } = await flaggedOrder();
    expect(await extraPaymentsNeedingOwnerCount()).toBe(before + 1);
    expect((await openExtraPayments()).map((e) => e.id)).toContain(extra.id);
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    expect(await extraPaymentsNeedingOwnerCount()).toBe(before);
    expect((await openExtraPayments()).find((e) => e.id === extra.id)).toMatchObject({ order_id: order.id, state: "refund_requested" });
  });

  it("dismissing needs a reason, is audited, and changes nothing else", async () => {
    const { order, extra } = await flaggedOrder();
    const before = await moneySnapshot(order.id);
    await expect(dismissExtraPaymentAction({}, form({ extraId: extra.id, reason: "x" }))).resolves.toMatchObject({ error: expect.stringContaining("٣ أحرف") });
    await expect(dismissExtraPaymentAction({}, form({ extraId: extra.id, reason: "تمت التسوية يدويًا" }))).resolves.toMatchObject({ ok: true });
    expect((await extraOf(order.id)).state).toBe("dismissed");
    expect(await moneySnapshot(order.id)).toBe(before);
    expect(await auditCount("payment_extra.dismissed", extra.id)).toBe(1);
    await expect(dismissExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "مرة ثانية" })).resolves.toBe(false);
  });

  it("a refund already sent cannot be dismissed", async () => {
    const { extra } = await flaggedOrder();
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    await expect(dismissExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "لا حاجة" })).resolves.toBe(false);
  });

  it("the refund action needs a reason and reports the gateway's answer", async () => {
    const { extra } = await flaggedOrder();
    await expect(refundExtraPaymentAction({}, form({ extraId: extra.id, reason: "x" }))).resolves.toMatchObject({ error: expect.stringContaining("٣ أحرف") });
    expect(refundCalls()).toHaveLength(0);
    await expect(refundExtraPaymentAction({}, form({ extraId: extra.id, reason: "دفعة مكررة" }))).resolves.toMatchObject({ ok: true });
  });

  it("only an admin can use the actions", async () => {
    const { extra } = await flaggedOrder();
    ctx.admin = null;
    try {
      const denied = { error: "غير مصرح لك بتنفيذ هذا الإجراء" };
      await expect(refundExtraPaymentAction({}, form({ extraId: extra.id, reason: "دفعة مكررة" }))).resolves.toEqual(denied);
      await expect(dismissExtraPaymentAction({}, form({ extraId: extra.id, reason: "دفعة مكررة" }))).resolves.toEqual(denied);
    } finally {
      ctx.admin = admin;
    }
    expect(refundCalls()).toHaveLength(0);
    expect((await sql<{ state: string }[]>`select state from payment_extras where id = ${extra.id}`)[0].state).toBe("open");
  });
});

describe("the backfill in the migration", () => {
  const migration = readFileSync(resolve(__dirname, "../../db/migrations/0010_payments_hardening.sql"), "utf8");
  const backfill = migration.slice(migration.indexOf("-- BEGIN backfill payment_extras"), migration.indexOf("-- END backfill payment_extras"));

  async function legacyPaidTwice(status: "paid" | "refunded", product: TestProduct, user: Awaited<ReturnType<typeof createUser>>) {
    const order = await createOrder({ user, productIds: [product.id], isTest: true });
    await sql`update orders set status = ${status}, paid_at = now() where id = ${order.id}`;
    const insert = async (when: string, rowStatus: string) =>
      (
        await sql<
          { id: string }[]
        >`insert into payments (order_id, provider, environment, status, amount_fils, paid_at, created_at) values (${order.id}, 'myfatoorah', 'sandbox', ${rowStatus}, ${order.total_fils}, ${when}::timestamptz, ${when}::timestamptz) returning id`
      )[0].id;
    return { order, older: insert("2026-01-01T00:00:00Z", "paid"), newer: insert("2026-01-02T00:00:00Z", "paid") };
  }

  it("flags the later of two paid rows on a paid order and every paid row on a refunded one, once", async () => {
    const user = await createUser();
    const paid = await legacyPaidTwice("paid", await createProduct(), user);
    const refunded = await legacyPaidTwice("refunded", await createProduct(), await createUser());
    const [olderId, newerId] = [await paid.older, await paid.newer];
    const [refundedOlder, refundedNewer] = [await refunded.older, await refunded.newer];

    await sql.unsafe(backfill);
    await sql.unsafe(backfill);

    const onPaid = await sql<{ payment_id: string; kind: string }[]>`select payment_id, kind from payment_extras where order_id = ${paid.order.id}`;
    expect(onPaid).toEqual([{ payment_id: newerId, kind: "duplicate" }]);
    expect(onPaid.map((r) => r.payment_id)).not.toContain(olderId);
    const onRefunded = await sql<{ payment_id: string; kind: string }[]>`select payment_id, kind from payment_extras where order_id = ${refunded.order.id} order by created_at`;
    expect(onRefunded.map((r) => r.payment_id).sort()).toEqual([refundedOlder, refundedNewer].sort());
    expect(new Set(onRefunded.map((r) => r.kind))).toEqual(new Set(["after_refund"]));
  });
});
