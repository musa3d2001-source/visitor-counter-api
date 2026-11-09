import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleMyFatoorahWebhook, verifyAndApplyPayment } from "@/server/payments/service";
import { createOrder } from "@/server/commerce/orders";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { activeEntitlements, createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, WEBHOOK_SECRET } from "../test-env";
import { startPayment } from "../helpers/payment-flow";

/**
 * مسار HTTP كامل كما سيحدث في الإنتاج:
 * صفحة الدفع (المحاكي) ← POST نجاح ← 302 إلى CallBackUrl مع paymentId ← Webhook موقّع (مرتين) إلى مستقبل يستدعي معالج التطبيق
 */
let sim: Simulator;
let receiver: Server;
const received: { status: number; result: string }[] = [];

beforeAll(async () => {
  await resetDb();
  receiver = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const out = await handleMyFatoorahWebhook(Buffer.concat(chunks).toString("utf8"), headers);
    received.push(out);
    res.writeHead(out.status, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
  });
  await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", () => r()));
  const port = (receiver.address() as AddressInfo).port;
  sim = await startSimulator({
    port: SIM_PORT,
    apiKey: SIM_API_KEY,
    webhookUrl: `http://127.0.0.1:${port}/api/payments/myfatoorah/webhook`,
    webhookSecret: WEBHOOK_SECRET,
    duplicateWebhooks: true,
  });
});

afterAll(async () => {
  await sim?.close();
  await new Promise<void>((r) => receiver.close(() => r()));
  await closeDb();
});

async function waitFor(cond: () => boolean, ms = 5000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("hosted payment page + callback + duplicated webhook", () => {
  it("success: redirect carries paymentId, webhook applied once, duplicate ignored", async () => {
    const user = await createUser();
    const product = await createProduct({ priceFils: 4500 });
    const order = await createOrder({ user, productIds: [product.id], isTest: true });
    const { url } = await startPayment(order, 1);

    const page = await fetch(url);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('data-testid="sim-pay-success"');
    expect(html).toContain("4.500 KWD");

    const post = await fetch(`${url}/success`, { method: "POST", redirect: "manual" });
    expect(post.status).toBe(302);
    const location = new URL(post.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("http://localhost:3000/payment/return");
    const paymentId = location.searchParams.get("paymentId")!;
    expect(paymentId).toMatch(/^\d{10,20}$/);

    await waitFor(() => received.length >= 2);
    const results = received.map((r) => r.result).sort();
    expect(results).toEqual(["duplicate ignored", "paid"]);
    expect(received.every((r) => r.status === 200)).toBe(true);

    // صفحة العودة تتحقق أيضًا من الخادم — دون أي تكرار
    expect(await verifyAndApplyPayment({ paymentId })).toEqual({ state: "paid", orderId: order.id, changed: false });
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from entitlements where user_id = ${user.id}`;
    expect(n).toBe(1);
  });

  it("failure: redirect to ErrorUrl and no entitlement", async () => {
    received.length = 0;
    const user = await createUser();
    const product = await createProduct({ priceFils: 1000 });
    const order = await createOrder({ user, productIds: [product.id], isTest: true });
    const { url } = await startPayment(order, 2);
    const post = await fetch(`${url}/fail`, { method: "POST", redirect: "manual" });
    expect(post.status).toBe(302);
    await waitFor(() => received.length >= 2);
    expect(received.map((r) => r.result).sort()).toEqual(["duplicate ignored", "failed"]);
    const [o] = await sql<{ status: string }[]>`select status from orders where id = ${order.id}`;
    expect(o.status).toBe("failed");
    expect(await activeEntitlements(user.id)).toEqual([]);
  });
});
