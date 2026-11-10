import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createOrder } from "@/server/commerce/orders";
import { handleMyFatoorahWebhook, resetPaymentMethodsCache } from "@/server/payments/service";
import { HEAL_LIMITS, healBuyerOrders } from "@/server/payments/heal";
import { claimDueInvoices } from "@/server/payments/invoice-queue";
import { CALL_TIMEOUT_MS, RECONCILE_BATCH_SIZE, RECONCILE_BUDGET_MS, reconcileFailure, runPaymentReconciliation } from "@/server/payments/reconcile";
import { reconcileNow, unhealedOrders } from "@/server/payments/unhealed";
import { GET, maxDuration as routeMaxDuration } from "@/app/api/cron/reconcile-payments/route";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { auditCount, invoiceIdOf, newOrder, orderRow, paymentRows, startPayment, statusCalls } from "../helpers/payment-flow";
import { activeEntitlements, createBundle, createProduct, createTeacher, createUser, createVideoProduct } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("@/server/auth/guards", async (original) => ({ ...(await original<typeof import("@/server/auth/guards")>()), requireUser: async () => ctx.user, assertUser: async () => ctx.user }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: LibraryPage } = await import("@/app/(site)/library/page");

const CRON = "cron-secret-0123456789abcdef";
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
  await sql`update payments set status = 'expired', expires_at = now() - interval '30 days', last_checked_at = now(), reconcile_claimed_at = null`;
  await sql`update orders set status = 'cancelled', closed_at = now() where status in ('pending', 'failed')`;
  await sql`delete from rate_limits where key like 'payment-heal:%' or key like 'ops_reconcile:%'`;
  await sql`delete from job_heartbeats`;
  sim.state.requests.length = 0;
  process.env.CRON_SECRET = CRON;
  resetEnvCache();
});
afterEach(() => {
  sim.clearFaults();
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

/** عمر الفاتورة كما لو أن المشتري غادر قبل دقائق */
const age = (orderId: string, minutes = 5) => sql`update payments set created_at = now() - make_interval(mins => ${minutes}) where order_id = ${orderId}`;

async function openInvoice(price = 3000) {
  const made = await newOrder(price);
  const { url } = await startPayment(made.order, null);
  await age(made.order.id);
  sim.state.requests.length = 0;
  return { ...made, invoice: invoiceIdOf(url) };
}

describe("healing on the buyer's visit", () => {
  it("a paid order whose webhook never arrived and whose buyer never returned is granted on the next visit to the library", async () => {
    const { user, product, order, invoice } = await openInvoice();
    await sim.pay(invoice, "success");
    expect(await activeEntitlements(user.id)).toEqual([]);
    ctx.user = user;
    const html = await LibraryPage({ searchParams: Promise.resolve({}) }).then(renderToStaticMarkup);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    // في هذه الزيارة نفسها، لا في التالية
    const [{ title }] = await sql<{ title: string }[]>`select title from products where id = ${product.id}`;
    expect(html).toContain(title);
  });

  it("the three buyer pages ask before they read", () => {
    const body = (page: string) => readFileSync(resolve(__dirname, `../../src/app/(site)/${page}`), "utf8");
    for (const [page, read] of [
      ["library/page.tsx", "getLibrary(user.id)"],
      ["orders/[id]/page.tsx", "getUserOrder(id, user.id)"],
      ["checkout/page.tsx", "computeCart(await getCartIds()"],
    ]) {
      const source = body(page);
      expect(source.indexOf("await healBuyerOrders(")).toBeGreaterThan(-1);
      expect(source.indexOf("await healBuyerOrders(")).toBeLessThan(source.indexOf(read));
    }
  });

  it("leaves an invoice younger than a minute alone: the buyer is still on the payment page", async () => {
    const { user, order } = await openInvoice();
    await age(order.id, 0);
    await expect(healBuyerOrders({ userId: user.id })).resolves.toBe("none");
    expect(statusCalls(sim)).toBe(0);
  });

  it("checks one order per request", async () => {
    const user = await createUser({ phone: "+96599887766" });
    const productA = await createProduct({ priceFils: 1000 });
    const productB = await createProduct({ priceFils: 1000 });
    const a = await createOrder({ user, productIds: [productA.id], isTest: true });
    const b = await createOrder({ user, productIds: [productB.id], isTest: true });
    await startPayment(a, null);
    await startPayment(b, null);
    await age(a.id);
    await age(b.id);
    sim.state.requests.length = 0;
    await expect(healBuyerOrders({ userId: user.id })).resolves.toBe("checked");
    expect(statusCalls(sim)).toBe(1);
  });

  it("looks only at the order the page shows, and only if it is this buyer's", async () => {
    const mine = await openInvoice();
    const other = await openInvoice();
    await expect(healBuyerOrders({ userId: mine.user.id, orderId: other.order.id })).resolves.toBe("none");
    await expect(healBuyerOrders({ userId: mine.user.id, orderId: "not-a-uuid" })).resolves.toBe("none");
    expect(statusCalls(sim)).toBe(0);
  });

  it("is limited per user, and a limited visit does not reach the gateway", async () => {
    const { user, order } = await openInvoice();
    for (let i = 0; i < HEAL_LIMITS.perUser; i++) {
      await sql`update payments set last_checked_at = null, reconcile_claimed_at = null where order_id = ${order.id}`;
      await expect(healBuyerOrders({ userId: user.id })).resolves.toBe("checked");
    }
    await sql`update payments set last_checked_at = null, reconcile_claimed_at = null where order_id = ${order.id}`;
    sim.state.requests.length = 0;
    await expect(healBuyerOrders({ userId: user.id })).resolves.toBe("limited");
    expect(statusCalls(sim)).toBe(0);
  });

  it("does not ask again within two minutes of a check", async () => {
    const { user } = await openInvoice();
    await healBuyerOrders({ userId: user.id });
    sim.state.requests.length = 0;
    await expect(healBuyerOrders({ userId: user.id })).resolves.toBe("none");
    expect(statusCalls(sim)).toBe(0);
  });

  it("a gateway failure never breaks the page, and backs off so the next refresh does not wait again", async () => {
    const { user } = await openInvoice();
    sim.setFault("/v2/GetPaymentStatus", "down");
    await expect(healBuyerOrders({ userId: user.id })).resolves.toBe("gateway_failed");
    sim.state.requests.length = 0;
    await expect(healBuyerOrders({ userId: user.id })).resolves.toBe("none");
    expect(statusCalls(sim)).toBe(0);
  });

  it("a slow gateway does not hold the page past its deadline", async () => {
    const { user, order, product, invoice } = await openInvoice();
    await sim.pay(invoice, "success");
    sim.setDelay("/v2/GetPaymentStatus", HEAL_LIMITS.deadlineMs + 800);
    const started = Date.now();
    // مهلة النداء أقصر من المهلة الكلية، فالمهلة الكلية تحمي من أي بطء غير النداء. كلاهما يجب ألا يتجاوزها
    const outcome = await healBuyerOrders({ userId: user.id });
    expect(Date.now() - started).toBeLessThanOrEqual(HEAL_LIMITS.deadlineMs + 700);
    expect(["gateway_failed", "deadline"]).toContain(outcome);
    expect((await orderRow(order.id)).status).toBe("pending");
    expect(await activeEntitlements(user.id)).not.toContain(product.id);
  });

  it("costs nothing when payments are off", async () => {
    const { user } = await openInvoice();
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    await expect(healBuyerOrders({ userId: user.id })).resolves.toBe("off");
  });

  it("grants once and earns once whoever wins between the visit, the webhook and the reconciler", async () => {
    const teacher = await createTeacher({ mode: "self_managed", shareBps: 5000 });
    const product = await createVideoProduct({ teacherId: teacher.id, priceFils: 3000 });
    const user = await createUser({ phone: "+96599887766" });
    const order = await createOrder({ user, productIds: [product.id], isTest: true });
    const { url } = await startPayment(order, null);
    await age(order.id);
    const invoice = invoiceIdOf(url);
    const { paymentId } = await sim.pay(invoice, "success");
    const { body, headers } = sim.buildWebhook(invoice, paymentId);
    await Promise.all([healBuyerOrders({ userId: user.id }), handleMyFatoorahWebhook(body, headers), runPaymentReconciliation(), healBuyerOrders({ userId: user.id, orderId: order.id })]);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    expect(await auditCount("order.paid", order.id)).toBe(1);
    expect(await sql`select id from teacher_earnings where order_id = ${order.id}`).toHaveLength(1);
  });
});

describe("the reconciler's queue", () => {
  it("three overlapping runs check each invoice once", async () => {
    const invoices = [];
    for (let i = 0; i < RECONCILE_BATCH_SIZE + 6; i++) invoices.push(await openInvoice());
    const reports = await Promise.all([runPaymentReconciliation(), runPaymentReconciliation(), runPaymentReconciliation()]);
    expect(reports.reduce((n, r) => n + r.claimed, 0)).toBe(invoices.length);
    const keys = sim.state.requests.filter((r) => r.path === "/v2/GetPaymentStatus").map((r) => (r.body as { Key: string }).Key);
    expect(keys).toHaveLength(invoices.length);
    expect(new Set(keys).size).toBe(invoices.length);
  });

  it("an early stop releases every claim it did not get an answer for", async () => {
    for (let i = 0; i < 8; i++) await openInvoice();
    sim.setFault("/v2/GetPaymentStatus", "down");
    const report = await runPaymentReconciliation();
    expect(report.stoppedEarly).toBe(true);
    expect(report.skipped).toBeGreaterThan(0);
    expect(await sql`select id from payments where reconcile_claimed_at is not null and status in ('initiated', 'pending')`).toHaveLength(0);
    sim.clearFaults();
    // يُطالب بها فورًا، بلا انتظار عقد الخمس دقائق
    expect((await runPaymentReconciliation()).claimed).toBe(8);
  });

  it("a budget that runs out releases what it has not reached, and leaves nothing leased", async () => {
    for (let i = 0; i < 8; i++) await openInvoice();
    const report = await runPaymentReconciliation({ budgetMs: -1 });
    expect(report).toMatchObject({ claimed: 0, stoppedEarly: true });
    expect(statusCalls(sim)).toBe(0);
    expect(await sql`select id from payments where reconcile_claimed_at is not null`).toHaveLength(0);
  });

  it("paid and dead invoices do not take a place ahead of an unverified one", async () => {
    const live = await openInvoice();
    const paid = await openInvoice();
    await sim.pay(paid.invoice, "success");
    await runPaymentReconciliation();
    const dead = await openInvoice();
    await sql`update payments set expires_at = now() - interval '4 hours', last_checked_at = now() - interval '20 minutes' where order_id = ${dead.order.id}`;
    await sql`update payments set last_checked_at = now() - interval '11 minutes', reconcile_claimed_at = null where order_id in (${live.order.id}, ${paid.order.id})`;
    sim.state.requests.length = 0;
    expect((await runPaymentReconciliation()).claimed).toBe(1);
    const [row] = await paymentRows(live.order.id);
    expect(sim.state.requests.filter((r) => r.path === "/v2/GetPaymentStatus").map((r) => (r.body as { Key: string }).Key)).toEqual([row.gateway_invoice_id]);
  });

  it("takes the never-checked first, then the longest unchecked", async () => {
    const never = await openInvoice();
    const older = await openInvoice();
    const newer = await openInvoice();
    await sql`update payments set last_checked_at = now() - interval '3 hours' where order_id = ${older.order.id}`;
    await sql`update payments set last_checked_at = now() - interval '11 minutes' where order_id = ${newer.order.id}`;
    const claimed = await claimDueInvoices("sandbox", "unverified", 2);
    expect(claimed.map((c) => c.id)).toEqual([(await paymentRows(never.order.id))[0].id, (await paymentRows(older.order.id))[0].id]);
  });

  it("its time budget fits the function it runs in", () => {
    expect(routeMaxDuration).toBeGreaterThan((RECONCILE_BUDGET_MS * 0.85 + CALL_TIMEOUT_MS) / 1000 + 10);
  });

  it("answers success when nothing was due", async () => {
    const res = await GET(new Request("http://localhost/api/cron/reconcile-payments", { headers: { authorization: `Bearer ${CRON}` } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ claimed: 0, errors: 0, stoppedEarly: false });
  });

  it("calls it a failure only when the gateway answered nothing", () => {
    const base = { mode: "sandbox", claimed: 0, checked: 0, paid: 0, flagged: 0, invalid: 0, errors: 0, skipped: 0, stoppedEarly: false, closed: 0, abandonedClaims: 0, refundsChecked: 0, refundsResolved: 0, refundErrors: 0 } as const;
    expect(reconcileFailure(base)).toBeNull();
    expect(reconcileFailure({ ...base, errors: 3, stoppedEarly: true })).not.toBeNull();
    expect(reconcileFailure({ ...base, errors: 1, checked: 2 })).toBeNull();
    // انتهاء الوقت ليس عطلًا في البوابة
    expect(reconcileFailure({ ...base, checked: 9, skipped: 3, stoppedEarly: true })).toBeNull();
    expect(reconcileFailure({ ...base, refundsChecked: 2, refundErrors: 2 })).not.toBeNull();
  });
});

describe("what the owner sees and presses", () => {
  it("pressing reconcile twice at once grants once", async () => {
    const owner = await createUser({ role: "admin" });
    const { user, product, order, invoice } = await openInvoice();
    await sim.pay(invoice, "success");
    const [a, b] = await Promise.all([reconcileNow({ adminId: owner.id, ip: null }), reconcileNow({ adminId: owner.id, ip: null })]);
    expect([a.state, b.state].sort()).toEqual(["done", "overlapped"]);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    expect(await auditCount("order.paid", order.id)).toBe(1);
    // كل ضغطة مسجلة باسم من ضغط
    expect(await sql`select actor_id from audit_logs where action = 'payments.reconcile_now'`).toHaveLength(2);
  });

  it("pressing it again later is harmless", async () => {
    const owner = await createUser({ role: "admin" });
    const { order, invoice } = await openInvoice();
    await sim.pay(invoice, "success");
    await reconcileNow({ adminId: owner.id, ip: null });
    expect(await reconcileNow({ adminId: owner.id, ip: null })).toMatchObject({ state: "done", report: { claimed: 0, paid: 0 } });
    expect(await auditCount("order.paid", order.id)).toBe(1);
  });

  it("reports a gateway that cannot be reached as a failure", async () => {
    const owner = await createUser({ role: "admin" });
    await openInvoice();
    sim.setFault("/v2/GetPaymentStatus", "down");
    expect((await reconcileNow({ adminId: owner.id, ip: null })).state).toBe("failed");
  });

  it("lists unverified invoices, with their age, and no personal data", async () => {
    const { user, order } = await openInvoice();
    await age(order.id, 30);
    const { unverified, unverifiedTotal } = await unhealedOrders();
    expect(unverifiedTotal).toBe(1);
    expect(unverified[0]).toMatchObject({ order_id: order.id, order_number: order.number });
    expect(Date.now() - unverified[0].since.getTime()).toBeGreaterThan(29 * 60_000);
    expect(JSON.stringify(unverified)).not.toContain(user.email);
  });

  it("lists a confirmed payment that did not complete its order", async () => {
    const { order } = await openInvoice();
    await sql`update payments set status = 'paid', paid_at = now() where order_id = ${order.id}`;
    expect((await unhealedOrders()).paidNotGranted.filter((r) => r.order_id === order.id).map((r) => r.reason)).toEqual(["payment_not_applied"]);
  });

  it("a healthy paid bundle is not reported as missing access", async () => {
    const part = await createProduct({ priceFils: 1000 });
    const bundle = await createBundle({ items: [part.id], priceFils: 900 });
    const user = await createUser({ phone: "+96599887766" });
    const order = await createOrder({ user, productIds: [bundle.id], isTest: true });
    const { url } = await startPayment(order, null);
    await sim.pay(invoiceIdOf(url), "success");
    await age(order.id);
    await healBuyerOrders({ userId: user.id });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect((await unhealedOrders()).paidNotGranted.filter((r) => r.order_id === order.id)).toEqual([]);
  });

  it("the owner's button is an owner action", () => {
    const source = readFileSync(resolve(__dirname, "../../src/app/admin/ops/actions.ts"), "utf8");
    const body = source.slice(source.indexOf("export async function reconcileNowAction"));
    expect(body.indexOf("adminAction(")).toBeGreaterThan(-1);
    expect(body.indexOf("adminAction(")).toBeLessThan(body.indexOf("reconcileNow("));
    expect(body.indexOf("hitRateLimit(")).toBeLessThan(body.indexOf("reconcileNow({"));
  });
});
