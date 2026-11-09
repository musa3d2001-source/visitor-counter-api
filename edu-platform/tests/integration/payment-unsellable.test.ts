import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closeOrder, createOrder, type OrderRow } from "@/server/commerce/orders";
import { resetEnvCache } from "@/server/env";
import { OrderClosedError, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { invoiceIdOf, invoicesCreated, orderRow, startPayment } from "../helpers/payment-flow";
import { activeEntitlements, createBundle, createProduct, createTeacher, createUser, type TestProduct } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

/**
 * طلب مفتوح يعيش حتى ٧٢ ساعة، وفي هذه المدة قد يُخفى المنتج أو يظهر فيه عيب.
 * السلة تمنع ذلك عند الإضافة فقط، فالدفع يتحقق من جديد قبل أي فاتورة وعند وصول المال.
 */
const CONSENT = { guardianDeclared: true, termsAccepted: true, meta: { ip: null, userAgent: null } };

let sim: Simulator;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});
afterEach(() => sim.clearFaults());
afterAll(async () => {
  await sim?.close();
  await closeDb();
});

type Spoil = (p: TestProduct) => Promise<unknown>;
const SPOILS: [string, Spoil][] = [
  ["hidden", (p) => sql`update products set status = 'hidden' where id = ${p.id}`],
  ["archived", (p) => sql`update products set status = 'archived' where id = ${p.id}`],
  ["a flagged main file", (p) => sql`update product_files set check_status = 'corrupt' where id = ${p.mainFileId}`],
  ["a price cleared to zero without being marked free", (p) => sql`update products set price_fils = 0 where id = ${p.id}`],
  [
    "a teacher with no agreed share",
    async (p) => {
      const t = await createTeacher({ shareBps: null });
      await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
    },
  ],
];

async function openOrder(priceFils = 3000) {
  const user = await createUser({ phone: "+96599887766" });
  const product = await createProduct({ priceFils });
  const order = await createOrder({ user, productIds: [product.id], isTest: true, consent: CONSENT });
  return { user, product, order };
}

const latestExtra = async (orderId: string) => (await sql<{ kind: string; details: Record<string, unknown> }[]>`select kind, details from payment_extras where order_id = ${orderId} order by created_at desc limit 1`)[0];

describe.each(SPOILS)("a product that became unsellable: %s", (_name, spoil) => {
  it("gets no invoice, and the open order is closed with nothing charged", async () => {
    const { product, order } = await openOrder();
    await spoil(product);
    sim.state.requests.length = 0;
    const err = await startPayment(order, null).catch((e) => e);
    expect(err).toBeInstanceOf(OrderClosedError);
    expect((err as OrderClosedError).reason).toBe("product_ended");
    expect(invoicesCreated(sim)).toBe(0);
    expect((await orderRow(order.id)).status).toBe("cancelled");
  });

  it("an old invoice link is not reopened", async () => {
    const { product, order } = await openOrder();
    await startPayment(order, null);
    await spoil(product);
    await expect(startPayment(order, null)).rejects.toBeInstanceOf(OrderClosedError);
  });

  it("money arriving on an invoice issued earlier is held for the owner, and grants nothing", async () => {
    const { user, product, order } = await openOrder();
    const { url } = await startPayment(order, null);
    await spoil(product);
    const invoice = invoiceIdOf(url);
    await sim.pay(invoice, "success");
    await expect(verifyAndApplyPayment({ invoiceId: String(invoice) })).resolves.toMatchObject({ state: "flagged", kind: "late_review" });
    expect(await activeEntitlements(user.id)).not.toContain(product.id);
    const after = await orderRow(order.id);
    expect(after).toMatchObject({ status: "cancelled", closed_reason: "product_ended" });
    expect(await latestExtra(order.id)).toMatchObject({ kind: "late_review", details: { blockers: [`unavailable:${product.id}`] } });
  });

  it("money arriving after the order was closed is held too, instead of completing it late", async () => {
    const { user, product, order } = await openOrder();
    const { url } = await startPayment(order, null);
    await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason: "student_cancelled", actorId: null }));
    await spoil(product);
    const invoice = invoiceIdOf(url);
    await sim.pay(invoice, "success");
    await expect(verifyAndApplyPayment({ invoiceId: String(invoice) })).resolves.toMatchObject({ state: "flagged", kind: "late_review" });
    expect(await activeEntitlements(user.id)).not.toContain(product.id);
  });
});

describe("a bundle", () => {
  async function bundleOrder() {
    const user = await createUser({ phone: "+96599887766" });
    const inside = await createProduct({ priceFils: 1000 });
    const bundle = await createBundle({ items: [inside.id], priceFils: 2000 });
    const order: OrderRow = await createOrder({ user, productIds: [bundle.id], isTest: true, consent: CONSENT });
    return { user, inside, bundle, order };
  }

  it("is closed when something inside it has a flagged file", async () => {
    const { inside, order } = await bundleOrder();
    await sql`update product_files set check_status = 'encrypted' where id = ${inside.mainFileId}`;
    await expect(startPayment(order, null)).rejects.toBeInstanceOf(OrderClosedError);
  });

  it("money on an earlier invoice is held when something inside it went bad", async () => {
    const { user, bundle, inside, order } = await bundleOrder();
    const { url } = await startPayment(order, null);
    await sql`update product_files set check_status = 'encrypted' where id = ${inside.mainFileId}`;
    const invoice = invoiceIdOf(url);
    await sim.pay(invoice, "success");
    await expect(verifyAndApplyPayment({ invoiceId: String(invoice) })).resolves.toMatchObject({ state: "flagged", kind: "late_review" });
    expect(await activeEntitlements(user.id)).not.toContain(bundle.id);
  });
});

describe("nothing wrong", () => {
  it("an order for a healthy product still pays and grants", async () => {
    const { user, product, order } = await openOrder();
    const { url } = await startPayment(order, null);
    const invoice = invoiceIdOf(url);
    await sim.pay(invoice, "success");
    await expect(verifyAndApplyPayment({ invoiceId: String(invoice) })).resolves.toMatchObject({ state: "paid" });
    expect(await activeEntitlements(user.id)).toContain(product.id);
  });
});
