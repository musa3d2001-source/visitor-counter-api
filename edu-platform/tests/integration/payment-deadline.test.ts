import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withDbDeadline } from "@/server/db";
import { handleMyFatoorahWebhook } from "@/server/payments/service";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { activeEntitlements } from "../helpers/factories";
import { invoiceIdOf, newOrder, orderRow, startPayment } from "../helpers/payment-flow";
import { SIM_API_KEY, SIM_PORT, TEST_DATABASE_URL, WEBHOOK_SECRET } from "../test-env";

/**
 * مهلة الأمر لا تترك تأكيد الدفع نصف منجز (F5): تنتهي المهلة في منتصف معاملة applyConfirmedPayment، بعد أن حدّثت
 * صف الدفع، فتُلغى المعاملة كلها ويُرد على البوابة بغير 200، ثم تنجح إعادة إرسالها مرة واحدة: منح واحد وأرباح مرة واحدة.
 */
let sim: Simulator;
let receiver: Server;
const received: { status: number; result: string }[] = [];
const blocker = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
const observer = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
let firstAttemptLeft: Record<string, unknown> | null = null;
let releaseLock: (() => void) | null = null;

beforeAll(async () => {
  await resetDb();
  receiver = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    // مهلة قصيرة كما يحدث عند ضغط حقيقي
    const out = await withDbDeadline(700, () => handleMyFatoorahWebhook(Buffer.concat(chunks).toString("utf8"), headers));
    received.push(out);
    if (received.length === 1) {
      const [row] = await observer`
        select p.status, p.paid_at is not null as paid,
          (select count(*)::int from entitlements e where e.user_id = o.user_id) as grants,
          (select count(*)::int from teacher_earnings t where t.order_id = o.id) as earnings,
          (select count(*)::int from payment_events where processed_at is not null) as processed
        from payments p join orders o on o.id = p.order_id order by p.created_at desc limit 1
      `;
      firstAttemptLeft = { ...row };
    }
    // انتهى سبب البطء بعد أول تسليم، فإعادة الإرسال تجد القاعدة متاحة
    releaseLock?.();
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
    webhookRetryDelayMs: 300,
  });
});

afterAll(async () => {
  releaseLock?.();
  await sim?.close();
  await new Promise<void>((r) => receiver.close(() => r()));
  await blocker.end();
  await observer.end();
  await closeDb();
});

async function waitFor(cond: () => boolean, ms = 10_000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function waitForAsync(cond: () => Promise<boolean>, ms = 5_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** يقفل order_items من اتصال آخر حتى يُحرر: أول أمر يقرؤه في معاملة الدفع ينتظر حتى تنتهي مهلته */
function lockOrderItems(): Promise<void> {
  return new Promise((locked, failed) => {
    const done = new Promise<void>((r) => (releaseLock = () => (releaseLock = null, r())));
    blocker
      .begin(async (tx) => {
        await tx`lock table order_items in access exclusive mode`;
        locked();
        await done;
      })
      .catch(failed);
  });
}

describe("a statement deadline inside the payment-apply transaction", () => {
  it("rolls the whole transaction back, answers non-200, and the gateway's retry grants exactly once", async () => {
    const { user, product, order } = await newOrder();
    const { url } = await startPayment(order, null);
    const [{ id: paymentId }] = await sql<{ id: string }[]>`select id from payments where order_id = ${order.id}`;
    await lockOrderItems();
    await sim.pay(invoiceIdOf(url), "success");

    // المعاملة كتبت صف الدفع ثم علقت على order_items: تحمل قفل الكتابة على payments وهي تنتظر
    await waitForAsync(async () => {
      const rows = await observer`
        select 1 from pg_locks l join pg_stat_activity a using (pid)
        where a.application_name = 'edu-platform' and l.relation = 'payments'::regclass and l.mode = 'RowExclusiveLock' and l.granted
      `;
      return rows.length > 0;
    });
    await waitFor(() => received.length >= 2);

    expect(received[0].status).not.toBe(200);
    expect(received[0].result).toMatch(/busy/);
    // ما رأته القاعدة بعد فشل المحاولة الأولى وقبل الإعادة: لا أثر للتحديث ولا منح ولا أرباح
    expect(firstAttemptLeft).toEqual({ status: "pending", paid: false, grants: 0, earnings: 0, processed: 0 });

    expect(received[1]).toMatchObject({ status: 200, result: "paid" });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    const [{ n: grants }] = await sql<{ n: number }[]>`select count(*)::int as n from entitlements where user_id = ${user.id}`;
    expect(grants).toBe(1);
    const [{ status }] = await sql<{ status: string }[]>`select status from payments where id = ${paymentId}`;
    expect(status).toBe("paid");
    const processed = await sql`select 1 from payment_events where processed_at is not null`;
    expect(processed).toHaveLength(1);
  });
});
