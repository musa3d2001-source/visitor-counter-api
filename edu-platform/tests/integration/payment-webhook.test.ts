import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST, maxDuration } from "@/app/api/payments/myfatoorah/webhook/route";
import { createOrder, type OrderRow } from "@/server/commerce/orders";
import { handleMyFatoorahWebhook, paymentsConfig, verifyAndApplyPayment } from "@/server/payments/service";
import { resetWebhookGate } from "@/server/payments/webhook-gate";
import { WEBHOOK_STALE_CLAIM_MINUTES, openPaymentAlertCount, openPaymentAlerts, resolvePaymentAlert, webhookDeliveryStatus } from "@/server/payments/monitoring";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { activeEntitlements, createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";
import { startPayment } from "../helpers/payment-flow";

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
  resetWebhookGate();
  await sql`delete from payment_webhook_rejections`;
  await sql`delete from payment_alerts`;
  await sql`delete from payment_events`;
});
afterEach(() => {
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

async function paidInvoice(priceFils = 3000) {
  const user = await createUser({ fullName: "سارة أحمد", email: `dispute-${Math.random().toString(36).slice(2)}@example.com` });
  const product = await createProduct({ priceFils });
  const order = await createOrder({ user, productIds: [product.id], isTest: true });
  const { url } = await startPayment(order, 1);
  const invoiceId = Number(new URL(url).pathname.split("/").pop());
  const { paymentId } = await sim.pay(invoiceId, "success");
  return { user, product, order, invoiceId, paymentId };
}

const rejections = () => sql<{ reason: string; http_status: number; event_code: number | null; event_name: string | null; invoice_id: string | null; version_header: string | null; body_bytes: number; body_sha256: string }[]>`select * from payment_webhook_rejections order by received_at desc`;
const eventRows = () => sql<{ id: string; result: string | null; processed_at: Date | null; claimed_at: Date | null; signature_valid: boolean }[]>`select id, result, processed_at, claimed_at, signature_valid from payment_events`;
const orderStatus = async (id: string) => (await sql<OrderRow[]>`select * from orders where id = ${id}`)[0].status;

describe("webhook version header", () => {
  it("absent header + valid signature → processed (the docs define no version header)", async () => {
    const { order, user, product, invoiceId, paymentId } = await paidInvoice();
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    expect(headers.has("MyFatoorah-Webhook-Version")).toBe(false);
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "paid" });
    expect(await orderStatus(order.id)).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it.each(["v2", "V2", " v2 ", ""])("header value %j + valid signature → processed", async (versionHeader) => {
    const { invoiceId, paymentId } = await paidInvoice();
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId, { versionHeader });
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "paid" });
  });

  it("an explicit non-v2 value is rejected even with a valid signature, and the rejection is recorded", async () => {
    const { order, invoiceId, paymentId } = await paidInvoice();
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId, { versionHeader: "v1" });
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 400, result: "unsupported webhook" });
    expect(await orderStatus(order.id)).toBe("pending");
    expect(await eventRows()).toHaveLength(0);
    expect((await rejections())[0]).toMatchObject({ reason: "unsupported_version", http_status: 400, version_header: "v1", event_code: 1 });
  });

  it("a V1-shaped body with no header is an unsupported version, not a signature failure", async () => {
    const body = JSON.stringify({ EventType: 1, Event: "TransactionsStatusChanged", DateTime: "2026-01-01", CountryIsoCode: "KWT", Data: { InvoiceId: 1 } });
    expect(await handleMyFatoorahWebhook(body, new Headers({ "MyFatoorah-Signature": "x" }))).toEqual({ status: 400, result: "unsupported webhook" });
    expect((await rejections())[0]).toMatchObject({ reason: "unsupported_version", event_code: 1, event_name: "TransactionsStatusChanged" });
  });
});

describe("webhook secret is required in sandbox too", () => {
  it("sandbox without a secret is disabled, so a webhook can never be accepted unsigned", async () => {
    delete process.env.MYFATOORAH_WEBHOOK_SECRET;
    resetEnvCache();
    expect(paymentsConfig()).toMatchObject({ enabled: false, reason: "مفتاح توقيع Webhook مطلوب حتى في الوضع التجريبي" });
    expect(await handleMyFatoorahWebhook("{}", new Headers())).toEqual({ status: 503, result: "payments disabled" });
  });
});

describe("rejected deliveries are stored in a bounded way", () => {
  const unsigned = (extra: Record<string, unknown> = {}) => JSON.stringify({ Event: { Code: 1, Name: "PAYMENT_STATUS_CHANGED", Reference: "WH-1", ...extra }, Data: { Invoice: { Id: "42", Status: "PAID" }, Customer: { Email: "secret-student@example.com" } } });

  it("records each kind of rejection with the right reason and an unchanged HTTP response", async () => {
    const cases: [string, Headers, { status: number; result: string }, string][] = [
      ["{not json", new Headers(), { status: 400, result: "invalid json" }, "invalid_json"],
      ["null", new Headers(), { status: 400, result: "unsupported webhook" }, "unsupported_shape"],
      [JSON.stringify({ Event: { Code: 1 } }), new Headers(), { status: 400, result: "unsupported webhook" }, "unsupported_shape"],
      [unsigned(), new Headers(), { status: 401, result: "invalid signature" }, "missing_signature"],
      [unsigned({ Code: 99 }), new Headers({ "MyFatoorah-Signature": "x" }), { status: 401, result: "invalid signature" }, "unsupported_event"],
      [unsigned(), new Headers({ "MyFatoorah-Signature": "AAAA" }), { status: 401, result: "invalid signature" }, "invalid_signature"],
    ];
    for (const [body, headers, expected, reason] of cases) {
      await sql`delete from payment_webhook_rejections`;
      expect(await handleMyFatoorahWebhook(body, headers)).toEqual(expected);
      const rows = await rejections();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ reason, http_status: expected.status });
    }
    expect(await eventRows()).toHaveLength(0);
  });

  it("records payments_disabled as 503", async () => {
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    expect(await handleMyFatoorahWebhook("{}", new Headers())).toEqual({ status: 503, result: "payments disabled" });
    expect((await rejections())[0]).toMatchObject({ reason: "payments_disabled", http_status: 503 });
  });

  it("never stores the unverified body: only capped metadata, its size and hash", async () => {
    const body = unsigned();
    await handleMyFatoorahWebhook(body, new Headers({ "MyFatoorah-Signature": "AAAA" }));
    const [row] = await rejections();
    expect(row).toMatchObject({ event_code: 1, event_name: "PAYMENT_STATUS_CHANGED", invoice_id: "42", body_bytes: Buffer.byteLength(body) });
    expect(row.body_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("secret-student");
    const columns = await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_name = 'payment_webhook_rejections'`;
    expect(columns.map((c) => c.column_name).filter((c) => /payload|^body$|raw/.test(c))).toEqual([]);
  });

  it("caps attacker-controlled metadata and strips control characters", async () => {
    const body = JSON.stringify({ Event: { Code: 1, Name: `N\u0000${"x".repeat(5000)}`, Reference: "r".repeat(5000) }, Data: { Invoice: { Id: "9".repeat(5000) } } });
    expect((await handleMyFatoorahWebhook(body, new Headers({ "MyFatoorah-Signature": "AAAA", "MyFatoorah-Webhook-Version": "v2" }))).status).toBe(401);
    const [row] = await sql<{ event_name: string; event_reference: string; invoice_id: string }[]>`select event_name, event_reference, invoice_id from payment_webhook_rejections`;
    expect(row.event_name).toHaveLength(64);
    expect(row.event_name).not.toContain("\u0000");
    expect(row.event_reference).toHaveLength(64);
    expect(row.invoice_id).toHaveLength(64);
    await sql`delete from payment_webhook_rejections`;
    expect((await handleMyFatoorahWebhook("{}", new Headers({ "MyFatoorah-Webhook-Version": "z".repeat(500) }))).status).toBe(400);
    const [v] = await sql<{ version_header: string }[]>`select version_header from payment_webhook_rejections`;
    expect(v.version_header).toHaveLength(16);
  });

  it("the store never exceeds its 200 rows under a flood, and keeps the newest", async () => {
    // حد الكتابات في الدقيقة مُختبر في payment-gateway-hardening، وهذا اختبار سعة الحلقة نفسها
    for (let i = 0; i < 230; i++) {
      resetWebhookGate();
      await handleMyFatoorahWebhook(`{not json ${i}`, new Headers());
    }
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from payment_webhook_rejections`;
    expect(n).toBe(200);
    const [{ newest }] = await sql<{ newest: number }[]>`select max(body_bytes)::int as newest from payment_webhook_rejections`;
    expect(newest).toBe(Buffer.byteLength("{not json 229"));
    await expect(sql`insert into payment_webhook_rejections (slot, reason, http_status) values (200, 'x', 400)`).rejects.toThrow(/check/);
  });

  it("a failure while recording never changes the response", async () => {
    await sql`alter table payment_webhook_rejections rename to payment_webhook_rejections_off`;
    try {
      expect(await handleMyFatoorahWebhook("{not json", new Headers())).toEqual({ status: 400, result: "invalid json" });
    } finally {
      await sql`alter table payment_webhook_rejections_off rename to payment_webhook_rejections`;
    }
  });

  it("the route records an oversize body without storing it, and answers 413", async () => {
    const huge = "x".repeat(256 * 1024 + 1);
    const res = await POST(new NextRequest("http://localhost:3000/api/payments/myfatoorah/webhook", { method: "POST", body: huge }));
    expect(res.status).toBe(413);
    expect((await rejections())[0]).toMatchObject({ reason: "body_too_large", http_status: 413, body_bytes: huge.length });
  });

  it("the route cannot outlive the claim window", () => {
    expect(maxDuration).toBeLessThan(WEBHOOK_STALE_CLAIM_MINUTES * 60);
  });
});

describe("event claim: retrying a stuck event", () => {
  async function delivered() {
    const p = await paidInvoice();
    const { body, headers } = sim.buildWebhook(p.invoiceId, p.paymentId);
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "paid" });
    return { ...p, body, headers };
  }

  it("processed_at null and claimed more than 5 minutes ago → retried and finished, in the same row", async () => {
    const { body, headers } = await delivered();
    await sql`update payment_events set processed_at = null, result = null, claimed_at = now() - interval '6 minutes'`;
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "paid (already)" });
    const rows = await eventRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].processed_at).not.toBeNull();
  });

  it("a stuck event from before the migration (claimed_at null) is retryable", async () => {
    const { body, headers } = await delivered();
    await sql`update payment_events set processed_at = null, result = null, claimed_at = null`;
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "paid (already)" });
  });

  it("an event claimed less than 5 minutes ago is in progress: 409 so the gateway keeps retrying", async () => {
    const { body, headers } = await delivered();
    await sql`update payment_events set processed_at = null, result = null, claimed_at = now() - interval '4 minutes'`;
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 409, result: "in progress" });
    expect((await eventRows())[0].processed_at).toBeNull();
  });

  it("a finished event is never reprocessed, however old its claim is", async () => {
    const { body, headers } = await delivered();
    await sql`update payment_events set claimed_at = now() - interval '2 hours'`;
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "duplicate ignored" });
  });

  it("two simultaneous stale retries: exactly one reclaims the event", async () => {
    const { body, headers } = await delivered();
    await sql`update payment_events set processed_at = null, result = null, claimed_at = now() - interval '6 minutes'`;
    const out = await Promise.all([handleMyFatoorahWebhook(body, headers), handleMyFatoorahWebhook(body, headers)]);
    expect(out.filter((r) => r.result === "paid (already)")).toHaveLength(1);
    expect(out.filter((r) => r.result === "in progress" || r.result === "duplicate ignored")).toHaveLength(1);
  });

  it("a processing failure keeps the row, answers 500 and the next delivery succeeds at once", async () => {
    const { order, invoiceId, paymentId } = await paidInvoice();
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    process.env.MYFATOORAH_API_KEY = "wrong-key";
    resetEnvCache();
    const failed = await handleMyFatoorahWebhook(body, headers);
    expect(failed.status).toBe(500);
    // لا نص داخلي لمن أرسل الحدث ولا في الجدول: التفاصيل في سجل الأخطاء بعد التنقية
    expect(failed.result).toBe("error");
    const [row] = await eventRows();
    expect(row).toMatchObject({ processed_at: null, claimed_at: null });
    expect(row.result).toBe("error");
    process.env.MYFATOORAH_API_KEY = SIM_API_KEY;
    resetEnvCache();
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "paid" });
    expect(await orderStatus(order.id)).toBe("paid");
    expect(await eventRows()).toHaveLength(1);
  });
});

describe("dispute events (code 6)", () => {
  async function paidOrderWithDispute() {
    const p = await paidInvoice();
    await verifyAndApplyPayment({ paymentId: p.paymentId });
    return p;
  }

  async function snapshot(orderId: string, userId: string) {
    const [order] = await sql`select status, paid_at, total_fils from orders where id = ${orderId}`;
    const payments = await sql`select status, amount_fils from payments where order_id = ${orderId}`;
    const entitlements = await sql`select product_id, revoked_at, expires_at from entitlements where user_id = ${userId}`;
    const earnings = await sql`select status, teacher_fils from teacher_earnings where order_id = ${orderId}`;
    const refunds = await sql`select id from refunds where order_id = ${orderId}`;
    return JSON.stringify({ order, payments, entitlements, earnings, refunds });
  }

  // تغيّر عمدًا (K003): النزاع يوقف وصول الطلب وأرباحه حتى يقرر المالك. الطلب والدفعة لا يتغيران، ولا يُعكس شيء
  it("verifies, is stored, raises an owner alert, and holds access and earnings without touching the order or payment", async () => {
    const { order, user, product, invoiceId, paymentId } = await paidOrderWithDispute();
    const before = JSON.parse(await snapshot(order.id, user.id));
    const { body, headers } = sim.buildDisputeWebhook(invoiceId, paymentId, { DisputeTransactionId: 112, Status: "PENDING" });
    expect(headers.has("MyFatoorah-Webhook-Version")).toBe(false);
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "dispute PENDING" });

    const [event] = await eventRows();
    expect(event).toMatchObject({ signature_valid: true, result: "dispute PENDING" });
    expect(event.processed_at).not.toBeNull();

    const [alert] = await openPaymentAlerts();
    expect(alert).toMatchObject({ kind: "dispute", order_id: order.id, order_number: order.number, order_is_test: true });
    expect(alert.details).toMatchObject({ disputeTransactionId: "112", status: "PENDING", type: "CHARGEBACK", reason: "CreditNotProcessed", invoiceId: String(invoiceId), paymentId, amount: "3.000", currency: "KWD" });
    expect(JSON.stringify(alert)).not.toContain(user.email);
    expect(await openPaymentAlertCount()).toBe(1);

    const after = JSON.parse(await snapshot(order.id, user.id));
    expect(after.order).toEqual(before.order);
    expect(after.payments).toEqual(before.payments);
    expect(after.earnings).toEqual(before.earnings);
    expect(after.refunds).toEqual(before.refunds);
    expect(product.id).toBeTruthy();
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("a forged dispute is rejected: no alert and no stored event", async () => {
    const { invoiceId, paymentId } = await paidOrderWithDispute();
    const { body, headers } = sim.buildDisputeWebhook(invoiceId, paymentId, { DisputeTransactionId: 113, Status: "PENDING" }, { secret: "attacker-secret" });
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 401, result: "invalid signature" });
    expect(await openPaymentAlertCount()).toBe(0);
    expect(await eventRows()).toHaveLength(0);
  });

  it("a redelivered dispute does not create a second alert", async () => {
    const { invoiceId, paymentId } = await paidOrderWithDispute();
    const { body, headers } = sim.buildDisputeWebhook(invoiceId, paymentId, { DisputeTransactionId: 114, Status: "PENDING" });
    await handleMyFatoorahWebhook(body, headers);
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "duplicate ignored" });
    expect(await openPaymentAlertCount()).toBe(1);
  });

  it("a status change updates the alert and reopens one the owner had closed; the same status does not", async () => {
    const owner = await createUser({ role: "admin" });
    const { invoiceId, paymentId } = await paidOrderWithDispute();
    const send = async (Status: "PENDING" | "LOST", Reason?: string) => {
      const { body, headers } = sim.buildDisputeWebhook(invoiceId, paymentId, { DisputeTransactionId: 115, Status, Reason });
      await handleMyFatoorahWebhook(body, headers);
    };
    await send("PENDING");
    const [alert] = await openPaymentAlerts();
    expect(await resolvePaymentAlert({ alertId: alert.id, adminId: owner.id })).toBe(true);
    expect(await openPaymentAlertCount()).toBe(0);

    await send("PENDING", "ChangedText");
    expect(await openPaymentAlertCount()).toBe(0);

    await send("LOST");
    const [reopened] = await openPaymentAlerts();
    expect(reopened.id).toBe(alert.id);
    expect(reopened.kind === "dispute" && reopened.details.status).toBe("LOST");
    const [row] = await sql<{ resolved_by: string | null }[]>`select resolved_by from payment_alerts where id = ${alert.id}`;
    expect(row.resolved_by).toBeNull();
  });

  it("a dispute on an invoice we do not know still reaches the owner", async () => {
    const { invoiceId, paymentId } = await paidOrderWithDispute();
    await sql`update payments set gateway_invoice_id = 'other' where gateway_invoice_id = ${String(invoiceId)}`;
    const { body, headers } = sim.buildDisputeWebhook(invoiceId, paymentId, { DisputeTransactionId: 116, Status: "PENDING" });
    expect((await handleMyFatoorahWebhook(body, headers)).status).toBe(200);
    const [alert] = await openPaymentAlerts();
    expect(alert).toMatchObject({ order_id: null, order_number: null });
    expect(alert.details.invoiceId).toBe(String(invoiceId));
  });

  it("resolving is audited, is idempotent, and alerts can be listed per order", async () => {
    const owner = await createUser({ role: "admin" });
    const a = await paidOrderWithDispute();
    const b = await paidOrderWithDispute();
    for (const [p, id] of [[a, 117], [b, 118]] as const) {
      const { body, headers } = sim.buildDisputeWebhook(p.invoiceId, p.paymentId, { DisputeTransactionId: id, Status: "PENDING" });
      await handleMyFatoorahWebhook(body, headers);
    }
    const forA = await openPaymentAlerts({ orderId: a.order.id });
    expect(forA.map((x) => x.order_id)).toEqual([a.order.id]);
    expect(await resolvePaymentAlert({ alertId: forA[0].id, adminId: owner.id, ip: "1.2.3.4" })).toBe(true);
    expect(await resolvePaymentAlert({ alertId: forA[0].id, adminId: owner.id })).toBe(false);
    const logs = await sql<{ action: string; actor_id: string }[]>`select action, actor_id from audit_logs where entity_id = ${forA[0].id}`;
    expect(logs).toEqual([{ action: "payment_alert.resolved", actor_id: owner.id }]);
    expect(await openPaymentAlertCount()).toBe(1);
  });
});

describe("webhookDeliveryStatus (what the owner sees)", () => {
  it("empty → no valid delivery yet", async () => {
    expect(await webhookDeliveryStatus()).toEqual({ lastValid: null, rejectedLast24h: 0, lastRejected: null, stuckEvents: 0 });
  });

  it("reports the last valid delivery, recent rejections and stuck events", async () => {
    const { invoiceId, paymentId } = await paidInvoice();
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    await handleMyFatoorahWebhook(body, headers);
    await handleMyFatoorahWebhook("{not json", new Headers());
    await handleMyFatoorahWebhook(body, new Headers({ "MyFatoorah-Signature": "AAAA" }));

    const s = await webhookDeliveryStatus();
    expect(s.lastValid).toMatchObject({ eventName: "PAYMENT_STATUS_CHANGED", result: "paid" });
    expect(s.lastValid!.at).toBeInstanceOf(Date);
    expect(s.rejectedLast24h).toBe(2);
    expect(s.lastRejected).toMatchObject({ reason: "invalid_signature", httpStatus: 401 });
    expect(s.stuckEvents).toBe(0);

    await sql`update payment_webhook_rejections set received_at = now() - interval '25 hours'`;
    await sql`update payment_events set processed_at = null, claimed_at = now() - interval '6 minutes'`;
    const later = await webhookDeliveryStatus();
    expect(later.rejectedLast24h).toBe(0);
    expect(later.stuckEvents).toBe(1);
  });
});
