import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { completeFreeOrder, createOrder, type OrderRow } from "@/server/commerce/orders";
import { handleMyFatoorahWebhook, requestOrderRefund, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { paymentMethodLabel } from "@/lib/labels";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { invoiceIdOf, newOrder, orderRow, startPayment } from "../helpers/payment-flow";
import { activeEntitlements, createCoupon, createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ user: null as unknown, mail: "ok" as "ok" | "throw" | "hang" | "no-send" }));

vi.mock("@/server/auth/guards", async (original) => ({ ...(await original<typeof import("@/server/auth/guards")>()), requireUser: async () => ctx.user, assertUser: async () => ctx.user }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/platform/mailer", async (original) => {
  const actual = await original<typeof import("@/server/platform/mailer")>();
  return {
    ...actual,
    sendMail: (msg: Parameters<typeof actual.sendMail>[0]) => {
      if (ctx.mail === "throw") return Promise.reject(new Error("smtp is down"));
      if (ctx.mail === "hang") return new Promise<boolean>(() => {});
      if (ctx.mail === "no-send") return Promise.resolve(false);
      return actual.sendMail(msg);
    },
  };
});

const { default: OrderPage } = await import("@/app/(site)/orders/[id]/page");

let sim: Simulator;
let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
  admin = await createUser({ role: "admin" });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(() => {
  ctx.mail = "ok";
});
afterEach(() => {
  sim.clearFaults();
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

const page = (order: OrderRow) => OrderPage({ params: Promise.resolve({ id: order.id }), searchParams: Promise.resolve({}) }).then(renderToStaticMarkup);
/** نص العنصر صاحب data-testid كما يظهر في الصفحة */
const shown = (html: string, testid: string) => {
  const m = new RegExp(`data-testid="${testid}"[^>]*>(.*?)</span>`, "s").exec(html);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
};
const mails = (email: string, template: string) => sql<{ subject: string; body: string }[]>`select subject, body from email_log where to_email = ${email} and template = ${template}`;

async function paidOrder(paymentMethodId: number | null = 1) {
  const made = await newOrder(3000);
  ctx.user = made.user;
  const { url } = await startPayment(made.order, paymentMethodId);
  const invoice = invoiceIdOf(url);
  const { paymentId } = await sim.pay(invoice, "success");
  await verifyAndApplyPayment({ paymentId });
  return { ...made, invoice, paymentId, order: await orderRow(made.order.id) };
}

const refund = (order: OrderRow) => requestOrderRefund({ orderId: order.id, adminId: admin.id, reason: "طلب الطالب" });
const refundEvent = (invoice: number, status: "REFUNDED" | "CANCELED" = "REFUNDED") => {
  const { body, headers } = sim.buildRefundWebhook(invoice, sim.state.invoices.get(invoice)!.Refunds[0].RefundId, status);
  return handleMyFatoorahWebhook(body, headers);
};

describe("paymentMethodLabel", () => {
  it.each([
    ["KNET", "كي نت"],
    ["knet", "كي نت"],
    ["VISA/MASTER", "فيزا أو ماستركارد"],
    ["Apple Pay", "Apple Pay"],
    ["all", "MyFatoorah"],
    ["Some New Gateway", "Some New Gateway"],
  ])("%s reads as %s", (raw, label) => {
    expect(paymentMethodLabel(raw)).toBe(label);
  });

  it.each(["1", " 20 ", "", "   ", null, undefined])("%j is never shown", (raw) => {
    expect(paymentMethodLabel(raw)).toBeNull();
  });
});

describe("the receipt on the order page", () => {
  it("shows the gateway's payment id, the invoice number and the method's name", async () => {
    const { order, invoice, paymentId } = await paidOrder();
    const html = await page(order);
    expect(shown(html, "receipt-payment-id")).toBe(String(paymentId));
    expect(shown(html, "receipt-invoice")).toBe(String(invoice));
    expect(shown(html, "receipt-method")).toBe("كي نت");
  });

  it("never shows the raw method number the checkout stored", async () => {
    const { order } = await paidOrder();
    await sql`update payments set payment_method = '1' where order_id = ${order.id}`;
    const html = await page(order);
    expect(shown(html, "receipt-method")).toBe("MyFatoorah");
  });

  it("shows no gateway rows for a free order", async () => {
    const coupon = await createCoupon({ kind: "percent", value: 100 });
    const user = await createUser();
    ctx.user = user;
    const product = await createProduct();
    const order = await createOrder({ user, productIds: [product.id], couponCode: coupon.code, isTest: true });
    await completeFreeOrder(order.id, user.id);
    const html = await page(await orderRow(order.id));
    expect(html).not.toContain('data-testid="receipt-payment-id"');
    expect(html).not.toContain('data-testid="receipt-invoice"');
  });

  it("shows nothing about a refund that the gateway has not accepted", async () => {
    const { order } = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    await refund(order);
    const html = await page(await orderRow(order.id));
    expect(html).not.toContain('data-testid="receipt-refund-state"');
    expect(html).toContain("تم الدفع بنجاح");
  });

  it("shows a waiting refund's amount, date and state", async () => {
    const { order } = await paidOrder();
    await refund(order);
    const html = await page(await orderRow(order.id));
    expect(html).toContain('data-testid="order-refunded"');
    expect(shown(html, "receipt-refund-amount")).toContain("3.000");
    expect(shown(html, "receipt-refund-date")).toBeTruthy();
    expect(shown(html, "receipt-refund-state")).toBe("قيد التنفيذ لدى بوابة الدفع");
  });

  it("shows when the refund is done", async () => {
    const { order, invoice } = await paidOrder();
    await refund(order);
    await refundEvent(invoice);
    expect(shown(await page(await orderRow(order.id)), "receipt-refund-state")).toBe("تم تنفيذه");
  });

  it("keeps the payment's numbers on a refunded order", async () => {
    const { order, invoice, paymentId } = await paidOrder();
    await refund(order);
    const html = await page(await orderRow(order.id));
    expect(shown(html, "receipt-payment-id")).toBe(String(paymentId));
    expect(shown(html, "receipt-invoice")).toBe(String(invoice));
  });
});

describe("the order confirmation email", () => {
  it("goes out once however many times the payment is confirmed", async () => {
    const { user, order, paymentId, invoice } = await paidOrder();
    await verifyAndApplyPayment({ paymentId });
    await verifyAndApplyPayment({ invoiceId: String(invoice) });
    const sent = await mails(user.email, "order_confirmation");
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain(order.number);
    expect(sent[0].body).toContain("3.000");
    expect(sent[0].subject).toContain("[تجريبي]");
  });

  it("goes out for a free order", async () => {
    const coupon = await createCoupon({ kind: "percent", value: 100 });
    const user = await createUser();
    const order = await createOrder({ user, productIds: [(await createProduct()).id], couponCode: coupon.code, isTest: true });
    await completeFreeOrder(order.id, user.id);
    await completeFreeOrder(order.id, user.id).catch(() => null);
    expect(await mails(user.email, "order_confirmation")).toHaveLength(1);
  });

  it("does not go out for a failed payment", async () => {
    const made = await newOrder();
    const { url } = await startPayment(made.order, 1);
    const { paymentId } = await sim.pay(invoiceIdOf(url), "fail");
    await verifyAndApplyPayment({ paymentId });
    expect(await mails(made.user.email, "order_confirmation")).toHaveLength(0);
  });

  it("uses the account's current address", async () => {
    const made = await newOrder();
    const changed = `changed-${made.user.id}@example.com`;
    await sql`update users set email = ${changed} where id = ${made.user.id}`;
    const { url } = await startPayment(made.order, 1);
    const { paymentId } = await sim.pay(invoiceIdOf(url), "success");
    await verifyAndApplyPayment({ paymentId });
    expect(await mails(changed, "order_confirmation")).toHaveLength(1);
    expect(await mails(made.user.email, "order_confirmation")).toHaveLength(0);
  });
});

describe("the email about money that did not complete an order", () => {
  const extraMails = (email: string) => mails(email, "order_extra_payment");

  it("is sent once, when the charge is first recorded", async () => {
    const { user, order } = await newOrder();
    const { url } = await startPayment(order, null);
    const invoice = invoiceIdOf(url);
    await sim.pay(invoice, "success");
    await verifyAndApplyPayment({ invoiceId: String(invoice) });
    expect(await extraMails(user.email)).toHaveLength(0);
    await sim.pay(invoice, "success");
    await verifyAndApplyPayment({ invoiceId: String(invoice) });
    await verifyAndApplyPayment({ invoiceId: String(invoice) });
    const sent = await extraMails(user.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("3.000");
    expect(sent[0].body).toContain("زائدة");
  });

  it("is sent when the amount did not match, and says the order was not completed", async () => {
    const { user, order } = await newOrder();
    const { url } = await startPayment(order, null);
    sim.setAmountTamper(500);
    await sim.pay(invoiceIdOf(url), "success");
    await verifyAndApplyPayment({ invoiceId: String(invoiceIdOf(url)) });
    await verifyAndApplyPayment({ invoiceId: String(invoiceIdOf(url)) });
    sim.setAmountTamper(null);
    const sent = await extraMails(user.email);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("لا يطابق");
  });

  it("a mail failure does not disturb the record", async () => {
    const { user, order } = await newOrder();
    const { url } = await startPayment(order, null);
    const invoice = invoiceIdOf(url);
    await sim.pay(invoice, "success");
    await verifyAndApplyPayment({ invoiceId: String(invoice) });
    await sim.pay(invoice, "success");
    ctx.mail = "throw";
    await expect(verifyAndApplyPayment({ invoiceId: String(invoice) })).resolves.toMatchObject({ state: "flagged" });
    expect(await sql`select 1 from payment_extras where order_id = ${order.id}`).toHaveLength(1);
    expect(await extraMails(user.email)).toHaveLength(0);
  });
});

describe("the refund emails", () => {
  it("on acceptance says it is being processed, never that it is done", async () => {
    const { user, order } = await paidOrder();
    await refund(order);
    const sent = await mails(user.email, "order_refund");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("3.000");
    expect(sent[0].body).toContain("قيد التنفيذ");
    expect(sent[0].body).toContain("وسيلة الدفع الأصلية");
    expect(sent[0].body).not.toContain("تم استرداد");
    expect(await mails(user.email, "order_refund_completed")).toHaveLength(0);
  });

  it("a second, different email when the gateway completes it, and only one", async () => {
    const { user, order, invoice } = await paidOrder();
    await refund(order);
    await refundEvent(invoice);
    await refundEvent(invoice);
    expect(await mails(user.email, "order_refund")).toHaveLength(1);
    const done = await mails(user.email, "order_refund_completed");
    expect(done).toHaveLength(1);
    expect(done[0].body).toContain("نفذت بوابة الدفع");
  });

  it("no email when the gateway refuses", async () => {
    const { user, order } = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    await refund(order);
    expect(await mails(user.email, "order_refund")).toHaveLength(0);
  });

  it("no email while the outcome is unknown", async () => {
    const { user, order } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await refund(order);
    expect(await mails(user.email, "order_refund")).toHaveLength(0);
  });

  it("tells the student when an accepted refund is cancelled", async () => {
    const { user, order, invoice } = await paidOrder();
    await refund(order);
    await refundEvent(invoice, "CANCELED");
    const sent = await mails(user.email, "order_refund_cancelled");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("فلم يُرد المبلغ");
  });
});

describe("a mail failure", () => {
  const failing = ["throw", "no-send"] as const;

  it.each(failing)("does not affect a payment (%s)", async (mode) => {
    const made = await newOrder();
    const { url } = await startPayment(made.order, 1);
    const { paymentId } = await sim.pay(invoiceIdOf(url), "success");
    ctx.mail = mode;
    await expect(verifyAndApplyPayment({ paymentId })).resolves.toMatchObject({ state: "paid", changed: true });
    expect((await orderRow(made.order.id)).status).toBe("paid");
    expect(await activeEntitlements(made.user.id)).toEqual([made.product.id]);
  });

  it.each(failing)("does not affect a free order (%s)", async (mode) => {
    const coupon = await createCoupon({ kind: "percent", value: 100 });
    const user = await createUser();
    const product = await createProduct();
    const order = await createOrder({ user, productIds: [product.id], couponCode: coupon.code, isTest: true });
    ctx.mail = mode;
    await expect(completeFreeOrder(order.id, user.id)).resolves.toMatchObject({ changed: true });
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it.each(failing)("does not affect a refund (%s)", async (mode) => {
    const { order, user } = await paidOrder();
    ctx.mail = mode;
    await expect(refund(order)).resolves.toEqual({ state: "requested" });
    expect((await orderRow(order.id)).status).toBe("refunded");
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("does not fail the refund webhook, so the gateway does not resend it forever", async () => {
    const { order, invoice } = await paidOrder();
    await refund(order);
    ctx.mail = "throw";
    await expect(refundEvent(invoice)).resolves.toMatchObject({ status: 200 });
  });

  it("a mail server that never answers does not hold the payment", async () => {
    const made = await newOrder();
    const { url } = await startPayment(made.order, 1);
    const { paymentId } = await sim.pay(invoiceIdOf(url), "success");
    ctx.mail = "hang";
    const started = Date.now();
    await expect(verifyAndApplyPayment({ paymentId })).resolves.toMatchObject({ state: "paid", changed: true });
    expect(Date.now() - started).toBeLessThan(8000);
    // المعاملة التزمت قبل البريد: الطلب مدفوع حتى قبل أن يقرر البريد شيئًا
    expect((await orderRow(made.order.id)).status).toBe("paid");
  }, 12_000);

  it("the order is already committed when the mailer is called", async () => {
    const made = await newOrder();
    const { url } = await startPayment(made.order, 1);
    const { paymentId } = await sim.pay(invoiceIdOf(url), "success");
    ctx.mail = "throw";
    const seen: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      seen.push(String(args[0]));
    });
    try {
      await verifyAndApplyPayment({ paymentId });
    } finally {
      spy.mockRestore();
    }
    expect(seen).toContain("[mail] order confirmation not sent");
    expect((await orderRow(made.order.id)).status).toBe("paid");
  });
});
