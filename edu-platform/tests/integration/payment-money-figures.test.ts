import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOrder, markOrderPaid, OrderError, type OrderRow } from "@/server/commerce/orders";
import { teacherBalance } from "@/server/commerce/earnings";
import { handleMyFatoorahWebhook, paymentsConfig, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { recordMoneyReturned } from "@/server/payments/refunds";
import { openOrderHolds, placeOrderHold, releaseOrderHold } from "@/server/payments/holds";
import { openPaymentAlerts } from "@/server/payments/monitoring";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { auditCount, invoiceIdOf, orderRow, paymentRows, startPayment } from "../helpers/payment-flow";
import { activeEntitlements, createBundle, createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";
import type { SessionUser } from "@/server/auth/session";

let sim: Simulator;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(async () => {
  await setFees(0, 0);
});
afterEach(() => {
  sim.clearFaults();
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

async function setFees(bps: number, fixed: number) {
  for (const [key, value] of [["fee_percent_bps", bps], ["fee_fixed_fils", fixed]] as const) {
    await sql`insert into settings (key, value) values (${key}, ${sql.json(value)}) on conflict (key) do update set value = excluded.value`;
  }
}

const confirm = (order: OrderRow) => sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));
const earnings = (orderId: string) => sql<{ share_bps: number; fee_fils: number; teacher_fils: number; status: string; held_at: Date | null }[]>`select share_bps, fee_fils, teacher_fils, status, held_at from teacher_earnings where order_id = ${orderId}`;
const setShare = (teacher: TestTeacher, bps: number) => sql`update teachers set revenue_share_bps = ${bps} where id = ${teacher.id}`;

async function teacherOrder(priceFils = 10_000, shareBps = 5000) {
  const teacher = await createTeacher({ mode: "self_managed", shareBps });
  const product = await createVideoProduct({ teacherId: teacher.id, priceFils });
  const user = await createUser({ phone: "+96599887766" });
  const order = await createOrder({ user, productIds: [product.id], isTest: false });
  return { teacher, product, user, order };
}

describe("the teacher's share is fixed when the order is created", () => {
  it("a share change between order and payment does not change the earning", async () => {
    const { teacher, order } = await teacherOrder();
    await setShare(teacher, 9000);
    await confirm(order);
    expect(await earnings(order.id)).toMatchObject([{ share_bps: 5000, teacher_fils: 5000 }]);
  });

  it("a fee change between order and payment does not change the earning", async () => {
    await setFees(1000, 100);
    const { order } = await teacherOrder();
    await setFees(5000, 900);
    await confirm(order);
    expect(await earnings(order.id)).toMatchObject([{ fee_fils: 1100, teacher_fils: 4450 }]);
  });

  it("a bundle keeps each teacher's share and split as they were at order time", async () => {
    const a = await createTeacher({ mode: "self_managed", shareBps: 5000 });
    const b = await createTeacher({ mode: "self_managed", shareBps: 2000 });
    const unitA = await createVideoProduct({ teacherId: a.id, priceFils: 6000 });
    const unitB = await createVideoProduct({ teacherId: b.id, priceFils: 4000 });
    const bundle = await createBundle({ items: [unitA.id, unitB.id], priceFils: 10_000 });
    const user = await createUser({ phone: "+96599887766" });
    const order = await createOrder({ user, productIds: [bundle.id], isTest: false });
    const parts = await sql<{ share_bps: number; gross_fils: number }[]>`select share_bps, gross_fils from order_item_parts where order_id = ${order.id} order by gross_fils desc`;
    expect(parts).toEqual([{ share_bps: 5000, gross_fils: 6000 }, { share_bps: 2000, gross_fils: 4000 }]);

    await setShare(a, 10_000);
    await sql`delete from bundle_items where bundle_id = ${bundle.id} and product_id = ${unitB.id}`;
    await sql`update products set price_fils = 1 where id = ${unitA.id}`;
    await confirm(order);
    const rows = await sql<{ teacher_id: string; share_bps: number; teacher_fils: number }[]>`select teacher_id, share_bps, teacher_fils from teacher_earnings where order_id = ${order.id} order by teacher_fils desc`;
    expect(rows).toEqual([{ teacher_id: a.id, share_bps: 5000, teacher_fils: 3000 }, { teacher_id: b.id, share_bps: 2000, teacher_fils: 800 }]);
  });

  it("an order open before the migration still settles, at the share read when it is paid", async () => {
    const { teacher, order } = await teacherOrder();
    await sql`update orders set earnings_snapshot_at = null, fee_bps = null, fee_fixed_fils = null where id = ${order.id}`;
    await sql`update order_items set share_bps = null where order_id = ${order.id}`;
    await setShare(teacher, 7000);
    await confirm(await orderRow(order.id));
    expect(await earnings(order.id)).toMatchObject([{ share_bps: 7000, teacher_fils: 7000 }]);
  });

  it("an open bundle order from before the migration still expands at payment", async () => {
    const a = await createTeacher({ mode: "self_managed", shareBps: 5000 });
    const unit = await createVideoProduct({ teacherId: a.id, priceFils: 6000 });
    const bundle = await createBundle({ items: [unit.id], priceFils: 6000 });
    const user = await createUser({ phone: "+96599887766" });
    const order = await createOrder({ user, productIds: [bundle.id], isTest: false });
    await sql`delete from order_item_parts where order_id = ${order.id}`;
    await sql`update orders set earnings_snapshot_at = null, fee_bps = null, fee_fixed_fils = null where id = ${order.id}`;
    await sql`update order_items set share_bps = null where order_id = ${order.id}`;
    await confirm(await orderRow(order.id));
    expect(await earnings(order.id)).toMatchObject([{ share_bps: 5000, teacher_fils: 3000 }]);
  });

  it("confirming twice still records one line", async () => {
    const { order } = await teacherOrder();
    await confirm(order);
    await confirm(order);
    expect(await earnings(order.id)).toHaveLength(1);
  });
});

describe("a dispute or a partial refund from the gateway", () => {
  async function paidThroughGateway() {
    const made = await teacherOrder();
    await sql`update orders set is_test = true where id = ${made.order.id}`;
    const { url } = await startPayment(await orderRow(made.order.id), null);
    const invoice = invoiceIdOf(url);
    const { paymentId } = await sim.pay(invoice, "success");
    await verifyAndApplyPayment({ paymentId });
    const admin = await createUser({ role: "admin" });
    return { ...made, invoice, paymentId, admin };
  }

  async function dispute(invoice: number, paymentId: string, status: "PENDING" | "RESOLVED" | "LOST" = "PENDING", id = invoice) {
    const { body, headers } = sim.buildDisputeWebhook(invoice, paymentId, { DisputeTransactionId: id, Status: status });
    return handleMyFatoorahWebhook(body, headers);
  }

  it("holds access and earnings, leaves the order paid, and asks the owner for one decision", async () => {
    const { order, user, teacher, invoice, paymentId } = await paidThroughGateway();
    await sql`update teacher_earnings set is_test = false where order_id = ${order.id}`;
    await dispute(invoice, paymentId);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([]);
    const [earning] = await earnings(order.id);
    expect(earning.status).toBe("active");
    expect(earning.held_at).not.toBeNull();
    expect(await openOrderHolds({ orderId: order.id })).toMatchObject([{ kind: "dispute", gateway_status: "PENDING" }]);
    expect(await auditCount("order.held", order.id)).toBe(1);
    await sql`update teacher_earnings set created_at = now() - interval '60 days' where order_id = ${order.id}`;
    // مضت فترة الاسترداد، والمعلق لا يدخل الرصيد المستحق مهما طال
    const balance = await teacherBalance(teacher.id);
    expect(balance.balanceFils).toBe(0);
    expect(balance.heldFils).toBe(5000);
  });

  it("the same event twice holds once", async () => {
    const { order, invoice, paymentId } = await paidThroughGateway();
    await dispute(invoice, paymentId);
    await dispute(invoice, paymentId);
    expect(await sql`select id from order_holds where order_id = ${order.id}`).toHaveLength(1);
    expect(await auditCount("order.held", order.id)).toBe(1);
  });

  it("a gateway status of RESOLVED never releases by itself: the docs do not say who won", async () => {
    const { order, user, invoice, paymentId } = await paidThroughGateway();
    await dispute(invoice, paymentId, "PENDING");
    await dispute(invoice, paymentId, "RESOLVED");
    expect(await activeEntitlements(user.id)).toEqual([]);
    expect(await openOrderHolds({ orderId: order.id })).toMatchObject([{ gateway_status: "RESOLVED" }]);
  });

  it("does nothing to an order that was never paid", async () => {
    const { order } = await teacherOrder();
    await sql`update orders set is_test = true where id = ${order.id}`;
    const { url } = await startPayment(await orderRow(order.id), null);
    const invoice = invoiceIdOf(url);
    const { paymentId } = await sim.pay(invoice, "fail");
    await dispute(invoice, paymentId);
    expect(await sql`select id from order_holds where order_id = ${order.id}`).toHaveLength(0);
    expect(await openPaymentAlerts({ orderId: order.id })).toHaveLength(1);
  });

  it("the owner's release restores exactly what the hold took, and only that", async () => {
    const { order, user, product, invoice, paymentId, admin } = await paidThroughGateway();
    await dispute(invoice, paymentId);
    const [hold] = await openOrderHolds({ orderId: order.id });
    await expect(releaseOrderHold({ holdId: hold.id, adminId: admin.id, reason: "راجعت البوابة" })).resolves.toBe("released");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    expect((await earnings(order.id))[0].held_at).toBeNull();
    expect(await openOrderHolds({ orderId: order.id })).toEqual([]);
    expect(await openPaymentAlerts({ orderId: order.id })).toEqual([]);
    expect(await auditCount("order.hold_released", order.id)).toBe(1);
  });

  it("does not restore an entitlement the owner had already revoked for another reason", async () => {
    const { order, user, invoice, paymentId, admin } = await paidThroughGateway();
    await sql`update entitlements set revoked_at = now() - interval '1 hour', revoked_by = ${admin.id}, revoke_reason = 'إساءة استخدام' where user_id = ${user.id}`;
    await dispute(invoice, paymentId);
    const [hold] = await openOrderHolds({ orderId: order.id });
    await releaseOrderHold({ holdId: hold.id, adminId: admin.id, reason: "راجعت البوابة" });
    expect(await activeEntitlements(user.id)).toEqual([]);
    expect(await sql`select revoke_reason from entitlements where user_id = ${user.id}`).toEqual([{ revoke_reason: "إساءة استخدام" }]);
  });

  it("pressing release twice at once releases once", async () => {
    const { order, invoice, paymentId, admin } = await paidThroughGateway();
    await dispute(invoice, paymentId);
    const [hold] = await openOrderHolds({ orderId: order.id });
    const outcomes = await Promise.all([releaseOrderHold({ holdId: hold.id, adminId: admin.id, reason: "مراجعة" }), releaseOrderHold({ holdId: hold.id, adminId: admin.id, reason: "مراجعة" })]);
    expect(outcomes.sort()).toEqual(["gone", "released"]);
    expect(await auditCount("order.hold_released", order.id)).toBe(1);
  });

  it("a replay after the owner decided does not hold again", async () => {
    const { user, product, order, invoice, paymentId, admin } = await paidThroughGateway();
    await dispute(invoice, paymentId, "PENDING");
    const [hold] = await openOrderHolds({ orderId: order.id });
    await releaseOrderHold({ holdId: hold.id, adminId: admin.id, reason: "مراجعة" });
    await dispute(invoice, paymentId, "PENDING");
    // مفتاح حدث آخر يتخطى منع التكرار في Webhook، فالحماية هنا في التعليق نفسه
    const [{ source_key }] = await sql<{ source_key: string }[]>`select source_key from order_holds where id = ${hold.id}`;
    await expect(sql.begin((tx) => placeOrderHold(tx, { orderId: order.id, paymentId: null, kind: "dispute", sourceKey: source_key, status: "PENDING", amountFils: null }))).resolves.toBe(false);
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it("a dispute that later turns LOST holds again after an earlier release", async () => {
    const { user, order, invoice, paymentId, admin } = await paidThroughGateway();
    await dispute(invoice, paymentId, "PENDING");
    const [hold] = await openOrderHolds({ orderId: order.id });
    await releaseOrderHold({ holdId: hold.id, adminId: admin.id, reason: "مراجعة" });
    await dispute(invoice, paymentId, "LOST");
    expect(await activeEntitlements(user.id)).toEqual([]);
    expect(await openOrderHolds({ orderId: order.id })).toMatchObject([{ gateway_status: "LOST" }]);
  });

  it("recording that the money returned acts as a full refund, without calling the gateway", async () => {
    const { order, user, teacher, invoice, paymentId, admin } = await paidThroughGateway();
    await dispute(invoice, paymentId, "LOST");
    const [hold] = await openOrderHolds({ orderId: order.id });
    sim.state.requests.length = 0;
    await expect(recordMoneyReturned({ holdId: hold.id, adminId: admin.id, reason: "خسرنا النزاع" })).resolves.toBe("recorded");
    expect(sim.state.requests.filter((r) => r.path === "/v2/MakeRefund")).toHaveLength(0);
    expect((await orderRow(order.id)).status).toBe("refunded");
    expect(await activeEntitlements(user.id)).toEqual([]);
    expect((await earnings(order.id))[0].status).toBe("reversed");
    expect((await teacherBalance(teacher.id)).heldFils).toBe(0);
    expect(await sql`select status, source, amount_fils from refunds where order_id = ${order.id}`).toEqual([{ status: "completed", source: "portal", amount_fils: 10_000 }]);
    expect(await openOrderHolds({ orderId: order.id })).toEqual([]);
    await expect(recordMoneyReturned({ holdId: hold.id, adminId: admin.id, reason: "مرة ثانية" })).resolves.toBe("gone");
  });

  it("refuses to record while another refund is under way", async () => {
    const { order, invoice, paymentId, admin } = await paidThroughGateway();
    await dispute(invoice, paymentId);
    const [payment] = await paymentRows(order.id);
    await sql`insert into refunds (order_id, payment_id, amount_fils, reason, status, attempt, created_by) values (${order.id}, ${payment.id}, 10000, 'جار', 'sending', 1, ${admin.id})`;
    const [hold] = await openOrderHolds({ orderId: order.id });
    await expect(recordMoneyReturned({ holdId: hold.id, adminId: admin.id, reason: "مراجعة" })).resolves.toBe("conflict");
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("a buyer under a hold cannot be charged again for the same product", async () => {
    const { user, product, invoice, paymentId } = await paidThroughGateway();
    await dispute(invoice, paymentId);
    await expect(createOrder({ user: user as SessionUser, productIds: [product.id], isTest: true })).rejects.toBeInstanceOf(OrderError);
  });
});

describe("sandbox and live gateway ids", () => {
  async function pendingOrder() {
    const { order } = await teacherOrder();
    await sql`update orders set is_test = true where id = ${order.id}`;
    const { url } = await startPayment(await orderRow(order.id), null);
    return { order, invoice: invoiceIdOf(url) };
  }

  it("the same invoice number can exist in both environments", async () => {
    const { order, invoice } = await pendingOrder();
    const [row] = await paymentRows(order.id);
    await sql`insert into payments (order_id, provider, environment, gateway_invoice_id, status, amount_fils) values (${order.id}, 'myfatoorah', 'live', ${String(invoice)}, 'pending', 10000)`;
    expect((await paymentRows(order.id)).map((p) => p.id)).toContain(row.id);
    expect(await paymentRows(order.id)).toHaveLength(2);
  });

  it("the same invoice number cannot repeat inside one environment", async () => {
    const { order, invoice } = await pendingOrder();
    await expect(sql`insert into payments (order_id, provider, environment, gateway_invoice_id, status, amount_fils) values (${order.id}, 'myfatoorah', 'sandbox', ${String(invoice)}, 'pending', 10000)`).rejects.toMatchObject({ code: "23505" });
  });

  it("a payment confirmed in one environment does not touch a row of the other", async () => {
    const { order, invoice } = await pendingOrder();
    const { paymentId } = await sim.pay(invoice, "success");
    await sql`update payments set environment = 'live' where order_id = ${order.id}`;
    expect(paymentsConfig()).toMatchObject({ environment: "sandbox" });
    expect(await verifyAndApplyPayment({ paymentId })).toEqual({ state: "invalid", error: "فاتورة غير معروفة" });
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("a dispute in one environment does not hold an order of the other", async () => {
    const { order, invoice } = await pendingOrder();
    const { paymentId } = await sim.pay(invoice, "success");
    await verifyAndApplyPayment({ paymentId });
    await sql`update payments set environment = 'live' where order_id = ${order.id}`;
    const { body, headers } = sim.buildDisputeWebhook(invoice, paymentId, { DisputeTransactionId: 777, Status: "PENDING" });
    await handleMyFatoorahWebhook(body, headers);
    expect(await sql`select id from order_holds where order_id = ${order.id}`).toHaveLength(0);
  });

});
