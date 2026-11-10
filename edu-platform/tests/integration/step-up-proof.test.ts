import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, describeSettingsChanges } from "@/server/platform/settings";
import { createSession, hashToken } from "@/server/auth/session";
import { disableTwoFactor, proveStepUp } from "@/server/auth/two-factor";
import { STEP_UP_PROOF_MINUTES } from "@/lib/two-factor";
import { resetEnvCache } from "@/server/env";
import { createOrder, markOrderPaid } from "@/server/commerce/orders";
import { EXPORT_PAGE_ROWS } from "@/server/admin/report-export";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createProduct, createTeacher, createUser, createVideoProduct, type TestTeacher } from "../helpers/factories";
import { provenOwner } from "../helpers/step-up";
import { currentStep, codeAt, enrolAdmin, freshCode, wrongCode } from "../helpers/two-factor";
import { TEST_ENV } from "../test-env";

/** الحارس الحقيقي، والجلسة الحقيقية عبر الكوكي: لا شيء من المسار مستبدل غير قراءة الكوكي وعنوان الطالب */
const ctx = vi.hoisted(() => ({ cookie: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && ctx.cookie ? { value: ctx.cookie } : undefined), set: () => {} }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.90", userAgent: async () => "vitest" }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (to: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
}));

const { recordPayoutAction, voidPayoutAction, updateTeacherAction, createTeacherAction, enableAccountAction, resetPasswordAction, setAccountActiveAction, switchToManagedAction } = await import("@/app/admin/teachers/actions");
const { anonymizeStudentAction, correctStudentEmailAction, grantAction, resetStudentPasswordAction, setActiveAction } = await import("@/app/admin/students/actions");
const { saveSettingsAction } = await import("@/app/admin/settings/actions");
const { saveCouponAction, toggleCouponAction } = await import("@/app/admin/coupons/actions");
const { dismissExtraPaymentAction, dismissRefundAction } = await import("@/app/admin/orders/actions");
const { proveStepUpAction } = await import("@/app/admin/security/actions");
const { POST: exportPost } = await import("@/app/api/admin/reports/export/route");

type Admin = Awaited<ReturnType<typeof createUser>>;
let owner: Admin;

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});
beforeEach(async () => {
  await sql`delete from rate_limits`;
  await sql`delete from settings where key in ('fee_percent_bps', 'fee_fixed_fils', 'watermark_enabled', 'whatsapp_number', 'seller_legal_name', 'tagline')`;
  owner = await createUser({ role: "admin" });
});
afterEach(() => {
  ctx.cookie = null;
  delete process.env.ADMIN_2FA_REQUIRED;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

const form = (values: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
};

const settingsForm = (overrides: Record<string, string> = {}) =>
  form({
    site_name: DEFAULT_SETTINGS.site_name,
    tagline: DEFAULT_SETTINGS.tagline,
    hero_title: DEFAULT_SETTINGS.hero_title,
    hero_subtitle: DEFAULT_SETTINGS.hero_subtitle,
    primary_color: DEFAULT_SETTINGS.primary_color,
    accent_color: DEFAULT_SETTINGS.accent_color,
    academic_year: DEFAULT_SETTINGS.academic_year,
    footer_note: DEFAULT_SETTINGS.footer_note,
    faq: JSON.stringify(DEFAULT_SETTINGS.faq),
    fee_percent: "0",
    fee_fixed: "0",
    videos_enabled: "on",
    watermark_enabled: "on",
    ...overrides,
  });

const teacherFields = (extra: Record<string, string> = {}) => ({ displayName: "أ. معلم الحماية", headline: "", bio: "", revenueShare: "40", sortOrder: "0", ...extra });

async function earningSale(teacher: TestTeacher) {
  const unit = await createVideoProduct({ teacherId: teacher.id, priceFils: 8000 });
  const order = await createOrder({ user: await createUser(), productIds: [unit.id], isTest: false });
  await sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));
  await sql`update teacher_earnings set created_at = now() - interval '20 days' where order_id = ${order.id}`;
}

async function openRefundRow() {
  const student = await createUser();
  const [order] = await sql<{ id: string }[]>`
    insert into orders (number, user_id, status, subtotal_fils, discount_fils, total_fils, customer_name, customer_email, paid_at)
    values (${`R${randomUUID().slice(0, 8)}`}, ${student.id}, 'paid', 5000, 0, 5000, 'x', 'x@example.com', now()) returning id`;
  const [refund] = await sql<{ id: string }[]>`
    insert into refunds (order_id, amount_fils, status, reason) values (${order.id}, 5000, 'not_sent', 'سبب الاسترداد') returning id`;
  return { orderId: order.id, refundId: refund.id };
}

async function openExtraRow() {
  const student = await createUser();
  const [order] = await sql<{ id: string }[]>`
    insert into orders (number, user_id, status, subtotal_fils, discount_fils, total_fils, customer_name, customer_email, paid_at)
    values (${`E${randomUUID().slice(0, 8)}`}, ${student.id}, 'paid', 5000, 0, 5000, 'x', 'x@example.com', now()) returning id`;
  const [payment] = await sql<{ id: string }[]>`
    insert into payments (order_id, provider, environment, status, amount_fils, gateway_invoice_id) values (${order.id}, 'myfatoorah', 'sandbox', 'paid', 5000, ${`i-${randomUUID().slice(0, 8)}`}) returning id`;
  const [extra] = await sql<{ id: string }[]>`
    insert into payment_extras (order_id, payment_id, kind, amount_fils, state) values (${order.id}, ${payment.id}, 'duplicate', 5000, 'open') returning id`;
  return { extraId: extra.id, orderId: order.id };
}

/** كل أمر محمي بفرض صحيح. كل أمر ناجح يكتب سطر تدقيق في معاملته، فعدّ السطور يقول هل كتب شيئًا */
type Case = { name: string; run: () => Promise<{ ok?: boolean; error?: string; stepUp?: string } | null | void> };
const commandAuditRows = async () => (await sql<{ n: number }[]>`select count(*)::int as n from audit_logs where action not like 'two\_factor.%'`)[0].n;

async function protectedCases(): Promise<Case[]> {
  const teacher = await createTeacher({ shareBps: 5000 });
  await earningSale(teacher);
  const [payout] = await sql<{ id: string }[]>`insert into teacher_payouts (teacher_id, amount_fils, reference, created_by) values (${teacher.id}, 1, 'r', ${owner.id}) returning id`;
  const seen = "1";
  const accountTeacher = await createTeacher({ shareBps: 5000, withUser: true, mode: "self_managed" });
  const managedTeacher = await createTeacher({ shareBps: 5000, mode: "managed" });
  const student = await createUser();
  const anonStudent = await createUser();
  const emailStudent = await createUser();
  const resetStudent = await createUser();
  const suspendStudent = await createUser();
  const product = await createProduct({ status: "published" });
  const [coupon] = await sql<{ id: string }[]>`insert into coupons (code, kind, value, is_active) values (${`C${randomUUID().slice(0, 6)}`.toUpperCase()}, 'percent', 10, false) returning id`;
  const refund = await openRefundRow();
  const extra = await openExtraRow();

  return [
    { name: "payout record", run: () => recordPayoutAction(null, form({ requestId: randomUUID(), payoutsSeen: seen, teacherId: teacher.id, amount: "1.000", method: "cash", reference: "", reason: "تسوية" })) },
    { name: "payout void", run: () => voidPayoutAction(null, form({ payoutId: payout.id, reason: "خطأ" })) },
    { name: "teacher share change", run: () => updateTeacherAction(teacher.id, null, form(teacherFields({ revenueShare: "70" }))) },
    { name: "teacher created with a share", run: () => createTeacherAction(null, form(teacherFields())) },
    { name: "teacher account create", run: () => enableAccountAction(null, form({ teacherId: managedTeacher.id, email: `new-${randomUUID().slice(0, 8)}@example.com`, fullName: "معلم جديد" })) },
    { name: "teacher password reset", run: () => resetPasswordAction(null, form({ teacherId: accountTeacher.id, confirmReset: "on" })) },
    { name: "teacher account deactivate", run: () => setAccountActiveAction(null, form({ teacherId: accountTeacher.id, reason: "سبب كاف", active: "0" })) },
    { name: "teacher back to managed", run: () => switchToManagedAction(null, form({ teacherId: accountTeacher.id })) },
    { name: "fee change", run: () => saveSettingsAction(null, settingsForm({ fee_percent: "2.5" })) },
    { name: "watermark off", run: () => saveSettingsAction(null, settingsForm({ watermark_enabled: "" })) },
    { name: "contact number change", run: () => saveSettingsAction(null, settingsForm({ whatsapp_number: "+96512345678" })) },
    { name: "seller identity change", run: () => saveSettingsAction(null, settingsForm({ seller_legal_name: "شركة أخرى" })) },
    { name: "coupon create", run: () => saveCouponAction(null, form({ code: `Z${randomUUID().slice(0, 6)}`.toUpperCase(), kind: "percent", value: "100", maxPerUser: "1" })) },
    { name: "coupon activate", run: () => toggleCouponAction(null, form({ id: coupon.id, active: "1" })) },
    { name: "student anonymise", run: () => anonymizeStudentAction(null, form({ userId: anonStudent.id, confirmEmail: anonStudent.email, reason: "طلب ولي الأمر" })) },
    { name: "grant paid access", run: () => grantAction(null, form({ userId: student.id, productId: product.id, reason: "منحة" })) },
    { name: "student password reset", run: () => resetStudentPasswordAction(null, form({ userId: resetStudent.id, reason: "طلب الطالب" })) },
    { name: "student email correction", run: () => correctStudentEmailAction(null, form({ userId: emailStudent.id, email: `fix-${randomUUID().slice(0, 8)}@example.com`, reason: "خطأ إملائي" })) },
    { name: "student suspend", run: () => setActiveAction(null, form({ userId: suspendStudent.id, active: "0", reason: "إساءة" })) },
    { name: "refund record closed", run: () => dismissRefundAction(null, form({ refundId: refund.refundId, orderId: refund.orderId, reason: "تمت خارج البوابة" })) },
    { name: "extra payment closed", run: () => dismissExtraPaymentAction(null, form({ extraId: extra.extraId, reason: "تمت خارج البوابة" })) },
    {
      name: "customer export",
      run: async () => {
        const res = await exportPost(exportRequest());
        return res.status === 200 ? { ok: true } : ((await res.json()) as { error?: string; stepUp?: string });
      },
    },
  ];
}

function exportRequest(query = "from=2020-01-01&to=2030-01-01", headers: Record<string, string> = { origin: "http://localhost:3000", host: "localhost:3000" }) {
  return new Request(`http://localhost:3000/api/admin/reports/export?${query}`, { method: "POST", headers });
}

const refusedAudit = (reason: string) => sql`select id from audit_logs where action = 'two_factor.proof_refused' and actor_id = ${owner.id} and metadata->>'reason' = ${reason}`;

async function assertAllRefused(need: "proof" | "enrol") {
  for (const c of await protectedCases()) {
    const before = await commandAuditRows();
    const res = await c.run();
    expect(res, c.name).toMatchObject({ stepUp: need });
    expect(await commandAuditRows(), `${c.name} wrote nothing`).toBe(before);
  }
}

describe("every protected owner command", () => {
  it("refuses a session that never proved, and writes nothing", async () => {
    const { session } = await enrolAdmin(owner);
    ctx.cookie = session.token;
    await assertAllRefused("proof");
    expect((await refusedAudit("missing")).length).toBeGreaterThanOrEqual(21);
  });

  it("refuses a proof older than ten minutes", async () => {
    const { session, sessionId, secret } = await provenOwner(owner);
    void secret;
    ctx.cookie = session.token;
    await sql`update sessions set step_up_at = now() - make_interval(mins => ${STEP_UP_PROOF_MINUTES}, secs => 1) where id = ${sessionId}`;
    await assertAllRefused("proof");
    expect((await refusedAudit("expired")).length).toBeGreaterThanOrEqual(21);
  });

  it("refuses a proof made by another session of the same owner", async () => {
    await provenOwner(owner);
    const other = await createSession(owner.id, { ip: "192.0.2.91", userAgent: "other" }, { twoFactorVerified: true, twoFactorMethod: "totp" });
    ctx.cookie = other.token;
    await assertAllRefused("proof");
  });

  it("refuses an owner with no second factor, even with the flag off and a leftover proof stamp", async () => {
    process.env.ADMIN_2FA_REQUIRED = "false";
    resetEnvCache();
    const session = await createSession(owner.id, { ip: "192.0.2.92", userAgent: "vitest" });
    await sql`update sessions set step_up_at = now() where id = ${hashToken(session.token)}`;
    ctx.cookie = session.token;
    await assertAllRefused("enrol");
    expect((await refusedAudit("not_enrolled")).length).toBeGreaterThanOrEqual(21);
  });

  it("runs with a live proof from this session, and a proof made seconds ago counts", async () => {
    const { session } = await provenOwner(owner);
    ctx.cookie = session.token;
    for (const c of await protectedCases()) {
      const before = await commandAuditRows();
      let res: Awaited<ReturnType<Case["run"]>> = null;
      try {
        res = await c.run();
      } catch (err) {
        // إنشاء المعلم وحفظ الكوبون يعيدان التوجيه عند النجاح
        expect(String((err as Error).message), c.name).toContain("NEXT_REDIRECT");
      }
      expect(res?.stepUp, c.name).toBeUndefined();
      expect(res?.error, c.name).toBeUndefined();
      expect(await commandAuditRows(), `${c.name} is audited, so the refusal checks above mean something`).toBeGreaterThan(before);
    }
  });
});

describe("commands that stay open without a proof", () => {
  it("harmless saves ask for nothing: colours, activating the watermark, deactivating a coupon, a teacher edit with the same share", async () => {
    const { session } = await enrolAdmin(owner);
    ctx.cookie = session.token;
    expect(await saveSettingsAction(null, settingsForm({ tagline: "جملة جديدة" }))).toMatchObject({ ok: true });
    const teacher = await createTeacher({ shareBps: 4000 });
    expect(await updateTeacherAction(teacher.id, null, form(teacherFields({ displayName: "أ. اسم جديد" })))).toMatchObject({ ok: true });
    const [coupon] = await sql<{ id: string }[]>`insert into coupons (code, kind, value, is_active) values (${`D${randomUUID().slice(0, 6)}`.toUpperCase()}, 'percent', 10, true) returning id`;
    expect(await toggleCouponAction(null, form({ id: coupon.id, active: "0" }))).toMatchObject({ ok: true });
    await sql`insert into settings (key, value) values ('watermark_enabled', 'false'::jsonb) on conflict (key) do update set value = excluded.value`;
    expect(await saveSettingsAction(null, settingsForm({ tagline: "جملة أخرى" }))).toMatchObject({ ok: true });
  });

  it("a teacher created with no share needs no proof", async () => {
    const { session } = await enrolAdmin(owner);
    ctx.cookie = session.token;
    await expect(createTeacherAction(null, form(teacherFields({ revenueShare: "", displayName: "أ. بلا نسبة" })))).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("the proof step", () => {
  it("is tied to the session, is written with the database clock, and is audited with its method only", async () => {
    const { session, sessionId, secret } = await enrolAdmin(owner);
    ctx.cookie = session.token;
    expect(await proveStepUpAction(null, form({ twoFactorCode: await freshCode(owner.id, secret) }))).toMatchObject({ ok: true });
    const [row] = await sql<{ fresh: boolean }[]>`select step_up_at > now() - interval '5 seconds' as fresh from sessions where id = ${sessionId}`;
    expect(row.fresh).toBe(true);
    const [log] = await sql<{ metadata: Record<string, unknown>; ip: string }[]>`select metadata, ip from audit_logs where action = 'two_factor.proof_granted' and actor_id = ${owner.id}`;
    expect(log.metadata).toEqual({ method: "totp" });
    expect(log.ip).toBe("192.0.2.90");
  });

  it("a wrong code sets nothing and leaves a trace; a replayed code is refused", async () => {
    const { session, sessionId, secret } = await enrolAdmin(owner);
    ctx.cookie = session.token;
    expect(await proveStepUpAction(null, form({ twoFactorCode: wrongCode(secret) }))).toMatchObject({ error: expect.any(String) });
    expect((await sql<{ step_up_at: Date | null }[]>`select step_up_at from sessions where id = ${sessionId}`)[0].step_up_at).toBeNull();
    expect(await refusedAudit("code")).toHaveLength(1);
    // رمز خطوة التسجيل نفسه لا يصلح إثباتًا
    expect(await proveStepUpAction(null, form({ twoFactorCode: codeAt(secret, currentStep()) }))).toMatchObject({ error: expect.any(String) });
  });

  it("a recovery code works once, for the owner without a phone", async () => {
    const { session, sessionId, recoveryCodes } = await enrolAdmin(owner);
    ctx.cookie = session.token;
    expect(await proveStepUpAction(null, form({ twoFactorCode: recoveryCodes[0] }))).toMatchObject({ ok: true });
    await sql`update sessions set step_up_at = null where id = ${sessionId}`;
    expect(await proveStepUpAction(null, form({ twoFactorCode: recoveryCodes[0] }))).toMatchObject({ error: expect.any(String) });
  });

  it("a code does not burn when the session is already gone", async () => {
    const { recoveryCodes, secret } = await enrolAdmin(owner);
    void secret;
    const out = await proveStepUp({ userId: owner.id, sessionId: hashToken("gone"), code: recoveryCodes[1], ip: "192.0.2.90" });
    expect(out.ok).toBe(false);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from user_recovery_codes where user_id = ${owner.id} and used_at is null`;
    expect(n).toBe(recoveryCodes.length);
  });

  it("wrong codes share the login counter and lock out", async () => {
    const { session, secret } = await enrolAdmin(owner);
    ctx.cookie = session.token;
    for (let i = 0; i < 5; i++) await proveStepUpAction(null, form({ twoFactorCode: wrongCode(secret) }));
    expect(await proveStepUpAction(null, form({ twoFactorCode: await freshCode(owner.id, secret) }))).toMatchObject({ error: expect.stringContaining("محاولات كثيرة") });
  });

  it("turning two-factor off drops the proof, so re-enrolling does not bring it back", async () => {
    const { sessionId, secret } = await provenOwner(owner);
    expect(await disableTwoFactor({ userId: owner.id, sessionId, code: await freshCode(owner.id, secret), ip: "192.0.2.90" })).toEqual({ ok: true });
    expect((await sql<{ step_up_at: Date | null }[]>`select step_up_at from sessions where id = ${sessionId}`)[0].step_up_at).toBeNull();
  });
});

describe("customer export", () => {
  async function seedOrders(n: number, paidAt = "2026-03-01T10:00:00.123456Z") {
    const student = await createUser();
    await sql`
      insert into orders (number, user_id, status, subtotal_fils, discount_fils, total_fils, customer_name, customer_email, paid_at, coupon_code)
      select 'X-' || g || '-' || ${randomUUID().slice(0, 6)}, ${student.id}, 'paid', 1000, 0, 1000, '=HYPERLINK("http://x")', '+evil@example.com', ${paidAt}::timestamptz, '@SUM(1)'
      from generate_series(1, ${n}) g`;
  }

  async function proved() {
    const { session, sessionId } = await provenOwner(owner);
    ctx.cookie = session.token;
    return sessionId;
  }

  async function readAll(res: Response) {
    return new TextDecoder().decode(await res.arrayBuffer());
  }

  beforeEach(async () => {
    await sql`delete from teacher_earnings`;
    await sql`delete from order_items`;
    await sql`delete from refunds`;
    await sql`delete from payment_extras`;
    await sql`delete from payments`;
    await sql`delete from orders`;
  });

  it("is POST only: there is no GET to link to", async () => {
    const mod = await import("@/app/api/admin/reports/export/route");
    expect("GET" in mod).toBe(false);
  });

  it("streams every order once, even when more than a page share one instant", async () => {
    await proved();
    const total = EXPORT_PAGE_ROWS + 25;
    await seedOrders(total);
    const res = await exportPost(exportRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await readAll(res);
    const lines = text.trim().split("\r\n");
    expect(lines).toHaveLength(total + 1);
    expect(new Set(lines.slice(1).map((l) => l.split(",")[0])).size).toBe(total);
  });

  it("does not read ahead of the reader, and a cancelled download is recorded as such", async () => {
    await proved();
    await seedOrders(EXPORT_PAGE_ROWS * 2 + 5);
    const res = await exportPost(exportRequest());
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first.trim().split("\r\n")).toHaveLength(1);
    const second = new TextDecoder().decode((await reader.read()).value);
    expect(second.trim().split("\r\n")).toHaveLength(EXPORT_PAGE_ROWS);
    await reader.cancel();
    const [end] = await sql<{ metadata: { rows: number; complete: boolean } }[]>`select metadata from audit_logs where action = 'report.export_end' and actor_id = ${owner.id}`;
    expect(end.metadata).toEqual({ rows: EXPORT_PAGE_ROWS, complete: false });
  });

  it("neutralises formula cells so a spreadsheet does not run them", async () => {
    await proved();
    await seedOrders(1);
    const text = await readAll(await exportPost(exportRequest()));
    const row = text.trim().split("\r\n")[1];
    expect(row).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(row).toContain(`"'+evil@example.com"`);
    expect(row).toContain(`"'@SUM(1)"`);
  });

  it("is audited before the first byte with the row count, without any personal data", async () => {
    await proved();
    await seedOrders(3);
    const res = await exportPost(exportRequest("from=2026-01-01&to=2026-12-31"));
    const [start] = await sql<{ metadata: Record<string, unknown>; ip: string; entity_id: string }[]>`select metadata, ip, entity_id from audit_logs where action = 'report.export' and actor_id = ${owner.id}`;
    expect(start.metadata).toEqual({ rowCount: 3, from: "2026-01-01", to: "2026-12-31", includeTest: false });
    expect(start.ip).toBe("192.0.2.90");
    expect(start.entity_id).toBe("orders");
    await readAll(res);
    const [end] = await sql<{ metadata: Record<string, unknown> }[]>`select metadata from audit_logs where action = 'report.export_end' and actor_id = ${owner.id}`;
    expect(end.metadata).toEqual({ rows: 3, complete: true });
    expect(JSON.stringify(start.metadata) + JSON.stringify(end.metadata)).not.toContain("example.com");
  });

  it("is rate limited per owner, and a refused attempt writes no export row", async () => {
    await proved();
    await seedOrders(1);
    for (let i = 0; i < 10; i++) expect((await exportPost(exportRequest())).status).toBe(200);
    const limited = await exportPost(exportRequest());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from audit_logs where action = 'report.export' and actor_id = ${owner.id}`;
    expect(n).toBe(10);
  });

  it("refuses another site's form post, and anyone who is not the owner", async () => {
    await proved();
    expect((await exportPost(exportRequest(undefined, { origin: "https://evil.example", host: "localhost:3000" }))).status).toBe(403);
    expect((await exportPost(exportRequest(undefined, {}))).status).toBe(403);
    const student = await createUser();
    ctx.cookie = (await createSession(student.id)).token;
    expect((await exportPost(exportRequest())).status).toBe(403);
    ctx.cookie = null;
    expect((await exportPost(exportRequest())).status).toBe(403);
  });

  it("the teachers report goes through the same door", async () => {
    await proved();
    const res = await exportPost(exportRequest("from=2026-01-01&to=2026-12-31&type=teachers"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("teachers-");
    await readAll(res);
    const [start] = await sql<{ entity_id: string }[]>`select entity_id from audit_logs where action = 'report.export' and actor_id = ${owner.id}`;
    expect(start.entity_id).toBe("teachers");
  });
});

describe("the settings audit row", () => {
  it("names each changed key with its old and new value, and only those", async () => {
    const { session } = await provenOwner(owner);
    ctx.cookie = session.token;
    expect(await saveSettingsAction(null, settingsForm({ fee_percent: "2.5", watermark_enabled: "", tagline: "جملة" }))).toMatchObject({ ok: true });
    const [log] = await sql<{ metadata: { changes: { key: string; from?: unknown; to?: unknown }[] } }[]>`select metadata from audit_logs where action = 'settings.update' and actor_id = ${owner.id}`;
    const byKey = Object.fromEntries(log.metadata.changes.map((c) => [c.key, c]));
    expect(byKey.fee_percent_bps).toMatchObject({ from: 0, to: 250 });
    expect(byKey.watermark_enabled).toMatchObject({ from: true, to: false });
    expect(byKey.tagline).toMatchObject({ from: DEFAULT_SETTINGS.tagline, to: "جملة" });
    expect(byKey.site_name).toBeUndefined();
  });

  it("records a secret only as changed, whatever its name, and shortens long values", () => {
    const patch = { site_name: "اسم", faq: Array.from({ length: 20 }, (_, i) => ({ q: `سؤال ${i}`, a: "جواب طويل ".repeat(10) })) };
    const changes = describeSettingsChanges(DEFAULT_SETTINGS, patch, (key) => key === "site_name");
    expect(changes.find((c) => c.key === "site_name")).toEqual({ key: "site_name", secret: true });
    const faq = changes.find((c) => c.key === "faq") as { from: string; to: string; truncated: boolean };
    expect(faq.truncated).toBe(true);
    expect(faq.to.length).toBeLessThanOrEqual(500);
    const named = describeSettingsChanges(DEFAULT_SETTINGS, { api_key: "live-value" } as never);
    expect(named).toEqual([{ key: "api_key", secret: true }]);
    expect(JSON.stringify(named)).not.toContain("live-value");
  });
});
