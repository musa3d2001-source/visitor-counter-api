import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { closeOrder, type OrderRow } from "@/server/commerce/orders";
import { resetEnvCache } from "@/server/env";
import { resetPaymentMethodsCache, startPayment, verifyAndApplyPayment } from "@/server/payments/service";
import { canSayNothingWasCharged } from "@/server/payments/extras";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { expireLocally, invoiceIdOf, newOrder, orderRow } from "../helpers/payment-flow";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

/** الصفحة الحقيقية تُعرض كاملة: ما يقرأه الطالب عن طلبه */
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

const { default: OrderPage } = await import("@/app/(site)/orders/[id]/page");

const NOTHING_CHARGED = "لم يتم خصم أي مبلغ";

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
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

const page = (order: OrderRow, search: Record<string, string> = {}) => OrderPage({ params: Promise.resolve({ id: order.id }), searchParams: Promise.resolve(search) }).then(renderToStaticMarkup);

async function failedWithInvoices(count: number) {
  const { user, order } = await newOrder();
  ctx.user = user;
  const invoices: number[] = [];
  for (let i = 0; i < count; i++) {
    const { url } = await startPayment(await orderRow(order.id), null);
    invoices.push(invoiceIdOf(url));
    await expireLocally(invoiceIdOf(url));
  }
  await sql`update orders set status = 'failed' where id = ${order.id}`;
  return { order: await orderRow(order.id), invoices };
}

const checkAll = (invoices: number[]) => Promise.all(invoices.map((id) => verifyAndApplyPayment({ invoiceId: String(id) })));

describe("the pending page", () => {
  it("leads with refresh, then completing the payment", async () => {
    const { user, order } = await newOrder();
    ctx.user = user;
    const html = await page(order);
    expect(html.indexOf("تحديث الحالة")).toBeGreaterThan(-1);
    expect(html.indexOf("إكمال الدفع")).toBeGreaterThan(html.indexOf("تحديث الحالة"));
  });

  it("offers a way out of an order the student no longer wants", async () => {
    const { user, order } = await newOrder();
    ctx.user = user;
    expect(await page(order)).toContain("إلغاء هذا الطلب");
  });

  it("offers no cancel button when payment is off, because nothing could be checked", async () => {
    const { user, order } = await newOrder();
    ctx.user = user;
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    expect(await page(order)).not.toContain("إلغاء هذا الطلب");
  });
});

describe("saying nothing was charged", () => {
  it("appears with no invoices at all, because nothing reached the gateway", async () => {
    const { order } = await failedWithInvoices(0);
    expect(await page(order)).toContain(NOTHING_CHARGED);
  });

  it("appears once every invoice has been checked", async () => {
    const { order, invoices } = await failedWithInvoices(2);
    await checkAll(invoices);
    const html = await page(order);
    expect(html).toContain(NOTHING_CHARGED);
    expect(html).toContain("يمكنك المحاولة مرة أخرى");
  });

  it("does not appear when only the latest invoice was checked", async () => {
    const { order, invoices } = await failedWithInvoices(2);
    await checkAll([invoices[1]]);
    const html = await page(order);
    expect(html).not.toContain(NOTHING_CHARGED);
    expect(html).toContain("تحديث الحالة");
    expect(html).toContain("إذا خُصم مبلغ من حسابك");
  });

  it("does not appear when a newer invoice was created after the checks", async () => {
    const { order, invoices } = await failedWithInvoices(2);
    await checkAll(invoices);
    await sql`update payments set created_at = now() + interval '1 second' where gateway_invoice_id = ${String(invoices[1])}`;
    expect(await page(order)).not.toContain(NOTHING_CHARGED);
  });

  it("does not appear when the checks are stale", async () => {
    const { order, invoices } = await failedWithInvoices(1);
    await checkAll(invoices);
    // الفحص جاء بعد إنشاء الفاتورة، لكن مضى عليه أكثر من نصف ساعة
    await sql`update payments set created_at = now() - interval '2 hours', last_checked_at = now() - interval '31 minutes' where order_id = ${order.id}`;
    expect(await page(order)).not.toContain(NOTHING_CHARGED);
    await sql`update payments set last_checked_at = now() - interval '29 minutes' where order_id = ${order.id}`;
    expect(await page(order)).toContain(NOTHING_CHARGED);
  });

  it("does not appear when any payment is confirmed", async () => {
    const { order, invoices } = await failedWithInvoices(2);
    await checkAll(invoices);
    await sql`update payments set status = 'paid' where gateway_invoice_id = ${String(invoices[0])}`;
    await expect(canSayNothingWasCharged(order.id)).resolves.toBe(false);
  });

  it("does not appear when an extra payment is on record", async () => {
    const { order, invoices } = await failedWithInvoices(1);
    await checkAll(invoices);
    const [{ id }] = await sql<{ id: string }[]>`select id from payments where order_id = ${order.id}`;
    await sql`insert into payment_extras (payment_id, order_id, kind, amount_fils) values (${id}, ${order.id}, 'amount_mismatch', 100)`;
    const html = await page(order);
    expect(html).not.toContain(NOTHING_CHARGED);
    expect(html).toContain("وصلتنا دفعة أخرى على هذا الطلب");
  });

  it("with payment off and unchecked invoices it points to contact, not to a button that is not there", async () => {
    const { order } = await failedWithInvoices(1);
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    const html = await page(order);
    expect(html).not.toContain(NOTHING_CHARGED);
    expect(html).not.toContain("اضغط «تحديث الحالة»");
    expect(html).toContain("تواصل معنا");
  });

  it("is gone from the payment-mode warning, which checks nothing", async () => {
    const { user, order } = await newOrder();
    ctx.user = user;
    const html = await page(order, { error: "mode" });
    expect(html).toContain("أُنشئ هذا الطلب في وضع دفع مختلف");
    expect(html).not.toContain(NOTHING_CHARGED);
  });
});

describe("what the student is told", () => {
  it.each([
    ["inprogress", "توجد عملية دفع لم تكتمل بعد"],
    ["check", "تعذر التأكد من حالة الدفع الآن"],
    ["rate", "محاولات كثيرة"],
    ["payment", "تعذر بدء الدفع حاليًا"],
  ])("error=%s explains itself", async (error, text) => {
    const { user, order } = await newOrder();
    ctx.user = user;
    expect(await page(order, { error })).toContain(text);
  });

  it("arriving from checkout at an open order says why", async () => {
    const { user, order } = await newOrder();
    ctx.user = user;
    expect(await page(order, { from: "open-order" })).toContain("لديك طلب مفتوح لهذا المنتج");
  });

  it.each([
    ["expired", "انتهت مدة هذا الطلب", 'href="/cart"'],
    ["student_cancelled", "ألغيت هذا الطلب", 'href="/cart"'],
    ["already_owned", "هذا المنتج في مكتبتك", 'href="/library"'],
  ] as const)("a closed order (%s) says what happened and where to go", async (reason, title, link) => {
    const { user, order } = await newOrder();
    ctx.user = user;
    await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason, actorId: null }));
    const html = await page(order);
    expect(html).toContain(title);
    expect(html).toContain(link);
    expect(html).not.toContain('name="orderId"');
  });

  it("an order cancelled with no reason keeps the plain description", async () => {
    const { user, order } = await newOrder();
    ctx.user = user;
    await sql`update orders set status = 'cancelled' where id = ${order.id}`;
    expect(await page(order)).toContain("حالة هذا الطلب: ملغي");
  });
});
