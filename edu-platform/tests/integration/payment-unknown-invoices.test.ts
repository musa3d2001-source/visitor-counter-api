import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UnknownInvoiceError, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { reconcileFailure, runPaymentReconciliation } from "@/server/payments/reconcile";
import { claimDueInvoices, releaseClaims } from "@/server/payments/invoice-queue";
import { healBuyerOrders } from "@/server/payments/heal";
import { resolvePaymentAlert } from "@/server/payments/monitoring";
import { anonymizationBlockers } from "@/server/admin/student-anonymize";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { auditCount, expireInvoice, invoiceIdOf, invoicesCreated, makeStale, newOrder, orderRow, paymentRows, startPayment, statusCalls } from "../helpers/payment-flow";
import { activeEntitlements, createUser } from "../helpers/factories";
import { provenOwner } from "../helpers/step-up";
import { enrolAdmin } from "../helpers/two-factor";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

/**
 * فواتير لا تعرفها البوابة (F28، البندان R001 و R026). المحاكي يرد 400 «Invalid key.» عن فاتورة واحدة بعينها،
 * كما ترد البوابة الحقيقية عن رقم لم يصدره حسابها الحالي (بعد تغيير الحساب أو المفتاح).
 */

const ctx = vi.hoisted(() => ({ user: null as unknown, cookie: null as string | null, redirected: [] as string[] }));
vi.mock("@/server/auth/guards", async (original) => ({ ...(await original<typeof import("@/server/auth/guards")>()), assertUser: async () => ctx.user }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    ctx.redirected.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && ctx.cookie ? { value: ctx.cookie } : undefined), set: () => {} }),
  headers: async () => new Headers({ "x-forwarded-for": "192.0.2.200" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { cancelOrderAction, retryPaymentAction } = await import("@/app/(site)/checkout/actions");
const { closeUnverifiableOrderAction } = await import("@/app/admin/orders/actions");
const { GET } = await import("@/app/api/cron/reconcile-payments/route");

const SECRET = "cron-secret-unknown-invoices-0123";
let sim: Simulator;

/** ما بقي مفتوحًا من اختبار سابق يدخل عمل الوظيفة، فنخرجه حتى يقرأ كل اختبار نتيجته وحده */
async function retireOpenWork() {
  await sql`update payments set status = 'paid', expires_at = now() - interval '1 day', last_checked_at = now(), gateway_unknown_first_at = null, gateway_unknown_last_at = null where status in ('initiated', 'pending', 'failed', 'expired', 'paid', 'refunded')`;
  await sql`update orders set status = 'refunded' where status in ('pending', 'failed')`;
}

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(async () => {
  await retireOpenWork();
  sim.state.requests.length = 0;
  ctx.cookie = null;
  ctx.redirected.length = 0;
  process.env.CRON_SECRET = SECRET;
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

const fd = (values: Record<string, string>) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  return form;
};

const act = async (action: (f: FormData) => Promise<unknown>, values: Record<string, string>) => {
  await expect(action(fd(values))).rejects.toThrow(/NEXT_REDIRECT/);
  return ctx.redirected.at(-1)!;
};

const cron = () => GET(new Request("http://localhost/api/cron/reconcile-payments", { headers: { authorization: `Bearer ${SECRET}` } }));

/** طلب بفاتورة واحدة لا تعرفها البوابة الآن */
async function orderWithUnknownInvoice() {
  const made = await newOrder();
  ctx.user = made.user;
  const { url } = await startPayment(made.order, null);
  const invoice = invoiceIdOf(url);
  const [payment] = await paymentRows(made.order.id);
  sim.forgetInvoice(invoice, true);
  sim.state.requests.length = 0;
  return { ...made, invoice, paymentId: payment.id };
}

/** انقضى عمر الطلب ومات رابط فاتورته منذ زمن: hours ساعة على إنشائهما */
async function aged(orderId: string, hours: number) {
  await makeStale(orderId, hours);
  await sql`update payments set created_at = now() - make_interval(hours => ${hours}), expires_at = now() - make_interval(hours => ${hours - 1}) where order_id = ${orderId}`;
}

/** جواب «لا أعرفها» سابق مسجل قبل ago ساعة (كما تكتبه الجولة اليومية السابقة) */
async function answeredUnknownBefore(paymentId: string, ago: number) {
  await sql`update payments set gateway_unknown_first_at = now() - make_interval(hours => ${ago}), gateway_unknown_last_at = now() - make_interval(hours => ${ago}), reconcile_claimed_at = null where id = ${paymentId}`;
}

const unknownColumns = (paymentId: string) =>
  sql<{ first: Date | null; last: Date | null; last_checked_at: Date | null }[]>`select gateway_unknown_first_at as first, gateway_unknown_last_at as last, last_checked_at from payments where id = ${paymentId}`.then(([r]) => r);

const alertsFor = (orderId: string) => sql<{ id: string; kind: string; payment_id: string; resolved_at: Date | null }[]>`select id, kind, payment_id, resolved_at from payment_alerts where order_id = ${orderId}`;

describe("the gateway's unknown answer is kept on the payment row", () => {
  it("records the first and the latest answer, and clears both once the gateway knows the invoice again", async () => {
    const { invoice, paymentId } = await orderWithUnknownInvoice();
    const first = await verifyAndApplyPayment({ invoiceId: String(invoice) }).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(UnknownInvoiceError);
    expect(first).toMatchObject({ firstTime: true, terminal: false, status: 400 });
    const once = await unknownColumns(paymentId);
    expect(once.first).not.toBeNull();
    expect(once.last?.getTime()).toBe(once.first?.getTime());
    // ليس فحصًا: لا يُكتب last_checked_at
    expect(once.last_checked_at).toBeNull();

    const second = await verifyAndApplyPayment({ invoiceId: String(invoice) }).catch((e: unknown) => e);
    expect(second).toMatchObject({ firstTime: false, terminal: false });
    const twice = await unknownColumns(paymentId);
    expect(twice.first?.getTime()).toBe(once.first?.getTime());
    expect(twice.last!.getTime()).toBeGreaterThan(once.last!.getTime());

    sim.forgetInvoice(invoice, false);
    expect(await verifyAndApplyPayment({ invoiceId: String(invoice) })).toMatchObject({ state: "pending" });
    expect(await unknownColumns(paymentId)).toMatchObject({ first: null, last: null });
  });

  it("a payment id the gateway does not know is not ours to record", async () => {
    const { paymentId } = await orderWithUnknownInvoice();
    await expect(verifyAndApplyPayment({ paymentId: "07070000001" })).rejects.toThrow();
    expect(await unknownColumns(paymentId)).toMatchObject({ first: null, last: null });
  });
});

describe("before an invoice is terminal nothing is closed on its account", () => {
  it("one answer after the order's life: the expire job keeps the order, cancel and retry still refuse, and the run alerts the owner", async () => {
    const { order, paymentId } = await orderWithUnknownInvoice();
    await aged(order.id, 100);

    const res = await cron();
    // أول جواب كهذا: قد يكون الحساب أو المفتاح خاطئًا، فيستحق تنبيه المالك
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ unknownAtGateway: 1, unknownAgain: 0, closed: 0 });
    expect((await orderRow(order.id)).status).toBe("pending");
    expect((await unknownColumns(paymentId)).first).not.toBeNull();

    expect(await act(cancelOrderAction, { orderId: order.id })).toBe(`/orders/${order.id}?error=check`);
    expect(await act(retryPaymentAction, { orderId: order.id, guardianDeclaration: "on", termsAccepted: "on" })).toBe(`/orders/${order.id}?error=payment`);
    expect((await orderRow(order.id)).status).toBe("pending");
    expect(invoicesCreated(sim)).toBe(0);
    expect(await alertsFor(order.id)).toHaveLength(0);
  });

  it("two answers less than 24 hours apart are not enough", async () => {
    const { order, paymentId } = await orderWithUnknownInvoice();
    await aged(order.id, 100);
    await answeredUnknownBefore(paymentId, 20);
    const res = await cron();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ unknownAtGateway: 0, unknownAgain: 1, closed: 0 });
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("two answers 24 hours apart but inside the order's life are not enough either", async () => {
    const { order, paymentId } = await orderWithUnknownInvoice();
    await aged(order.id, 50);
    await answeredUnknownBefore(paymentId, 25);
    await expect(verifyAndApplyPayment({ invoiceId: String((await paymentRows(order.id))[0].gateway_invoice_id) })).rejects.toMatchObject({ terminal: false });
    expect(await act(cancelOrderAction, { orderId: order.id })).toBe(`/orders/${order.id}?error=check`);
  });
});

describe("an invoice answered unknown twice, 24 hours apart, after its order's life is terminal", () => {
  it("the expire job closes the order, raises one alert for the owner, and a quiet run is a 200", async () => {
    const { order, paymentId } = await orderWithUnknownInvoice();
    await aged(order.id, 100);
    await answeredUnknownBefore(paymentId, 25);

    const res = await cron();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ unknownAtGateway: 0, unknownAgain: 1, closed: 1, errors: 0 });
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "expired" });
    const alerts = await alertsFor(order.id);
    expect(alerts).toEqual([expect.objectContaining({ kind: "unknown_invoice", payment_id: paymentId, resolved_at: null })]);

    // لا يعود إلى رأس الطابور: الجولة التالية لا تسأل عنه، وتبقى ناجحة
    await sql`update payments set reconcile_claimed_at = null where id = ${paymentId}`;
    sim.state.requests.length = 0;
    const next = await cron();
    expect(next.status).toBe(200);
    expect(statusCalls(sim)).toBe(0);
    // إغلاق آخر للطلب نفسه لا يكرر التنبيه
    expect(await alertsFor(order.id)).toHaveLength(1);
  });

  it("is asked about again once a week, so a corrected key still finds a late payment", async () => {
    const { order, invoice, paymentId } = await orderWithUnknownInvoice();
    await aged(order.id, 100);
    await answeredUnknownBefore(paymentId, 25);
    await cron();
    expect((await orderRow(order.id)).status).toBe("cancelled");

    // صُحح المفتاح ودُفعت الفاتورة في الحساب الذي أصدرها، وبعد أسبوع تسأل الجولة عنها
    sim.forgetInvoice(invoice, false);
    await sim.pay(invoice, "success");
    await sql`update payments set gateway_unknown_last_at = now() - interval '8 days', gateway_unknown_first_at = now() - interval '9 days', reconcile_claimed_at = null where id = ${paymentId}`;
    sim.state.requests.length = 0;
    const res = await cron();
    expect(res.status).toBe(200);
    expect(statusCalls(sim)).toBe(1);
    // طلب أُغلق لانتهاء مدته يكتمل بدفعة متأخرة كالمعتاد
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await unknownColumns(paymentId)).toMatchObject({ first: null, last: null });
  });

  it("the student's cancel succeeds, and raises the same alert", async () => {
    const { order, paymentId } = await orderWithUnknownInvoice();
    await aged(order.id, 100);
    await answeredUnknownBefore(paymentId, 25);
    expect(await act(cancelOrderAction, { orderId: order.id })).toBe(`/orders/${order.id}`);
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "student_cancelled" });
    expect(await alertsFor(order.id)).toEqual([expect.objectContaining({ kind: "unknown_invoice", payment_id: paymentId })]);
  });

  it("retry closes the order instead of issuing a new invoice on it", async () => {
    const { order, paymentId } = await orderWithUnknownInvoice();
    await aged(order.id, 100);
    await answeredUnknownBefore(paymentId, 25);
    expect(await act(retryPaymentAction, { orderId: order.id, guardianDeclaration: "on", termsAccepted: "on" })).toBe(`/orders/${order.id}?error=closed`);
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "expired" });
    expect(invoicesCreated(sim)).toBe(0);
    expect(await paymentRows(order.id)).toHaveLength(1);
  });

  it("anonymisation waits for the open order, then only for the owner's review of the alert", async () => {
    const { order, user, paymentId } = await orderWithUnknownInvoice();
    await aged(order.id, 100);
    expect((await anonymizationBlockers(user.id)).map((b) => b.kind)).toEqual(["open_order"]);
    await answeredUnknownBefore(paymentId, 25);
    await cron();
    expect((await anonymizationBlockers(user.id)).map((b) => b.kind)).toEqual(["payment_alert"]);
    const owner = await createUser({ role: "admin" });
    const [alert] = await alertsFor(order.id);
    expect(await resolvePaymentAlert({ alertId: alert.id, adminId: owner.id })).toBe(true);
    expect(await anonymizationBlockers(user.id)).toEqual([]);
  });
});

describe("unknown invoices never sit at the head of the queue", () => {
  it("a never-checked invoice created later is claimed before an unknown one", async () => {
    const unknown = await orderWithUnknownInvoice();
    await aged(unknown.order.id, 100);
    await answeredUnknownBefore(unknown.paymentId, 2);
    await sql`update payments set last_checked_at = null where id = ${unknown.paymentId}`;
    const fresh = await newOrder();
    const { url } = await startPayment(fresh.order, null);
    await sim.pay(invoiceIdOf(url), "success");

    const [first] = await claimDueInvoices("sandbox", "unverified", 1);
    expect(first.gateway_invoice_id).toBe(String(invoiceIdOf(url)));
    await releaseClaims([first.id]);
  });

  it("a buyer's visit checks the invoice the gateway knows first", async () => {
    const made = await newOrder();
    const { url: firstUrl } = await startPayment(made.order, null);
    await expireInvoice(sim, invoiceIdOf(firstUrl));
    const { url: secondUrl } = await startPayment(made.order, null);
    // الأحدث هو المجهول، والأقدم دُفع: الزيارة تبدأ بما تعرفه البوابة رغم أن ترتيبها المعتاد الأحدث أولًا
    const [older, newer] = await paymentRows(made.order.id);
    await sql`update payments set created_at = now() - interval '2 hours', last_checked_at = null where id = ${older.id}`;
    await sql`update payments set created_at = now() - interval '1 hour', last_checked_at = null where id = ${newer.id}`;
    sim.forgetInvoice(invoiceIdOf(secondUrl), true);
    await answeredUnknownBefore(newer.id, 1);
    await sql`update payments set expires_at = now() + interval '10 minutes' where id = ${older.id}`;
    sim.state.invoices.get(invoiceIdOf(firstUrl))!.ExpiresAtMs = Date.now() + 600_000;
    await sim.pay(invoiceIdOf(firstUrl), "success");
    sim.state.requests.length = 0;
    expect(await healBuyerOrders({ userId: made.user.id, orderId: made.order.id })).toBe("paid");
    expect(sim.state.requests.filter((r) => r.path === "/v2/GetPaymentStatus").map((r) => (r.body as { Key: string }).Key)).toEqual([String(invoiceIdOf(firstUrl))]);
  });

  it("a run whose only due row was already answered unknown is a 200, a newly unknown row is a 502", async () => {
    const { order, paymentId } = await orderWithUnknownInvoice();
    await aged(order.id, 30);
    const res = await cron();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ unknownAtGateway: 1 });
    await sql`update payments set reconcile_claimed_at = null where id = ${paymentId}`;
    const again = await cron();
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ unknownAtGateway: 0, unknownAgain: 1 });
    expect(reconcileFailure({ ...(await runPaymentReconciliation()), unknownAgain: 5 })).toBeNull();
  });
});

describe("the owner's last resort: close unverifiable order", () => {
  async function ownerSession(proven: boolean) {
    const owner = await createUser({ role: "admin" });
    const { session } = proven ? await provenOwner(owner) : await enrolAdmin(owner);
    ctx.cookie = session.token;
    return owner;
  }

  const close = (orderId: string, reason = "تحققت في لوحة الحساب السابق: الفاتورة غير مدفوعة") => closeUnverifiableOrderAction({}, fd({ orderId, reason }));

  it("needs a fresh proof and a reason", async () => {
    const { order } = await orderWithUnknownInvoice();
    await aged(order.id, 10);
    await ownerSession(false);
    expect(await close(order.id)).toMatchObject({ stepUp: "proof" });
    await ownerSession(true);
    expect(await close(order.id, "")).toMatchObject({ error: expect.stringContaining("٣ أحرف") });
    expect((await orderRow(order.id)).status).toBe("pending");
  });

  it("closes the order as unverifiable, audits it, raises no alert, and anonymisation is no longer blocked", async () => {
    const { order, user } = await orderWithUnknownInvoice();
    await aged(order.id, 10);
    await ownerSession(true);
    expect(await close(order.id)).toMatchObject({ ok: true });
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", closed_reason: "unverifiable" });
    expect(await auditCount("order.close_unverifiable", order.id)).toBe(1);
    const [row] = await sql<{ reason: string }[]>`select reason from audit_logs where action = 'order.close_unverifiable' and entity_id = ${order.id}`;
    expect(row.reason).toContain("الحساب السابق");
    expect(await alertsFor(order.id)).toHaveLength(0);
    expect(await anonymizationBlockers(user.id)).toEqual([]);
  });

  it("a payment that shows up afterwards is recorded for review, not granted", async () => {
    const { order, user, invoice } = await orderWithUnknownInvoice();
    await aged(order.id, 10);
    await ownerSession(true);
    expect(await close(order.id)).toMatchObject({ ok: true });
    sim.forgetInvoice(invoice, false);
    await sim.pay(invoice, "success");
    expect(await verifyAndApplyPayment({ invoiceId: String(invoice) })).toMatchObject({ state: "flagged", kind: "late_review" });
    expect((await orderRow(order.id)).status).toBe("cancelled");
    expect(await activeEntitlements(user.id)).toHaveLength(0);
  });

  it("refuses while a link can still be paid, when the gateway cannot be reached, or when nothing is unknown", async () => {
    await ownerSession(true);
    const live = await orderWithUnknownInvoice();
    expect(await close(live.order.id)).toMatchObject({ error: expect.stringContaining("ما زال يقبل الدفع") });
    expect((await orderRow(live.order.id)).status).toBe("pending");

    const down = await orderWithUnknownInvoice();
    // فاتورة ثانية على الطلب نفسه تعرفها البوابة، ثم تتعذر البوابة عند السؤال عنها
    sim.forgetInvoice(down.invoice, false);
    await expireInvoice(sim, down.invoice);
    const { url } = await startPayment(down.order, null);
    sim.forgetInvoice(down.invoice, true);
    await aged(down.order.id, 10);
    sim.setStatusFault(invoiceIdOf(url), true);
    expect(await close(down.order.id)).toMatchObject({ error: expect.stringContaining("تعذر الوصول") });
    expect((await orderRow(down.order.id)).status).toBe("pending");

    const known = await orderWithUnknownInvoice();
    sim.forgetInvoice(known.invoice, false);
    await aged(known.order.id, 10);
    expect(await close(known.order.id)).toMatchObject({ error: expect.stringContaining("تعرف كل فواتير") });
    expect((await orderRow(known.order.id)).status).toBe("pending");
  });

  it("does not close an order the gateway shows as paid", async () => {
    const { order, invoice } = await orderWithUnknownInvoice();
    // فاتورة ثانية تعرفها البوابة وعليها الدفعة: السؤال قبل الإغلاق يجدها فيكمل الطلب بدل إغلاقه
    sim.forgetInvoice(invoice, false);
    await expireInvoice(sim, invoice);
    const { url } = await startPayment(order, null);
    await sim.pay(invoiceIdOf(url), "success");
    sim.forgetInvoice(invoice, true);
    await aged(order.id, 10);
    await ownerSession(true);
    expect(await close(order.id)).toMatchObject({ error: expect.stringContaining("ظهرت دفعة") });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await auditCount("order.close_unverifiable", order.id)).toBe(0);
  });
});
