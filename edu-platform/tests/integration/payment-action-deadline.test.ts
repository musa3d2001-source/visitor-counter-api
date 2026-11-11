import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_GATEWAY_CALL_MS, PAYMENT_ACTION_BUDGET_MS, PAYMENT_CREATE_RESERVE_MS, PaymentGatewaySlowError, resetPaymentMethodsCache } from "@/server/payments/service";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { expireInvoice, invoiceIdOf, invoicesCreated, newOrder, orderRow, paymentRows, startPayment, statusCalls } from "../helpers/payment-flow";
import { createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

/**
 * مهلة واحدة لبدء الدفع وإعادة المحاولة (R025): بوابة بطيئة وفواتير سابقة لا تجعل الأمر يتجاوز maxDuration للصفحة،
 * فلا يقطعه Vercel في منتصفه ولا تبقى مطالبة إنشاء معلقة ولا فاتورة لم يرها أحد.
 */

const ctx = vi.hoisted(() => ({ user: null as unknown, cart: [] as string[], redirected: [] as string[] }));
vi.mock("@/server/auth/guards", async (original) => ({ ...(await original<typeof import("@/server/auth/guards")>()), assertUser: async () => ctx.user }));
vi.mock("@/server/commerce/cart", async (original) => ({
  ...(await original<typeof import("@/server/commerce/cart")>()),
  getCartIds: async () => ctx.cart,
  writeCartIds: async (ids: string[]) => {
    ctx.cart = ids;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    ctx.redirected.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

const { placeOrderAction, retryPaymentAction } = await import("@/app/(site)/checkout/actions");

let sim: Simulator;
const STATUS = "/v2/GetPaymentStatus";

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
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
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
  ctx.redirected.length = 0;
});

const fd = (values: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  return form;
};

/** طلب عليه فاتورتان سابقتان انتهتا: كل بدء دفع جديد يسأل البوابة عنهما أولًا (D3) */
async function orderWithEarlierInvoices() {
  const made = await newOrder();
  for (let i = 0; i < 2; i++) {
    const { url } = await startPayment(made.order, null);
    await expireInvoice(sim, invoiceIdOf(url));
  }
  sim.state.requests.length = 0;
  return made;
}

const claims = (orderId: string) => sql<{ n: number }[]>`select count(*)::int as n from payments where order_id = ${orderId} and status = 'initiated'`.then(([r]) => r.n);

describe("one deadline for starting a payment", () => {
  it("fits inside the page's maxDuration with room for the database and the redirect", () => {
    // الإجراءات ترث maxDuration من صفحتها (node_modules/next/dist/docs/.../maxDuration.md، قسم Server Actions)
    for (const page of ["src/app/(site)/checkout/page.tsx", "src/app/(site)/orders/[id]/page.tsx"]) {
      expect(readFileSync(page, "utf8")).toMatch(/export const maxDuration = 60;/);
    }
    expect(PAYMENT_ACTION_BUDGET_MS + 15_000).toBeLessThanOrEqual(60_000);
    expect(PAYMENT_CREATE_RESERVE_MS).toBeGreaterThan(MIN_GATEWAY_CALL_MS);
  });

  it("a slow gateway with earlier invoices stops the walk at the deadline and creates nothing", async () => {
    const { order } = await orderWithEarlierInvoices();
    sim.setDelay(STATUS, 1_500);
    const started = Date.now();
    // يكفي الوقت لسؤال واحد عن الفواتير السابقة لا لسؤالين، ثم الاحتياطي لنداء الإنشاء
    const deadline = started + PAYMENT_CREATE_RESERVE_MS + 2_500;
    await expect(startPayment(order, null, { deadline })).rejects.toBeInstanceOf(PaymentGatewaySlowError);
    expect(Date.now() - started).toBeLessThan(2_500);
    expect(statusCalls(sim)).toBe(1);
    expect(invoicesCreated(sim)).toBe(0);
    expect(await claims(order.id)).toBe(0);
    expect(await paymentRows(order.id)).toHaveLength(2);
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("a gateway that does not answer is cut off at the time left, not after the usual 20 seconds", async () => {
    const { order } = await orderWithEarlierInvoices();
    sim.setDelay(STATUS, 8_000);
    const started = Date.now();
    const deadline = started + PAYMENT_CREATE_RESERVE_MS + 3_000;
    await expect(startPayment(order, null, { deadline })).rejects.toBeInstanceOf(PaymentGatewaySlowError);
    expect(Date.now() - started).toBeLessThan(4_500);
    expect(invoicesCreated(sim)).toBe(0);
    expect(await claims(order.id)).toBe(0);
  });

  it("no creation claim is taken with less than the reserve left", async () => {
    const { order } = await newOrder();
    const deadline = Date.now() + PAYMENT_CREATE_RESERVE_MS - 1_000;
    await expect(startPayment(order, null, { deadline })).rejects.toBeInstanceOf(PaymentGatewaySlowError);
    expect(invoicesCreated(sim)).toBe(0);
    expect(await paymentRows(order.id)).toHaveLength(0);
  });

  it("with enough time the same order gets its invoice as before", async () => {
    const { order } = await orderWithEarlierInvoices();
    sim.setDelay(STATUS, 300);
    const { url, reused } = await startPayment(order, null, { deadline: Date.now() + PAYMENT_CREATE_RESERVE_MS + 5_000 });
    expect(reused).toBe(false);
    expect(url).toContain("/pay/");
    expect(invoicesCreated(sim)).toBe(1);
  });
});

describe("the student's actions carry the deadline from their first line", () => {
  /** أول قراءة للساعة في الإجراء هي بداية مهلته: نجعلها تبدو قبل ٤٠ ثانية، كأن الطلب انتظر طويلًا قبل أن يصل */
  const lateStart = () => {
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementationOnce(() => realNow() - 40_000);
  };

  it("retry sends the student back with the slow notice and creates nothing", async () => {
    const { order, user } = await orderWithEarlierInvoices();
    ctx.user = user;
    lateStart();
    await expect(retryPaymentAction(fd({ orderId: order.id, guardianDeclaration: "on", termsAccepted: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected.at(-1)).toBe(`/orders/${order.id}?error=slow`);
    expect(invoicesCreated(sim)).toBe(0);
    expect(await claims(order.id)).toBe(0);
  });

  it("checkout says the gateway is slow instead of running past the page's limit", async () => {
    const product = await createProduct({ priceFils: 2500 });
    const user = await createUser({ phone: "+96599887766" });
    ctx.user = user;
    ctx.cart = [product.id];
    lateStart();
    const out = await placeOrderAction({}, fd({ guardianDeclaration: "on", termsAccepted: "on" }));
    expect(out).toMatchObject({ error: expect.stringContaining("بوابة الدفع بطيئة") });
    expect(invoicesCreated(sim)).toBe(0);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from payments p join orders o on o.id = p.order_id where o.user_id = ${user.id}`;
    expect(n).toBe(0);
  });
});
