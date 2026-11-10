import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resetEnvCache } from "@/server/env";
import { createOrder } from "@/server/commerce/orders";
import {
  confirmEmailToken,
  EmailVerificationRequiredError,
  emailVerificationRequired,
  requestEmailCorrection,
  resendEmailVerification,
  sendEmailVerificationLink,
  sendRegistrationVerification,
  verificationState,
} from "@/server/auth/email-verification";
import { changePassword, completeForcedPasswordChange, registerStudent, resetPassword } from "@/server/auth/service";
import { resetStudentPassword } from "@/server/admin/student-accounts";
import { createSession, hashToken } from "@/server/auth/session";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { startSmtpSink, type SmtpSink } from "../mocks/smtp-sink";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createCoupon, createProduct, createUser, TEST_PASSWORD } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";
import { startPayment } from "../helpers/payment-flow";

const ctx = vi.hoisted(() => ({ user: null as unknown, cart: [] as string[], revalidated: [] as string[] }));
vi.mock("next/cache", async (original) => ({ ...(await original<typeof import("next/cache")>()), revalidatePath: (path: string) => void ctx.revalidated.push(path) }));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.80" }));
vi.mock("@/server/auth/session", async (original) => ({ ...(await original<typeof import("@/server/auth/session")>()), getCurrentUser: async () => ctx.user }));
vi.mock("@/server/auth/guards", async (original) => ({ ...(await original<typeof import("@/server/auth/guards")>()), requireUser: async () => ctx.user, assertUser: async () => ctx.user }));
vi.mock("@/server/commerce/cart", async (original) => ({
  ...(await original<typeof import("@/server/commerce/cart")>()),
  getCartIds: async () => ctx.cart,
  writeCartIds: async () => {},
}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: CheckoutPage } = await import("@/app/(site)/checkout/page");
const { default: VerifyEmailPage } = await import("@/app/(site)/(auth)/verify-email/page");
const { default: ConfirmEmailPage } = await import("@/app/(site)/(auth)/verify-email/confirm/page");
const { placeOrderAction, retryPaymentAction } = await import("@/app/(site)/checkout/actions");
const { correctEmailAction, resendVerificationAction } = await import("@/app/(site)/(auth)/verify-email/actions");

let sink: SmtpSink;
let sim: Simulator;
const IP = "192.0.2.80";

beforeAll(async () => {
  await resetDb();
  sink = await startSmtpSink();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sink.close();
  await sim.close();
  await closeDb();
});
beforeEach(() => {
  sink.clear();
  realMail();
  return sql`delete from rate_limits`;
});
afterEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.MAIL_FROM;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

function realMail() {
  process.env.MAIL_DRIVER = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(sink.port);
  process.env.MAIL_FROM = "no-reply@farqad.test";
  resetEnvCache();
}

function logMail() {
  process.env.MAIL_DRIVER = "log";
  resetEnvCache();
}

function tokenSentTo(address: string) {
  const mail = sink.messages.filter((m) => m.to.includes(address)).at(-1);
  if (!mail) throw new Error(`no mail to ${address}`);
  return decodeURIComponent(/verify-email\/confirm\?token=(\S+)/.exec(mail.text)![1]!);
}

const mailsTo = (address: string) => sink.messages.filter((m) => m.to.includes(address));
const verifiedAt = async (id: string) => (await sql<{ email_verified_at: Date | null }[]>`select email_verified_at from users where id = ${id}`)[0].email_verified_at;

async function addOrder(userId: string, opts: { status: string; totalFils: number; isTest: boolean }) {
  const paidAt = opts.status === "paid" || opts.status === "refunded" ? new Date() : null;
  await sql`
    insert into orders (user_id, subtotal_fils, discount_fils, total_fils, status, is_test, paid_at, customer_name, customer_email)
    values (${userId}, ${opts.totalFils}, 0, ${opts.totalFils}, ${opts.status}, ${opts.isTest}, ${paidAt}, 'طالب', 'x@example.com')
  `;
}

describe("who must verify", () => {
  it("nobody while mail is not real, since the link would never arrive", async () => {
    logMail();
    const u = await createUser();
    expect(await emailVerificationRequired(u.id)).toBe(false);
  });

  it("an unverified account with real mail", async () => {
    const u = await createUser();
    expect(await emailVerificationRequired(u.id)).toBe(true);
  });

  it("not an account already verified", async () => {
    const u = await createUser();
    await sql`update users set email_verified_at = now() where id = ${u.id}`;
    expect(await emailVerificationRequired(u.id)).toBe(false);
  });

  it.each(["paid", "refunded"])("an account with a real %s order is grandfathered", async (status) => {
    const u = await createUser();
    await addOrder(u.id, { status, totalFils: 1000, isTest: false });
    expect(await emailVerificationRequired(u.id)).toBe(false);
  });

  it.each([
    ["a sandbox order", { status: "paid", totalFils: 1000, isTest: true }],
    ["a free order", { status: "paid", totalFils: 0, isTest: false }],
    ["an unpaid order", { status: "pending", totalFils: 1000, isTest: false }],
    ["a failed order", { status: "failed", totalFils: 1000, isTest: false }],
  ])("%s does not grandfather", async (_label, order) => {
    const u = await createUser();
    await addOrder(u.id, order);
    expect(await emailVerificationRequired(u.id)).toBe(true);
  });
});

describe("registration stays instant", () => {
  it("the account opens with no mail step, and the link is a separate later send", async () => {
    const r = await registerStudent({ fullName: "طالب جديد", email: "fresh@farqad.test", password: "Student-Pass-1", phone: null, acceptedDocuments: true, acceptedGuardian: true }, { ip: IP, userAgent: "t" });
    expect(r.ok).toBe(true);
    expect(mailsTo("fresh@farqad.test")).toHaveLength(0);
    if (!r.ok || !r.userId) throw new Error("register");
    await sendRegistrationVerification(r.userId);
    expect(mailsTo("fresh@farqad.test")).toHaveLength(1);
    expect(await verifiedAt(r.userId)).toBeNull();
  });

  it("sends nothing while mail is not real", async () => {
    logMail();
    const u = await createUser();
    await sendRegistrationVerification(u.id);
    expect(await sql`select 1 from email_log where to_email = ${u.email}`).toHaveLength(0);
    expect(await sql`select 1 from email_verification_tokens where user_id = ${u.id}`).toHaveLength(0);
  });
});

describe("the block sits on paid checkout only", () => {
  const fd = (values: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(values)) f.set(k, v);
    return f;
  };
  const orderCount = async (userId: string) => (await sql<{ n: number }[]>`select count(*)::int as n from orders where user_id = ${userId}`)[0].n;

  it("createOrder refuses a paid order and leaves nothing behind", async () => {
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 2500 })]);
    await expect(createOrder({ user: u, productIds: [p.id], isTest: true })).rejects.toThrow(EmailVerificationRequiredError);
    expect(await orderCount(u.id)).toBe(0);
  });

  it("a free item is not blocked", async () => {
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 0 })]);
    const order = await createOrder({ user: u, productIds: [p.id], isTest: true });
    expect(order.total_fils).toBe(0);
  });

  it("a full-discount coupon is not blocked", async () => {
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 2500 })]);
    const coupon = await createCoupon({ kind: "percent", value: 100 });
    const order = await createOrder({ user: u, productIds: [p.id], couponCode: coupon.code, isTest: true });
    expect(order.total_fils).toBe(0);
  });

  it("a verified or grandfathered buyer goes through", async () => {
    const p = await createProduct({ priceFils: 2500 });
    const verified = await createUser();
    await sql`update users set email_verified_at = now() where id = ${verified.id}`;
    expect((await createOrder({ user: verified, productIds: [p.id], isTest: true })).total_fils).toBe(2500);
    const old = await createUser();
    await addOrder(old.id, { status: "paid", totalFils: 500, isTest: false });
    expect((await createOrder({ user: old, productIds: [p.id], isTest: true })).total_fils).toBe(2500);
  });

  it("with log mail the paid order is not blocked at all", async () => {
    logMail();
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 2500 })]);
    expect((await createOrder({ user: u, productIds: [p.id], isTest: true })).total_fils).toBe(2500);
  });

  it("startPayment refuses an order that predates real mail, before any gateway call", async () => {
    logMail();
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 2500 })]);
    const order = await createOrder({ user: u, productIds: [p.id], isTest: true });
    realMail();
    const before = sim.state.requests.length;
    await expect(startPayment(order, null)).rejects.toThrow(EmailVerificationRequiredError);
    expect(sim.state.requests.length).toBe(before);
    expect(await sql`select 1 from payments where order_id = ${order.id}`).toHaveLength(0);
  });

  it("placing a paid order sends the student to the verify page", async () => {
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 2500 })]);
    ctx.user = u;
    ctx.cart = [p.id];
    await expect(placeOrderAction({}, fd())).rejects.toThrow("NEXT_REDIRECT /verify-email?next=%2Fcheckout");
    expect(await orderCount(u.id)).toBe(0);
  });

  it("placing a free order still completes", async () => {
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 0 })]);
    ctx.user = u;
    ctx.cart = [p.id];
    await expect(placeOrderAction({}, fd())).rejects.toThrow(/NEXT_REDIRECT \/orders\//);
    expect(await sql`select 1 from entitlements where user_id = ${u.id} and product_id = ${p.id}`).toHaveLength(1);
  });

  it("retrying an old unpaid order sends the student to the verify page and back to the order", async () => {
    logMail();
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 2500 })]);
    const order = await createOrder({ user: u, productIds: [p.id], isTest: true });
    realMail();
    ctx.user = u;
    await expect(retryPaymentAction(fd({ orderId: order.id }))).rejects.toThrow(`NEXT_REDIRECT /verify-email?next=${encodeURIComponent(`/orders/${order.id}`)}`);
  });

  it("the checkout page redirects for a paid cart and keeps the coupon", async () => {
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 2500 })]);
    ctx.user = u;
    ctx.cart = [p.id];
    await expect(CheckoutPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT /verify-email?next=%2Fcheckout");
    await expect(CheckoutPage({ searchParams: Promise.resolve({ coupon: "SAVE10" }) })).rejects.toThrow(`NEXT_REDIRECT /verify-email?next=${encodeURIComponent("/checkout?coupon=SAVE10")}`);
  });

  it("the checkout page stays open for a free cart", async () => {
    const [u, p] = await Promise.all([createUser(), createProduct({ priceFils: 0 })]);
    ctx.user = u;
    ctx.cart = [p.id];
    expect(renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve({}) }))).toContain("إتمام الشراء");
  });
});

describe("the link", () => {
  it("is stored hashed, reaches the inbox, and the mail log never sees it", async () => {
    const u = await createUser();
    await sendEmailVerificationLink(u.id, u.email);
    const token = tokenSentTo(u.email);
    const rows = await sql<{ id: string }[]>`select id from email_verification_tokens where user_id = ${u.id}`;
    expect(rows.map((r) => r.id)).toEqual([hashToken(token)]);
    expect(JSON.stringify(await sql`select * from email_log`)).not.toContain(token);
  });

  it("carries no student name", async () => {
    const u = await createUser({ fullName: "اسم الطالب السري" });
    await sendEmailVerificationLink(u.id, u.email);
    expect(mailsTo(u.email)[0]!.text).not.toContain("اسم الطالب السري");
  });

  it("confirms once, and lifts the block", async () => {
    const u = await createUser();
    await sendEmailVerificationLink(u.id, u.email);
    const token = tokenSentTo(u.email);
    expect(await confirmEmailToken(token, IP)).toEqual({ ok: true });
    expect(await verifiedAt(u.id)).not.toBeNull();
    expect(await emailVerificationRequired(u.id)).toBe(false);
    expect((await confirmEmailToken(token, IP)).ok).toBe(false);
  });

  it("expires", async () => {
    const u = await createUser();
    await sendEmailVerificationLink(u.id, u.email);
    await sql`update email_verification_tokens set expires_at = now() - interval '1 second' where user_id = ${u.id}`;
    expect((await confirmEmailToken(tokenSentTo(u.email), IP)).ok).toBe(false);
    expect(await verifiedAt(u.id)).toBeNull();
  });

  it("a newer link cancels the older one", async () => {
    const u = await createUser();
    await sendEmailVerificationLink(u.id, u.email);
    const first = tokenSentTo(u.email);
    await sendEmailVerificationLink(u.id, u.email);
    expect((await confirmEmailToken(first, IP)).ok).toBe(false);
    expect((await confirmEmailToken(tokenSentTo(u.email), IP)).ok).toBe(true);
  });

  it("a failed send keeps the earlier link alive and does not claim a link was sent", async () => {
    const u = await createUser();
    await sendEmailVerificationLink(u.id, u.email);
    const first = tokenSentTo(u.email);
    sink.rejectNext();
    expect(await sendEmailVerificationLink(u.id, u.email)).toBe(false);
    expect(await sql`select 1 from email_verification_tokens where user_id = ${u.id}`).toHaveLength(1);
    expect((await confirmEmailToken(first, IP)).ok).toBe(true);
    const other = await createUser();
    sink.rejectNext();
    await sendEmailVerificationLink(other.id, other.email);
    expect((await verificationState(other.id)).linkSent).toBe(false);
  });

  it("garbage and unknown tokens get the same answer", async () => {
    const a = await confirmEmailToken("", IP);
    const b = await confirmEmailToken("x".repeat(200), IP);
    const c = await confirmEmailToken("A".repeat(43), IP);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.ok).toBe(false);
  });

  it("guessing is rate limited by IP", async () => {
    for (let i = 0; i < 30; i++) await confirmEmailToken(`guess-${i}-${"x".repeat(30)}`, IP);
    expect(await confirmEmailToken("one-more-guess-xxxxxxxxxxxxxxxx", IP)).toEqual({ ok: false, error: "محاولات كثيرة. حاول بعد قليل." });
  });

  it("a whole class confirming from one school network is never blocked", async () => {
    const ip = "192.0.2.82";
    for (let i = 0; i < 40; i++) {
      const u = await createUser();
      await sendEmailVerificationLink(u.id, u.email);
      expect(await confirmEmailToken(tokenSentTo(u.email), ip), `student ${i}`).toEqual({ ok: true });
    }
  });

  it("a valid link still works from an address that has been guessing", async () => {
    const ip = "192.0.2.83";
    const u = await createUser();
    await sendEmailVerificationLink(u.id, u.email);
    for (let i = 0; i < 31; i++) await confirmEmailToken(`guess-${i}-${"y".repeat(30)}`, ip);
    expect(await confirmEmailToken(tokenSentTo(u.email), ip)).toEqual({ ok: true });
  });

  it("does nothing for a suspended account", async () => {
    const u = await createUser();
    await sendEmailVerificationLink(u.id, u.email);
    await sql`update users set is_active = false where id = ${u.id}`;
    expect((await confirmEmailToken(tokenSentTo(u.email), IP)).ok).toBe(false);
  });

  it("merely opening the page spends nothing, so a mail scanner cannot use it up", async () => {
    const u = await createUser();
    await sendEmailVerificationLink(u.id, u.email);
    const html = renderToStaticMarkup(await ConfirmEmailPage({ searchParams: Promise.resolve({ token: tokenSentTo(u.email) }) }));
    expect(html).toContain("تأكيد البريد");
    expect(await verifiedAt(u.id)).toBeNull();
    expect(await sql`select 1 from email_verification_tokens where user_id = ${u.id} and used_at is null`).toHaveLength(1);
  });
});

describe("resend", () => {
  it("sends a link, then makes the student wait", async () => {
    const u = await createUser();
    expect(await resendEmailVerification(u.id, IP)).toMatchObject({ ok: true });
    expect(mailsTo(u.email)).toHaveLength(1);
    expect(await resendEmailVerification(u.id, IP)).toMatchObject({ ok: false, error: expect.stringContaining("قبل قليل") });
    expect(mailsTo(u.email)).toHaveLength(1);
  });

  it("is capped per account", async () => {
    const u = await createUser();
    for (let i = 0; i < 6; i++) {
      expect((await resendEmailVerification(u.id, IP)).ok, `send ${i}`).toBe(true);
      await sql`delete from rate_limits where key = ${`verify:cooldown:${u.id}`}`;
    }
    expect(await resendEmailVerification(u.id, IP)).toMatchObject({ ok: false, error: "طلبت روابط كثيرة. حاول بعد ساعة." });
    expect(mailsTo(u.email)).toHaveLength(6);
  });

  it("is capped per IP across accounts", async () => {
    const ip = "192.0.2.81";
    await sql`insert into rate_limits (key, count, reset_at) values (${`verify:ip:${ip}`}, 200, now() + interval '1 hour')`;
    const u = await createUser();
    expect(await resendEmailVerification(u.id, ip)).toMatchObject({ ok: false });
    expect(mailsTo(u.email)).toHaveLength(0);
  });

  it("says so when the send fails", async () => {
    const u = await createUser();
    sink.rejectNext();
    expect(await resendEmailVerification(u.id, IP)).toEqual({ ok: false, error: "تعذر إرسال الرسالة الآن. حاول بعد قليل." });
  });

  it("refuses when nothing is needed", async () => {
    const u = await createUser();
    await sql`update users set email_verified_at = now() where id = ${u.id}`;
    expect((await resendEmailVerification(u.id, IP)).ok).toBe(false);
    expect(mailsTo(u.email)).toHaveLength(0);
  });

  it("a failed send leaves no cooldown, so the student can try again at once", async () => {
    const u = await createUser();
    sink.rejectNext();
    expect(await resendEmailVerification(u.id, IP)).toEqual({ ok: false, error: "تعذر إرسال الرسالة الآن. حاول بعد قليل." });
    expect(await resendEmailVerification(u.id, IP)).toMatchObject({ ok: true });
    expect(mailsTo(u.email)).toHaveLength(1);
  });

  it("the action redraws the page only after a link really went out", async () => {
    const u = await createUser();
    ctx.user = u;
    ctx.revalidated.length = 0;
    sink.rejectNext();
    expect(await resendVerificationAction()).toMatchObject({ error: expect.any(String) });
    expect(ctx.revalidated).toEqual([]);
    expect(await resendVerificationAction()).toMatchObject({ ok: true });
    expect(ctx.revalidated).toEqual(["/verify-email"]);
  });
});

describe("correcting a mistyped address", () => {
  const ACCEPTED = "إذا كان هذا البريد متاحًا فستصلك عليه رسالة تأكيد. لن يتغير بريد حسابك قبل فتح الرابط.";

  it("needs the account password", async () => {
    const u = await createUser();
    expect(await requestEmailCorrection(u.id, "right@farqad.test", "wrong-password", IP)).toMatchObject({ ok: false, field: "currentPassword" });
    expect(mailsTo("right@farqad.test")).toHaveLength(0);
  });

  it("the account keeps its address until the link is opened from the new one", async () => {
    const u = await createUser();
    expect(await requestEmailCorrection(u.id, "right@farqad.test", TEST_PASSWORD, IP)).toEqual({ ok: true, message: ACCEPTED });
    const [before] = await sql<{ email: string }[]>`select email from users where id = ${u.id}`;
    expect(before.email).toBe(u.email);
    expect(await verificationState(u.id)).toMatchObject({ required: true, email: u.email, pendingEmail: "right@farqad.test", linkSent: true });
    expect(await confirmEmailToken(tokenSentTo("right@farqad.test"), IP)).toEqual({ ok: true });
    const [after] = await sql<{ email: string; email_verified_at: Date | null }[]>`select email, email_verified_at from users where id = ${u.id}`;
    expect(after.email).toBe("right@farqad.test");
    expect(after.email_verified_at).not.toBeNull();
    const [log] = await sql<{ action: string; actor_id: string; metadata: { from: string; to: string } }[]>`select action, actor_id, metadata from audit_logs where entity_id = ${u.id}`;
    expect(log).toMatchObject({ action: "user.email_corrected_by_student", actor_id: u.id, metadata: { from: u.email, to: "right@farqad.test" } });
  });

  it("opening the new address voids reset links that went to the old one", async () => {
    const u = await createUser();
    const reset = "reset-link-to-the-mistyped-address-1";
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken(reset)}, ${u.id}, now() + interval '1 hour')`;
    await requestEmailCorrection(u.id, "moved@farqad.test", TEST_PASSWORD, IP);
    await confirmEmailToken(tokenSentTo("moved@farqad.test"), IP);
    expect((await resetPassword(reset, "Another-Pass-11")).ok).toBe(false);
  });

  it("an address already registered gets the same reply, no link, and its owner is told", async () => {
    const [u, holder] = await Promise.all([createUser(), createUser()]);
    expect(await requestEmailCorrection(u.id, holder.email.toLowerCase(), TEST_PASSWORD, IP)).toEqual({ ok: true, message: ACCEPTED });
    const [notice] = mailsTo(holder.email);
    expect(notice!.text).not.toContain("confirm?token=");
    expect(notice!.text).not.toContain(u.email);
    expect(await sql`select 1 from email_verification_tokens where user_id = ${u.id}`).toHaveLength(0);
  });

  it("someone taking the address before the link is opened gets a clean refusal", async () => {
    const u = await createUser();
    await requestEmailCorrection(u.id, "contested@farqad.test", TEST_PASSWORD, IP);
    await createUser({ email: "contested@farqad.test" });
    expect((await confirmEmailToken(tokenSentTo("contested@farqad.test"), IP)).ok).toBe(false);
    const [row] = await sql<{ email: string; email_verified_at: Date | null }[]>`select email, email_verified_at from users where id = ${u.id}`;
    expect(row).toEqual({ email: u.email, email_verified_at: null });
  });

  it("resend goes only to the account's own address, and cancels the pending correction", async () => {
    const u = await createUser();
    await requestEmailCorrection(u.id, "second@farqad.test", TEST_PASSWORD, IP);
    const pending = tokenSentTo("second@farqad.test");
    await resendEmailVerification(u.id, IP);
    expect(mailsTo("second@farqad.test")).toHaveLength(1);
    expect(mailsTo(u.email)).toHaveLength(1);
    expect((await verificationState(u.id)).pendingEmail).toBeNull();
    expect((await confirmEmailToken(pending, IP)).ok).toBe(false);
    expect(await confirmEmailToken(tokenSentTo(u.email), IP)).toEqual({ ok: true });
  });

  it("the page says where the resend button sends while a correction is pending", async () => {
    const u = await createUser({ email: "own-address@farqad.test" });
    ctx.user = u;
    await requestEmailCorrection(u.id, "pending-address@farqad.test", TEST_PASSWORD, IP);
    const html = renderToStaticMarkup(await VerifyEmailPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("إرسال الرابط إلى بريد حسابك");
    expect(html).toContain('data-testid="resend-account-hint"');
    expect(html).toContain("own-address@farqad.test");
    expect(html).toContain("pending-address@farqad.test");
  });

  it("a student can go back to the account's address after a wrong correction", async () => {
    const u = await createUser();
    await requestEmailCorrection(u.id, "second-typo@farqad.test", TEST_PASSWORD, IP);
    const wrongLink = tokenSentTo("second-typo@farqad.test");
    expect(await requestEmailCorrection(u.id, u.email.toLowerCase(), TEST_PASSWORD, IP)).toEqual({ ok: true, message: ACCEPTED });
    expect((await verificationState(u.id)).pendingEmail).toBeNull();
    expect((await confirmEmailToken(wrongLink, IP)).ok).toBe(false);
    expect(await confirmEmailToken(tokenSentTo(u.email), IP)).toEqual({ ok: true });
  });

  it("a verified address cannot be swapped this way", async () => {
    const u = await createUser();
    await sql`update users set email_verified_at = now() where id = ${u.id}`;
    expect((await requestEmailCorrection(u.id, "elsewhere@farqad.test", TEST_PASSWORD, IP)).ok).toBe(false);
    expect(mailsTo("elsewhere@farqad.test")).toHaveLength(0);
  });

  it("an unverified account with a real paid order goes through the owner", async () => {
    const u = await createUser();
    await addOrder(u.id, { status: "paid", totalFils: 1000, isTest: false });
    expect(await requestEmailCorrection(u.id, "buyer-new@farqad.test", TEST_PASSWORD, IP)).toEqual({ ok: false, error: "لا يمكن تغيير بريد هذا الحساب من هنا. تواصل مع إدارة المنصة." });
    expect(mailsTo("buyer-new@farqad.test")).toHaveLength(0);
    expect(await sql`select 1 from email_verification_tokens where user_id = ${u.id}`).toHaveLength(0);
  });

  it("the old address is told, without the new one or the student's name", async () => {
    const u = await createUser({ fullName: "اسم يجب ألا يظهر" });
    await requestEmailCorrection(u.id, "moved-away@farqad.test", TEST_PASSWORD, IP);
    expect(mailsTo(u.email)).toHaveLength(0);
    expect(await confirmEmailToken(tokenSentTo("moved-away@farqad.test"), IP)).toEqual({ ok: true });
    const [notice] = mailsTo(u.email);
    expect(notice!.subject).toContain("تغيّر البريد");
    expect(notice!.text).not.toContain("moved-away@farqad.test");
    expect(notice!.text).not.toContain("اسم يجب ألا يظهر");
  });

  it("confirming the account's own address sends no change notice", async () => {
    const u = await createUser();
    await sendEmailVerificationLink(u.id, u.email);
    await confirmEmailToken(tokenSentTo(u.email), IP);
    expect(mailsTo(u.email)).toHaveLength(1);
  });

  it("a notice that cannot be delivered does not undo the confirmation", async () => {
    const u = await createUser();
    await requestEmailCorrection(u.id, "still-moved@farqad.test", TEST_PASSWORD, IP);
    sink.rejectNext();
    expect(await confirmEmailToken(tokenSentTo("still-moved@farqad.test"), IP)).toEqual({ ok: true });
    const [row] = await sql<{ email: string }[]>`select email from users where id = ${u.id}`;
    expect(row.email).toBe("still-moved@farqad.test");
  });

  it("a failed send is reported for a free address and a taken address alike", async () => {
    const FAILED = { ok: false, error: "تعذر إرسال الرسالة الآن. حاول بعد قليل." };
    const [u, holder] = await Promise.all([createUser(), createUser()]);
    sink.rejectNext();
    expect(await requestEmailCorrection(u.id, "free-address@farqad.test", TEST_PASSWORD, IP)).toEqual(FAILED);
    sink.rejectNext();
    expect(await requestEmailCorrection(u.id, holder.email.toLowerCase(), TEST_PASSWORD, IP)).toEqual(FAILED);
  });

  it("going back to the account's address reports a failed send too", async () => {
    const u = await createUser();
    await requestEmailCorrection(u.id, "third-typo@farqad.test", TEST_PASSWORD, IP);
    sink.rejectNext();
    expect(await requestEmailCorrection(u.id, u.email.toLowerCase(), TEST_PASSWORD, IP)).toEqual({ ok: false, error: "تعذر إرسال الرسالة الآن. حاول بعد قليل." });
    expect((await verificationState(u.id)).pendingEmail).toBe("third-typo@farqad.test");
  });

  it("the correction action redraws the page after a link went out", async () => {
    const u = await createUser();
    ctx.user = u;
    ctx.revalidated.length = 0;
    const f = new FormData();
    f.set("email", "drawn-again@farqad.test");
    f.set("currentPassword", TEST_PASSWORD);
    expect(await correctEmailAction(null, f)).toMatchObject({ ok: true });
    expect(ctx.revalidated).toEqual(["/verify-email"]);
  });

  it("the same address is pointed at resend", async () => {
    const u = await createUser();
    expect(await requestEmailCorrection(u.id, u.email.toLowerCase(), TEST_PASSWORD, IP)).toMatchObject({ ok: false, field: "email" });
  });

  it("wrong passwords run out, even with the right one last", async () => {
    const u = await createUser();
    for (let i = 0; i < 5; i++) await requestEmailCorrection(u.id, `a${i}@farqad.test`, `guess-${i}`, IP);
    expect(await requestEmailCorrection(u.id, "z@farqad.test", TEST_PASSWORD, IP)).toEqual({ ok: false, error: "محاولات كثيرة. حاول بعد ساعة." });
  });

  it("one target cannot be flooded from many accounts, with the same reply throughout", async () => {
    const accounts = await Promise.all(Array.from({ length: 5 }, () => createUser()));
    for (const a of accounts) expect(await requestEmailCorrection(a.id, "flooded@farqad.test", TEST_PASSWORD, IP)).toEqual({ ok: true, message: ACCEPTED });
    expect(mailsTo("flooded@farqad.test")).toHaveLength(3);
  });

  it("does nothing while mail is not real", async () => {
    logMail();
    const u = await createUser();
    expect((await requestEmailCorrection(u.id, "x@farqad.test", TEST_PASSWORD, IP)).ok).toBe(false);
  });
});

describe("a stolen password loses its pending correction link when the owner changes the password", () => {
  const STRONG = "Fresh-Student-Pass-1";
  const meta = { ip: IP, userAgent: "t" };

  async function pendingCorrection() {
    const u = await createUser();
    await requestEmailCorrection(u.id, "attacker@farqad.test", TEST_PASSWORD, IP);
    return { u, token: tokenSentTo("attacker@farqad.test") };
  }
  async function expectStillOwned(userId: string, email: string, token: string) {
    expect((await confirmEmailToken(token, IP)).ok).toBe(false);
    const [row] = await sql<{ email: string }[]>`select email from users where id = ${userId}`;
    expect(row.email).toBe(email);
    expect((await verificationState(userId)).pendingEmail).toBeNull();
  }

  it("password reset by link", async () => {
    const { u, token } = await pendingCorrection();
    const reset = "reset-link-owned-by-the-real-student-1";
    await sql`insert into password_reset_tokens (id, user_id, expires_at) values (${hashToken(reset)}, ${u.id}, now() + interval '1 hour')`;
    expect((await resetPassword(reset, STRONG)).ok).toBe(true);
    await expectStillOwned(u.id, u.email, token);
  });

  it("password change from a signed-in session", async () => {
    const { u, token } = await pendingCorrection();
    const s = await createSession(u.id);
    expect((await changePassword(u.id, TEST_PASSWORD, STRONG, hashToken(s.token))).ok).toBe(true);
    await expectStillOwned(u.id, u.email, token);
  });

  it("the forced change after a temporary password", async () => {
    const { u, token } = await pendingCorrection();
    await sql`update users set must_change_password = true where id = ${u.id}`;
    expect((await completeForcedPasswordChange(u.id, STRONG, meta)).ok).toBe(true);
    await expectStillOwned(u.id, u.email, token);
  });

  it("a reset issued by the owner", async () => {
    const { u, token } = await pendingCorrection();
    const admin = await createUser({ role: "admin" });
    await resetStudentPassword({ studentId: u.id, adminId: admin.id, reason: "فقد الوصول" });
    await expectStillOwned(u.id, u.email, token);
  });

  it("the link is bound to the password even if nothing voided it", async () => {
    const { u, token } = await pendingCorrection();
    await sql`update users set password_hash = 'scrypt$changed-by-another-path' where id = ${u.id}`;
    expect((await confirmEmailToken(token, IP)).ok).toBe(false);
    const [row] = await sql<{ email: string; email_verified_at: Date | null }[]>`select email, email_verified_at from users where id = ${u.id}`;
    expect(row).toEqual({ email: u.email, email_verified_at: null });
  });

  it("an address-changing link with no password proof is refused", async () => {
    const u = await createUser();
    await sendEmailVerificationLink(u.id, "unbound@farqad.test");
    expect((await confirmEmailToken(tokenSentTo("unbound@farqad.test"), IP)).ok).toBe(false);
    const [row] = await sql<{ email: string }[]>`select email from users where id = ${u.id}`;
    expect(row.email).toBe(u.email);
  });

  it("no link is issued once the verified password has changed", async () => {
    const u = await createUser();
    const [before] = await sql<{ password_hash: string }[]>`select password_hash from users where id = ${u.id}`;
    await sql`update users set password_hash = 'scrypt$changed-after-the-check' where id = ${u.id}`;
    expect(await sendEmailVerificationLink(u.id, "late@farqad.test", { verifiedPasswordHash: before.password_hash })).toBe(false);
    expect(mailsTo("late@farqad.test")).toHaveLength(0);
    expect(await sql`select 1 from email_verification_tokens where user_id = ${u.id}`).toHaveLength(0);
  });
});

describe("the verify page", () => {
  it("shows the address and the two ways forward", async () => {
    const u = await createUser({ email: "page-user@farqad.test" });
    ctx.user = u;
    const html = renderToStaticMarkup(await VerifyEmailPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("page-user@farqad.test");
    expect(html).toContain("إرسال رابط التأكيد");
    expect(html).toContain("كتبت بريدك خطأ؟");
  });

  it("moves on when nothing is needed, to a safe local path only", async () => {
    logMail();
    ctx.user = await createUser();
    await expect(VerifyEmailPage({ searchParams: Promise.resolve({ next: "/orders/abc" }) })).rejects.toThrow("NEXT_REDIRECT /orders/abc");
    await expect(VerifyEmailPage({ searchParams: Promise.resolve({ next: "https://evil.example" }) })).rejects.toThrow("NEXT_REDIRECT /checkout");
  });
});
