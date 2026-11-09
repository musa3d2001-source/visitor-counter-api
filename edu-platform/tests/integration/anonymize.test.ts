import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { AdminError } from "@/server/admin/common";
import { correctStudentEmail, resetStudentPassword } from "@/server/admin/student-accounts";
import { anonymizationBlockers, anonymizeStudent } from "@/server/admin/student-anonymize";
import { closeOrder, createOrder, type OrderRow } from "@/server/commerce/orders";
import { handleMyFatoorahWebhook, resetPaymentMethodsCache, verifyAndApplyPayment } from "@/server/payments/service";
import { resetEnvCache } from "@/server/env";
import { loginWithPassword } from "@/server/auth/service";
import { createSession, createSessionIn, hashToken, validateSessionToken } from "@/server/auth/session";
import { sendMail } from "@/server/platform/mailer";
import { dashboardTotals } from "@/server/admin/stats";
import { anonymizedEmail, anonymizedName } from "@/lib/anonymize";
import { closeDb, resetDb, sql } from "../helpers/db";
import { confirmPaid, invoiceIdOf, newOrder, startPayment } from "../helpers/payment-flow";
import { activeEntitlements, createProduct, createTeacher, createUser, createVideoProduct, TEST_PASSWORD } from "../helpers/factories";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { SIM_API_KEY, SIM_PORT, TEST_DATABASE_URL, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ cookie: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && ctx.cookie ? { value: ctx.cookie } : undefined), set: () => {} }),
  headers: async () => new Headers({ "x-forwarded-for": "192.0.2.200" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { anonymizeStudentAction, grantAction, setActiveAction } = await import("@/app/admin/students/actions");

const EMAIL = "real.person@farqad.test";
const PHONE = "+96599112233";
const NAME = "سارة أحمد الكندري";
const IP = "192.0.2.61";
const OWNER_IP = "192.0.2.7";
const REASON = "طلب ولي الأمر";
const meta = { ip: "192.0.2.50", userAgent: "vitest" };

let n = 0;

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});
beforeEach(async () => {
  ctx.cookie = null;
  await sql`delete from rate_limits`;
});

const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};

async function student(opts: { email?: string; phone?: string | null; fullName?: string } = {}) {
  const i = n++;
  // صاحب السجل الكامل وحده يحمل الاسم والهاتف الثابتين، حتى يصح فحص كل الجداول بعد حذفه
  return createUser({ email: opts.email ?? `person${i}@farqad.test`, phone: opts.phone === undefined ? `+9659900${String(1000 + i)}` : opts.phone, fullName: opts.fullName ?? `طالب رقم ${i}` });
}

async function admin() {
  return createUser({ role: "admin", email: `owner${n++}@farqad.test`, fullName: "المالك" });
}

async function order(user: Awaited<ReturnType<typeof createUser>>, priceFils = 3000) {
  const product = await createProduct({ priceFils });
  const row = await createOrder({ user, productIds: [product.id], isTest: true });
  return { product, order: row };
}

async function paidOrder(user: Awaited<ReturnType<typeof createUser>>) {
  const made = await order(user);
  await confirmPaid(made.order);
  return made;
}

async function auditRows(id: string) {
  return sql<{ action: string; reason: string | null; metadata: Record<string, unknown>; ip: string | null; actor_id: string | null }[]>`
    select action, reason, metadata, ip, actor_id from audit_logs where entity_type = 'user' and entity_id = ${id} order by id
  `;
}

const run = (id: string, adminId: string, confirmEmail: string, reason = REASON) => anonymizeStudent({ studentId: id, adminId, confirmEmail, reason, ip: OWNER_IP });

describe("who and what can be anonymised", () => {
  it("needs the student's exact email typed, and a wrong one changes nothing", async () => {
    const [u, a] = [await student(), await admin()];
    await expect(run(u.id, a.id, "wrong@farqad.test")).rejects.toMatchObject({ fieldErrors: { confirmEmail: expect.any(String) } });
    const [row] = await sql<{ email: string; anonymized_at: Date | null; is_active: boolean }[]>`select email, anonymized_at, is_active from users where id = ${u.id}`;
    expect(row).toMatchObject({ email: u.email, anonymized_at: null, is_active: true });
    expect(await auditRows(u.id)).toHaveLength(0);
  });

  it("accepts the email in another case or with spaces", async () => {
    const [u, a] = [await student(), await admin()];
    await expect(run(u.id, a.id, `  ${u.email.toUpperCase()} `)).resolves.toEqual({ alreadyAnonymized: false });
  });

  it("refuses an admin account", async () => {
    const [target, a] = [await admin(), await admin()];
    await expect(run(target.id, a.id, target.email)).rejects.toThrow(/لحسابات الطلاب فقط/);
    expect((await sql`select 1 from users where id = ${target.id} and anonymized_at is null`).length).toBe(1);
  });

  it("refuses a teacher account", async () => {
    const [target, a] = [await createUser({ role: "teacher", email: `teacher${n++}@farqad.test` }), await admin()];
    await expect(run(target.id, a.id, target.email)).rejects.toBeInstanceOf(AdminError);
  });

  it("refuses an unknown account", async () => {
    const a = await admin();
    await expect(run("00000000-0000-4000-8000-000000000000", a.id, "x@y.test")).rejects.toThrow(/غير موجود/);
  });

  it("the owner action refuses a missing reason and anyone who is not the owner", async () => {
    const [u, a] = [await student(), await admin()];
    ctx.cookie = (await createSession(a.id, meta)).token;
    const noReason = await anonymizeStudentAction(null, form({ userId: u.id, confirmEmail: u.email, reason: "" }));
    expect(noReason?.error).toBeTruthy();
    ctx.cookie = (await createSession(u.id, meta)).token;
    const stranger = await student();
    const denied = await anonymizeStudentAction(null, form({ userId: stranger.id, confirmEmail: stranger.email, reason: REASON }));
    expect(denied?.ok).toBeFalsy();
    expect((await sql`select 1 from users where id = ${stranger.id} and anonymized_at is null`).length).toBe(1);
  });

  it("the action tells the owner when there was nothing left to do", async () => {
    const [u, a] = [await student(), await admin()];
    ctx.cookie = (await createSession(a.id, meta)).token;
    const first = await anonymizeStudentAction(null, form({ userId: u.id, confirmEmail: u.email, reason: REASON }));
    expect(first?.ok).toBe(true);
    const again = await anonymizeStudentAction(null, form({ userId: u.id, confirmEmail: u.email, reason: REASON }));
    expect(again).toMatchObject({ ok: true, message: expect.stringContaining("سبق حذف") });
  });

  it("is limited per student", async () => {
    const [u, a] = [await student(), await admin()];
    for (let i = 0; i < 5; i++) await expect(run(u.id, a.id, "wrong@farqad.test")).rejects.toThrow(/لا يطابق/);
    await expect(run(u.id, a.id, u.email)).rejects.toThrow(/محاولات كثيرة/);
    expect((await sql`select 1 from users where id = ${u.id} and anonymized_at is null`).length).toBe(1);
  });
});

describe("it refuses while money is unsettled", () => {
  async function blockedOn(setup: (u: Awaited<ReturnType<typeof createUser>>, a: Awaited<ReturnType<typeof createUser>>) => Promise<unknown>, kind: string) {
    const [u, a] = [await student(), await admin()];
    await setup(u, a);
    expect((await anonymizationBlockers(u.id)).map((b) => b.kind)).toContain(kind);
    await expect(run(u.id, a.id, u.email)).rejects.toThrow(/لا يمكن الحذف الآن/);
    const [row] = await sql<{ anonymized_at: Date | null; email: string }[]>`select anonymized_at, email from users where id = ${u.id}`;
    expect(row).toMatchObject({ anonymized_at: null, email: u.email });
    expect((await auditRows(u.id)).filter((r) => r.action === "student.anonymized")).toHaveLength(0);
    return u;
  }

  it.each(["pending", "failed"])("an order that is %s", async (status) => {
    await blockedOn(async (u) => {
      const { order: o } = await order(u);
      await sql`update orders set status = ${status} where id = ${o.id}`;
    }, "open_order");
  });

  it("a closed order whose invoice can still be paid", async () => {
    await blockedOn(async (u) => {
      const { order: o } = await order(u);
      await sql`update orders set status = 'cancelled' where id = ${o.id}`;
      await sql`insert into payments (order_id, provider, environment, status, amount_fils, gateway_invoice_id, expires_at) values (${o.id}, 'myfatoorah', 'sandbox', 'pending', 3000, ${`inv-live-${n++}`}, now() + interval '30 minutes')`;
    }, "payable_invoice");
  });

  it.each(["recorded", "sending", "unknown", "not_sent", "requested", "failed"])("a refund that is %s", async (status) => {
    await blockedOn(async (u, a) => {
      const { order: o } = await paidOrder(u);
      await sql`insert into refunds (order_id, amount_fils, reason, status, attempt, created_by) values (${o.id}, 3000, 'سبب', ${status}, 1, ${a.id})`;
    }, "refund");
  });

  it.each(["open", "refund_sending", "refund_unknown", "refund_requested", "refund_failed"])("an extra payment that is %s", async (state) => {
    await blockedOn(async (u) => {
      const { order: o } = await paidOrder(u);
      const [p] = await sql<{ id: string }[]>`insert into payments (order_id, provider, environment, status, amount_fils, gateway_invoice_id) values (${o.id}, 'myfatoorah', 'sandbox', 'paid', 3000, ${`inv-extra-${n++}`}) returning id`;
      await sql`insert into payment_extras (payment_id, order_id, kind, amount_fils, state) values (${p.id}, ${o.id}, 'duplicate', 3000, ${state})`;
    }, "extra_payment");
  });

  it("an open payment alert", async () => {
    await blockedOn(async (u) => {
      const { order: o } = await paidOrder(u);
      await sql`insert into payment_alerts (kind, dedupe_key, order_id) values ('dispute', ${`d-${n++}`}, ${o.id})`;
    }, "payment_alert");
  });

  it("names the order so the owner can go and close it", async () => {
    const [u] = [await student()];
    const { order: o } = await order(u);
    expect(await anonymizationBlockers(u.id)).toEqual([{ kind: "open_order", orderId: o.id, orderNumber: o.number }]);
  });

  it("settled history does not block it", async () => {
    const [u, a] = [await student(), await admin()];
    const { order: refunded } = await paidOrder(u);
    await sql`insert into refunds (order_id, amount_fils, reason, status, attempt, created_by) values (${refunded.id}, 3000, 'سبب', 'completed', 1, ${a.id})`;
    const { order: dismissed } = await paidOrder(u);
    await sql`insert into refunds (order_id, amount_fils, reason, status, attempt, created_by) values (${dismissed.id}, 3000, 'سبب', 'dismissed', 1, ${a.id})`;
    const { order: closed } = await order(u);
    await sql`update orders set status = 'cancelled' where id = ${closed.id}`;
    await sql`insert into payments (order_id, provider, environment, status, amount_fils, gateway_invoice_id, expires_at) values (${closed.id}, 'myfatoorah', 'sandbox', 'expired', 3000, ${`inv-old-${n++}`}, now() - interval '1 day')`;
    await sql`insert into payment_alerts (kind, dedupe_key, order_id, resolved_at) values ('dispute', ${`d-${n++}`}, ${closed.id}, now())`;
    expect(await anonymizationBlockers(u.id)).toEqual([]);
    await expect(run(u.id, a.id, u.email)).resolves.toEqual({ alreadyAnonymized: false });
  });
});

describe("a student with a full history", () => {
  const OLD_EMAIL = "old.address@farqad.test";
  const GATEWAY_STATUS = {
    InvoiceId: 991,
    InvoiceStatus: "Paid",
    CustomerName: NAME,
    CustomerEmail: EMAIL,
    CustomerMobile: "99112233",
    CustomerReference: "ref",
    InvoiceTransactions: [{ PaymentId: "0707", TransactionStatus: "Succss", CardNumber: "512345******1234", CustomerIp: IP }],
  };
  const WEBHOOK = { Event: { Code: 1, Name: "PAYMENT_STATUS_CHANGED" }, Data: { Invoice: { Id: "991", Status: "PAID" }, Transaction: { PaymentId: "0707", IP: { Address: IP }, Card: { Number: "512345******1234" } }, Customer: { Name: NAME, Email: EMAIL, Mobile: "99112233" } } };

  let u: Awaited<ReturnType<typeof createUser>>;
  let a: Awaited<ReturnType<typeof createUser>>;
  let paid: OrderRow;
  let productId: string;
  let token: string;
  let earningsBefore: unknown;
  let earningOrderId: string;
  let refundId: string;
  const earnings = (orderId: string) => sql`select id, order_id, teacher_id, gross_fils, discount_fils, fee_fils, net_fils, share_bps, teacher_fils, platform_fils, status from teacher_earnings where order_id = ${orderId}`;
  /** لقطة بعد الحذف مباشرة: beforeEach العام يفرغ جدول المحاولات */
  let rateKeysAfter: string[];

  beforeAll(async () => {
    u = await student({ email: EMAIL, phone: PHONE, fullName: NAME });
    a = await admin();
    const made = await paidOrder(u);
    paid = made.order;
    productId = made.product.id;
    token = (await createSession(u.id, meta)).token;
    await sql`update users set email_verified_at = now(), last_login_at = now(), grade_id = (select id from grades limit 1) where id = ${u.id}`;
    await sql`insert into consent_records (user_id, kind, document_version, order_id, ip, user_agent) values (${u.id}, 'guardian_purchase', 'v1', ${paid.id}, ${IP}, 'Safari-of-student')`;
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken("r".repeat(43))}, ${u.id}, now() + interval '1 hour')`;
    await sql`insert into email_verification_tokens (id, user_id, email, expires_at) values (${hashToken("v".repeat(43))}, ${u.id}, 'pending.address@farqad.test', now() + interval '1 hour')`;
    await sql`insert into login_challenges (id, user_id, expires_at) values (${hashToken("c".repeat(43))}, ${u.id}, now() + interval '1 hour')`;
    await sql`insert into user_totp (user_id, secret_ciphertext) values (${u.id}, ${"s".repeat(40)})`;
    await sql`insert into user_recovery_codes (user_id, code_hash) values (${u.id}, ${"a".repeat(64)})`;
    const teacher = await createTeacher({ shareBps: 7000 });
    const video = await createVideoProduct({ teacherId: teacher.id, lessons: 1, priceFils: 4000 });
    const taught = await createOrder({ user: u, productIds: [video.id], isTest: true });
    await confirmPaid(taught);
    earningOrderId = taught.id;
    await sql`update teacher_earnings set reversal_reason = ${`استرداد طلبته ${NAME}`} where order_id = ${taught.id}`;
    const [{ file_id }] = await sql<{ file_id: string }[]>`select id as file_id from product_files where product_id = ${productId} limit 1`;
    await sql`insert into reading_progress (user_id, file_id, last_page) values (${u.id}, ${file_id}, 4)`;
    await sql`insert into lesson_progress (user_id, lesson_id) values (${u.id}, ${video.lessonIds[0]})`;
    await sql`insert into access_logs (user_id, product_id, action, ip, user_agent) values (${u.id}, ${productId}, 'view', ${IP}, 'Safari-of-student')`;
    await sql`insert into email_log (to_email, subject, template, body, status) values (${EMAIL}, 'إيصال', 'order_confirmation', ${`مرحبا ${NAME}`}, 'logged'), (${OLD_EMAIL}, 'قديم', 'order_confirmation', 'x', 'logged'), ('someone.else@farqad.test', 'لغيره', 'order_confirmation', 'y', 'logged')`;
    await sql`insert into rate_limits (key, count, reset_at) values (${`login:fail:${EMAIL}|${IP}`}, 1, now() + interval '1 hour'), (${`checkout:${u.id}`}, 1, now() + interval '1 hour'), (${`reset:acct:${OLD_EMAIL}`}, 1, now() + interval '1 hour'), ('reset:acct:someone.else@farqad.test', 1, now() + interval '1 hour')`;
    await sql`
      insert into audit_logs (actor_id, action, entity_type, entity_id, reason, metadata, ip) values
        (${a.id}, 'student.email_corrected', 'user', ${u.id}, ${`طلب من ${NAME} على ${PHONE}`}, ${sql.json({ from: OLD_EMAIL, to: EMAIL })}, '192.0.2.1'),
        (${u.id}, 'user.email_corrected_by_student', 'user', ${u.id}, null, ${sql.json({ from: OLD_EMAIL, to: EMAIL })}, ${IP}),
        (${a.id}, 'order.note', 'order', ${paid.id}, ${`اتصلت على 99112233 بخصوص ${EMAIL}`}, '{}', '192.0.2.1')
    `;
    await sql`update entitlements set grant_reason = ${`هدية إلى ${NAME}`} where user_id = ${u.id}`;
    const [pay] = await sql<{ id: string }[]>`
      insert into payments (order_id, provider, environment, status, amount_fils, gateway_invoice_id, gateway_payment_id, payment_url, last_gateway_status, paid_at)
      values (${paid.id}, 'myfatoorah', 'sandbox', 'paid', 3000, '991', '0707', 'https://pay.example/991', ${sql.json(GATEWAY_STATUS)}, now()) returning id
    `;
    await sql`insert into payment_events (provider, event_key, event_name, payload, signature_valid) values ('myfatoorah', ${`ev-${n++}`}, 'PAYMENT_STATUS_CHANGED', ${sql.json(WEBHOOK)}, true)`;
    // كل حدث يُعثر عليه بطريق واحد فقط: رقم الفاتورة، أو الفاتورة المرجعية، أو بريد العميل
    await sql`insert into payment_events (provider, event_key, event_name, payload, signature_valid) values ('myfatoorah', ${`ev-${n++}`}, 'PAYMENT_STATUS_CHANGED', ${sql.json({ Event: { Code: 1 }, Data: { Invoice: { Id: "991", Status: "PAID" }, Customer: { Name: NAME, Mobile: "99112233" } } })}, true)`;
    await sql`insert into payment_events (provider, event_key, event_name, payload, signature_valid) values ('myfatoorah', ${`ev-${n++}`}, 'REFUND_STATUS_CHANGED', ${sql.json({ Event: { Code: 2 }, Data: { ReferencedInvoice: { Id: "991" }, Refund: { Id: "r1", Status: "REFUNDED" }, Customer: { Name: NAME, Mobile: "99112233" } } })}, true)`;
    await sql`insert into payment_events (provider, event_key, event_name, payload, signature_valid) values ('myfatoorah', ${`ev-${n++}`}, 'PAYMENT_STATUS_CHANGED', ${sql.json({ Event: { Code: 1 }, Data: { Invoice: { Id: "unknown-invoice" }, Customer: { Name: NAME, Email: EMAIL, Mobile: "99112233" } } })}, true)`;
    await sql`insert into payment_events (provider, event_key, event_name, payload, signature_valid) values ('myfatoorah', ${`ev-${n++}`}, 'PAYMENT_STATUS_CHANGED', ${sql.json({ Data: { Invoice: { Id: "other" }, Customer: { Email: "someone.else@farqad.test" } } })}, true)`;
    const [refund] = await sql<{ id: string }[]>`insert into refunds (order_id, payment_id, amount_fils, reason, status, attempt, created_by) values (${paid.id}, ${pay.id}, 1000, ${`طلب ${NAME}`}, 'completed', 1, ${a.id}) returning id`;
    refundId = refund.id;
    const [extra] = await sql<{ id: string }[]>`insert into payment_extras (payment_id, order_id, kind, amount_fils, state, refund_reason) values (${pay.id}, ${paid.id}, 'duplicate', 1000, 'refunded', ${`أعيد المبلغ إلى ${NAME}`}) returning id`;
    await sql`insert into audit_logs (actor_id, action, entity_type, entity_id, reason, metadata, ip) values (${a.id}, 'payment_extra.refund', 'payment_extra', ${extra.id}, ${`بطلب ${NAME}`}, '{}', '192.0.2.1')`;
    await sql`insert into audit_logs (actor_id, action, entity_type, entity_id, reason, metadata, ip) values (${u.id}, 'coupon.tried', 'coupon', 'c1', ${`كتبها ${NAME}`}, '{}', ${IP})`;
    earningsBefore = await earnings(earningOrderId);
    expect(earningsBefore).toHaveLength(1);
    await expect(run(u.id, a.id, EMAIL, `طلب ${NAME} حذف بياناته`)).resolves.toEqual({ alreadyAnonymized: false });
    rateKeysAfter = (await sql<{ key: string }[]>`select key from rate_limits`).map((r) => r.key);
  });

  it("replaces the identity with placeholders and closes the account", async () => {
    const [row] = await sql<Record<string, unknown>[]>`select * from users where id = ${u.id}`;
    expect(row).toMatchObject({ email: anonymizedEmail(u.id), full_name: anonymizedName(u.id), phone: null, password_hash: "!anonymized", grade_id: null, is_active: false, email_verified_at: null, last_login_at: null, must_change_password: false, temp_password_expires_at: null });
    expect(row.anonymized_at).toBeInstanceOf(Date);
  });

  it("the old session and every credential path are dead", async () => {
    // الصفوف أولًا: فحص الجلسة يحذف صف الحساب المغلق بنفسه، فلا يثبت أن الحذف هو من أزالها
    expect(await sql`select 1 from sessions where user_id = ${u.id}`).toHaveLength(0);
    expect(await validateSessionToken(token)).toBeNull();
    expect(await sql`select 1 from password_reset_tokens where user_id = ${u.id}`).toHaveLength(0);
    expect(await sql`select 1 from email_verification_tokens where user_id = ${u.id}`).toHaveLength(0);
    expect(await sql`select 1 from login_challenges where user_id = ${u.id}`).toHaveLength(0);
    expect(await sql`select 1 from user_totp where user_id = ${u.id}`).toHaveLength(0);
    expect(await sql`select 1 from user_recovery_codes where user_id = ${u.id}`).toHaveLength(0);
    expect((await loginWithPassword(EMAIL, TEST_PASSWORD, meta)).ok).toBe(false);
    expect((await loginWithPassword(anonymizedEmail(u.id), TEST_PASSWORD, meta)).ok).toBe(false);
    expect((await loginWithPassword(anonymizedEmail(u.id), "!anonymized", meta)).ok).toBe(false);
  });

  it("removes progress, access logs, mail history and attempt counters", async () => {
    expect(await sql`select 1 from reading_progress where user_id = ${u.id}`).toHaveLength(0);
    expect(await sql`select 1 from lesson_progress where user_id = ${u.id}`).toHaveLength(0);
    expect(await sql`select 1 from access_logs where user_id = ${u.id}`).toHaveLength(0);
    expect(await sql`select 1 from email_log where lower(to_email) in (${EMAIL}, ${OLD_EMAIL})`).toHaveLength(0);
    expect(rateKeysAfter.filter((k) => k.includes(EMAIL) || k.includes(OLD_EMAIL) || k.includes(u.id))).toEqual([]);
  });

  it("leaves other people's mail and counters alone", async () => {
    expect(await sql`select 1 from email_log where to_email = 'someone.else@farqad.test'`).toHaveLength(1);
    expect(rateKeysAfter).toContain("reset:acct:someone.else@farqad.test");
    const [other] = await sql<{ payload: { Data: { Customer: { Email: string } } } }[]>`select payload from payment_events where payload #>> '{Data,Invoice,Id}' = 'other'`;
    expect(other.payload.Data.Customer.Email).toBe("someone.else@farqad.test");
  });

  it("keeps the order and its money, without the identity", async () => {
    const [o] = await sql<OrderRow[]>`select * from orders where id = ${paid.id}`;
    expect(o).toMatchObject({ status: "paid", total_fils: paid.total_fils, number: paid.number, customer_name: anonymizedName(u.id), customer_email: anonymizedEmail(u.id), customer_phone: null });
    expect(await earnings(earningOrderId)).toEqual(earningsBefore);
  });

  it("keeps the payment auditable: identifiers stay, customer and card go", async () => {
    const [p] = await sql<{ status: string; gateway_invoice_id: string; gateway_payment_id: string; payment_url: string | null; last_gateway_status: { InvoiceId: number; InvoiceStatus: string; InvoiceTransactions: unknown[] } }[]>`
      select status, gateway_invoice_id, gateway_payment_id, payment_url, last_gateway_status from payments where order_id = ${paid.id}
    `;
    expect(p).toMatchObject({ status: "paid", gateway_invoice_id: "991", gateway_payment_id: "0707", payment_url: null });
    expect(p.last_gateway_status.InvoiceStatus).toBe("Paid");
    expect(p.last_gateway_status.InvoiceTransactions).toEqual([{ PaymentId: "0707", TransactionStatus: "Succss" }]);
  });

  it("the stored webhook keeps its identifiers without the customer", async () => {
    const [e] = await sql<{ payload: { Data: Record<string, unknown> } }[]>`select payload from payment_events where payload #>> '{Data,Invoice,Id}' = '991'`;
    expect(e.payload.Data.Customer).toBeUndefined();
    expect(e.payload.Data.Invoice).toEqual({ Id: "991", Status: "PAID" });
  });

  it("keeps each consent without the address or device", async () => {
    const rows = await sql<{ kind: string; document_version: string; order_id: string | null; ip: string | null; user_agent: string | null }[]>`select kind, document_version, order_id, ip, user_agent from consent_records where user_id = ${u.id} order by kind`;
    expect(rows.map((r) => r.kind)).toEqual(["guardian_purchase", "privacy", "terms"]);
    for (const r of rows) expect(r).toMatchObject({ ip: null, user_agent: null });
    expect(rows[0]).toMatchObject({ document_version: "v1", order_id: paid.id });
  });

  it("revokes access and removes the identity from the reasons", async () => {
    const [e] = await sql<{ revoked_at: Date | null; revoked_by: string; revoke_reason: string; grant_reason: string }[]>`select revoked_at, revoked_by, revoke_reason, grant_reason from entitlements where user_id = ${u.id}`;
    expect(e.revoked_at).toBeInstanceOf(Date);
    expect(e.revoked_by).toBe(a.id);
    expect(e.grant_reason).not.toContain(NAME);
    const [r] = await sql<{ reason: string; amount_fils: number }[]>`select reason, amount_fils from refunds where id = ${refundId}`;
    expect(r.reason).not.toContain(NAME);
    expect(r.amount_fils).toBe(1000);
    const [earning] = await sql<{ reversal_reason: string }[]>`select reversal_reason from teacher_earnings where order_id = ${earningOrderId}`;
    expect(earning.reversal_reason).toBe(`استرداد طلبته ${anonymizedName(u.id)}`);
  });

  it("records one audit entry with counts and no identity", async () => {
    const entries = (await auditRows(u.id)).filter((r) => r.action === "student.anonymized");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actor_id: a.id, ip: OWNER_IP });
    expect(entries[0].metadata).toMatchObject({ sessions: 1, accessLogs: 1, readingProgress: 1, lessonProgress: 1, ordersAnonymized: 2, entitlementsRevoked: 2 });
    expect(entries[0].reason).toBe(`طلب ${anonymizedName(u.id)} حذف بياناته`);
  });

  it("removes the identity from older audit entries but keeps what happened", async () => {
    const rows = await auditRows(u.id);
    const corrected = rows.find((r) => r.action === "student.email_corrected")!;
    expect(corrected.metadata).toEqual({ from: anonymizedEmail(u.id), to: anonymizedEmail(u.id) });
    expect(corrected.reason).toBe(`طلب من ${anonymizedName(u.id)} على [هاتف محذوف]`);
    expect(corrected.ip).toBe("192.0.2.1");
    expect(rows.find((r) => r.action === "user.email_corrected_by_student")!.ip).toBeNull();
    const [note] = await sql<{ reason: string }[]>`select reason from audit_logs where action = 'order.note' and entity_id = ${paid.id}`;
    expect(note.reason).toBe(`اتصلت على [هاتف محذوف] بخصوص ${anonymizedEmail(u.id)}`);
  });

  it("no table still holds the person's details", async () => {
    const tables = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`;
    const needles = [EMAIL, OLD_EMAIL, "pending.address@farqad.test", NAME, PHONE, "99112233", "512345", "Safari-of-student", IP];
    for (const { tablename } of tables) {
      const rows = await sql.unsafe(`select t::text as row from "${tablename}" t`);
      for (const { row } of rows as unknown as { row: string }[]) {
        for (const needle of needles) expect(`${tablename}: ${row}`.includes(needle) ? `${tablename}: ${row}` : "").toBe("");
      }
    }
  });

  it("is idempotent: a second run does nothing and adds no audit entry", async () => {
    const before = await sql`select * from users where id = ${u.id}`;
    await expect(run(u.id, a.id, "anything@farqad.test")).resolves.toEqual({ alreadyAnonymized: true });
    expect(await sql`select * from users where id = ${u.id}`).toEqual(before);
    expect((await auditRows(u.id)).filter((r) => r.action === "student.anonymized")).toHaveLength(1);
  });

  it("the student count no longer includes it", async () => {
    const before = await dashboardTotals(true);
    const other = await student();
    expect((await dashboardTotals(true)).students).toBe(before.students + 1);
    await run(other.id, a.id, other.email);
    expect((await dashboardTotals(true)).students).toBe(before.students);
  });
});

describe("an anonymised account stays closed", () => {
  async function closed() {
    const [u, a] = [await student(), await admin()];
    await run(u.id, a.id, u.email);
    ctx.cookie = (await createSession(a.id, meta)).token;
    return { u, a };
  }

  it("two accounts never collide", async () => {
    const { u } = await closed();
    const { u: v } = await closed();
    const rows = await sql<{ email: string }[]>`select email from users where id in (${u.id}, ${v.id})`;
    expect(new Set(rows.map((r) => r.email)).size).toBe(2);
  });

  it("the real email is free to register again", async () => {
    const { u } = await closed();
    await expect(createUser({ email: u.email })).resolves.toBeTruthy();
  });

  it("no session can be opened for it, even directly", async () => {
    const { u } = await closed();
    await expect(createSession(u.id, meta)).rejects.toThrow(/unknown user/);
    await expect(sql.begin((tx) => createSessionIn(tx, u.id, meta))).rejects.toThrow(/unknown user/);
  });

  it("the owner cannot reset, correct, reactivate or grant", async () => {
    const { u, a } = await closed();
    await expect(resetStudentPassword({ studentId: u.id, adminId: a.id, reason: REASON })).rejects.toThrow(/حُذفت بيانات/);
    await expect(correctStudentEmail({ studentId: u.id, newEmail: "new.one@farqad.test", adminId: a.id, reason: REASON })).rejects.toThrow(/حُذفت بيانات/);
    const activated = await setActiveAction(null, form({ userId: u.id, active: "1" }));
    expect(activated?.error).toMatch(/حُذفت بيانات/);
    const product = await createProduct({ priceFils: 1000 });
    const granted = await grantAction(null, form({ userId: u.id, productId: product.id, reason: REASON }));
    expect(granted?.error).toMatch(/حُذفت بيانات/);
    expect(await sql`select 1 from entitlements where user_id = ${u.id} and revoked_at is null`).toHaveLength(0);
  });

  it.each([
    ["reactivating", sql`is_active = true`],
    ["a real password", sql`password_hash = 'scrypt$x$y$z$a$b'`],
    ["a real email", sql`email = 'back@farqad.test'`],
    ["a phone", sql`phone = '+96599000000'`],
  ])("the database itself refuses %s", async (_label, change) => {
    const { u } = await closed();
    await expect(sql`update users set ${change} where id = ${u.id}`).rejects.toThrow(/users_anonymized_stays_closed/);
  });

  it("mail to the placeholder is dropped before any transport or log", async () => {
    const { u } = await closed();
    const before = (await sql<{ n: number }[]>`select count(*)::int as n from email_log`)[0].n;
    await expect(sendMail({ to: anonymizedEmail(u.id), subject: "s", text: "t", template: "x" })).resolves.toBe(false);
    expect((await sql<{ n: number }[]>`select count(*)::int as n from email_log`)[0].n).toBe(before);
  });

});

describe("all or nothing", () => {
  it("a failure half way leaves the student exactly as before", async () => {
    const [u, a] = [await student(), await admin()];
    await order(u);
    await sql`update orders set status = 'cancelled' where user_id = ${u.id}`;
    const session = await createSession(u.id, meta);
    await sql`insert into access_logs (user_id, action, ip) values (${u.id}, 'view', ${IP})`;
    // عنوان بديل محجوز مسبقًا يجعل تعديل الحساب، آخر خطوة تقريبًا، يفشل
    await createUser({ email: anonymizedEmail(u.id), role: "admin" });
    await expect(run(u.id, a.id, u.email)).rejects.toThrow(/duplicate|unique/);
    expect(await validateSessionToken(session.token)).not.toBeNull();
    expect(await sql`select 1 from access_logs where user_id = ${u.id}`).toHaveLength(1);
    const [o] = await sql<{ customer_email: string }[]>`select customer_email from orders where user_id = ${u.id}`;
    expect(o.customer_email).toBe(u.email);
    expect((await auditRows(u.id)).filter((r) => r.action === "student.anonymized")).toHaveLength(0);
  });
});

describe("two owners at once", () => {
  it("one anonymises, the other finds it done, and the audit has one entry", async () => {
    const [u, a] = [await student(), await admin()];
    const [first, second] = await Promise.all([run(u.id, a.id, u.email), run(u.id, a.id, u.email)]);
    expect([first.alreadyAnonymized, second.alreadyAnonymized].sort()).toEqual([false, true]);
    expect((await auditRows(u.id)).filter((r) => r.action === "student.anonymized")).toHaveLength(1);
  });

  it("waits for a change to an order in flight, then sees it and refuses", async () => {
    const [u, a] = [await student(), await admin()];
    const { order: o } = await order(u);
    await sql`update orders set status = 'cancelled' where id = ${o.id}`;
    const other = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
    try {
      let attempt: Promise<unknown> = Promise.resolve();
      await other.begin(async (tx) => {
        await tx`update orders set status = 'pending' where id = ${o.id}`;
        attempt = run(u.id, a.id, u.email).catch((e: unknown) => e);
        await new Promise((r) => setTimeout(r, 150));
      });
      const result = await attempt;
      expect(result).toBeInstanceOf(AdminError);
      expect((result as AdminError).message).toContain(o.number);
      const [row] = await sql<{ customer_email: string }[]>`select customer_email from orders where id = ${o.id}`;
      expect(row.customer_email).toBe(u.email);
    } finally {
      await other.end();
    }
  });

  it("a checkout already waiting on the student cannot write the old details afterwards", async () => {
    const u = await student();
    const product = await createProduct({ priceFils: 1000 });
    const other = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
    try {
      let placing: Promise<unknown> = Promise.resolve();
      await other.begin(async (tx) => {
        await tx`select id from users where id = ${u.id} for no key update`;
        placing = createOrder({ user: u, productIds: [product.id], isTest: true, consent: { guardianDeclared: true, termsAccepted: true, meta: { ip: null, userAgent: null } } }).catch((e: unknown) => e);
        await new Promise((r) => setTimeout(r, 150));
        await tx`update users set email = ${anonymizedEmail(u.id)}, phone = null, password_hash = '!anonymized', is_active = false, anonymized_at = now() where id = ${u.id}`;
      });
      expect(await placing).toBeInstanceOf(Error);
      expect(await sql`select 1 from orders where user_id = ${u.id}`).toHaveLength(0);
    } finally {
      await other.end();
    }
  });
});

describe("what the gateway sends after the deletion", () => {
  let sim: Simulator;

  beforeAll(async () => {
    sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
  });
  afterAll(async () => {
    await sim.close();
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
    resetEnvCache();
    resetPaymentMethodsCache();
  });

  const PII = /CustomerName|CustomerEmail|CustomerMobile|Customer"|سارة|@example\.com|\+96599887766|99887766/;
  const storedStatus = async (orderId: string) => JSON.stringify((await sql<{ last_gateway_status: unknown }[]>`select last_gateway_status from payments where order_id = ${orderId}`)[0].last_gateway_status);
  const eventPayload = async (invoiceId: number, name: string) => JSON.stringify((await sql<{ payload: unknown }[]>`select payload from payment_events where event_name = ${name} and (payload #>> '{Data,Invoice,Id}' = ${String(invoiceId)} or payload #>> '{Data,ReferencedInvoice,Id}' = ${String(invoiceId)}) order by received_at desc limit 1`)[0].payload);

  /** طلب مدفوع عبر البوابة بهوية حقيقية، ثم حُذفت بيانات صاحبه */
  async function paidThenAnonymized() {
    const { user, order } = await newOrder();
    await sql`update orders set customer_name = 'سارة أحمد' where id = ${order.id}`;
    const { url } = await startPayment({ ...order, customer_name: "سارة أحمد" }, null);
    const invoiceId = invoiceIdOf(url);
    const { paymentId } = await sim.pay(invoiceId, "success");
    expect(await verifyAndApplyPayment({ invoiceId: String(invoiceId) })).toMatchObject({ state: "paid" });
    expect(await storedStatus(order.id)).not.toMatch(PII);
    const a = await admin();
    await run(user.id, a.id, user.email);
    return { user, order, invoiceId, paymentId, a };
  }

  it("re-checking an invoice leaves the customer out, and the order stays paid", async () => {
    const { order, invoiceId } = await paidThenAnonymized();
    expect(await storedStatus(order.id)).not.toMatch(PII);
    expect(await verifyAndApplyPayment({ invoiceId: String(invoiceId) })).toMatchObject({ state: "paid", changed: false });
    const stored = await storedStatus(order.id);
    expect(stored).not.toMatch(PII);
    expect(stored).toContain("InvoiceTransactions");
    const [o] = await sql<{ status: string }[]>`select status from orders where id = ${order.id}`;
    expect(o.status).toBe("paid");
  });

  it("a dispute that arrives later is stored without the customer, and still raises the alert", async () => {
    const { order, invoiceId, paymentId } = await paidThenAnonymized();
    const { body, headers } = sim.buildDisputeWebhook(invoiceId, paymentId, { DisputeTransactionId: 912, Status: "PENDING" });
    expect(await handleMyFatoorahWebhook(body, headers)).toEqual({ status: 200, result: "dispute PENDING" });
    const event = await sql<{ event_name: string }[]>`select event_name from payment_events order by received_at desc limit 1`;
    expect(await eventPayload(invoiceId, event[0].event_name)).not.toMatch(PII);
    expect(await sql`select 1 from payment_alerts where order_id = ${order.id} and resolved_at is null`).toHaveLength(1);
  });

  it("no student's event or invoice stores the customer or the card, and the ids stay", async () => {
    const { order } = await newOrder();
    await sql`update orders set customer_name = 'سارة أحمد' where id = ${order.id}`;
    const { url } = await startPayment({ ...order, customer_name: "سارة أحمد" }, null);
    const invoiceId = invoiceIdOf(url);
    const { paymentId } = await sim.pay(invoiceId, "success");
    const { body, headers } = sim.buildWebhook(invoiceId, paymentId);
    expect((await handleMyFatoorahWebhook(body, headers)).status).toBe(200);
    const event = await sql<{ event_name: string }[]>`select event_name from payment_events order by received_at desc limit 1`;
    const stored = await eventPayload(invoiceId, event[0].event_name);
    expect(stored).not.toMatch(PII);
    expect(stored).not.toMatch(/450875|"Card"|"IP"/);
    expect(stored).toContain(paymentId);
    const status = await storedStatus(order.id);
    expect(status).not.toMatch(PII);
    expect(status).not.toMatch(/450875|CardNumber/);
    expect(status).toContain(paymentId);
  });

  it("a declined or still-open invoice is stored without the customer or the card too", async () => {
    const declined = await newOrder();
    const declinedUrl = (await startPayment(declined.order, null)).url;
    const declinedId = invoiceIdOf(declinedUrl);
    await sim.pay(declinedId, "fail");
    expect(await verifyAndApplyPayment({ invoiceId: String(declinedId) })).toMatchObject({ state: "failed" });
    const failedStatus = await storedStatus(declined.order.id);
    expect(failedStatus).toContain("InvoiceTransactions");
    expect(failedStatus).not.toMatch(PII);
    expect(failedStatus).not.toMatch(/450875|CardNumber/);

    const open = await newOrder();
    const openId = invoiceIdOf((await startPayment(open.order, null)).url);
    expect(await verifyAndApplyPayment({ invoiceId: String(openId) })).toMatchObject({ state: "pending" });
    const pendingStatus = await storedStatus(open.order.id);
    expect(pendingStatus).toContain("InvoiceStatus");
    expect(pendingStatus).not.toMatch(PII);
  });

  it("a late payment on a closed order does not bring access back: it waits for the owner to refund", async () => {
    const { user, order } = await newOrder();
    const { url } = await startPayment(order, null);
    const invoiceId = invoiceIdOf(url);
    await sql`update payments set status = 'expired', expires_at = now() - interval '1 day', created_at = now() - interval '2 days' where order_id = ${order.id}`;
    await sql.begin((db) => closeOrder(db, { orderId: order.id, reason: "expired", actorId: null }));
    const a = await admin();
    await run(user.id, a.id, user.email);

    await sim.pay(invoiceId, "success");
    expect(await verifyAndApplyPayment({ invoiceId: String(invoiceId) })).toMatchObject({ state: "flagged", kind: "late_review" });
    expect(await activeEntitlements(user.id)).toHaveLength(0);
    const [extra] = await sql<{ details: { blockers: string[] } }[]>`select details from payment_extras where order_id = ${order.id}`;
    expect(extra.details.blockers).toContain("account_anonymized");
    expect(await storedStatus(order.id)).not.toMatch(PII);
  });
});
