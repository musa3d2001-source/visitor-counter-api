import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPaymentMethods, handleMyFatoorahWebhook, paymentsConfig, requestOrderRefund, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { MyFatoorahClient, MyFatoorahError, signWebhookV2 } from "@/server/payments/myfatoorah";
import { applyRefundEvent } from "@/server/payments/refunds";
import { paymentReturnRef, readPaymentReturnRef } from "@/server/payments/return-ref";
import { RING_WRITES_PER_ADDRESS, RING_WRITES_PER_MINUTE, WEBHOOK_REJECTIONS_PER_ADDRESS, resetPaymentReturnGate, resetWebhookGate } from "@/server/payments/webhook-gate";
import { resetEnvCache } from "@/server/env";
import { paymentFailureMessage } from "@/lib/payment-failure";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { activeEntitlements, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";
import { invoiceIdOf, newOrder, orderRow, paymentRows, startPayment, statusCalls } from "../helpers/payment-flow";
import { mutateGatewayReply } from "../helpers/gateway-fetch";

/** جلسة الزائر وسلته: الجلسة وحدها تُبدل، وبقية مسار الدفع حقيقية مقابل المحاكي وقاعدة البيانات */
const ctx = vi.hoisted(() => ({ userId: null as string | null, sessionFails: false, cartFails: false }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => {
    if (ctx.sessionFails) throw new Error("session store down");
    return ctx.userId ? { id: ctx.userId } : null;
  },
}));
vi.mock("@/server/commerce/cart", async (original) => {
  const real = await original<typeof import("@/server/commerce/cart")>();
  return {
    ...real,
    parseCartCookie: (value: string) => {
      if (ctx.cartFails) throw new Error("cart unavailable");
      return real.parseCartCookie(value);
    },
  };
});

const { GET: returnGET, maxDuration: returnMaxDuration } = await import("@/app/payment/return/route");
const { POST: webhookPOST } = await import("@/app/api/payments/myfatoorah/webhook/route");

let sim: Simulator;
const BASE = "http://localhost:3000";

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(async () => {
  sim.clearFaults();
  sim.state.requests.length = 0;
  ctx.userId = null;
  ctx.sessionFails = false;
  ctx.cartFails = false;
  resetWebhookGate();
  resetPaymentReturnGate();
  resetPaymentMethodsCache();
  await sql`delete from payment_webhook_rejections`;
  await sql`delete from payment_events`;
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

const pathOf = (res: Response) => new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search;
const callReturn = (url: string, ip = "198.51.100.7", cookie?: string) => returnGET(new NextRequest(url, { headers: { "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) } }));
const creditedOrders = (orderId: string) => sql<{ n: number }[]>`select count(*)::int as n from entitlements where order_id = ${orderId}`.then(([r]) => r.n);

/** طلب مدفوع لدى البوابة ولم يصلنا تأكيده بعد، ورابط العودة كما يبنيه المتصفح */
async function paidAtGateway(priceFils = 3000) {
  const made = await newOrder(priceFils);
  const { url } = await startPayment(made.order, 1);
  const invoiceId = invoiceIdOf(url);
  const { paymentId, redirectUrl } = await sim.pay(invoiceId, "success");
  return { ...made, invoiceId, paymentId, redirectUrl };
}

describe("the live key never leaves for a host that is not the gateway's", () => {
  const live = { PAYMENTS_MODE: "live", MYFATOORAH_LIVE_CONFIRMED: "true", APP_URL: "https://farqad.com" };

  it.each(["http://127.0.0.1:4590", "https://api.myfatoorah.com.evil.example", "http://api.myfatoorah.com"])("live on %s is disabled and no request carries the key", async (MYFATOORAH_BASE_URL) => {
    const { order } = await newOrder();
    setEnv({ ...live, MYFATOORAH_BASE_URL });
    expect(paymentsConfig()).toMatchObject({ enabled: false });
    await expect(startPayment(order, 1)).rejects.toBeInstanceOf(MyFatoorahError);
    expect(sim.state.requests).toHaveLength(0);
  });

  it("live with a localhost APP_URL is disabled with a reason the owner can read", () => {
    setEnv({ PAYMENTS_MODE: "live", MYFATOORAH_LIVE_CONFIRMED: "true", MYFATOORAH_BASE_URL: undefined, APP_URL: "http://localhost:3000" });
    expect(paymentsConfig()).toMatchObject({ enabled: false, reason: expect.stringContaining("APP_URL") });
  });

  it("a redirect from the gateway is not followed with the key", async () => {
    const seen: RequestRedirect[] = [];
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.redirect ?? "follow");
      return real(input, init);
    });
    await getPaymentMethods(3000);
    expect(seen).toEqual(["manual"]);
  });
});

describe("the payment page address is checked before it is stored or followed", () => {
  it.each(["https://evil.example/pay", "http://portal.myfatoorah.com/pay", "javascript:alert(1)"])("%s is never stored or returned", async (bad) => {
    const { order } = await newOrder();
    mutateGatewayReply("/v2/ExecutePayment", (d) => {
      d.PaymentURL = bad;
    });
    await expect(startPayment(order, 1)).rejects.toBeInstanceOf(MyFatoorahError);
    const [p] = await paymentRows(order.id);
    expect(p).toMatchObject({ status: "failed", payment_url: null, gateway_invoice_id: null });
    expect(p.error_message).not.toContain(bad);
  });

  it("the same check holds on the link for all methods", async () => {
    const { order } = await newOrder();
    mutateGatewayReply("/v2/SendPayment", (d) => {
      d.InvoiceURL = "https://evil.example/pay";
    });
    await expect(startPayment(order, null)).rejects.toBeInstanceOf(MyFatoorahError);
    expect((await paymentRows(order.id))[0]).toMatchObject({ payment_url: null });
  });

  it("a stored address that fails the check is not followed on reuse", async () => {
    const { order } = await newOrder();
    await startPayment(order, null);
    await sql`update payments set payment_url = 'https://evil.example/pay' where order_id = ${order.id}`;
    await expect(startPayment(order, null)).rejects.toBeInstanceOf(MyFatoorahError);
  });

  it("a direct-payment reply is a failed attempt", async () => {
    const { order } = await newOrder();
    mutateGatewayReply("/v2/ExecutePayment", (d) => {
      d.IsDirectPayment = true;
    });
    await expect(startPayment(order, 1)).rejects.toBeInstanceOf(MyFatoorahError);
    expect((await paymentRows(order.id))[0]).toMatchObject({ status: "failed", payment_url: null });
  });
});

describe("the payment method id from the browser", () => {
  const executes = () => sim.state.requests.filter((r) => r.path === "/v2/ExecutePayment");
  const sends = () => sim.state.requests.filter((r) => r.path === "/v2/SendPayment");

  it("an offered id goes to the gateway", async () => {
    const { order } = await newOrder();
    await startPayment(order, 2);
    expect(executes()[0].body).toMatchObject({ PaymentMethodId: 2 });
  });

  it.each([[9999, "unknown"], [20, "direct, never offered on our page"]])("id %s (%s) falls back to the general hosted link", async (forged) => {
    const { order } = await newOrder();
    await startPayment(order, forged);
    expect(executes()).toHaveLength(0);
    expect(sends()).toHaveLength(1);
    expect((await paymentRows(order.id))[0]).toMatchObject({ status: "pending" });
    const [row] = await sql<{ payment_method: string }[]>`select payment_method from payments where order_id = ${order.id}`;
    expect(row.payment_method).toBe("all");
  });

  it("is checked against the methods offered for this amount, not another", async () => {
    let cheap = true;
    mutateGatewayReply("/v2/InitiatePayment", (d) => {
      if (cheap) d.PaymentMethods = (d.PaymentMethods as { PaymentMethodId: number }[]).filter((m) => m.PaymentMethodId === 1);
    });
    await getPaymentMethods(1000);
    cheap = false;
    expect((await getPaymentMethods(5000)).map((m) => m.id)).toContain(2);
    expect((await getPaymentMethods(1000)).map((m) => m.id)).toEqual([1]);
  });

  it("when the gateway cannot list methods, the buyer still reaches the hosted page", async () => {
    const { order } = await newOrder();
    sim.setFault("/v2/InitiatePayment", "down");
    await startPayment(order, 2);
    expect(executes()).toHaveLength(0);
    expect(sends()).toHaveLength(1);
  });
});

describe("what the gateway says about the invoice", () => {
  async function verify(mutate: (d: Record<string, unknown>) => void) {
    const made = await paidAtGateway();
    mutateGatewayReply("/v2/GetPaymentStatus", mutate);
    const result = await verifyAndApplyPayment({ invoiceId: String(made.invoiceId) });
    return { ...made, result };
  }

  async function expectNotGranted(made: { order: { id: string }; user: { id: string }; result: unknown }, error: string) {
    expect(made.result).toEqual({ state: "invalid", error });
    expect((await orderRow(made.order.id)).status).toBe("pending");
    expect(await activeEntitlements(made.user.id)).toHaveLength(0);
    const [extra] = await sql<{ kind: string }[]>`select kind from payment_extras where order_id = ${made.order.id}`;
    expect(extra?.kind).toBe("amount_mismatch");
  }

  it.each([
    ["empty", ""],
    ["null", null],
    ["another order's", "ORD-999999"],
  ])("a %s CustomerReference grants nothing and reaches the owner", async (_label, value) => {
    const made = await verify((d) => {
      d.CustomerReference = value;
    });
    await expectNotGranted(made, "الفاتورة لا تخص هذا الطلب");
  });

  it("a UserDefinedField of another attempt grants nothing", async () => {
    const made = await verify((d) => {
      d.UserDefinedField = "11111111-1111-4111-8111-111111111111";
    });
    await expectNotGranted(made, "الفاتورة لا تخص هذا الطلب");
  });

  it("an empty UserDefinedField is accepted when the order reference matches", async () => {
    const made = await verify((d) => {
      d.UserDefinedField = null;
    });
    expect(made.result).toMatchObject({ state: "paid", changed: true });
  });

  it.each(["", null])("a display value of %j grants nothing", async (value) => {
    const made = await verify((d) => {
      d.InvoiceDisplayValue = value;
    });
    await expectNotGranted(made, "المبلغ لا يطابق الطلب");
  });

  const setCurrency = (value: unknown) => (d: Record<string, unknown>) => {
    (d.InvoiceTransactions as Record<string, unknown>[]).forEach((t) => {
      t.Currency = value;
    });
  };

  it.each(["", null, "USD", "SAR"])("a transaction currency of %j grants nothing", async (value) => {
    const made = await verify(setCurrency(value));
    await expectNotGranted(made, "المبلغ لا يطابق الطلب");
  });

  it.each(["KD", "KWD"])("the documented currency %s is accepted", async (value) => {
    const made = await verify(setCurrency(value));
    expect(made.result).toMatchObject({ state: "paid" });
  });

  it("a different currency in PaidCurrency alone does not block a real payment", async () => {
    const made = await verify((d) => {
      (d.InvoiceTransactions as Record<string, unknown>[]).forEach((t) => {
        t.PaidCurrency = "USD";
      });
    });
    expect(made.result).toMatchObject({ state: "paid" });
  });

  it("an amount moved at the gateway cannot be paid under the order", async () => {
    const made = await verify((d) => {
      d.InvoiceValue = 2.999;
    });
    await expectNotGranted(made, "المبلغ لا يطابق الطلب");
  });
});

describe("what the buyer sees", () => {
  it("the message is fixed per kind and never the stored text", () => {
    expect(paymentFailureMessage({ status: "failed", gateway_invoice_id: "1" })).toBe("لم تكتمل العملية عند البنك أو بوابة الدفع.");
    expect(paymentFailureMessage({ status: "failed", gateway_invoice_id: null })).toBe("تعذر فتح صفحة الدفع.");
    expect(paymentFailureMessage({ status: "expired", gateway_invoice_id: "1" })).toBe("انتهت مدة رابط الدفع.");
    expect(paymentFailureMessage({ status: "pending", gateway_invoice_id: "1" })).toBeNull();
    expect(paymentFailureMessage(undefined)).toBeNull();
  });

  it("the order page never reads the raw column", () => {
    const page = readFileSync(resolve(__dirname, "../../src/app/(site)/orders/[id]/page.tsx"), "utf8");
    expect(page).not.toContain("error_message");
  });

  it("the raw decline text stays for the owner, scrubbed", async () => {
    const { order } = await newOrder();
    const { url } = await startPayment(order, 1);
    const invoiceId = invoiceIdOf(url);
    await sim.pay(invoiceId, "fail");
    mutateGatewayReply("/v2/GetPaymentStatus", (d) => {
      (d.InvoiceTransactions as Record<string, unknown>[]).forEach((t) => {
        t.Error = "Declined for card 4508750000001019 by bank.host.internal";
      });
    });
    await verifyAndApplyPayment({ invoiceId: String(invoiceId) });
    const [p] = await paymentRows(order.id);
    expect(p.status).toBe("failed");
    expect(p.error_message).toContain("Declined");
    expect(p.error_message).not.toContain("4508750000001019");
  });
});

describe("webhook: the door", () => {
  const url = `${BASE}/api/payments/myfatoorah/webhook`;
  const ringCount = () => sql<{ n: number }[]>`select count(*)::int as n from payment_webhook_rejections`.then(([r]) => r.n);
  const unsigned = JSON.stringify({ Event: { Code: 1, Name: "PAYMENT_STATUS_CHANGED" }, Data: { Invoice: { Id: "1", Status: "PAID" }, Transaction: { Status: "SUCCESS", PaymentId: "1" } } });
  const post = (body: BodyInit, ip = "203.0.113.5", extra: Record<string, string> = {}) => webhookPOST(new NextRequest(url, { method: "POST", body, headers: { "x-forwarded-for": ip, "myfatoorah-signature": "AAAA", ...extra }, duplex: "half" } as never));

  it("a declared oversize body is refused without reading it", async () => {
    let pulled = false;
    const body = new ReadableStream(
      {
        pull() {
          pulled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const res = await post(body as never, "203.0.113.6", { "content-length": String(5 * 1024 * 1024) });
    expect(res.status).toBe(413);
    expect(pulled).toBe(false);
    const [row] = await sql<{ reason: string; body_bytes: number }[]>`select reason, body_bytes from payment_webhook_rejections`;
    expect(row).toMatchObject({ reason: "body_too_large", body_bytes: 5 * 1024 * 1024 });
  });

  it("a body that hides its size is cut while reading, not after", async () => {
    let sent = 0;
    const chunk = new Uint8Array(64 * 1024);
    const body = new ReadableStream({
      pull(c) {
        sent += chunk.byteLength;
        if (sent > 8 * 1024 * 1024) c.close();
        else c.enqueue(chunk);
      },
    });
    const res = await post(body as never, "203.0.113.7");
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(1024 * 1024);
  });

  it("a body exactly at the limit is still read", async () => {
    const res = await post("x".repeat(256 * 1024), "203.0.113.8");
    expect(res.status).toBe(400);
  });

  it(`an address past ${WEBHOOK_REJECTIONS_PER_ADDRESS} rejections is refused before the body and writes at most ${RING_WRITES_PER_ADDRESS} ring rows`, async () => {
    for (let i = 0; i < WEBHOOK_REJECTIONS_PER_ADDRESS; i++) expect((await post(unsigned)).status).toBe(401);
    expect(await ringCount()).toBe(RING_WRITES_PER_ADDRESS);
    let pulled = false;
    const res = await post(new ReadableStream({ pull: () => void (pulled = true) }, { highWaterMark: 0 }) as never);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(pulled).toBe(false);
    expect(await ringCount()).toBe(RING_WRITES_PER_ADDRESS);
  });

  it("a flood from many addresses costs a fixed number of ring writes", async () => {
    for (let i = 0; i < RING_WRITES_PER_MINUTE * 3; i++) await post(unsigned, `198.18.${i % 200}.${i % 250}`);
    expect(await ringCount()).toBe(RING_WRITES_PER_MINUTE);
  });

  it("a flood from one address does not block a signed delivery from another", async () => {
    for (let i = 0; i < WEBHOOK_REJECTIONS_PER_ADDRESS + 3; i++) await post(unsigned, "203.0.113.9");
    const { order, invoiceId, paymentId } = await paidAtGateway();
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    const res = await webhookPOST(new NextRequest(url, { method: "POST", body, headers: { ...Object.fromEntries(headers), "x-forwarded-for": "198.51.100.200" } }));
    expect(res.status).toBe(200);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("without a trusted proxy every address is one, so the door stays open and only the write budget applies", async () => {
    setEnv({ TRUST_PROXY: "false" });
    for (let i = 0; i < WEBHOOK_REJECTIONS_PER_ADDRESS + 5; i++) expect((await post(unsigned)).status).toBe(401);
    expect(await ringCount()).toBe(RING_WRITES_PER_MINUTE);
  });

  it("a rejected post while payments are off is bounded the same way", async () => {
    setEnv({ PAYMENTS_MODE: "disabled" });
    for (let i = 0; i < 10; i++) expect((await post(unsigned)).status).toBe(503);
    expect(await ringCount()).toBe(RING_WRITES_PER_ADDRESS);
  });
});

describe("webhook: forged, replayed and reordered messages", () => {
  it("a re-serialised copy of a signed event is the same event", async () => {
    const { order, invoiceId, paymentId } = await paidAtGateway();
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "paid" });
    const parsed = JSON.parse(body) as { Event: unknown; Data: unknown };
    const reordered = JSON.stringify({ Data: parsed.Data, Event: parsed.Event }, null, 2);
    expect(await handleMyFatoorahWebhook(reordered, headers)).toEqual({ status: 200, result: "duplicate ignored" });
    expect(await sql`select 1 from payment_events`).toHaveLength(1);
    expect(await creditedOrders(order.id)).toBe(1);
  });

  it("a body changed after signing cannot grant", async () => {
    const { order, invoiceId, paymentId } = await paidAtGateway();
    const { headers } = sim.buildWebhook(invoiceId, paymentId, { tamper: true });
    const forged = sim.buildWebhook(invoiceId, paymentId, { tamper: true }).body;
    expect(await handleMyFatoorahWebhook(forged, headers)).toMatchObject({ status: 401 });
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("a validly signed event for another invoice does not touch this order", async () => {
    const first = await paidAtGateway();
    const second = await paidAtGateway();
    const { body, headers } = sim.buildWebhook(second.invoiceId, second.paymentId);
    await handleMyFatoorahWebhook(body, headers);
    expect((await orderRow(first.order.id)).status).toBe("pending");
    expect((await orderRow(second.order.id)).status).toBe("paid");
    expect(await creditedOrders(first.order.id)).toBe(0);
  });

  it("a processing failure tells the sender nothing", async () => {
    const { invoiceId, paymentId } = await paidAtGateway();
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    await sql`alter table payments rename column last_gateway_status to last_gateway_status_off`;
    try {
      const out = await handleMyFatoorahWebhook(body, headers);
      expect(out).toEqual({ status: 500, result: "error" });
    } finally {
      await sql`alter table payments rename column last_gateway_status_off to last_gateway_status`;
    }
  });
});

describe("signed refund events are never matched on amount alone", () => {
  const gateway = () => new MyFatoorahClient({ baseUrl: sim.url, apiKey: SIM_API_KEY });

  async function paidOrder() {
    const made = await paidAtGateway();
    await verifyAndApplyPayment({ invoiceId: String(made.invoiceId) });
    const admin = await createUser({ role: "admin" });
    return { ...made, admin };
  }
  const refundRow = (orderId: string) => sql<{ id: string; status: string; attempt: number; gateway_refund_id: string | null }[]>`select id, status, attempt, gateway_refund_id from refunds where order_id = ${orderId}`.then(([r]) => r);
  const alerts = (orderId: string) => sql<{ details: { reason: string } }[]>`select details from payment_alerts where order_id = ${orderId}`;
  const statusOf = (r: { RefundId: number }, status: string, invoiceId: number) => ({ invoiceId: String(invoiceId), refundId: String(r.RefundId), status, amountFils: 3000 });

  it("an old cancellation of attempt 1 cannot fail attempt 2 while it is being sent", async () => {
    const { order, invoiceId, admin } = await paidOrder();
    await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
    const first = sim.state.invoices.get(invoiceId)!.Refunds[0];
    sim.setRefundStatus(first.RefundId, "Canceled");
    await applyRefundEvent(gateway(), "sandbox", statusOf(first, "CANCELED", invoiceId));
    expect((await refundRow(order.id)).status).toBe("failed");

    let seenDuringSend: string | null = null;
    sim.setBeforeRefundReply(async () => {
      await applyRefundEvent(gateway(), "sandbox", statusOf(first, "CANCELED", invoiceId));
      seenDuringSend = (await refundRow(order.id)).status;
    });
    await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
    sim.setBeforeRefundReply(null);

    expect(seenDuringSend).toBe("sending");
    expect(await refundRow(order.id)).toMatchObject({ status: "requested", attempt: 2 });
    expect((await orderRow(order.id)).status).toBe("refunded");
    expect((await alerts(order.id)).map((a) => a.details.reason)).toContain("cancelled_unknown");
  });

  it("the refund the gateway says is this attempt's applies before the reply arrives", async () => {
    const { order, invoiceId, admin } = await paidOrder();
    sim.setBeforeRefundReply(async (refund) => {
      sim.setRefundStatus(refund.RefundId, "Refunded");
      await applyRefundEvent(gateway(), "sandbox", statusOf(refund, "REFUNDED", invoiceId));
    });
    await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
    sim.setBeforeRefundReply(null);
    expect(await refundRow(order.id)).toMatchObject({ status: "completed" });
  });

  it("an amount match the gateway cannot place changes nothing", async () => {
    const { order, invoiceId, admin } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
    sim.clearFaults();
    expect((await refundRow(order.id)).status).toBe("unknown");
    await applyRefundEvent(gateway(), "sandbox", { invoiceId: String(invoiceId), refundId: "77777777", status: "CANCELED", amountFils: 3000 });
    expect((await refundRow(order.id)).status).toBe("unknown");
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("a gateway outage leaves the row alone and the event is retried", async () => {
    const { order, invoiceId, admin } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
    sim.clearFaults();
    sim.setFault("/v2/GetRefundStatus", "down");
    await expect(applyRefundEvent(gateway(), "sandbox", { invoiceId: String(invoiceId), refundId: "77777777", status: "REFUNDED", amountFils: 3000 })).rejects.toBeInstanceOf(MyFatoorahError);
    expect((await refundRow(order.id)).status).toBe("unknown");
  });

  it("a forged signature for a refund is refused before any of this", async () => {
    const body = { Event: { Code: 2, Name: "REFUND_STATUS_CHANGED" }, Data: { Refund: { Id: "1", Status: "REFUNDED" }, Amount: { ValueInBaseCurrency: "3.000" }, ReferencedInvoice: { Id: "1" } } };
    const wrong = signWebhookV2(body, "not-the-secret")!;
    expect(await handleMyFatoorahWebhook(JSON.stringify(body), new Headers({ "MyFatoorah-Signature": wrong }))).toMatchObject({ status: 401 });
  });
});

describe("the signed return reference", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("round-trips and rejects any change", () => {
    const ref = paymentReturnRef(id);
    expect(readPaymentReturnRef(ref)).toBe(id);
    expect(readPaymentReturnRef(ref.slice(0, -1) + (ref.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(readPaymentReturnRef(`22222222-2222-4222-8222-222222222222.${ref.split(".")[1]}`)).toBeNull();
    for (const bad of [null, undefined, "", id, `${id}.short`, `${id}.${"x".repeat(200)}`, "../../etc"]) expect(readPaymentReturnRef(bad)).toBeNull();
  });

  it("depends on the app secret", () => {
    const ref = paymentReturnRef(id);
    setEnv({ APP_SECRET: "another-secret-0123456789abcdef-0123456789" });
    expect(readPaymentReturnRef(ref)).toBeNull();
  });
});

describe("payment return", () => {
  const checked = "/account?payment=checked";

  it("declares a duration that covers the gateway deadline", () => {
    expect(returnMaxDuration).toBeGreaterThanOrEqual(60);
    for (const page of ["(site)/checkout/page.tsx", "(site)/orders/[id]/page.tsx"]) {
      expect(readFileSync(resolve(__dirname, `../../src/app/${page}`), "utf8")).toMatch(/export const maxDuration = 60/);
    }
  });

  it("the owner is verified, sent to the order, and the bought items leave the cart", async () => {
    const { order, user, product, redirectUrl } = await paidAtGateway();
    ctx.userId = user.id;
    const keep = "22222222-2222-4222-8222-222222222222";
    const res = await callReturn(redirectUrl, "198.51.100.7", `cart=${encodeURIComponent(JSON.stringify([product.id, keep]))}`);
    expect(res.status).toBe(303);
    expect(pathOf(res)).toBe(`/orders/${order.id}?from=payment`);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(decodeURIComponent(decodeURIComponent(res.headers.get("set-cookie")!))).toContain(`["${keep}"]`);
  });

  it("an anonymous caller gets a neutral page and the payment is still applied", async () => {
    const { order, user, redirectUrl } = await paidAtGateway();
    const res = await callReturn(redirectUrl);
    expect(res.status).toBe(303);
    expect(pathOf(res)).toBe(checked);
    expect(res.headers.get("location")).not.toContain(order.id);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toHaveLength(1);
  });

  it("another signed-in user sees the same neutral page and no cart change", async () => {
    const { order, redirectUrl } = await paidAtGateway();
    ctx.userId = (await createUser()).id;
    const res = await callReturn(redirectUrl, "198.51.100.7", "cart=%5B%5D");
    expect(pathOf(res)).toBe(checked);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("replayed returns grant once", async () => {
    const { order, user, redirectUrl } = await paidAtGateway();
    ctx.userId = user.id;
    await Promise.all([callReturn(redirectUrl), callReturn(redirectUrl), callReturn(redirectUrl)]);
    await callReturn(redirectUrl);
    expect(await creditedOrders(order.id)).toBe(1);
    expect(await sql`select 1 from payment_extras where order_id = ${order.id}`).toHaveLength(0);
  });

  it("an unknown id costs one lookup and never a gateway call", async () => {
    const res = await callReturn(`${BASE}/payment/return?paymentId=07070123456&Id=07070123456`);
    expect(pathOf(res)).toBe(checked);
    expect(sim.state.requests).toHaveLength(0);
  });

  it("a forged reference with a real-looking payment id reaches no gateway", async () => {
    const { paymentId } = await paidAtGateway();
    sim.state.requests.length = 0;
    const res = await callReturn(`${BASE}/payment/return?ref=11111111-1111-4111-8111-111111111111.AAAAAAAAAAAAAAAAAAAAAA&paymentId=${paymentId}`);
    expect(pathOf(res)).toBe(checked);
    expect(statusCalls(sim)).toBe(0);
  });

  it("unknown ids are limited per address, and the limit never blocks a real one on that address", async () => {
    for (let i = 0; i < 31; i++) await callReturn(`${BASE}/payment/return?paymentId=0707${i}`, "198.51.100.50");
    expect(pathOf(await callReturn(`${BASE}/payment/return?paymentId=07079999`, "198.51.100.50"))).toBe("/account?payment=rate");
    const { order, user, redirectUrl } = await paidAtGateway();
    ctx.userId = user.id;
    const res = await callReturn(redirectUrl, "198.51.100.50");
    expect(pathOf(res)).toBe(`/orders/${order.id}?from=payment`);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("a school behind one address: every real return is verified", async () => {
    const buyers = await Promise.all(Array.from({ length: 70 }, () => paidAtGateway(1000)));
    for (const b of buyers) await callReturn(b.redirectUrl, "198.51.100.60");
    const orders = await Promise.all(buyers.map((b) => orderRow(b.order.id)));
    expect(orders.every((o) => o.status === "paid")).toBe(true);
  }, 60_000);

  it("a real invoice id without a reference is still verified", async () => {
    const { order, invoiceId } = await paidAtGateway();
    await callReturn(`${BASE}/payment/return?Id=${invoiceId}`);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("asks the gateway about our own invoice, whatever payment id is in the address", async () => {
    const mine = await paidAtGateway();
    const other = await paidAtGateway();
    const ref = paymentReturnRef((await paymentRows(mine.order.id))[0].id);
    sim.state.requests.length = 0;
    await callReturn(`${BASE}/payment/return?ref=${ref}&paymentId=${other.paymentId}&Id=${other.paymentId}`);
    const calls = sim.state.requests.filter((r) => r.path === "/v2/GetPaymentStatus");
    expect(calls.map((c) => c.body)).toEqual([{ Key: String(mine.invoiceId), KeyType: "InvoiceId" }]);
    expect((await orderRow(other.order.id)).status).toBe("pending");
    expect((await orderRow(mine.order.id)).status).toBe("paid");
  });

  it("repeat checks of one invoice are capped per invoice and the page still works", async () => {
    const { order, user, redirectUrl } = await paidAtGateway();
    const [p] = await paymentRows(order.id);
    await sql`insert into rate_limits (key, count, reset_at) values (${`payreturn:${p.id}`}, 30, now() + interval '5 minutes')`;
    ctx.userId = user.id;
    sim.state.requests.length = 0;
    const res = await callReturn(redirectUrl);
    expect(pathOf(res)).toBe(`/orders/${order.id}?from=payment`);
    expect(statusCalls(sim)).toBe(0);
  });

  it("after the payment is recorded, a failing session lookup cannot turn the page into an error", async () => {
    const { order, redirectUrl } = await paidAtGateway();
    ctx.sessionFails = true;
    const res = await callReturn(redirectUrl);
    expect(res.status).toBe(303);
    expect(pathOf(res)).toBe(checked);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("after the payment is recorded, a failing cart step cannot turn the page into an error", async () => {
    const { order, user, redirectUrl } = await paidAtGateway();
    ctx.userId = user.id;
    ctx.cartFails = true;
    const res = await callReturn(redirectUrl, "198.51.100.7", "cart=x");
    expect(res.status).toBe(303);
    expect(pathOf(res)).toBe(`/orders/${order.id}?from=payment`);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("a gateway outage sends the owner to the refresh hint and tells a stranger nothing", async () => {
    const { order, user, redirectUrl } = await paidAtGateway();
    sim.setFault("/v2/GetPaymentStatus", "down");
    expect(pathOf(await callReturn(redirectUrl))).toBe(checked);
    ctx.userId = user.id;
    expect(pathOf(await callReturn(redirectUrl))).toBe(`/orders/${order.id}?error=check`);
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("a mismatch sends the owner to the review note and grants nothing", async () => {
    const { order, user, redirectUrl } = await paidAtGateway();
    sim.setAmountTamper(1);
    ctx.userId = user.id;
    const res = await callReturn(redirectUrl);
    sim.setAmountTamper(null);
    expect(pathOf(res)).toBe(`/orders/${order.id}?error=review`);
    expect(await creditedOrders(order.id)).toBe(0);
  });

  it("no parameters: invalid, and nothing is looked up", async () => {
    expect(pathOf(await callReturn(`${BASE}/payment/return`))).toBe("/account?payment=invalid");
    expect(sim.state.requests).toHaveLength(0);
  });

  it("malformed ids are not looked up or sent anywhere", async () => {
    expect(pathOf(await callReturn(`${BASE}/payment/return?paymentId=${encodeURIComponent("1' or 1=1--")}`))).toBe(checked);
    expect(sim.state.requests).toHaveLength(0);
  });

  it("payments off: neutral, no gateway", async () => {
    const { redirectUrl } = await paidAtGateway();
    sim.state.requests.length = 0;
    setEnv({ PAYMENTS_MODE: "disabled" });
    expect(pathOf(await callReturn(redirectUrl))).toBe(checked);
    expect(sim.state.requests).toHaveLength(0);
  });

  it("a declined return does not grant and shows the owner the order", async () => {
    const { order, user } = await newOrder();
    const { url } = await startPayment(order, 1);
    const { redirectUrl } = await sim.pay(invoiceIdOf(url), "fail");
    ctx.userId = user.id;
    const res = await callReturn(redirectUrl);
    expect(pathOf(res)).toBe(`/orders/${order.id}?from=payment`);
    expect((await orderRow(order.id)).status).toBe("failed");
    expect(await activeEntitlements(user.id)).toHaveLength(0);
  });
});
