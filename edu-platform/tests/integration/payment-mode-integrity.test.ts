import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createOrder, OrderError, type OrderRow } from "@/server/commerce/orders";
import { PaymentModeMismatchError, paymentsConfig, startPayment } from "@/server/payments/service";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

/** ما يصل إلى الخدمة من إجراءات الشراء — تستبدلها الاختبارات لتشغيل الإجراءات الحقيقية خارج Next.js */
const ctx = vi.hoisted(() => ({ user: null as unknown, cart: [] as string[], redirected: [] as string[] }));

vi.mock("@/server/auth/guards", () => ({ assertUser: async () => ctx.user }));
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

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  delete process.env.ALLOW_SANDBOX_ON_PRODUCTION;
  delete process.env.VERCEL_ENV;
  resetEnvCache();
  ctx.redirected.length = 0;
});

function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (k === "NODE_ENV") vi.stubEnv("NODE_ENV", v as "production");
    else if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

const BLOCK_REASON = /الوضع التجريبي محظور على نشر الإنتاج/;

describe("sandbox on a production deployment", () => {
  it.each([
    ["a real domain", "https://farqad.com", undefined],
    ["a real domain on Vercel Production", "https://farqad.com", "production"],
    ["the current production host (the word preview is not a test signal)", "https://darb-preview.vercel.app", "production"],
    ["the same host without VERCEL_ENV", "https://darb-preview.vercel.app", undefined],
    ["the default localhost APP_URL on Vercel Production", "http://localhost:3000", "production"],
    ["a word that only contains a test word", "https://devices.farqad.com", undefined],
    ["a test word deeper in the domain", "https://shop.staging.farqad.com", undefined],
  ])("blocked on %s", (_label, APP_URL, VERCEL_ENV) => {
    setEnv({ NODE_ENV: "production", APP_URL, VERCEL_ENV });
    expect(paymentsConfig()).toMatchObject({ enabled: false, reason: expect.stringMatching(BLOCK_REASON) });
  });

  it.each([
    ["the explicit override", "https://farqad.com", undefined, "true"],
    ["the explicit override, on Vercel Production", "https://farqad.com", "production", "true"],
    ["a Vercel preview deployment", "https://farqad.com", "preview", undefined],
    ["a Vercel development deployment", "https://farqad.com", "development", undefined],
    ["a staging subdomain", "https://staging.farqad.com", undefined, undefined],
    ["a sandbox subdomain", "https://sandbox.farqad.com", "production", undefined],
    ["a hyphenated dev host", "https://darb-dev.vercel.app", "production", undefined],
    ["localhost", "http://localhost:3100", undefined, undefined],
    ["a loopback address", "http://127.0.0.1:3000", undefined, undefined],
    ["a .test host", "https://farqad.test", undefined, undefined],
  ])("allowed with %s", (_label, APP_URL, VERCEL_ENV, ALLOW_SANDBOX_ON_PRODUCTION) => {
    setEnv({ NODE_ENV: "production", APP_URL, VERCEL_ENV, ALLOW_SANDBOX_ON_PRODUCTION });
    expect(paymentsConfig()).toMatchObject({ enabled: true, environment: "sandbox" });
  });

  it("the override must be exactly true", () => {
    setEnv({ NODE_ENV: "production", APP_URL: "https://farqad.com", ALLOW_SANDBOX_ON_PRODUCTION: "false" });
    expect(paymentsConfig()).toMatchObject({ enabled: false });
  });

  it("outside production the rule does not apply", () => {
    setEnv({ NODE_ENV: "development", APP_URL: "https://farqad.com" });
    expect(paymentsConfig()).toMatchObject({ enabled: true, environment: "sandbox" });
  });

  it("live mode is not affected by the sandbox rule", () => {
    setEnv({ NODE_ENV: "production", APP_URL: "https://farqad.com", PAYMENTS_MODE: "live", MYFATOORAH_LIVE_CONFIRMED: "true", MYFATOORAH_BASE_URL: undefined });
    expect(paymentsConfig()).toMatchObject({ enabled: true, environment: "live", baseUrl: "https://api.myfatoorah.com" });
  });

  it.each(["https://api.myfatoorah.com", "https://api-sa.myfatoorah.com", "https://API.MyFatoorah.com/"])("sandbox can never point at the live gateway %s, even with the override", (MYFATOORAH_BASE_URL) => {
    setEnv({ MYFATOORAH_BASE_URL });
    expect(paymentsConfig()).toMatchObject({ enabled: false, reason: "رابط بوابة الدفع لا يطابق الوضع التجريبي" });
    setEnv({ NODE_ENV: "production", ALLOW_SANDBOX_ON_PRODUCTION: "true" });
    expect(paymentsConfig()).toMatchObject({ enabled: false, reason: "رابط بوابة الدفع لا يطابق الوضع التجريبي" });
  });

  it("the official test gateway is allowed in sandbox", () => {
    setEnv({ MYFATOORAH_BASE_URL: "https://apitest.myfatoorah.com" });
    expect(paymentsConfig()).toMatchObject({ enabled: true, baseUrl: "https://apitest.myfatoorah.com" });
    setEnv({ MYFATOORAH_BASE_URL: undefined });
    expect(paymentsConfig()).toMatchObject({ enabled: true, baseUrl: "https://apitest.myfatoorah.com" });
  });
});

async function makeOrder(isTest: boolean, priceFils = 3000) {
  const user = await createUser();
  const p = await createProduct({ priceFils });
  return { user, product: p, order: await createOrder({ user, productIds: [p.id], isTest }) };
}
const liveOnSimulator = { PAYMENTS_MODE: "live", MYFATOORAH_LIVE_CONFIRMED: "true" };

describe("startPayment refuses an order from the other mode", () => {
  it("a real order cannot be paid against the sandbox: nothing is written", async () => {
    const { order } = await makeOrder(false);
    await expect(startPayment(order, 1)).rejects.toBeInstanceOf(PaymentModeMismatchError);
    expect(await sql`select 1 from payments where order_id = ${order.id}`).toHaveLength(0);
  });

  it("a test order cannot be paid for real: nothing is written and no invoice is created", async () => {
    const { order } = await makeOrder(true);
    setEnv(liveOnSimulator);
    const before = sim.state.invoices.size;
    await expect(startPayment(order, 1)).rejects.toBeInstanceOf(PaymentModeMismatchError);
    expect(await sql`select 1 from payments where order_id = ${order.id}`).toHaveLength(0);
    expect(sim.state.invoices.size).toBe(before);
  });

  it("the refusal comes before any status change on a failed order", async () => {
    const { order } = await makeOrder(true);
    await sql`update orders set status = 'failed' where id = ${order.id}`;
    setEnv(liveOnSimulator);
    const failed = { ...order, status: "failed" as const };
    await expect(startPayment(failed, 1)).rejects.toBeInstanceOf(PaymentModeMismatchError);
    const [row] = await sql<OrderRow[]>`select * from orders where id = ${order.id}`;
    expect(row.status).toBe("failed");
  });

  it("orders of the matching mode still start", async () => {
    const sandbox = await makeOrder(true);
    await expect(startPayment(sandbox.order, 1)).resolves.toMatchObject({ url: expect.stringContaining("/pay/") });
    const live = await makeOrder(false);
    setEnv(liveOnSimulator);
    await expect(startPayment(live.order, 1)).resolves.toMatchObject({ url: expect.stringContaining("/pay/") });
    const [p] = await sql<{ environment: string }[]>`select environment from payments where order_id = ${live.order.id}`;
    expect(p.environment).toBe("live");
  });

  it("the retry action sends the student to the page that explains it", async () => {
    const { user, order } = await makeOrder(true);
    ctx.user = user;
    setEnv(liveOnSimulator);
    const fd = new FormData();
    fd.set("orderId", order.id);
    await expect(retryPaymentAction(fd)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected).toEqual([`/orders/${order.id}?error=mode`]);
  });

  it("any other failure on retry keeps the generic message", async () => {
    const { user, order } = await makeOrder(true);
    ctx.user = user;
    setEnv({ MYFATOORAH_API_KEY: "wrong-key" });
    const fd = new FormData();
    fd.set("orderId", order.id);
    await expect(retryPaymentAction(fd)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected).toEqual([`/orders/${order.id}?error=payment`]);
  });
});

describe("disabled mode writes no pending rows", () => {
  const counts = async () => {
    const [{ orders, items, payments }] = await sql<{ orders: number; items: number; payments: number }[]>`
      select (select count(*)::int from orders) as orders, (select count(*)::int from order_items) as items, (select count(*)::int from payments) as payments
    `;
    return { orders, items, payments };
  };

  it("createOrder refuses a paid order when told checkout is blocked, and writes nothing", async () => {
    const user = await createUser();
    const p = await createProduct({ priceFils: 3000 });
    const before = await counts();
    await expect(createOrder({ user, productIds: [p.id], isTest: false, paidCheckoutBlockedReason: "غير متاح" })).rejects.toBeInstanceOf(OrderError);
    expect(await counts()).toEqual(before);
  });

  it("the checkout action in disabled mode answers with a message and creates no order", async () => {
    const user = await createUser();
    const p = await createProduct({ priceFils: 3000 });
    ctx.user = user;
    ctx.cart = [p.id];
    setEnv({ PAYMENTS_MODE: "disabled" });
    const before = await counts();
    const out = await placeOrderAction(null, new FormData());
    expect(out).toEqual({ error: "الدفع الإلكتروني غير متاح حاليًا. تبقى المنتجات في سلتك لتعود إليها لاحقًا." });
    expect(await counts()).toEqual(before);
    expect(ctx.cart).toEqual([p.id]);
    expect(ctx.redirected).toEqual([]);
  });

  it("a free order still completes in disabled mode", async () => {
    const user = await createUser();
    const p = await createProduct({ priceFils: 0 });
    ctx.user = user;
    ctx.cart = [p.id];
    setEnv({ PAYMENTS_MODE: "disabled" });
    await expect(placeOrderAction(null, new FormData())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected[0]).toMatch(/^\/orders\/[0-9a-f-]{36}\?from=checkout$/);
    const [o] = await sql<{ status: string; is_test: boolean }[]>`select status, is_test from orders where user_id = ${user.id}`;
    expect(o).toEqual({ status: "paid", is_test: false });
    expect(ctx.cart).toEqual([]);
  });

  it("with payments on, the action marks sandbox orders as test and goes to the gateway", async () => {
    const user = await createUser();
    const p = await createProduct({ priceFils: 3000 });
    ctx.user = user;
    ctx.cart = [p.id];
    await expect(placeOrderAction(null, new FormData())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected[0]).toContain("/pay/");
    const [o] = await sql<{ status: string; is_test: boolean }[]>`select status, is_test from orders where user_id = ${user.id}`;
    expect(o).toEqual({ status: "pending", is_test: true });
  });
});
