import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { closeOrder, markOrderPaid, type OrderRow } from "@/server/commerce/orders";
import { resetEnvCache } from "@/server/env";
import { resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { canSayNothingWasCharged } from "@/server/payments/extras";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { expireLocally, invoiceIdOf, newOrder, orderRow, startPayment } from "../helpers/payment-flow";

const WAIT = "توجد محاولة دفع لم تُحسم بعد";
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
    const refresh = html.indexOf('data-testid="order-refresh"');
    const retry = html.indexOf('data-testid="order-retry"');
    expect(refresh).toBeGreaterThan(-1);
    expect(retry).toBeGreaterThan(refresh);
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

  it("tells the buyer plainly when the order is under review", async () => {
    const { user, order } = await newOrder();
    ctx.user = user;
    await sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));
    await sql`insert into order_holds (order_id, kind, source_key) values (${order.id}, 'dispute', ${`dispute:${order.id}`})`;
    const html = await page(order);
    expect(html).toContain("هذا الطلب قيد المراجعة");
    // لا تُقال جملة الاكتمال عن طلب وصوله موقوف
    expect(html).not.toContain("مشترياتك جاهزة الآن في مكتبتك");
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
    // الفحص جاء بعد إنشاء الفاتورة، لكن مضى عليه أكثر من نصف ساعة. العقد يمنع فحص الزيارة من تجديده: المطلوب هنا الجملة وحدها
    await sql`update payments set created_at = now() - interval '2 hours', last_checked_at = now() - interval '31 minutes', reconcile_claimed_at = now() where order_id = ${order.id}`;
    expect(await page(order)).not.toContain(NOTHING_CHARGED);
    await sql`update payments set last_checked_at = now() - interval '29 minutes' where order_id = ${order.id}`;
    expect(await page(order)).toContain(NOTHING_CHARGED);
  });

  it("a visit re-checks a stale invoice, and only then says nothing was charged", async () => {
    const { order, invoices } = await failedWithInvoices(1);
    await checkAll(invoices);
    await sql`update payments set created_at = now() - interval '2 hours', last_checked_at = now() - interval '31 minutes', reconcile_claimed_at = null where order_id = ${order.id}`;
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
    expect(html).toContain("وصلتنا دفعة لا يطابق مبلغها هذا الطلب");
    expect(html).not.toContain("وصلتنا دفعة أخرى");
  });

  describe("while an attempt on an open link has not finished", () => {
    async function withAttempt() {
      const { order, invoices } = await failedWithInvoices(1);
      await sql`update payments set expires_at = now() + interval '30 minutes' where order_id = ${order.id}`;
      sim.startTransaction(invoices[0]);
      await checkAll(invoices);
      return { order, invoices };
    }

    it("does not appear on a failed order, and asks the student to wait", async () => {
      const { order } = await withAttempt();
      const html = await page(order);
      expect(html).not.toContain(NOTHING_CHARGED);
      expect(html).not.toContain("يمكنك المحاولة مرة أخرى");
      expect(html).toContain(WAIT);
    });

    it("does not appear on a closed order, and asks the student to wait", async () => {
      const { order } = await withAttempt();
      await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason: "expired", actorId: null }));
      const html = await page(await orderRow(order.id));
      expect(html).not.toContain(NOTHING_CHARGED);
      expect(html).toContain(WAIT);
    });

    it("once the link and its grace have passed nobody is asked to wait, but the sentence stays withheld", async () => {
      const { order } = await withAttempt();
      await sql`update payments set expires_at = now() - interval '20 minutes' where order_id = ${order.id}`;
      const html = await page(order);
      expect(html).not.toContain(WAIT);
      expect(html).not.toContain(NOTHING_CHARGED);
    });
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
    ["review", "لا يمكن تأكيد هذا الطلب تلقائيًا"],
  ])("error=%s explains itself", async (error, text) => {
    const { user, order } = await newOrder();
    ctx.user = user;
    expect(await page(order, { error })).toContain(text);
  });

  it("does not call a refund done while the gateway has only accepted it", async () => {
    const { user, order } = await newOrder();
    ctx.user = user;
    await sql`update orders set status = 'refunded' where id = ${order.id}`;
    await sql`insert into refunds (order_id, amount_fils, reason, status, gateway_refund_id) values (${order.id}, ${order.total_fils}, 'سبب الاختبار', 'requested', 'r-1')`;
    const accepted = await page(await orderRow(order.id));
    expect(accepted).toContain("طلب الاسترداد قيد التنفيذ");
    expect(accepted).not.toContain("تم استرداد هذا الطلب");
    expect(accepted).toMatch(/data-testid="order-status"[^>]*>قيد الاسترداد</);

    await sql`update refunds set status = 'completed' where order_id = ${order.id}`;
    const done = await page(await orderRow(order.id));
    expect(done).toContain("تم استرداد هذا الطلب");
    expect(done).toMatch(/data-testid="order-status"[^>]*>مسترد</);
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
    ["coupon_unavailable", "نفد كود الخصم قبل إكمال الطلب", 'href="/cart"'],
    ["product_ended", "انتهى بيع أحد منتجات هذا الطلب", 'href="/cart"'],
  ] as const)("a closed order (%s) says what happened and where to go", async (reason, title, link) => {
    const { user, order } = await newOrder();
    ctx.user = user;
    await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason, actorId: null }));
    const html = await page(order);
    expect(html).toContain(title);
    expect(html).toContain(link);
    expect(html).not.toContain('name="orderId"');
  });

  describe("when money arrived that did not complete the order", () => {
    const setContacts = async (values: Record<string, string>) => {
      for (const [key, value] of Object.entries(values)) {
        await sql`insert into settings (key, value) values (${key}, to_jsonb(${value}::text)) on conflict (key) do update set value = excluded.value`;
      }
    };
    async function closedWithExtra(reason: "expired" | "product_ended" | "already_owned", kind: string, state = "open") {
      const { user, order } = await newOrder();
      ctx.user = user;
      const { url } = await startPayment(order, null);
      await sql.begin((tx) => closeOrder(tx, { orderId: order.id, reason, actorId: null }));
      const [{ id }] = await sql<{ id: string }[]>`select id from payments where order_id = ${order.id}`;
      await sql`insert into payment_extras (payment_id, order_id, kind, amount_fils, state) values (${id}, ${order.id}, ${kind}, ${order.total_fils}, ${state})`;
      return { order: await orderRow(order.id), invoice: invoiceIdOf(url) };
    }

    it.each([
      ["late_review", "وصلتنا دفعتك ولم يكتمل هذا الطلب"],
      ["amount_mismatch", "وصلتنا دفعة لا يطابق مبلغها هذا الطلب"],
      ["after_refund", "وصلتنا دفعة بعد استرداد هذا الطلب"],
      ["duplicate", "وصلتنا دفعة أخرى على هذا الطلب"],
    ])("%s has its own true heading", async (kind, title) => {
      const { order } = await closedWithExtra("expired", kind);
      expect(await page(order)).toContain(title);
    });

    it.each([
      ["expired", "دون تأكيد دفع"],
      ["product_ended", "حتى لا تدفع مقابل منتج انتهى"],
      ["already_owned", "حتى لا تدفع مرتين"],
    ] as const)("the closed heading for %s stops saying no payment was made", async (reason, untrue) => {
      const { order } = await closedWithExtra(reason, "late_review");
      const html = await page(order);
      expect(html).not.toContain(untrue);
      expect(html).toContain("لم نضف منتجات الطلب إلى مكتبتك");
      expect(html).toContain("لإعادتها إليك");
    });

    it("stays withdrawn after the money has been returned", async () => {
      const { order } = await closedWithExtra("expired", "late_review", "refunded");
      const html = await page(order);
      expect(html).not.toContain("دون تأكيد دفع");
      expect(html).not.toContain("وصلتنا دفعتك");
    });

    it("says the refund is under way once it has been sent", async () => {
      const { order } = await closedWithExtra("expired", "late_review", "refund_requested");
      expect(await page(order)).toContain("طلبنا إعادتها من بوابة الدفع");
    });

    it("shows the real ways to reach us, and none that are not set", async () => {
      await setContacts({ whatsapp_number: "96599887766", contact_email: "", contact_phone: "" });
      const { order } = await closedWithExtra("expired", "late_review");
      const html = await page(order);
      expect(html).toContain('data-testid="extra-payment-contacts"');
      expect(html).toContain('href="https://wa.me/96599887766"');
      expect(html).not.toContain("mailto:");
      await setContacts({ whatsapp_number: "" });
      expect(await page(order)).not.toContain('data-testid="extra-payment-contacts"');
    });
  });

  it("an order cancelled with no reason keeps the plain description", async () => {
    const { user, order } = await newOrder();
    ctx.user = user;
    await sql`update orders set status = 'cancelled' where id = ${order.id}`;
    expect(await page(order)).toContain("حالة هذا الطلب: ملغي");
  });
});
