import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrder, type OrderRow } from "@/server/commerce/orders";
import { handleMyFatoorahWebhook, recheckOrderRefund, refundExtraPayment, requestOrderRefund, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { RefundError, dismissRefund, openRefunds, refundsNeedingOwnerCount, requestRefund, type RefundGateway } from "@/server/payments/refunds";
import { MyFatoorahClient } from "@/server/payments/myfatoorah";
import { reportSummary } from "@/server/admin/stats";
import { adminGrant, adminRevoke } from "@/server/access/entitlements";
import { resetEnvCache } from "@/server/env";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { asOtherServer, auditCount, expireLocally, invoiceIdOf, moneySnapshot, newOrder, orderRow, pause, startPayment } from "../helpers/payment-flow";
import { activeEntitlements, createBundle, createProduct, createTeacher, createUser, createVideoProduct } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ admin: null as unknown, stepUpFails: false }));
vi.mock("@/server/auth/guards", async (original) => ({
  ...(await original<typeof import("@/server/auth/guards")>()),
  assertAdmin: async () => {
    if (!ctx.admin) throw new Error("denied");
    return ctx.admin;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/auth/step-up", () => ({
  assertFreshProof: async () => {},
  assertRefundStepUp: async () => {
    if (ctx.stepUpFails) {
      const { AdminError } = await import("@/server/admin/common");
      throw new AdminError("أدخل رمز التحقق");
    }
  },
}));

const { dismissRefundAction, recheckRefundAction, refundExtraPaymentAction, refundOrderAction, resendRefundAction } = await import("@/app/admin/orders/actions");

let sim: Simulator;
let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
  admin = await createUser({ role: "admin" });
  ctx.admin = admin;
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
  ctx.stepUpFails = false;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

type RefundRow = { id: string; status: string; attempt: number; error: string | null; source: string; gateway_refund_id: string | null; accepted_at: Date | null; completed_at: Date | null; amount_fils: number };

const refundOf = async (orderId: string) => (await sql<RefundRow[]>`select * from refunds where order_id = ${orderId} and status <> 'dismissed'`)[0];
const makeRefundCalls = () => sim.state.requests.filter((r) => r.path === "/v2/MakeRefund");
const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};
const ask = (order: OrderRow, reason: string | undefined = "طلب الطالب") => requestOrderRefund({ orderId: order.id, adminId: admin.id, reason });
const recheck = (refundId: string) => recheckOrderRefund({ refundId, adminId: admin.id });
const staleClaim = (orderId: string) => sql`update refunds set claimed_at = now() - interval '5 minutes' where order_id = ${orderId}`;
const realClient = () => new MyFatoorahClient({ baseUrl: `http://127.0.0.1:${SIM_PORT}`, apiKey: SIM_API_KEY });
const refundsOnGateway = (invoice: number) => sim.state.invoices.get(invoice)!.Refunds;
const refundMails = (email: string) => sql`select id from email_log where to_email = ${email} and template = 'order_refund'`;
const completedMails = (email: string) => sql`select id from email_log where to_email = ${email} and template = 'order_refund_completed'`;

async function paidOrder(priceFils = 3000) {
  const made = await newOrder(priceFils);
  const { url } = await startPayment(made.order, 1);
  const invoice = invoiceIdOf(url);
  const { paymentId } = await sim.pay(invoice, "success");
  await verifyAndApplyPayment({ paymentId });
  return { ...made, invoice, paymentId, order: await orderRow(made.order.id) };
}

async function paidTeacherOrder() {
  const teacher = await createTeacher({ shareBps: 5000 });
  const product = await createVideoProduct({ teacherId: teacher.id, priceFils: 4000 });
  const user = await createUser();
  const order = await createOrder({ user, productIds: [product.id], isTest: true });
  const { url } = await startPayment(order, 1);
  const invoice = invoiceIdOf(url);
  const { paymentId } = await sim.pay(invoice, "success");
  await verifyAndApplyPayment({ paymentId });
  return { user, product, invoice, order: await orderRow(order.id) };
}

const earningStates = (orderId: string) => sql<{ status: string }[]>`select status from teacher_earnings where order_id = ${orderId}`.then((rows) => rows.map((r) => r.status));
const portalEvent = (invoice: number, refundId: number, status: "REFUNDED" | "CANCELED" = "REFUNDED") => {
  const { body, headers } = sim.buildRefundWebhook(invoice, refundId, status);
  return handleMyFatoorahWebhook(body, headers);
};
const alertsOf = (orderId: string) => sql<{ kind: string; details: { reason: string; refundId: string } }[]>`select kind, details from payment_alerts where order_id = ${orderId}`;

describe("one owner action", () => {
  it("asks the gateway for the whole order and, once accepted, applies everything together", async () => {
    const { order, user, invoice } = await paidTeacherOrder();
    expect(await earningStates(order.id)).toEqual(["active"]);

    await expect(ask(order)).resolves.toEqual({ state: "requested" });

    const refund = await refundOf(order.id);
    expect(refund).toMatchObject({ status: "requested", attempt: 1, source: "owner", amount_fils: 4000, error: null });
    expect(refund.accepted_at).not.toBeNull();
    expect((await orderRow(order.id)).status).toBe("refunded");
    const [p] = await sql<{ status: string }[]>`select status from payments where order_id = ${order.id}`;
    expect(p.status).toBe("refunded");
    expect(await activeEntitlements(user.id)).toEqual([]);
    expect(await earningStates(order.id)).toEqual(["reversed"]);
    expect(await auditCount("order.refund", order.id)).toBe(1);
    expect(refundsOnGateway(invoice)).toHaveLength(1);

    const [call] = makeRefundCalls();
    expect(call.body).toMatchObject({ Amount: 4, KeyType: "PaymentId", ExternalIdentifier: `refund:${refund.id}:1` });
    expect(call.idempotencyKey).toBe(`refund-${refund.id}-1`);
  });

  it("nothing about the order changes before the gateway answers", async () => {
    const { order, user, product } = await paidOrder();
    const before = await moneySnapshot(order.id);
    sim.setDelay("/v2/MakeRefund", 500);
    const running = ask(order);
    await vi.waitFor(async () => expect((await refundOf(order.id))?.status).toBe("sending"), { interval: 20 });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    // بصمة الطلب والوصول والأرباح لم تتغير، والفرق الوحيد هو صف الاسترداد نفسه
    expect(JSON.parse(await moneySnapshot(order.id)).entitlements).toEqual(JSON.parse(before).entitlements);
    await expect(running).resolves.toEqual({ state: "requested" });
    expect((await orderRow(order.id)).status).toBe("refunded");
  });

  it("two simultaneous clicks send one refund", async () => {
    const { order, invoice } = await paidOrder();
    sim.setDelay("/v2/MakeRefund", 300);
    const results = await Promise.allSettled([ask(order), ask(order), ask(order)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(2);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(RefundError);
    expect(makeRefundCalls()).toHaveLength(1);
    expect(refundsOnGateway(invoice)).toHaveLength(1);
    expect(await sql`select 1 from refunds where order_id = ${order.id}`).toHaveLength(1);
  });

  it("refuses orders that cannot be refunded, without calling the gateway", async () => {
    const pending = await newOrder();
    await expect(ask(pending.order)).rejects.toMatchObject({ userMessage: "لا يمكن استرداد طلب غير مدفوع." });
    const paid = await paidOrder();
    await ask(paid.order);
    sim.state.requests.length = 0;
    await expect(ask(paid.order)).rejects.toMatchObject({ userMessage: "أُرسل طلب استرداد لهذا الطلب وينتظر التنفيذ." });
    await sql`update refunds set status = 'completed' where order_id = ${paid.order.id}`;
    await expect(ask(paid.order)).rejects.toMatchObject({ userMessage: "هذا الطلب مسترد بالفعل." });
    expect(makeRefundCalls()).toHaveLength(0);
  });

  it("a live refund blocks a new one even if the order reads as paid", async () => {
    const { order } = await paidOrder();
    await ask(order);
    await sql`update orders set status = 'paid' where id = ${order.id}`;
    sim.state.requests.length = 0;
    await expect(ask(order)).rejects.toMatchObject({ userMessage: "أُرسل طلب استرداد لهذا الطلب وينتظر التنفيذ." });
    await sql`update refunds set status = 'completed' where order_id = ${order.id}`;
    await expect(ask(order)).rejects.toMatchObject({ userMessage: "هذا الطلب مسترد بالفعل." });
    expect(makeRefundCalls()).toHaveLength(0);
  });

  it("a claim waits for the order lock, so two servers cannot both claim it", async () => {
    const { order } = await paidOrder();
    const out = await asOtherServer(async (tx) => {
      // NO KEY لا يوقف المفتاح الأجنبي لصف الاسترداد، فالذي يوقف المطالبة هو قفلها الصريح على الطلب
      await tx`select id from orders where id = ${order.id} for no key update`;
      const waiting = ask(order);
      await pause(400);
      return { waiting, calls: makeRefundCalls().length, rows: (await sql`select 1 from refunds where order_id = ${order.id}`).length };
    });
    expect(out).toMatchObject({ calls: 0, rows: 0 });
    await expect(out.waiting).resolves.toEqual({ state: "requested" });
    expect(makeRefundCalls()).toHaveLength(1);
  });

  it("the database itself refuses a second live refund on an order", async () => {
    const { order } = await paidOrder();
    await ask(order);
    await expect(sql`insert into refunds (order_id, amount_fils, reason, status, attempt, created_by) values (${order.id}, ${order.total_fils}, 'تكرار', 'sending', 1, ${admin.id})`).rejects.toMatchObject({
      constraint_name: "refunds_one_live_per_order",
    });
  });

  it("an order paid outside the gateway has nothing to refund through it", async () => {
    const { order } = await newOrder();
    await sql.begin(async (tx) => {
      const { markOrderPaid } = await import("@/server/commerce/orders");
      await markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils });
    });
    await expect(ask(order)).rejects.toMatchObject({ userMessage: expect.stringContaining("لا يوجد دفع إلكتروني") });
    expect(makeRefundCalls()).toHaveLength(0);
  });

  it("is refused when payments are off, and changes nothing", async () => {
    const { order } = await paidOrder();
    process.env.PAYMENTS_MODE = "disabled";
    resetEnvCache();
    await expect(ask(order)).rejects.toBeInstanceOf(RefundError);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await refundOf(order.id)).toBeUndefined();
  });
});

describe("a clear refusal", () => {
  it("leaves the order as it was and shows the reason", async () => {
    const { order, user, product } = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    await expect(ask(order)).resolves.toEqual({ state: "failed", error: "Insufficient refund balance" });
    expect(await refundOf(order.id)).toMatchObject({ status: "failed", error: "Insufficient refund balance" });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    expect(await auditCount("order.refund", order.id)).toBe(0);
    expect(await refundMails(user.email)).toHaveLength(0);
  });

  it("tells the owner the reason and how the balance works", async () => {
    const { order } = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    const out = await refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب" }));
    expect(out?.error).toContain("Insufficient refund balance");
    expect(out?.error).toContain("ولم يتغير الطلب");
    expect(out?.error).toContain("المبالغ المقبوضة اليوم");
  });

  it("can be retried, as a new attempt with a new key", async () => {
    const { order } = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    await ask(order);
    sim.setRefundRefusal(null);
    const { id } = await refundOf(order.id);
    await expect(resendRefundAction({}, form({ orderId: order.id }))).resolves.toMatchObject({ ok: true, message: expect.stringContaining("فريق مالية MyFatoorah") });
    expect(await refundOf(order.id)).toMatchObject({ id, status: "requested", attempt: 2 });
    expect(makeRefundCalls().map((c) => c.idempotencyKey)).toEqual([`refund-${id}-1`, `refund-${id}-2`]);
    expect((await orderRow(order.id)).status).toBe("refunded");
  });

  it("a validation error the gateway answers with HTTP 200 counts as a refusal too", async () => {
    const { order } = await paidOrder();
    const gateway: RefundGateway = {
      getRefundStatus: async () => [],
      makeRefund: async () => {
        const { MyFatoorahError } = await import("@/server/payments/myfatoorah");
        throw new MyFatoorahError("Refund amount exceeds the paid amount", 200);
      },
    };
    await expect(requestRefund(gateway, "sandbox", { orderId: order.id, adminId: admin.id, reason: "طلب الطالب" })).resolves.toMatchObject({ state: "failed" });
    expect((await orderRow(order.id)).status).toBe("paid");
  });
});

describe("a timeout", () => {
  it("goes to unknown, leaves the order alone and blocks any resend until a re-check", async () => {
    const { order, user, product, invoice } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await expect(ask(order)).resolves.toMatchObject({ state: "unknown" });
    sim.clearFaults();

    expect(await refundOf(order.id)).toMatchObject({ status: "unknown" });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);

    sim.state.requests.length = 0;
    await expect(ask(order)).rejects.toMatchObject({ userMessage: expect.stringContaining("إعادة التحقق") });
    await expect(resendRefundAction({}, form({ orderId: order.id }))).resolves.toMatchObject({ error: expect.stringContaining("إعادة التحقق") });
    expect(makeRefundCalls()).toHaveLength(0);
    expect(refundsOnGateway(invoice)).toHaveLength(1);
  });

  it("re-check finds the refund that did go through and applies it once", async () => {
    const { order, user, invoice } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await ask(order);
    sim.clearFaults();
    const { id } = await refundOf(order.id);
    await expect(recheck(id)).resolves.toEqual({ state: "requested" });
    expect((await refundOf(order.id)).gateway_refund_id).toBe(String(refundsOnGateway(invoice)[0].RefundId));
    expect((await orderRow(order.id)).status).toBe("refunded");
    expect(await activeEntitlements(user.id)).toEqual([]);
    expect(refundsOnGateway(invoice)).toHaveLength(1);
    expect(await auditCount("order.refund", order.id)).toBe(1);
  });

  it("a request that never arrived is not declared lost too early", async () => {
    const { order } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "down");
    await ask(order);
    sim.clearFaults();
    const { id } = await refundOf(order.id);
    await expect(recheck(id)).resolves.toEqual({ state: "unknown", wait: true });
    expect((await refundOf(order.id)).status).toBe("unknown");
  });

  it("after the wait it is not_sent, and the resend reuses the same key", async () => {
    const { order, invoice } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "down");
    await ask(order);
    sim.clearFaults();
    const { id } = await refundOf(order.id);
    await staleClaim(order.id);
    await expect(recheck(id)).resolves.toMatchObject({ state: "not_sent" });
    expect((await orderRow(order.id)).status).toBe("paid");
    await expect(resendRefundAction({}, form({ orderId: order.id }))).resolves.toMatchObject({ ok: true });
    const keys = makeRefundCalls().map((c) => c.idempotencyKey);
    expect(keys).toEqual([`refund-${id}-1`, `refund-${id}-1`]);
    expect(refundsOnGateway(invoice)).toHaveLength(1);
    expect((await orderRow(order.id)).status).toBe("refunded");
  });

  it("a resend first asks the gateway, and a late arrival is not refunded again", async () => {
    const { order, invoice } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await ask(order);
    sim.clearFaults();
    await sql`update refunds set status = 'not_sent', claimed_at = null where order_id = ${order.id}`;
    sim.state.requests.length = 0;
    await expect(ask(order, undefined)).resolves.toEqual({ state: "requested" });
    expect(makeRefundCalls()).toHaveLength(0);
    expect(sim.state.requests.filter((r) => r.path === "/v2/GetRefundStatus")).toHaveLength(1);
    expect(refundsOnGateway(invoice)).toHaveLength(1);
  });

  it("if the gateway cannot be asked before a resend, nothing is sent", async () => {
    const { order, invoice } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await ask(order);
    sim.clearFaults();
    await sql`update refunds set status = 'not_sent', claimed_at = null where order_id = ${order.id}`;
    sim.setFault("/v2/GetRefundStatus", "error");
    sim.state.requests.length = 0;
    await expect(ask(order, undefined)).resolves.toMatchObject({ state: "held_back", error: expect.stringContaining("فلم نرسل شيئًا") });
    expect(makeRefundCalls()).toHaveLength(0);
    expect(refundsOnGateway(invoice)).toHaveLength(1);
    expect((await refundOf(order.id)).status).toBe("not_sent");
  });

  it("a resend does not go out over a refund the gateway reports in a state we do not know", async () => {
    const { order, invoice } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await ask(order);
    sim.clearFaults();
    await sql`update refunds set status = 'not_sent', claimed_at = null where order_id = ${order.id}`;
    sim.setRefundStatus(refundsOnGateway(invoice)[0].RefundId, "UnderReview" as never);
    sim.state.requests.length = 0;
    await expect(ask(order, undefined)).resolves.toMatchObject({ state: "held_back", error: expect.stringContaining("UnderReview") });
    expect(makeRefundCalls()).toHaveLength(0);
    expect(refundsOnGateway(invoice)).toHaveLength(1);
    expect((await refundOf(order.id)).status).toBe("not_sent");
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("tells the owner nothing was sent, not that the gateway refused, when it could not be asked", async () => {
    const { order } = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    await ask(order);
    sim.setRefundRefusal(null);
    sim.setFault("/v2/GetRefundStatus", "error");
    sim.state.requests.length = 0;
    const out = await resendRefundAction({}, form({ orderId: order.id }));
    expect(out?.error).toContain("لم يُرسل طلب الاسترداد");
    expect(out?.error).not.toContain("رفضت البوابة");
    expect(out?.error).not.toContain("الرصيد");
    expect(makeRefundCalls()).toHaveLength(0);
    expect((await refundOf(order.id)).status).toBe("failed");
  });

  it("an empty answer with Data: null reads as nothing found, as the documentation allows", async () => {
    const { order } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "down");
    await ask(order);
    sim.clearFaults();
    const { id } = await refundOf(order.id);
    await staleClaim(order.id);
    sim.setRefundStatusNullData(true);
    await expect(recheck(id)).resolves.toMatchObject({ state: "not_sent" });
    await expect(resendRefundAction({}, form({ orderId: order.id }))).resolves.toMatchObject({ ok: true });
    expect((await orderRow(order.id)).status).toBe("refunded");
  });

  it("a re-check that cannot reach the gateway changes nothing", async () => {
    const { order } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "down");
    await ask(order);
    const { id } = await refundOf(order.id);
    await staleClaim(order.id);
    sim.setFault("/v2/GetRefundStatus", "down");
    await expect(recheck(id)).rejects.toMatchObject({ userMessage: expect.stringContaining("ولم يتغير شيء") });
    expect((await refundOf(order.id)).status).toBe("unknown");
    await expect(recheckRefundAction({}, form({ refundId: id, orderId: order.id }))).resolves.toMatchObject({ error: expect.stringContaining("ولم يتغير شيء") });
  });

  it("a claim abandoned by a crash is re-checked, not resent", async () => {
    const { order, invoice } = await paidOrder();
    const [{ id }] = await sql<{ id: string }[]>`
      insert into refunds (order_id, payment_id, amount_fils, reason, status, attempt, claimed_at, created_by)
      select ${order.id}, p.id, ${order.total_fils}, 'طلب الطالب', 'sending', 1, now() - interval '5 minutes', ${admin.id} from payments p where p.order_id = ${order.id}
      returning id
    `;
    await expect(ask(order)).rejects.toMatchObject({ userMessage: expect.stringContaining("إعادة التحقق") });
    await expect(recheck(id)).resolves.toMatchObject({ state: "not_sent" });
    expect(refundsOnGateway(invoice)).toHaveLength(0);
  });

  it("a save failure after the gateway accepted is not reported as a refusal", async () => {
    const { order, invoice } = await paidOrder();
    await sql`create or replace function test_block_requested() returns trigger as $$ begin raise exception 'database went away'; end $$ language plpgsql`;
    await sql`create trigger test_block_requested before update on refunds for each row when (new.status = 'requested') execute function test_block_requested()`;
    const out = await ask(order).finally(async () => {
      await sql`drop trigger test_block_requested on refunds`;
      await sql`drop function test_block_requested()`;
    });
    expect(out.state).toBe("unknown");
    expect(await refundOf(order.id)).toMatchObject({ status: "sending" });
    expect((await orderRow(order.id)).status).toBe("paid");
    await staleClaim(order.id);
    await expect(recheck((await refundOf(order.id)).id)).resolves.toEqual({ state: "requested" });
    expect(refundsOnGateway(invoice)).toHaveLength(1);
    expect((await orderRow(order.id)).status).toBe("refunded");
  });
});

describe("a new refund after the owner dismissed one whose outcome was unknown", () => {
  async function dismissedUnknown() {
    const { order, invoice } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await ask(order);
    sim.clearFaults();
    const { id } = await refundOf(order.id);
    await staleClaim(order.id);
    await expect(dismissRefundAction({}, form({ refundId: id, orderId: order.id, reason: "راجعنا لوحة البوابة" }))).resolves.toMatchObject({ ok: true });
    sim.state.requests.length = 0;
    return { order, invoice };
  }

  it("does not go out while the gateway shows the earlier request", async () => {
    const { order, invoice } = await dismissedUnknown();
    await expect(ask(order)).resolves.toMatchObject({ state: "held_back", error: expect.stringContaining("طلب استرداد سابق") });
    expect(makeRefundCalls()).toHaveLength(0);
    expect(refundsOnGateway(invoice)).toHaveLength(1);
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("says so to the owner in words that do not blame the gateway", async () => {
    const { order } = await dismissedUnknown();
    const out = await refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب" }));
    expect(out?.error).toContain("لم يُرسل طلب الاسترداد");
    expect(out?.error).not.toContain("رفضت البوابة");
  });

  it("does not go out when the gateway cannot be asked", async () => {
    const { order } = await dismissedUnknown();
    sim.setFault("/v2/GetRefundStatus", "error");
    await expect(ask(order)).resolves.toMatchObject({ state: "held_back" });
    expect(makeRefundCalls()).toHaveLength(0);
  });

  it("goes out once the gateway shows the earlier request as cancelled", async () => {
    const { order, invoice } = await dismissedUnknown();
    sim.setRefundStatus(refundsOnGateway(invoice)[0].RefundId, "Canceled");
    await expect(ask(order)).resolves.toEqual({ state: "requested" });
    expect(makeRefundCalls()).toHaveLength(1);
  });

  it("goes out when the earlier request never reached the gateway", async () => {
    const { order, invoice } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "down");
    await ask(order);
    sim.clearFaults();
    const { id } = await refundOf(order.id);
    await staleClaim(order.id);
    await dismissRefundAction({}, form({ refundId: id, orderId: order.id, reason: "راجعنا لوحة البوابة" }));
    await expect(ask(order)).resolves.toEqual({ state: "requested" });
    expect(refundsOnGateway(invoice)).toHaveLength(1);
  });
});

describe("the partial amount field is gone", () => {
  it("an amount in the form is ignored: the whole order is refunded", async () => {
    const { order } = await paidOrder(3000);
    await refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب", amount: "1.000" }));
    expect((makeRefundCalls()[0].body as { Amount: number }).Amount).toBe(3);
    expect((await refundOf(order.id)).amount_fils).toBe(3000);
  });
});

describe("the step-up hook", () => {
  it("stops the refund, the resend and the extra-payment refund before the gateway", async () => {
    const { order } = await paidOrder();
    ctx.stepUpFails = true;
    await expect(refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب" }))).resolves.toEqual({ error: "أدخل رمز التحقق" });
    await expect(resendRefundAction({}, form({ orderId: order.id }))).resolves.toEqual({ error: "أدخل رمز التحقق" });
    await expect(refundExtraPaymentAction({}, form({ extraId: order.id, reason: "دفعة مكررة" }))).resolves.toEqual({ error: "أدخل رمز التحقق" });
    expect(makeRefundCalls()).toHaveLength(0);
    expect(await refundOf(order.id)).toBeUndefined();
  });
});

describe("refund webhooks for a refund we know", () => {
  it("REFUNDED completes it, once, whatever the number of deliveries", async () => {
    const { order, user, invoice } = await paidOrder();
    await ask(order);
    const [gatewayRefund] = refundsOnGateway(invoice);
    sim.setRefundStatus(gatewayRefund.RefundId, "Refunded");
    await expect(portalEvent(invoice, gatewayRefund.RefundId)).resolves.toMatchObject({ status: 200, result: "refund REFUNDED" });
    const refund = await refundOf(order.id);
    expect(refund.status).toBe("completed");
    expect(refund.completed_at).not.toBeNull();
    expect(await auditCount("order.refund", order.id)).toBe(1);
    expect(await refundMails(user.email)).toHaveLength(1);
    // إشعار ثانٍ بتوقيع صحيح لا يطبق شيئًا من جديد
    await expect(portalEvent(invoice, gatewayRefund.RefundId)).resolves.toMatchObject({ status: 200 });
    expect((await refundOf(order.id)).completed_at).toEqual(refund.completed_at);
    expect(await auditCount("order.refund", order.id)).toBe(1);
    expect(await refundMails(user.email)).toHaveLength(1);
    expect(await completedMails(user.email)).toHaveLength(1);
  });

  it("CANCELED after acceptance gives everything back and allows a new attempt", async () => {
    const { order, user, product, invoice } = await paidTeacherOrder();
    await ask(order);
    expect(await earningStates(order.id)).toEqual(["reversed"]);
    const [gatewayRefund] = refundsOnGateway(invoice);
    sim.setRefundStatus(gatewayRefund.RefundId, "Canceled");
    await expect(portalEvent(invoice, gatewayRefund.RefundId, "CANCELED")).resolves.toMatchObject({ status: 200 });

    expect(await refundOf(order.id)).toMatchObject({ status: "failed", accepted_at: null });
    expect((await orderRow(order.id)).status).toBe("paid");
    const [p] = await sql<{ status: string }[]>`select status from payments where order_id = ${order.id}`;
    expect(p.status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    expect(await earningStates(order.id)).toEqual(["active"]);
    expect(await auditCount("order.refund_undone", order.id)).toBe(1);
    const [mail] = await sql`select id from email_log where to_email = ${user.email} and template = 'order_refund_cancelled'`;
    expect(mail).toBeDefined();

    await expect(ask(order, undefined)).resolves.toEqual({ state: "requested" });
    expect(await refundOf(order.id)).toMatchObject({ status: "requested", attempt: 2 });
  });

  it("a cancellation does not touch access the student has since received another way", async () => {
    const { order, user, product, invoice } = await paidOrder();
    await ask(order);
    await adminGrant({ userId: user.id, productId: product.id, adminId: admin.id, reason: "تعويض" });
    const [gatewayRefund] = refundsOnGateway(invoice);
    await portalEvent(invoice, gatewayRefund.RefundId, "CANCELED");
    const [e] = await sql<{ source: string; revoked_at: Date | null }[]>`select source, revoked_at from entitlements where user_id = ${user.id} and product_id = ${product.id}`;
    expect(e).toEqual({ source: "manual", revoked_at: null });
  });

  it("a cancellation gives back only what this refund took", async () => {
    const { order, user, product, invoice } = await paidOrder();
    // منتج آخر سحبه المالك لسبب مختلف: الإلغاء لا يعيده
    const other = await createVideoProduct();
    await adminGrant({ userId: user.id, productId: other.id, adminId: admin.id, reason: "منحة" });
    await adminRevoke({ userId: user.id, productId: other.id, adminId: admin.id, reason: "مخالفة الشروط" });
    await ask(order);
    await portalEvent(invoice, refundsOnGateway(invoice)[0].RefundId, "CANCELED");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it("access the owner removed before the refund stays removed after a cancellation", async () => {
    const { order, user, product, invoice } = await paidOrder();
    await adminRevoke({ userId: user.id, productId: product.id, adminId: admin.id, reason: "مخالفة الشروط" });
    await ask(order);
    await portalEvent(invoice, refundsOnGateway(invoice)[0].RefundId, "CANCELED");
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([]);
  });

  it("a cancellation restores everything a bundle had given", async () => {
    const inside = await createProduct({ priceFils: 2000 });
    const bundle = await createBundle({ items: [inside.id], priceFils: 2500 });
    const user = await createUser();
    const order = await createOrder({ user, productIds: [bundle.id], isTest: true });
    const { url } = await startPayment(order, 1);
    const invoice = invoiceIdOf(url);
    const { paymentId } = await sim.pay(invoice, "success");
    await verifyAndApplyPayment({ paymentId });
    const before = await activeEntitlements(user.id);
    expect(before.length).toBeGreaterThan(0);
    await ask(await orderRow(order.id));
    expect(await activeEntitlements(user.id)).toEqual([]);
    await portalEvent(invoice, refundsOnGateway(invoice)[0].RefundId, "CANCELED");
    expect(await activeEntitlements(user.id)).toEqual(before);
  });

  it("CANCELED on a completed refund is flagged and changes nothing", async () => {
    const { order, invoice } = await paidOrder();
    await ask(order);
    const [gatewayRefund] = refundsOnGateway(invoice);
    await portalEvent(invoice, gatewayRefund.RefundId);
    await portalEvent(invoice, gatewayRefund.RefundId, "CANCELED");
    expect((await refundOf(order.id)).status).toBe("completed");
    expect((await orderRow(order.id)).status).toBe("refunded");
    expect((await alertsOf(order.id)).map((a) => a.details.reason)).toEqual(["cancelled_after_completion"]);
  });

  it("a webhook arriving before the MakeRefund reply is applied once", async () => {
    const { order, user, invoice } = await paidOrder();
    const real = realClient();
    const gateway: RefundGateway = {
      getRefundStatus: (k, t) => real.getRefundStatus(k, t),
      makeRefund: async (input) => {
        const reply = await real.makeRefund(input);
        await portalEvent(invoice, reply.RefundId);
        return reply;
      },
    };
    await expect(requestRefund(gateway, "sandbox", { orderId: order.id, adminId: admin.id, reason: "طلب الطالب" })).resolves.toEqual({ state: "completed" });
    expect(await refundOf(order.id)).toMatchObject({ status: "completed", source: "owner" });
    expect(await auditCount("order.refund", order.id)).toBe(1);
    // نُفذ قبل أن يصلنا القبول، فلا معنى لرسالة «قيد التنفيذ»: رسالة واحدة تقول ما حدث
    expect(await refundMails(user.email)).toHaveLength(0);
    expect(await completedMails(user.email)).toHaveLength(1);
    expect(await alertsOf(order.id)).toHaveLength(0);
  });

  it("a cancellation arriving before the MakeRefund reply wins", async () => {
    const { order, user, product, invoice } = await paidOrder();
    const real = realClient();
    const gateway: RefundGateway = {
      getRefundStatus: (k, t) => real.getRefundStatus(k, t),
      makeRefund: async (input) => {
        const reply = await real.makeRefund(input);
        await portalEvent(invoice, reply.RefundId, "CANCELED");
        return reply;
      },
    };
    await expect(requestRefund(gateway, "sandbox", { orderId: order.id, adminId: admin.id, reason: "طلب الطالب" })).resolves.toMatchObject({ state: "failed" });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
  });

  it("a webhook resolves an unknown refund without a re-check", async () => {
    const { order, invoice } = await paidOrder();
    sim.setFault("/v2/MakeRefund", "drop-after");
    await ask(order);
    sim.clearFaults();
    const [gatewayRefund] = refundsOnGateway(invoice);
    await portalEvent(invoice, gatewayRefund.RefundId);
    expect(await refundOf(order.id)).toMatchObject({ status: "completed", gateway_refund_id: String(gatewayRefund.RefundId) });
    expect((await orderRow(order.id)).status).toBe("refunded");
    expect(await alertsOf(order.id)).toHaveLength(0);
  });

  it("re-check reads Canceled and Refunded from the gateway", async () => {
    const a = await paidOrder();
    await ask(a.order);
    const refundA = await refundOf(a.order.id);
    sim.setRefundStatus(refundsOnGateway(a.invoice)[0].RefundId, "Refunded");
    await expect(recheck(refundA.id)).resolves.toEqual({ state: "completed" });

    const b = await paidOrder();
    await ask(b.order);
    const refundB = await refundOf(b.order.id);
    sim.setRefundStatus(refundsOnGateway(b.invoice)[0].RefundId, "Canceled");
    await expect(recheck(refundB.id)).resolves.toMatchObject({ state: "failed" });
    expect((await orderRow(b.order.id)).status).toBe("paid");
  });
});

describe("refund webhooks with an id we do not know (portal refunds)", () => {
  it("confirms against the original invoice, because the refund has its own invoice number", async () => {
    const { order, invoice } = await paidOrder();
    const portal = sim.portalRefund(invoice, order.total_fils);
    expect(portal.RefundInvoiceId).not.toBe(invoice);
    const { body } = sim.buildRefundWebhook(invoice, portal.RefundId, "REFUNDED");
    expect(JSON.parse(body).Data).toMatchObject({ Refund: { InvoiceId: String(portal.RefundInvoiceId) }, ReferencedInvoice: { Id: String(invoice) } });
    sim.state.requests.length = 0;
    await portalEvent(invoice, portal.RefundId);
    expect(sim.state.requests.filter((r) => r.path === "/v2/GetRefundStatus").map((r) => r.body)).toEqual([{ Key: String(invoice), KeyType: "InvoiceId" }]);
    expect((await orderRow(order.id)).status).toBe("refunded");
  });

  it("are applied when they match a paid order in full", async () => {
    const { order, user, invoice } = await paidTeacherOrder();
    const portal = sim.portalRefund(invoice, order.total_fils);
    await expect(portalEvent(invoice, portal.RefundId)).resolves.toMatchObject({ status: 200 });
    expect(await refundOf(order.id)).toMatchObject({ status: "completed", source: "portal", gateway_refund_id: String(portal.RefundId), amount_fils: order.total_fils });
    expect((await orderRow(order.id)).status).toBe("refunded");
    expect(await activeEntitlements(user.id)).toEqual([]);
    expect(await earningStates(order.id)).toEqual(["reversed"]);
    expect(await refundMails(user.email)).toHaveLength(0);
    expect(await completedMails(user.email)).toHaveLength(1);
    expect(await alertsOf(order.id)).toHaveLength(0);
  });

  // تغيّر عمدًا (K003): استرداد جزئي من لوحة البوابة يوقف الوصول والأرباح حتى يقرر المالك، والطلب نفسه لا يتغير
  it("a partial refund is flagged and holds the order without reversing anything", async () => {
    const { order, user, product, invoice } = await paidOrder(3000);
    const portal = sim.portalRefund(invoice, 1000);
    expect(await activeEntitlements(user.id)).toEqual([product.id]);
    await expect(portalEvent(invoice, portal.RefundId)).resolves.toMatchObject({ status: 200 });
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await activeEntitlements(user.id)).toEqual([]);
    expect(await sql`select kind, amount_fils from order_holds where order_id = ${order.id} and released_at is null`).toEqual([{ kind: "partial_refund", amount_fils: 1000 }]);
    expect((await alertsOf(order.id)).map((a) => [a.kind, a.details.reason])).toEqual([["refund_unmatched", "amount_mismatch"]]);
  });

  it("is flagged when the gateway does not confirm it", async () => {
    const { order, invoice } = await paidOrder();
    const portal = sim.portalRefund(invoice, order.total_fils, "Pending");
    await portalEvent(invoice, portal.RefundId);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect((await alertsOf(order.id)).map((a) => a.details.reason)).toEqual(["not_confirmed"]);
  });

  it("is retried when the gateway cannot be asked", async () => {
    const { order, invoice } = await paidOrder();
    const portal = sim.portalRefund(invoice, order.total_fils);
    sim.setFault("/v2/GetRefundStatus", "error");
    await expect(portalEvent(invoice, portal.RefundId)).resolves.toMatchObject({ status: 500 });
    expect((await orderRow(order.id)).status).toBe("paid");
    sim.clearFaults();
    await expect(portalEvent(invoice, portal.RefundId)).resolves.toMatchObject({ status: 200 });
    expect((await orderRow(order.id)).status).toBe("refunded");
  });

  it("on an order already refunded is flagged, not applied twice", async () => {
    const { order, invoice } = await paidOrder();
    await ask(order);
    const portal = sim.portalRefund(invoice, order.total_fils);
    await portalEvent(invoice, portal.RefundId);
    expect(await auditCount("order.refund", order.id)).toBe(1);
    expect((await alertsOf(order.id)).map((a) => a.details.reason)).toEqual(["order_not_paid"]);
  });

  it("a portal refund after a refused attempt takes over that record", async () => {
    const { order, invoice } = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    await ask(order);
    sim.clearFaults();
    const { id } = await refundOf(order.id);
    const portal = sim.portalRefund(invoice, order.total_fils);
    await portalEvent(invoice, portal.RefundId);
    expect(await refundOf(order.id)).toMatchObject({ id, status: "completed", source: "portal" });
    expect((await orderRow(order.id)).status).toBe("refunded");
  });

  it("an invoice that is not ours is flagged", async () => {
    const res = await fetch(`${sim.url}/v2/ExecutePayment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SIM_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ PaymentMethodId: 1, InvoiceValue: 3, CallBackUrl: "https://x.test/cb", ErrorUrl: "https://x.test/err", CustomerReference: "ORD-1" }),
    });
    const { Data } = (await res.json()) as { Data: { InvoiceId: number } };
    await sim.pay(Data.InvoiceId, "success");
    const portal = sim.portalRefund(Data.InvoiceId, 3000);
    await expect(portalEvent(Data.InvoiceId, portal.RefundId)).resolves.toMatchObject({ status: 200 });
    const [alert] = await sql<{ order_id: string | null; details: { reason: string } }[]>`select order_id, details from payment_alerts where dedupe_key = ${`refund:${portal.RefundId}:REFUNDED`}`;
    expect(alert).toMatchObject({ order_id: null, details: { reason: "unknown_invoice" } });
  });

  it("an extra payment's refund stays on the extra payment", async () => {
    // فاتورتان دُفعتا على الطلب نفسه: الثانية دفعة زائدة
    const { order } = await newOrder();
    const first = await startPayment(order, null);
    await expireLocally(invoiceIdOf(first.url));
    const second = await startPayment(await orderRow(order.id), null);
    const invoice = invoiceIdOf(first.url);
    const secondInvoice = invoiceIdOf(second.url);
    await sim.pay(invoice, "success");
    await verifyAndApplyPayment({ invoiceId: String(invoice) });
    await sim.pay(secondInvoice, "success");
    await verifyAndApplyPayment({ invoiceId: String(secondInvoice) });
    const [extra] = await sql<{ id: string }[]>`select id from payment_extras where order_id = ${order.id}`;
    await refundExtraPayment({ extraId: extra.id, adminId: admin.id, reason: "دفعة مكررة" });
    const [gatewayRefund] = refundsOnGateway(secondInvoice);
    await portalEvent(secondInvoice, gatewayRefund.RefundId);
    expect((await sql<{ state: string }[]>`select state from payment_extras where id = ${extra.id}`)[0].state).toBe("refunded");
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await refundOf(order.id)).toBeUndefined();
    expect(refundsOnGateway(invoice)).toHaveLength(0);
  });
});

describe("a refund recorded before this command existed", () => {
  const resend = (order: OrderRow) => requestOrderRefund({ orderId: order.id, adminId: admin.id });

  async function legacyRefund() {
    const paid = await paidOrder();
    // كما كان يفعل النظام القديم: يقلب الطلب محليًا دون أي طلب إلى البوابة
    await sql`
      insert into refunds (order_id, payment_id, amount_fils, reason, status, created_by)
      select ${paid.order.id}, p.id, ${paid.order.total_fils}, 'طلب قديم', 'recorded', ${admin.id} from payments p where p.order_id = ${paid.order.id}
    `;
    await sql`update orders set status = 'refunded' where id = ${paid.order.id}`;
    await sql`update payments set status = 'refunded' where order_id = ${paid.order.id}`;
    await sql`update entitlements set revoked_at = now(), revoke_reason = 'استرداد: طلب قديم' where order_id = ${paid.order.id}`;
    return paid;
  }

  it("is sent to the gateway without applying the refund a second time", async () => {
    const { order, user, invoice } = await legacyRefund();
    await expect(resend(order)).resolves.toEqual({ state: "requested" });
    expect(await refundOf(order.id)).toMatchObject({ status: "requested", attempt: 1, accepted_at: null });
    expect(refundsOnGateway(invoice)).toHaveLength(1);
    expect(await auditCount("order.refund", order.id)).toBe(0);
    expect(await refundMails(user.email)).toHaveLength(0);
  });

  it("does not give access back if the gateway cancels it, because this command did not take it", async () => {
    const { order, user, invoice } = await legacyRefund();
    await resend(order);
    await portalEvent(invoice, refundsOnGateway(invoice)[0].RefundId, "CANCELED");
    expect(await refundOf(order.id)).toMatchObject({ status: "failed" });
    expect((await orderRow(order.id)).status).toBe("refunded");
    expect(await activeEntitlements(user.id)).toEqual([]);
    expect(await auditCount("order.refund_undone", order.id)).toBe(0);
  });
});

describe("a refund that has waited too long on the gateway", () => {
  it("comes back to the owner's count", async () => {
    const before = await refundsNeedingOwnerCount();
    const { order } = await paidOrder();
    await ask(order);
    expect(await refundsNeedingOwnerCount()).toBe(before);
    await sql`update refunds set accepted_at = now() - interval '73 hours' where order_id = ${order.id}`;
    expect(await refundsNeedingOwnerCount()).toBe(before + 1);
  });
});

describe("the owner's queue", () => {
  it("lists every refund that is not completed and counts what needs a decision", async () => {
    const before = await refundsNeedingOwnerCount();
    const waiting = await paidOrder();
    await ask(waiting.order);
    const refused = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    await ask(refused.order);
    sim.clearFaults();
    const done = await paidOrder();
    await ask(done.order);
    await portalEvent(done.invoice, refundsOnGateway(done.invoice)[0].RefundId);

    const queue = await openRefunds({ limit: 200 });
    const statusOf = (orderId: string) => queue.find((r) => r.order_id === orderId)?.status;
    expect(statusOf(waiting.order.id)).toBe("requested");
    expect(statusOf(refused.order.id)).toBe("failed");
    expect(statusOf(done.order.id)).toBeUndefined();
    expect(await refundsNeedingOwnerCount()).toBe(before + 1);
  });

  it("dismissing keeps the order, needs a reason, and frees the order for a new refund", async () => {
    const { order } = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    await ask(order);
    sim.clearFaults();
    const { id } = await refundOf(order.id);
    const before = (await orderRow(order.id)).status;
    await expect(dismissRefundAction({}, form({ refundId: id, orderId: order.id, reason: "x" }))).resolves.toMatchObject({ error: expect.stringContaining("٣ أحرف") });
    await expect(dismissRefundAction({}, form({ refundId: id, orderId: order.id, reason: "تمت التسوية يدويًا" }))).resolves.toMatchObject({ ok: true });
    expect((await orderRow(order.id)).status).toBe(before);
    expect(await auditCount("order.refund_dismissed", order.id)).toBe(1);
    await expect(ask(order)).resolves.toEqual({ state: "requested" });
    expect(await sql`select 1 from refunds where order_id = ${order.id}`).toHaveLength(2);
  });

  it("a refund the gateway accepted, or one being sent, cannot be dismissed", async () => {
    const accepted = await paidOrder();
    await ask(accepted.order);
    await expect(dismissRefund({ refundId: (await refundOf(accepted.order.id)).id, adminId: admin.id, reason: "لا حاجة" })).resolves.toBe(false);
    const sending = await paidOrder();
    const [{ id }] = await sql<{ id: string }[]>`
      insert into refunds (order_id, payment_id, amount_fils, reason, status, attempt, claimed_at, created_by)
      select ${sending.order.id}, p.id, ${sending.order.total_fils}, 'طلب الطالب', 'sending', 1, now(), ${admin.id} from payments p where p.order_id = ${sending.order.id}
      returning id
    `;
    await expect(dismissRefund({ refundId: id, adminId: admin.id, reason: "لا حاجة" })).resolves.toBe(false);
  });

  it("only an admin can use the actions", async () => {
    const { order } = await paidOrder();
    ctx.admin = null;
    try {
      const denied = { error: "غير مصرح لك بتنفيذ هذا الإجراء" };
      await expect(refundOrderAction({}, form({ orderId: order.id, reason: "طلب الطالب" }))).resolves.toEqual(denied);
      await expect(resendRefundAction({}, form({ orderId: order.id }))).resolves.toEqual(denied);
      await expect(recheckRefundAction({}, form({ refundId: order.id, orderId: order.id }))).resolves.toEqual(denied);
      await expect(dismissRefundAction({}, form({ refundId: order.id, orderId: order.id, reason: "تمت التسوية" }))).resolves.toEqual(denied);
      await expect(refundExtraPaymentAction({}, form({ extraId: order.id, reason: "دفعة مكررة" }))).resolves.toEqual(denied);
    } finally {
      ctx.admin = admin;
    }
    expect(makeRefundCalls()).toHaveLength(0);
  });
});

describe("reports", () => {
  it("count a refund only once the gateway has accepted it", async () => {
    const range = () => ({ from: new Date(Date.now() - 3600_000), to: new Date(Date.now() + 3600_000), includeTest: true });
    const baseline = (await reportSummary(range())).refundsCount;
    const refused = await paidOrder();
    sim.setRefundRefusal("Insufficient refund balance");
    await ask(refused.order);
    sim.clearFaults();
    expect((await reportSummary(range())).refundsCount).toBe(baseline);
    const accepted = await paidOrder();
    await ask(accepted.order);
    expect((await reportSummary(range())).refundsCount).toBe(baseline + 1);
  });
});

describe("connections", () => {
  const withinTime = <T>(work: Promise<T>, ms = 8000): Promise<T> => {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`still waiting after ${ms}ms: a transaction asked the pool for a second connection`)), ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  };
  const usePool = async (max: number) => {
    await closeDb();
    process.env.DATABASE_POOL_MAX = String(max);
    resetEnvCache();
  };

  it("every refund path completes on a pool of one connection", async () => {
    const owner = await paidOrder();
    const timedOut = await paidOrder();
    const portal = await paidOrder();
    const cancelled = await paidOrder();
    await usePool(1);
    try {
      await expect(withinTime(ask(owner.order))).resolves.toEqual({ state: "requested" });
      await withinTime(portalEvent(owner.invoice, refundsOnGateway(owner.invoice)[0].RefundId));
      expect((await refundOf(owner.order.id)).status).toBe("completed");

      sim.setFault("/v2/MakeRefund", "drop-after");
      await expect(withinTime(ask(timedOut.order))).resolves.toMatchObject({ state: "unknown" });
      sim.clearFaults();
      await expect(withinTime(recheck((await refundOf(timedOut.order.id)).id))).resolves.toEqual({ state: "requested" });

      const made = sim.portalRefund(portal.invoice, portal.order.total_fils);
      await withinTime(portalEvent(portal.invoice, made.RefundId));
      expect((await refundOf(portal.order.id)).source).toBe("portal");

      await withinTime(ask(cancelled.order));
      await withinTime(portalEvent(cancelled.invoice, refundsOnGateway(cancelled.invoice)[0].RefundId, "CANCELED"));
      expect((await orderRow(cancelled.order.id)).status).toBe("paid");
    } finally {
      await usePool(Number(TEST_ENV.DATABASE_POOL_MAX));
    }
  });
});
