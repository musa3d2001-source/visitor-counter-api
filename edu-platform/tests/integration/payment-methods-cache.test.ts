import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_METHODS_DEADLINE_MS, checkoutPaymentMethods, getPaymentMethods, resetPaymentMethodsCache } from "@/server/payments/service";
import { amountBand } from "@/server/payments/method-cache";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

let sim: Simulator;
const lists = () => sim.state.requests.filter((r) => r.path === "/v2/InitiatePayment").length;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(async () => {
  await sql`delete from payment_method_cache`;
  resetPaymentMethodsCache();
  sim.state.requests.length = 0;
});
afterEach(() => {
  sim.clearFaults();
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

describe("methods offered at checkout", () => {
  it("amounts of one band share a list, and different bands do not", () => {
    expect(amountBand(2_000)).toBe(amountBand(4_999));
    expect(amountBand(999)).not.toBe(amountBand(1_000));
    expect(amountBand(9_999_999)).toBe(amountBand(250_000));
  });

  it("asks the gateway once per band", async () => {
    await checkoutPaymentMethods(2_000);
    await checkoutPaymentMethods(3_000);
    expect(lists()).toBe(1);
  });

  it("a cold instance reads the shared copy instead of waiting on the gateway", async () => {
    const first = await checkoutPaymentMethods(2_000);
    expect(first.methods.length).toBeGreaterThan(0);
    resetPaymentMethodsCache();
    sim.state.requests.length = 0;
    sim.setFault("/v2/InitiatePayment", "down");
    expect(await checkoutPaymentMethods(3_000)).toEqual(first);
    expect(lists()).toBe(0);
  });

  it("serves a stale copy at once rather than making the buyer wait", async () => {
    const first = await checkoutPaymentMethods(2_000);
    await sql`update payment_method_cache set fetched_at = now() - interval '2 hours'`;
    resetPaymentMethodsCache();
    sim.setDelay("/v2/InitiatePayment", 5_000);
    const started = Date.now();
    expect(await checkoutPaymentMethods(2_000)).toEqual(first);
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it("a copy older than a day is not offered", async () => {
    await checkoutPaymentMethods(2_000);
    await sql`update payment_method_cache set fetched_at = now() - interval '25 hours'`;
    resetPaymentMethodsCache();
    sim.setFault("/v2/InitiatePayment", "down");
    expect(await checkoutPaymentMethods(2_000)).toEqual({ methods: [], unavailable: true });
  });

  it("a gateway that does not answer in time still leaves the buyer a way to pay", async () => {
    sim.setDelay("/v2/InitiatePayment", CHECKOUT_METHODS_DEADLINE_MS + 2_000);
    const started = Date.now();
    expect(await checkoutPaymentMethods(2_000)).toEqual({ methods: [], unavailable: true });
    expect(Date.now() - started).toBeLessThan(CHECKOUT_METHODS_DEADLINE_MS + 700);
  });

  it("sandbox and live never share a list", async () => {
    await checkoutPaymentMethods(2_000);
    const rows = await sql<{ environment: string }[]>`select environment from payment_method_cache`;
    expect(rows).toEqual([{ environment: "sandbox" }]);
  });

  it("keeps only what the page needs", async () => {
    await checkoutPaymentMethods(2_000);
    const [{ methods }] = await sql<{ methods: Record<string, unknown>[] }[]>`select methods from payment_method_cache`;
    expect(Object.keys(methods[0]).sort()).toEqual(["code", "id", "imageUrl", "nameAr"]);
  });

  it("the payment path does not trust the shared copy", async () => {
    await checkoutPaymentMethods(2_000);
    resetPaymentMethodsCache();
    sim.state.requests.length = 0;
    await getPaymentMethods(2_000);
    expect(lists()).toBe(1);
  });

  it("the page does not wait on the gateway directly", () => {
    const source = readFileSync(resolve(__dirname, "../../src/app/(site)/checkout/page.tsx"), "utf8");
    expect(source).not.toContain("getPaymentMethods(");
    expect(source).toContain("checkoutPaymentMethods(total)");
  });
});
