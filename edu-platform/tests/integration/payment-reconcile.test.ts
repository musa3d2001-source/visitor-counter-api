import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeOrder, createOrder, type OrderRow } from "@/server/commerce/orders";
import { refundExtraPayment, requestOrderRefund, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { RECONCILE_BATCH_SIZE, runPaymentReconciliation } from "@/server/payments/reconcile";
import { GET } from "@/app/api/cron/reconcile-payments/route";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { asOtherServer, auditCount, invoiceIdOf, makeStale, newOrder, orderRow, paymentRows, startPayment, statusCalls } from "../helpers/payment-flow";
import { activeEntitlements, createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const SECRET = "cron-secret-0123456789abcdef";

let sim: Simulator;

/** الفواتير المفتوحة من اختبار سابق تُعد ضمن عمل الوظيفة، فنخرجها حتى يقرأ كل اختبار نتيجته فقط */
async function retireOpenWork() {
  await sql`update payments set status = 'paid', expires_at = now() - interval '1 day' where status in ('initiated', 'pending', 'failed', 'expired', 'paid', 'refunded')`;
  await sql`update orders set status = 'refunded' where status in ('pending', 'failed')`;
  await sql`update refunds set status = 'completed' where status = 'requested'`;
  await sql`update payment_extras set state = 'refunded' where state = 'refund_requested'`;
}

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(async () => {
  await retireOpenWork();
  sim.state.requests.length = 0;
  process.env.CRON_SECRET = SECRET;
  resetEnvCache();
});
afterEach(() => {
  sim.clearFaults();
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

const call = (authorization?: string) => GET(new Request("http://localhost/api/cron/reconcile-payments", { headers: authorization === undefined ? {} : { authorization } }));

async function openInvoice(price = 3000) {
  const made = await newOrder(price);
  const { url } = await startPayment(made.order, null);
  return { ...made, invoice: invoiceIdOf(url) };
}

async function manyOpenInvoices(count: number) {
  const user = await createUser();
  const product = await createProduct({ priceFils: 1000, withFile: false, withPreview: false });
  const orders: OrderRow[] = [];
  for (let i = 0; i < count; i++) {
    const order = await createOrder({ user, productIds: [product.id], isTest: true });
    await startPayment(order, null);
    orders.push(order);
  }
  sim.state.requests.length = 0;
  return orders;
}

describe("who may call it", () => {
  it.each([
    ["no header", undefined],
    ["the wrong secret", "Bearer not-the-secret-at-all-xxxxx"],
    ["the right secret without Bearer", SECRET],
    ["the right secret in another scheme", `Basic ${SECRET}`],
    ["a prefix of the secret", `Bearer ${SECRET.slice(0, -1)}`],
    ["an empty bearer", "Bearer "],
  ])("%s gets 401 and does no work", async (_label, header) => {
    await openInvoice();
    sim.state.requests.length = 0;
    const res = await call(header);
    expect(res.status).toBe(401);
    expect(statusCalls(sim)).toBe(0);
  });

  it("the right secret is accepted", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "sandbox", errors: 0 });
  });

  it.each([
    ["unset", undefined, "Bearer undefined"],
    ["empty", "", "Bearer "],
    ["too short to be a secret", "short", "Bearer short"],
  ])("with CRON_SECRET %s it fails closed", async (_label, value, header) => {
    if (value === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = value;
    resetEnvCache();
    expect((await call(header)).status).toBe(401);
    expect((await call()).status).toBe(401);
  });
});

describe("the runbook", () => {
  const readme = readFileSync(resolve(__dirname, "../../README.md"), "utf8");
  // خطوة الاشتراك نفسها: البوابة لا ترسل إلا ما يُحدد فيها
  const subscribeStep = readme.split("\n").find((line) => line.trim().startsWith("- فعّل الأحداث")) ?? "";

  it.each(["Payment Status Changed", "Refund Status Changed", "Dispute Status Changed"])("tells the owner to subscribe to %s", (event) => {
    expect(subscribeStep).toContain(`**${event}**`);
  });

  it("gives the plan decision and the schedule that works on Hobby", () => {
    expect(readme).toContain("قرار قبل الدمج");
    expect(readme).toContain("`0 0 * * *`");
  });
});

describe("vercel.json", () => {
  const config = JSON.parse(readFileSync(resolve(__dirname, "../../vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };

  it("declares the job on a schedule Vercel Pro accepts", () => {
    expect(config.crons).toEqual([{ path: "/api/cron/reconcile-payments", schedule: "*/15 * * * *" }]);
  });

  it("points at a route that exists", () => {
    expect(existsSync(resolve(__dirname, `../../src/app${config.crons[0].path}/route.ts`))).toBe(true);
  });
});

describe("re-checking open invoices", () => {
  it("catches a payment whose webhook never came", async () => {
    const { user, order, product, invoice } = await openInvoice();
    await sim.pay(invoice, "success");
    const report = await runPaymentReconciliation();
    expect(report).toMatchObject({ claimed: 1, checked: 1, paid: 1, errors: 0 });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toContain(product.id);
  });

  it("checks a failed order's invoices too", async () => {
    const { order, invoice } = await openInvoice();
    await sql`update orders set status = 'failed' where id = ${order.id}`;
    await sql`update payments set status = 'failed' where order_id = ${order.id}`;
    await sim.pay(invoice, "success");
    await runPaymentReconciliation();
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("works in small batches", async () => {
    await manyOpenInvoices(RECONCILE_BATCH_SIZE + 3);
    const first = await runPaymentReconciliation();
    expect(first.claimed).toBe(RECONCILE_BATCH_SIZE);
    expect(statusCalls(sim)).toBe(RECONCILE_BATCH_SIZE);
    const second = await runPaymentReconciliation();
    expect(second.claimed).toBe(3);
  });

  it("two runs at once never ask about the same invoice twice", async () => {
    await manyOpenInvoices(12);
    const [a, b] = await Promise.all([runPaymentReconciliation(), runPaymentReconciliation()]);
    expect(a.claimed + b.claimed).toBe(12);
    const keys = sim.state.requests.filter((r) => r.path === "/v2/GetPaymentStatus").map((r) => (r.body as { Key: string }).Key);
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
  });

  it("skips a row another run holds instead of waiting for it", async () => {
    const [held, free] = await manyOpenInvoices(2);
    const { report } = await asOtherServer(async (tx) => {
      await tx`select id from payments where order_id = ${held.id} for update`;
      const report = await Promise.race([runPaymentReconciliation(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("the job waited on a locked row")), 3000))]);
      return { report };
    });
    expect(report).toMatchObject({ claimed: 1 });
    expect((await paymentRows(held.id))[0].last_checked_at).toBeNull();
    expect((await paymentRows(free.id))[0].last_checked_at).not.toBeNull();
  });

  it("running again straight away does nothing", async () => {
    await openInvoice();
    await runPaymentReconciliation();
    sim.state.requests.length = 0;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 0, checked: 0 });
    expect(statusCalls(sim)).toBe(0);
  });

  it("a claim that got no answer waits for its lease, so an overlapping run does not repeat it", async () => {
    const { order, invoice } = await openInvoice();
    sim.setStatusFault(invoice, true);
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 1, errors: 1 });
    sim.state.requests.length = 0;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 0 });
    expect(statusCalls(sim)).toBe(0);
    await sql`update payments set reconcile_claimed_at = now() - interval '6 minutes' where order_id = ${order.id}`;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 1 });
  });

  it("finds a second charge on a paid invoice while its link can still be used", async () => {
    const { order, invoice } = await openInvoice();
    await sim.pay(invoice, "success");
    await runPaymentReconciliation();
    expect((await orderRow(order.id)).status).toBe("paid");
    const second = await sim.pay(invoice, "success");
    await sql`update payments set last_checked_at = now() - interval '11 minutes', reconcile_claimed_at = null where order_id = ${order.id}`;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 1, flagged: 1 });
    expect(await sql`select gateway_payment_id, kind from payment_extras where order_id = ${order.id}`).toEqual([{ gateway_payment_id: second.paymentId, kind: "duplicate" }]);
  });

  it("stops following a paid invoice once its link is well past use", async () => {
    const { order, invoice } = await openInvoice();
    await sim.pay(invoice, "success");
    await runPaymentReconciliation();
    await sql`update payments set expires_at = now() - interval '4 hours', last_checked_at = now() - interval '11 minutes', reconcile_claimed_at = null where order_id = ${order.id}`;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 0 });
  });

  it("flags a second invoice paid on an order that is already paid", async () => {
    const { order, invoice } = await openInvoice();
    await sql`update payments set expires_at = now() - interval '1 hour' where order_id = ${order.id}`;
    const { url } = await startPayment(await orderRow(order.id), null);
    await sim.pay(invoiceIdOf(url), "success");
    await sim.pay(invoice, "success");
    await sql`update payments set last_checked_at = null, reconcile_claimed_at = null where order_id = ${order.id}`;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 2, flagged: 1, paid: 1 });
    expect((await orderRow(order.id)).status).toBe("paid");
    const [extra] = await sql<{ kind: string; state: string }[]>`select kind, state from payment_extras where order_id = ${order.id}`;
    expect(extra).toMatchObject({ kind: "duplicate", state: "open" });
  });

  it("an invoice checked ten minutes ago is due again", async () => {
    const { order } = await openInvoice();
    await runPaymentReconciliation();
    await sql`update payments set last_checked_at = now() - interval '11 minutes', reconcile_claimed_at = now() - interval '11 minutes' where order_id = ${order.id}`;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 1 });
  });

  it("an invoice that keeps failing does not starve the others", async () => {
    const orders = await manyOpenInvoices(RECONCILE_BATCH_SIZE);
    const rows = await paymentRows(orders[0].id);
    sim.setStatusFault(Number(rows[0].gateway_invoice_id), true);
    await sql`update payments set reconcile_claimed_at = now() - interval '6 minutes' where order_id = ${orders[0].id}`;
    const extra = await manyOpenInvoices(1);
    const report = await runPaymentReconciliation();
    expect(report.claimed).toBe(RECONCILE_BATCH_SIZE);
    const [fresh] = await paymentRows(extra[0].id);
    expect(fresh.last_checked_at).not.toBeNull();
  });

  it("stops after repeated gateway failures and reports 502", async () => {
    await manyOpenInvoices(6);
    sim.setFault("/v2/GetPaymentStatus", "down");
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ claimed: 6, checked: 0, errors: 3, skipped: 3, stoppedEarly: true });
  });

  it("one bad invoice among good ones is still a 200", async () => {
    const orders = await manyOpenInvoices(3);
    const [row] = await paymentRows(orders[1].id);
    sim.setStatusFault(Number(row.gateway_invoice_id), true);
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ checked: 2, errors: 1, stoppedEarly: false });
  });

  it("stops when its time budget runs out", async () => {
    await manyOpenInvoices(6);
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + (statusCalls(sim) >= 2 ? 50_000 : 0));
    const report = await runPaymentReconciliation();
    expect(report).toMatchObject({ claimed: 6, stoppedEarly: true });
    expect(report.checked).toBeLessThan(6);
    expect(report.skipped).toBeGreaterThan(0);
  });

  it("does nothing at the gateway when payment is off", async () => {
    await openInvoice();
    sim.state.requests.length = 0;
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    expect(await runPaymentReconciliation()).toMatchObject({ mode: "none", claimed: 0 });
    expect(statusCalls(sim)).toBe(0);
  });

  it("does not ask about another mode's invoices", async () => {
    const { order } = await openInvoice();
    await sql`update payments set environment = 'live' where order_id = ${order.id}`;
    sim.state.requests.length = 0;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 0 });
  });
});

describe("a closed order's link", () => {
  it("a payment made after closing is still caught while the link could be paid", async () => {
    const { user, order, product, invoice } = await openInvoice();
    await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason: "student_cancelled", actorId: null }));
    await sim.pay(invoice, "success");
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 1, paid: 1 });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toContain(product.id);
  });

  it("is left alone once the link is long dead", async () => {
    const { order } = await openInvoice();
    await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason: "student_cancelled", actorId: null }));
    await sql`update payments set expires_at = now() - interval '4 hours' where order_id = ${order.id}`;
    sim.state.requests.length = 0;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 0 });
  });
});

describe("closing stale orders", () => {
  it("closes an order past 72 hours once its invoices are checked, with one audit entry", async () => {
    const { order, invoice } = await openInvoice();
    await makeStale(order.id);
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 1, closed: 1 });
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "expired" });
    expect(await auditCount("order.closed", order.id)).toBe(1);
    expect(sim.state.invoices.has(invoice)).toBe(true);

    expect(await runPaymentReconciliation()).toMatchObject({ closed: 0 });
    expect(await auditCount("order.closed", order.id)).toBe(1);
  });

  it("two runs at once close and audit once", async () => {
    const order = (await newOrder()).order;
    await makeStale(order.id);
    await Promise.all([runPaymentReconciliation(), runPaymentReconciliation(), runPaymentReconciliation()]);
    expect(await auditCount("order.closed", order.id)).toBe(1);
  });

  it("a stale order that was paid is completed, not closed", async () => {
    const { order, invoice } = await openInvoice();
    await makeStale(order.id);
    await sim.pay(invoice, "success");
    expect(await runPaymentReconciliation()).toMatchObject({ paid: 1, closed: 0 });
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("never closes while the gateway cannot answer", async () => {
    const { order } = await openInvoice();
    await makeStale(order.id);
    sim.setFault("/v2/GetPaymentStatus", "error");
    expect(await runPaymentReconciliation()).toMatchObject({ closed: 0, errors: 1 });
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("does not close on a check made before the order's life ended", async () => {
    const { order } = await openInvoice();
    await makeStale(order.id);
    // فُحصت قبل دقيقتين، لكن ذلك كان قبل انقضاء عمر الطلب
    await sql`update orders set created_at = now() - interval '72 hours 1 minute' where id = ${order.id}`;
    await sql`update payments set last_checked_at = now() - interval '2 minutes' where order_id = ${order.id}`;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 0, closed: 0 });
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("every invoice must have been checked, not only the latest", async () => {
    const { order, invoice } = await openInvoice();
    await sql`update payments set expires_at = now() - interval '1 hour' where order_id = ${order.id}`;
    await startPayment(await orderRow(order.id), null);
    await makeStale(order.id);
    // الفاتورة الأولى لم يسأل عنها أحد بعد انقضاء عمر الطلب، والبوابة لا تجيب عنها الآن
    await sql`update payments set last_checked_at = null, reconcile_claimed_at = null where gateway_invoice_id = ${String(invoice)}`;
    sim.setStatusFault(invoice, true);
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 2, checked: 1, closed: 0, errors: 1 });
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("an order that never reached the gateway closes", async () => {
    const { order } = await newOrder();
    await makeStale(order.id);
    expect(await runPaymentReconciliation()).toMatchObject({ closed: 1 });
    expect((await orderRow(order.id)).status).toBe("cancelled");
  });

  it("a young order is left alone", async () => {
    const { order } = await newOrder();
    await makeStale(order.id, 71);
    expect(await runPaymentReconciliation()).toMatchObject({ closed: 0 });
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("with payment off, only orders that never reached the gateway close", async () => {
    const reached = await openInvoice();
    await makeStale(reached.order.id);
    await sql`update payments set last_checked_at = now() where order_id = ${reached.order.id}`;
    const never = await newOrder();
    await makeStale(never.order.id);
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    expect(await runPaymentReconciliation()).toMatchObject({ closed: 1 });
    expect((await orderRow(reached.order.id)).status).toBe("pending");
    expect((await orderRow(never.order.id)).status).toBe("cancelled");
  });

  it("in live mode, leftover sandbox invoices do not keep an order open forever", async () => {
    const { order } = await openInvoice();
    await makeStale(order.id);
    process.env.PAYMENTS_MODE = "live";
    process.env.MYFATOORAH_LIVE_CONFIRMED = "true";
    resetEnvCache();
    sim.state.requests.length = 0;
    expect(await runPaymentReconciliation()).toMatchObject({ mode: "live", claimed: 0, closed: 1 });
    expect(statusCalls(sim)).toBe(0);
  });

  it("in sandbox mode, a live invoice that cannot be checked keeps the order open", async () => {
    const { order } = await openInvoice();
    await makeStale(order.id);
    await sql`update payments set environment = 'live' where order_id = ${order.id}`;
    expect(await runPaymentReconciliation()).toMatchObject({ claimed: 0, closed: 0 });
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  describe("refunds the gateway accepted and never settled for us", () => {
    async function paidThenRefunded() {
      const made = await openInvoice();
      await sim.pay(made.invoice, "success");
      await verifyAndApplyPayment({ invoiceId: String(made.invoice) });
      const admin = await createUser({ role: "admin" });
      await requestOrderRefund({ orderId: made.order.id, adminId: admin.id, reason: "طلب الطالب" });
      // الفاتورة نفسها خارج المتابعة، حتى يقيس التقرير الاستردادات وحدها
      await sql`update payments set expires_at = now() - interval '1 day' where order_id = ${made.order.id}`;
      const [refund] = await sql<{ id: string; gateway_refund_id: string }[]>`select id, gateway_refund_id from refunds where order_id = ${made.order.id}`;
      return { ...made, admin, refundId: refund.id, gatewayRefundId: Number(refund.gateway_refund_id) };
    }
    /** وقت سحب الوصول يطابق وقت القبول عمدًا: بهما يعرف الإلغاء أي وصول يعيده، فيتقدمان معًا */
    const ageRefund = async (orderId: string, hours = 4) => {
      await sql`update entitlements e set revoked_at = r.accepted_at - make_interval(hours => ${hours}) from refunds r where r.order_id = ${orderId} and e.order_id = r.order_id and e.revoked_at = r.accepted_at`;
      await sql`update refunds set accepted_at = accepted_at - make_interval(hours => ${hours}), swept_at = null where order_id = ${orderId}`;
    };

    async function extraRefund() {
      const made = await openInvoice();
      await sim.pay(made.invoice, "success");
      await verifyAndApplyPayment({ invoiceId: String(made.invoice) });
      await sim.pay(made.invoice, "success");
      await verifyAndApplyPayment({ invoiceId: String(made.invoice) });
      const admin = await createUser({ role: "admin" });
      const [{ id }] = await sql<{ id: string }[]>`select id from payment_extras where order_id = ${made.order.id}`;
      await refundExtraPayment({ extraId: id, adminId: admin.id, reason: "دفعة مكررة" });
      await sql`update payments set expires_at = now() - interval '1 day' where order_id = ${made.order.id}`;
      await sql`update payment_extras set refund_requested_at = now() - interval '4 hours' where id = ${id}`;
      const [{ gateway_refund_id }] = await sql<{ gateway_refund_id: string }[]>`select gateway_refund_id from payment_extras where id = ${id}`;
      return { ...made, extraId: id, gatewayRefundId: Number(gateway_refund_id) };
    }
    const extraState = async (id: string) => (await sql<{ state: string }[]>`select state from payment_extras where id = ${id}`)[0].state;

    it("picks up a completed refund whose webhook was lost", async () => {
      const { order, gatewayRefundId, refundId } = await paidThenRefunded();
      sim.setRefundStatus(gatewayRefundId, "Refunded");
      await ageRefund(order.id);
      expect(await runPaymentReconciliation()).toMatchObject({ refundsChecked: 1, refundsResolved: 1, refundErrors: 0 });
      expect((await sql`select status from refunds where id = ${refundId}`)[0].status).toBe("completed");
    });

    it("picks up a cancellation whose webhook was lost, and gives the student back what they paid for", async () => {
      const { user, product, order, gatewayRefundId, refundId } = await paidThenRefunded();
      expect(await activeEntitlements(user.id)).not.toContain(product.id);
      sim.setRefundStatus(gatewayRefundId, "Canceled");
      await ageRefund(order.id);
      expect(await runPaymentReconciliation()).toMatchObject({ refundsChecked: 1, refundsResolved: 1 });
      expect((await sql`select status from refunds where id = ${refundId}`)[0].status).toBe("failed");
      expect((await orderRow(order.id)).status).toBe("paid");
      expect(await activeEntitlements(user.id)).toContain(product.id);
    });

    it("sends nothing to the gateway, and leaves a refund still in process as it is", async () => {
      const { order, refundId } = await paidThenRefunded();
      await ageRefund(order.id);
      sim.state.requests.length = 0;
      expect(await runPaymentReconciliation()).toMatchObject({ refundsChecked: 1, refundsResolved: 0 });
      expect(sim.state.requests.filter((r) => r.path === "/v2/MakeRefund")).toHaveLength(0);
      expect((await sql`select status from refunds where id = ${refundId}`)[0].status).toBe("requested");
    });

    it("does not ask again on the very next run", async () => {
      const { order } = await paidThenRefunded();
      await ageRefund(order.id);
      await runPaymentReconciliation();
      expect(await runPaymentReconciliation()).toMatchObject({ refundsChecked: 0 });
      await sql`update refunds set swept_at = now() - interval '4 hours' where order_id = ${order.id}`;
      expect(await runPaymentReconciliation()).toMatchObject({ refundsChecked: 1 });
    });

    it("leaves a young refund to its webhook", async () => {
      const { order } = await paidThenRefunded();
      await ageRefund(order.id, 1);
      expect(await runPaymentReconciliation()).toMatchObject({ refundsChecked: 0 });
    });

    it("does not ask about a refund from another payment mode", async () => {
      const { order } = await paidThenRefunded();
      await ageRefund(order.id);
      await sql`update payments set environment = 'live' where order_id = ${order.id}`;
      expect(await runPaymentReconciliation()).toMatchObject({ refundsChecked: 0 });
    });

    it("stops when the gateway is down and changes nothing; what it did not reach waits for the next run", async () => {
      const made = [await paidThenRefunded(), await paidThenRefunded(), await paidThenRefunded(), await paidThenRefunded()];
      for (const m of made) await ageRefund(m.order.id);
      sim.setFault("/v2/GetRefundStatus", "error");
      expect(await runPaymentReconciliation()).toMatchObject({ refundsChecked: 3, refundErrors: 3, stoppedEarly: true });
      expect(await sql`select 1 from refunds where order_id = any(${made.map((m) => m.order.id)}::uuid[]) and status <> 'requested'`).toHaveLength(0);
      const unreached = await sql`select id from refunds where order_id = any(${made.map((m) => m.order.id)}::uuid[]) and swept_at is null`;
      expect(unreached).toHaveLength(1);
    });

    it("picks up a lost completion on an extra payment", async () => {
      const { order, extraId, gatewayRefundId } = await extraRefund();
      sim.setRefundStatus(gatewayRefundId, "Refunded");
      expect(await runPaymentReconciliation()).toMatchObject({ refundsChecked: 1, refundsResolved: 1 });
      expect(await extraState(extraId)).toBe("refunded");
      expect((await orderRow(order.id)).status).toBe("paid");
    });

    it("picks up a lost cancellation on an extra payment", async () => {
      const { extraId, gatewayRefundId } = await extraRefund();
      sim.setRefundStatus(gatewayRefundId, "Canceled");
      await runPaymentReconciliation();
      expect(await extraState(extraId)).toBe("refund_failed");
    });
  });

  it("a claim abandoned over an hour ago is closed, a fresh one is not", async () => {
    const { order } = await newOrder();
    await sql`insert into payments (order_id, provider, environment, status, amount_fils, created_at) values (${order.id}, 'myfatoorah', 'sandbox', 'initiated', 3000, now() - interval '2 hours')`;
    const fresh = await newOrder();
    await sql`insert into payments (order_id, provider, environment, status, amount_fils) values (${fresh.order.id}, 'myfatoorah', 'sandbox', 'initiated', 3000)`;
    expect(await runPaymentReconciliation()).toMatchObject({ abandonedClaims: 1 });
    expect((await paymentRows(order.id))[0].status).toBe("failed");
    expect((await paymentRows(fresh.order.id))[0].status).toBe("initiated");
  });
});
