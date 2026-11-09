import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleMyFatoorahWebhook, startPayment } from "@/server/payments/service";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb } from "../helpers/db";
import { activeEntitlements } from "../helpers/factories";
import { invoiceIdOf, newOrder, orderRow } from "../helpers/payment-flow";
import { SIM_API_KEY, SIM_PORT, WEBHOOK_SECRET } from "../test-env";

/**
 * إعادة المحاولة من البوابة (Webhook V2 يعيد حتى ٥ مرات، وبحد أقصى ١٨٠ ثانية بين المحاولات):
 * رد 500 منا يجب أن يبقي الحدث قابلًا للمعالجة في المحاولة التالية.
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
    // انتهى العطل بعد أول تسليم، فالمحاولة التالية تجد البوابة متاحة
    sim.clearFaults();
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
    webhookRetries: 5,
    webhookRetryDelayMs: 50,
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

describe("the gateway retrying a delivery we did not acknowledge", () => {
  it("applies the payment on the retry and then stops", async () => {
    const { user, product, order } = await newOrder();
    const { url } = await startPayment(order, null);
    sim.setFault("/v2/GetPaymentStatus", "error");
    await sim.pay(invoiceIdOf(url), "success");

    await waitFor(() => received.length >= 2);
    expect(received.map((r) => r.status)).toEqual([500, 200]);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);

    await new Promise((r) => setTimeout(r, 200));
    expect(sim.state.webhookDeliveries.map((d) => d.status)).toEqual([500, 200]);
  });
});
