import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getPaymentMethods,
  handleMyFatoorahWebhook,
  paymentsConfig,
  requestGatewayRefund,
  resetPaymentMethodsCache,
  startPayment,
  verifyAndApplyPayment,
} from "@/server/payments/service";
import { MyFatoorahError } from "@/server/payments/myfatoorah";
import { createOrder, refundOrder, type OrderRow } from "@/server/commerce/orders";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { activeEntitlements, createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

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
  sim.setAmountTamper(null);
  sim.setDisplayCurrency(null);
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  delete process.env.MYFATOORAH_BASE_URL_OVERRIDE;
  resetEnvCache();
  resetPaymentMethodsCache();
});

async function newOrder(priceFils = 3000, phone: string | null = "+96599887766") {
  const user = await createUser({ phone, fullName: "سارة: <أحمد>" });
  const p = await createProduct({ priceFils });
  const order = await createOrder({ user, productIds: [p.id], isTest: true });
  return { user, product: p, order };
}

async function orderRow(id: string) {
  const [o] = await sql<OrderRow[]>`select * from orders where id = ${id}`;
  return o;
}

function invoiceIdFromUrl(url: string) {
  return Number(new URL(url).pathname.split("/").pop());
}

describe("payment configuration safety", () => {
  it("sandbox with key is enabled and points at the configured base URL", () => {
    const cfg = paymentsConfig();
    expect(cfg).toMatchObject({ enabled: true, environment: "sandbox", baseUrl: `http://127.0.0.1:${SIM_PORT}` });
  });

  it("disabled mode / missing key → disabled", () => {
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    expect(paymentsConfig().enabled).toBe(false);
    process.env.PAYMENTS_MODE = "sandbox";
    delete process.env.MYFATOORAH_API_KEY;
    resetEnvCache();
    expect(paymentsConfig()).toMatchObject({ enabled: false });
  });

  it("live mode requires explicit confirmation, a webhook secret and a non-test URL", () => {
    process.env.PAYMENTS_MODE = "live";
    delete process.env.MYFATOORAH_BASE_URL;
    resetEnvCache();
    expect(paymentsConfig()).toMatchObject({ enabled: false, reason: "وضع الإنتاج يتطلب تأكيدًا صريحًا" });
    process.env.MYFATOORAH_LIVE_CONFIRMED = "true";
    delete process.env.MYFATOORAH_WEBHOOK_SECRET;
    resetEnvCache();
    expect(paymentsConfig()).toMatchObject({ enabled: false, reason: "مفتاح توقيع Webhook مطلوب في الإنتاج" });
    process.env.MYFATOORAH_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.MYFATOORAH_BASE_URL = "https://apitest.myfatoorah.com";
    resetEnvCache();
    expect(paymentsConfig()).toMatchObject({ enabled: false });
    delete process.env.MYFATOORAH_BASE_URL;
    resetEnvCache();
    expect(paymentsConfig()).toMatchObject({ enabled: true, environment: "live", baseUrl: "https://api.myfatoorah.com" });
  });

  it("a disabled gateway never starts a payment", async () => {
    const { order } = await newOrder();
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    await expect(startPayment(order, 1)).rejects.toBeInstanceOf(MyFatoorahError);
    expect(await sql`select 1 from payments where order_id = ${order.id}`).toHaveLength(0);
  });
});

describe("InitiatePayment / ExecutePayment", () => {
  it("lists only redirect (non-direct) methods enabled for the merchant", async () => {
    const methods = await getPaymentMethods(3000);
    expect(methods.map((m) => m.code)).toEqual(["kn", "vm", "ap"]);
    expect(methods[0]).toMatchObject({ id: 1, nameAr: "كي نت" });
  });

  it("creates an invoice with the order reference, exact KWD amount and server callback URLs", async () => {
    const { order } = await newOrder(2750);
    const { url } = await startPayment(order, 1);
    expect(url).toMatch(new RegExp(`^http://127.0.0.1:${SIM_PORT}/pay/\\d+$`));
    const req = sim.state.requests.filter((r) => r.path === "/v2/ExecutePayment").pop()!;
    expect(req.auth).toBe(`Bearer ${SIM_API_KEY}`);
    const [pay] = await sql<{ id: string; status: string; gateway_invoice_id: string; amount_fils: number; environment: string }[]>`
      select id, status, gateway_invoice_id, amount_fils, environment from payments where order_id = ${order.id}
    `;
    expect(req.body).toMatchObject({
      PaymentMethodId: 1,
      InvoiceValue: 2.75,
      DisplayCurrencyIso: "KWD",
      CustomerReference: order.number,
      UserDefinedField: pay.id,
      CallBackUrl: "http://localhost:3000/payment/return",
      ErrorUrl: "http://localhost:3000/payment/return",
      Language: "AR",
      MobileCountryCode: "+965",
      CustomerMobile: "99887766",
      CustomerName: "سارة أحمد",
    });
    expect(pay).toMatchObject({ status: "pending", amount_fils: 2750, environment: "sandbox", gateway_invoice_id: String(invoiceIdFromUrl(url)) });
  });

  it("SendPayment is used when no method is chosen", async () => {
    const { order } = await newOrder(1000, null);
    const { url } = await startPayment(order, null);
    const req = sim.state.requests.filter((r) => r.path === "/v2/SendPayment").pop()!;
    expect(req.body).toMatchObject({ NotificationOption: "LNK", CustomerReference: order.number });
    expect((req.body as Record<string, unknown>).CustomerMobile).toBeUndefined();
    expect(url).toContain("/pay/");
  });

  it("gateway validation errors mark the payment attempt failed and surface the message", async () => {
    const { order } = await newOrder();
    await expect(startPayment(order, 9999)).rejects.toThrow(/PaymentMethodId/);
    const [p] = await sql<{ status: string; error_message: string }[]>`select status, error_message from payments where order_id = ${order.id}`;
    expect(p.status).toBe("failed");
    expect(p.error_message).toMatch(/PaymentMethodId/);
  });

  it("wrong API key is rejected by the gateway", async () => {
    process.env.MYFATOORAH_API_KEY = "wrong";
    resetEnvCache();
    const { order } = await newOrder();
    await expect(startPayment(order, 1)).rejects.toBeInstanceOf(MyFatoorahError);
  });
});

describe("verifyAndApplyPayment (server-side confirmation)", () => {
  it("success → order paid + entitlement; repeated verification is a no-op", async () => {
    const { order, user, product } = await newOrder(3000);
    const { url } = await startPayment(order, 1);
    const { paymentId } = await sim.pay(invoiceIdFromUrl(url), "success");
    const r1 = await verifyAndApplyPayment({ paymentId });
    expect(r1).toEqual({ state: "paid", orderId: order.id, changed: true });
    const r2 = await verifyAndApplyPayment({ paymentId });
    expect(r2).toEqual({ state: "paid", orderId: order.id, changed: false });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    const [p] = await sql<{ status: string; gateway_payment_id: string; payment_method: string; paid_at: Date }[]>`
      select status, gateway_payment_id, payment_method, paid_at from payments where order_id = ${order.id}
    `;
    expect(p).toMatchObject({ status: "paid", gateway_payment_id: paymentId, payment_method: "KNET" });
    expect(p.paid_at).not.toBeNull();
  });

  it("returning to the callback without paying does not grant anything (pending)", async () => {
    const { order, user } = await newOrder();
    const { url } = await startPayment(order, 1);
    const r = await verifyAndApplyPayment({ invoiceId: String(invoiceIdFromUrl(url)) });
    expect(r).toEqual({ state: "pending", orderId: order.id });
    expect((await orderRow(order.id)).status).toBe("pending");
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("failure → order failed, no files granted; retry can then succeed", async () => {
    const { order, user, product } = await newOrder();
    const first = await startPayment(order, 1);
    const fail = await sim.pay(invoiceIdFromUrl(first.url), "fail");
    const r = await verifyAndApplyPayment({ paymentId: fail.paymentId });
    expect(r).toMatchObject({ state: "failed", orderId: order.id });
    expect((await orderRow(order.id)).status).toBe("failed");
    expect(await activeEntitlements(user.id)).toEqual([]);

    const second = await startPayment(await orderRow(order.id), 2);
    expect((await orderRow(order.id)).status).toBe("pending");
    const ok = await sim.pay(invoiceIdFromUrl(second.url), "success");
    expect(await verifyAndApplyPayment({ paymentId: ok.paymentId })).toMatchObject({ state: "paid", changed: true });
    expect(await activeEntitlements(user.id)).toEqual([product.id]);

    // إشعار فشل متأخر للمحاولة الأولى لا يلغي الدفع الناجح
    expect(await verifyAndApplyPayment({ paymentId: fail.paymentId })).toMatchObject({ state: "failed" });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it("amount mismatch reported by the gateway → invalid, nothing granted", async () => {
    const { order, user } = await newOrder(3000);
    const { url } = await startPayment(order, 1);
    const { paymentId } = await sim.pay(invoiceIdFromUrl(url), "success");
    sim.setAmountTamper(-1000);
    expect(await verifyAndApplyPayment({ paymentId })).toEqual({ state: "invalid", error: "المبلغ لا يطابق الطلب" });
    expect((await orderRow(order.id)).status).toBe("pending");
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("the documented 'x.xxx KD' display value confirms the payment", async () => {
    const { order, user, product } = await newOrder(3000);
    const { url } = await startPayment(order, 1);
    const { paymentId } = await sim.pay(invoiceIdFromUrl(url), "success");
    const status = await fetch(`${sim.url}/v2/GetPaymentStatus`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SIM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ Key: paymentId, KeyType: "PaymentId" }),
    });
    const { Data } = (await status.json()) as { Data: { InvoiceDisplayValue: string; InvoiceTransactions: { Currency: string; PaidCurrency: string }[] } };
    expect(Data.InvoiceDisplayValue).toBe("3.000 KD");
    expect(Data.InvoiceTransactions[0]).toMatchObject({ Currency: "KD", PaidCurrency: "KD" });
    expect(await verifyAndApplyPayment({ paymentId })).toEqual({ state: "paid", orderId: order.id, changed: true });
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it("the ISO spelling 'x.xxx KWD' also confirms the payment", async () => {
    const { order, user, product } = await newOrder(3000);
    const { url } = await startPayment(order, 1);
    const { paymentId } = await sim.pay(invoiceIdFromUrl(url), "success");
    sim.setDisplayCurrency("KWD");
    expect(await verifyAndApplyPayment({ paymentId })).toEqual({ state: "paid", orderId: order.id, changed: true });
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it("a foreign display currency is rejected, nothing granted", async () => {
    const { order, user } = await newOrder(3000);
    const { url } = await startPayment(order, 1);
    const { paymentId } = await sim.pay(invoiceIdFromUrl(url), "success");
    sim.setDisplayCurrency("USD");
    expect(await verifyAndApplyPayment({ paymentId })).toEqual({ state: "invalid", error: "المبلغ لا يطابق الطلب" });
    expect((await orderRow(order.id)).status).toBe("pending");
    expect(await activeEntitlements(user.id)).toEqual([]);
    const [p] = await sql<{ error_message: string }[]>`select error_message from payments where order_id = ${order.id}`;
    expect(p.error_message).toBe("amount/currency mismatch");
  });

  it("an invoice that is not ours (created outside the app) is rejected", async () => {
    const res = await fetch(`${sim.url}/v2/ExecutePayment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SIM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ PaymentMethodId: 1, InvoiceValue: 3, CallBackUrl: "https://x.test/cb", ErrorUrl: "https://x.test/err", CustomerReference: "ORD-1" }),
    });
    const { Data } = (await res.json()) as { Data: { InvoiceId: number } };
    const { paymentId } = await sim.pay(Data.InvoiceId, "success");
    expect(await verifyAndApplyPayment({ paymentId })).toEqual({ state: "invalid", error: "فاتورة غير معروفة" });
  });

  it("a paid invoice of another order cannot be replayed onto this order", async () => {
    const { order, user } = await newOrder(3000);
    await startPayment(order, 1);
    // فاتورة مدفوعة بنفس المبلغ لكن بمرجع طلب مختلف
    const res = await fetch(`${sim.url}/v2/ExecutePayment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SIM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ PaymentMethodId: 1, InvoiceValue: 3, CallBackUrl: "https://x.test/cb", ErrorUrl: "https://x.test/err", CustomerReference: "ORD-999999" }),
    });
    const { Data } = (await res.json()) as { Data: { InvoiceId: number } };
    const { paymentId } = await sim.pay(Data.InvoiceId, "success");
    await sql`update payments set gateway_invoice_id = ${String(Data.InvoiceId)} where order_id = ${order.id}`;
    expect(await verifyAndApplyPayment({ paymentId })).toEqual({ state: "invalid", error: "الفاتورة لا تخص هذا الطلب" });
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("a sandbox payment cannot be applied when running in another environment", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, 1);
    const { paymentId } = await sim.pay(invoiceIdFromUrl(url), "success");
    await sql`update payments set environment = 'live' where order_id = ${order.id}`;
    expect(await verifyAndApplyPayment({ paymentId })).toEqual({ state: "invalid", error: "بيئة الدفع لا تطابق" });
  });

  it("malformed or unknown references", async () => {
    expect(await verifyAndApplyPayment({})).toMatchObject({ state: "invalid" });
    expect(await verifyAndApplyPayment({ paymentId: "abc'; drop table x" })).toMatchObject({ state: "invalid" });
    // مرجع غير موجود لدى البوابة: البوابة ترد بخطأ تحقق → يُرمى MyFatoorahError (صفحة العودة يجب أن تلتقطه)
    await expect(verifyAndApplyPayment({ paymentId: "123456789" })).rejects.toBeInstanceOf(MyFatoorahError);
  });
});

describe("Webhook V2", () => {
  it("valid signature → payment applied; duplicate delivery ignored", async () => {
    const { order, user, product } = await newOrder();
    const { url } = await startPayment(order, 1);
    const invoiceId = invoiceIdFromUrl(url);
    const { paymentId } = await sim.pay(invoiceId, "success");
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "paid" });
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "duplicate ignored" });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    const events = await sql<{ result: string; signature_valid: boolean; processed_at: Date }[]>`select result, signature_valid, processed_at from payment_events`;
    expect(events.filter((e) => e.result === "paid")).toHaveLength(1);
  });

  it("simultaneous duplicate webhooks and callback race → applied exactly once", async () => {
    const { order, user, product } = await newOrder();
    const { url } = await startPayment(order, 1);
    const invoiceId = invoiceIdFromUrl(url);
    const { paymentId } = await sim.pay(invoiceId, "success");
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    const results = await Promise.all([
      handleMyFatoorahWebhook(body, headers),
      handleMyFatoorahWebhook(body, headers),
      handleMyFatoorahWebhook(body, headers),
      verifyAndApplyPayment({ paymentId }),
      verifyAndApplyPayment({ paymentId }),
    ]);
    const webhookResults = results.slice(0, 3).map((r) => (r as { result: string }).result);
    // نسخة واحدة تعالج الحدث؛ والبقية إما 409 (ما زالت المعالجة جارية) أو 200 (انتهت)
    expect(webhookResults.filter((r) => r === "duplicate ignored" || r === "in progress")).toHaveLength(2);
    const changed = results.filter((r) => ("changed" in r && r.changed) || ("result" in r && r.result === "paid"));
    expect(changed).toHaveLength(1);
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from audit_logs where action = 'order.paid' and entity_id = ${order.id}`;
    expect(n).toBe(1);
  });

  it("webhook after the callback already confirmed → 'paid (already)'", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, 1);
    const invoiceId = invoiceIdFromUrl(url);
    const { paymentId } = await sim.pay(invoiceId, "success");
    await verifyAndApplyPayment({ paymentId });
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "paid (already)" });
  });

  it("invalid signature (wrong secret) → 401, nothing stored or granted", async () => {
    const { order, user } = await newOrder();
    const { url } = await startPayment(order, 1);
    const invoiceId = invoiceIdFromUrl(url);
    const { paymentId } = await sim.pay(invoiceId, "success");
    const before = await sql<{ n: number }[]>`select count(*)::int as n from payment_events`;
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId, { secret: "attacker-secret" });
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 401, result: "invalid signature" });
    const after = await sql<{ n: number }[]>`select count(*)::int as n from payment_events`;
    expect(after[0].n).toBe(before[0].n);
    expect((await orderRow(order.id)).status).toBe("pending");
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("tampered payload (signed fields changed) → 401", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, 1);
    const invoiceId = invoiceIdFromUrl(url);
    const { paymentId } = await sim.pay(invoiceId, "fail");
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId, { tamper: true });
    expect((await handleMyFatoorahWebhook(body, headers)).status).toBe(401);
  });

  it("forged 'PAID' webhook for an unpaid invoice does not grant (gateway re-check)", async () => {
    // حتى لو تسرب السر: المعالج يعيد الاستعلام من البوابة ولا يثق بمحتوى الحدث
    const { order, user } = await newOrder();
    const { url } = await startPayment(order, 1);
    const invoiceId = invoiceIdFromUrl(url);
    const { paymentId } = await sim.pay(invoiceId, "fail");
    const { body } = sim.buildWebhook(invoiceId, paymentId);
    const forged = JSON.parse(body);
    forged.Data.Invoice.Status = "PAID";
    forged.Data.Transaction.Status = "SUCCESS";
    const { simSignPaymentWebhook } = await import("../mocks/myfatoorah-simulator");
    const headers = new Headers({ "MyFatoorah-Signature": simSignPaymentWebhook(forged.Data, WEBHOOK_SECRET) });
    expect(await handleMyFatoorahWebhook(JSON.stringify(forged), headers)).toEqual({ status: 200, result: "failed" });
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("webhook for a failed payment does not grant", async () => {
    const { order, user } = await newOrder();
    const { url } = await startPayment(order, 1);
    const invoiceId = invoiceIdFromUrl(url);
    const { paymentId } = await sim.pay(invoiceId, "fail");
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "failed" });
    expect((await orderRow(order.id)).status).toBe("failed");
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("rejects unsupported versions, bad JSON, and disabled payments", async () => {
    const h = new Headers({ "MyFatoorah-Signature": "x", "MyFatoorah-Webhook-Version": "v1" });
    expect((await handleMyFatoorahWebhook(JSON.stringify({ Event: { Code: 1 }, Data: {} }), h)).status).toBe(400);
    expect((await handleMyFatoorahWebhook("{not json", new Headers({ "MyFatoorah-Webhook-Version": "v2" }))).status).toBe(400);
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    expect((await handleMyFatoorahWebhook("{}", new Headers())).status).toBe(503);
  });
});

describe("refund via gateway", () => {
  it("records a refund locally then requests it from MyFatoorah", async () => {
    const admin = await createUser({ role: "admin" });
    const { order, user } = await newOrder(3000);
    const { url } = await startPayment(order, 1);
    const { paymentId } = await sim.pay(invoiceIdFromUrl(url), "success");
    await verifyAndApplyPayment({ paymentId });
    const r = await refundOrder({ orderId: order.id, adminId: admin.id, reason: "طلب العميل" });
    expect(r.paymentId).not.toBeNull();
    const gw = await requestGatewayRefund({ refundId: r.refundId, paymentRowId: r.paymentId!, amountFils: r.amountFils, comment: "طلب العميل" });
    expect(gw.RefundId).toBeGreaterThan(0);
    const [ref] = await sql<{ status: string; gateway_refund_id: string }[]>`select status, gateway_refund_id from refunds where id = ${r.refundId}`;
    expect(ref).toEqual({ status: "requested", gateway_refund_id: String(gw.RefundId) });
    const req = sim.state.requests.filter((x) => x.path === "/v2/MakeRefund").pop()!;
    expect(req.body).toMatchObject({ Key: paymentId, KeyType: "PaymentId", Amount: 3 });
    // الوثائق: لا حقل عملة في الاسترداد، فالمبلغ دائمًا بالعملة الأساسية للحساب
    expect(req.body).not.toHaveProperty("CurrencyIso");
    expect(await activeEntitlements(user.id)).toEqual([]);
  });
});
