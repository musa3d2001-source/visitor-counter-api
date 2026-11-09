import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { refundExtraPayment, requestOrderRefund, resetPaymentMethodsCache, startPayment, verifyAndApplyPayment } from "@/server/payments/service";
import { resetEnvCache } from "@/server/env";
import { getTwoFactorStatus } from "@/server/auth/two-factor";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { expireLocally, invoiceIdOf, newOrder, orderRow } from "../helpers/payment-flow";
import { createUser } from "../helpers/factories";
import { enrolAdmin, freshCode, wrongCode } from "../helpers/two-factor";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

/** خطوة التحقق الحقيقية على أوامر إخراج المال: لا تُستبدل step-up هنا، بعكس refunds.test */
const ctx = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@/server/auth/guards", async (original) => ({
  ...(await original<typeof import("@/server/auth/guards")>()),
  assertAdmin: async () => {
    if (!ctx.admin) throw new Error("denied");
    return ctx.admin;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { dismissExtraPaymentAction, dismissRefundAction, recheckExtraPaymentAction, recheckRefundAction, refundExtraPaymentAction, refundOrderAction, resendRefundAction } = await import("@/app/admin/orders/actions");

let sim: Simulator;
type Admin = Awaited<ReturnType<typeof createUser>>;
let owner: Admin;
let secret: Buffer;
let recoveryCodes: string[];

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(async () => {
  sim.state.requests.length = 0;
  await sql`delete from rate_limits`;
  owner = await createUser({ role: "admin" });
  ctx.admin = owner;
  const enrolled = await enrolAdmin(owner);
  secret = enrolled.secret;
  recoveryCodes = enrolled.recoveryCodes;
});
afterEach(() => {
  sim.clearFaults();
  delete process.env.ADMIN_2FA_REQUIRED;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const makeRefundCalls = () => sim.state.requests.filter((r) => r.path === "/v2/MakeRefund");
const refundsOf = (orderId: string) => sql<{ id: string; status: string }[]>`select id, status from refunds where order_id = ${orderId}`;
const extraOf = async (orderId: string) => (await sql<{ id: string; state: string; gateway_refund_id: string | null }[]>`select id, state, gateway_refund_id from payment_extras where order_id = ${orderId}`)[0];
const refusedAudits = () => sql`select id from audit_logs where action = 'two_factor.step_up_refused' and actor_id = ${owner.id}`;

async function paidOrder(priceFils = 3000) {
  const made = await newOrder(priceFils);
  const { url } = await startPayment(made.order, 1);
  const invoice = invoiceIdOf(url);
  const { paymentId } = await sim.pay(invoice, "success");
  await verifyAndApplyPayment({ paymentId });
  return { ...made, invoice, order: await orderRow(made.order.id) };
}

/** فاتورتان مدفوعتان لدى البوابة: الأولى أكملت الطلب، والثانية صارت دفعة زائدة */
async function orderWithExtra() {
  const made = await newOrder(3000);
  const first = await startPayment(made.order, null);
  await expireLocally(invoiceIdOf(first.url));
  const second = await startPayment(await orderRow(made.order.id), null);
  await sim.pay(invoiceIdOf(first.url), "success");
  await verifyAndApplyPayment({ invoiceId: String(invoiceIdOf(first.url)) });
  await sim.pay(invoiceIdOf(second.url), "success");
  await verifyAndApplyPayment({ invoiceId: String(invoiceIdOf(second.url)) });
  const extra = await extraOf(made.order.id);
  sim.state.requests.length = 0;
  return { ...made, extra };
}

async function refusedRefund() {
  const paid = await paidOrder();
  sim.setRefundRefusal("Insufficient refund balance");
  await requestOrderRefund({ orderId: paid.order.id, adminId: owner.id, reason: "طلب الطالب" });
  sim.setRefundRefusal(null);
  sim.state.requests.length = 0;
  return paid;
}

describe("the full order refund", () => {
  it("refuses a missing or wrong code before the gateway, and leaves a trace", async () => {
    const { order } = await paidOrder();
    sim.state.requests.length = 0;
    await expect(refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب" }))).resolves.toMatchObject({ error: expect.stringContaining("٦ أرقام") });
    await expect(refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب", twoFactorCode: wrongCode(secret) }))).resolves.toMatchObject({ error: expect.stringContaining("غير صحيح") });
    expect(makeRefundCalls()).toHaveLength(0);
    expect(await refundsOf(order.id)).toHaveLength(0);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await refusedAudits()).toHaveLength(2);
  });

  it("goes through with a fresh code", async () => {
    const { order } = await paidOrder();
    sim.state.requests.length = 0;
    await expect(refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب", twoFactorCode: await freshCode(owner.id, secret) }))).resolves.toMatchObject({ ok: true });
    expect(makeRefundCalls()).toHaveLength(1);
  });

  it("goes through with a recovery code, once", async () => {
    const { order } = await paidOrder();
    const second = await paidOrder();
    sim.state.requests.length = 0;
    await expect(refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب", twoFactorCode: recoveryCodes[0] }))).resolves.toMatchObject({ ok: true });
    await expect(getTwoFactorStatus(owner.id)).resolves.toMatchObject({ recoveryRemaining: 9 });
    await expect(refundOrderAction({}, form({ orderId: second.order.id, reason: "طلب الطالب", twoFactorCode: recoveryCodes[0] }))).resolves.toMatchObject({ error: expect.any(String) });
    expect(makeRefundCalls()).toHaveLength(1);
  });

  it("a code that was already used, even moments ago, does not send money", async () => {
    const a = await paidOrder();
    const b = await paidOrder();
    sim.state.requests.length = 0;
    const code = await freshCode(owner.id, secret);
    await expect(refundOrderAction({}, form({ orderId: a.order.id, reason: "طلب الطالب", twoFactorCode: code }))).resolves.toMatchObject({ ok: true });
    await expect(refundOrderAction({}, form({ orderId: b.order.id, reason: "طلب الطالب", twoFactorCode: code }))).resolves.toMatchObject({ error: expect.stringContaining("سبق") });
    expect(makeRefundCalls()).toHaveLength(1);
  });

  it("does not spend the code when the form itself is invalid", async () => {
    const { order } = await paidOrder();
    await expect(refundOrderAction({}, form({ orderId: order.id, reason: "x", twoFactorCode: recoveryCodes[0] }))).resolves.toMatchObject({ error: expect.stringContaining("٣ أحرف") });
    await expect(getTwoFactorStatus(owner.id)).resolves.toMatchObject({ recoveryRemaining: 10 });
  });
});

describe("resending a refund", () => {
  it("needs a code, and goes through with one", async () => {
    const { order } = await refusedRefund();
    await expect(resendRefundAction({}, form({ orderId: order.id }))).resolves.toMatchObject({ error: expect.stringContaining("٦ أرقام") });
    await expect(resendRefundAction({}, form({ orderId: order.id, twoFactorCode: wrongCode(secret) }))).resolves.toMatchObject({ error: expect.stringContaining("غير صحيح") });
    expect(makeRefundCalls()).toHaveLength(0);
    await expect(resendRefundAction({}, form({ orderId: order.id, twoFactorCode: await freshCode(owner.id, secret) }))).resolves.toMatchObject({ ok: true });
    expect(makeRefundCalls()).toHaveLength(1);
  });
});

describe("refunding an extra payment", () => {
  it("needs a code, and goes through with one", async () => {
    const { order, extra } = await orderWithExtra();
    await expect(refundExtraPaymentAction({}, form({ extraId: extra.id, reason: "دفعة مكررة" }))).resolves.toMatchObject({ error: expect.stringContaining("٦ أرقام") });
    await expect(refundExtraPaymentAction({}, form({ extraId: extra.id, reason: "دفعة مكررة", twoFactorCode: wrongCode(secret) }))).resolves.toMatchObject({ error: expect.stringContaining("غير صحيح") });
    expect(makeRefundCalls()).toHaveLength(0);
    expect((await extraOf(order.id)).state).toBe("open");
    await expect(refundExtraPaymentAction({}, form({ extraId: extra.id, reason: "دفعة مكررة", twoFactorCode: await freshCode(owner.id, secret) }))).resolves.toMatchObject({ ok: true });
    expect(makeRefundCalls()).toHaveLength(1);
  });
});

describe("actions that send no money", () => {
  it("re-checking and dismissing a refund need no code and send nothing", async () => {
    const { order } = await refusedRefund();
    const [{ id }] = await refundsOf(order.id);
    await sql`update refunds set status = 'unknown', claimed_at = now() - interval '5 minutes' where id = ${id}`;
    const recheck = await recheckRefundAction({}, form({ refundId: id, orderId: order.id }));
    expect(recheck?.error ?? "").not.toMatch(/الرمز|رمز/);
    expect(makeRefundCalls()).toHaveLength(0);
    await sql`update refunds set status = 'unknown', claimed_at = now() - interval '5 minutes' where id = ${id}`;
    await expect(dismissRefundAction({}, form({ refundId: id, orderId: order.id, reason: "راجعنا لوحة البوابة" }))).resolves.toMatchObject({ ok: true });
    expect(makeRefundCalls()).toHaveLength(0);
    expect(await refusedAudits()).toHaveLength(0);
  });

  it("re-checking and dismissing an extra payment need no code and send nothing", async () => {
    const { order, extra } = await orderWithExtra();
    await refundExtraPayment({ extraId: extra.id, adminId: owner.id, reason: "دفعة مكررة" });
    sim.state.requests.length = 0;
    await expect(recheckExtraPaymentAction({}, form({ extraId: extra.id }))).resolves.toMatchObject({ ok: true });
    expect(makeRefundCalls()).toHaveLength(0);
    const other = await orderWithExtra();
    await expect(dismissExtraPaymentAction({}, form({ extraId: other.extra.id, reason: "تمت التسوية يدويًا" }))).resolves.toMatchObject({ ok: true });
    expect((await extraOf(other.order.id)).state).toBe("dismissed");
    expect(makeRefundCalls()).toHaveLength(0);
    expect(await refusedAudits()).toHaveLength(0);
    expect((await extraOf(order.id)).gateway_refund_id).toBeTruthy();
  });
});

describe("when two-factor is not on for this admin", () => {
  async function plainOwner() {
    owner = await createUser({ role: "admin" });
    ctx.admin = owner;
  }

  it("passes when it is not required", async () => {
    await plainOwner();
    const { order } = await paidOrder();
    sim.state.requests.length = 0;
    await expect(refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب" }))).resolves.toMatchObject({ ok: true });
    expect(makeRefundCalls()).toHaveLength(1);
  });

  it("refuses when it is required, even if the session gate were bypassed", async () => {
    await plainOwner();
    process.env.ADMIN_2FA_REQUIRED = "true";
    resetEnvCache();
    const { order } = await paidOrder();
    sim.state.requests.length = 0;
    await expect(refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب" }))).resolves.toMatchObject({ error: expect.stringContaining("إلزامي") });
    expect(makeRefundCalls()).toHaveLength(0);
  });
});
