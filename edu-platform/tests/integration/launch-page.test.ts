import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MANUAL_KEYS, MANUAL_VERSIONS, REQUIRED_MIGRATIONS } from "@/lib/launch";
import { createOrder, markOrderPaid, type OrderRow } from "@/server/commerce/orders";
import { getDb } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { launchFacts, launchStatus, launchTicks, setLaunchCheck } from "@/server/platform/launch";
import { purgeTestOrders } from "../../scripts/purge-test-orders";
import { closeDb, resetDb, sql } from "../helpers/db";
import { acceptAgreement, createBundle, createProduct, createTeacher, createUser } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

/**
 * صفحة الإطلاق على قاعدة بيانات حقيقية: الحقائق من الجداول نفسها، والتأشير اليدوي للمالك وحده ومسجل،
 * والصفحة لا تطبع قيمة أي سر مهما كانت متغيرات البيئة.
 */
const ctx = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), usePathname: () => "/admin/launch" }));
vi.mock("@/server/http", async (original) => ({ ...(await original<typeof import("@/server/http")>()), clientIp: async () => "192.0.2.91", userAgent: async () => "vitest" }));
vi.mock("@/server/auth/session", async (original) => ({
  ...(await original<typeof import("@/server/auth/session")>()),
  getCurrentUser: async () => ctx.user,
  getCurrentSession: async () => (ctx.user ? { user: ctx.user, mustChangePassword: false, needsTwoFactorEnrolment: false } : null),
}));

const { setLaunchCheckAction } = await import("@/app/admin/launch/actions");
const { default: LaunchPage } = await import("@/app/admin/launch/page");

const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};
const pay = (order: OrderRow) => sql.begin((tx) => markOrderPaid(tx, { orderId: order.id, paidAmountFils: order.total_fils }));
const auditCount = (key: string) => sql<{ action: string; actor_id: string; metadata: { version: string } }[]>`
  select action, actor_id, metadata from audit_logs where entity_type = 'launch_check' and entity_id = ${key} order by id
`;

let owner: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await resetDb();
  owner = await createUser({ role: "admin", fullName: "مالك المنصة" });
  ctx.user = owner;
});
afterEach(() => {
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  for (const k of ["VIDEO_PROVIDER", "BUNNY_STREAM_LIBRARY_ID", "BUNNY_STREAM_API_KEY", "BUNNY_STREAM_TOKEN_KEY", "BUNNY_STREAM_READONLY_API_KEY", "BUNNY_STREAM_CDN_HOSTNAME", "CRON_SECRET", "OPS_ALERT_EMAIL", "SMTP_PASSWORD", "SMTP_HOST", "SMTP_USER", "VERCEL_ENV"]) {
    if (!(k in TEST_ENV)) delete process.env[k];
  }
  resetEnvCache();
});
afterAll(async () => {
  await closeDb();
});

describe("facts read from the database", () => {
  it("knows which required migrations are applied", async () => {
    expect((await launchFacts()).migrations?.applied.sort()).toEqual([...REQUIRED_MIGRATIONS].sort());
    const [row] = await sql<{ name: string; applied_at: Date }[]>`select name, applied_at from schema_migrations where name = '0012_content_teachers.sql'`;
    await sql`delete from schema_migrations where name = ${row.name}`;
    try {
      const { steps } = await launchStatus();
      const step = steps.find((s) => s.key === "migrations")!;
      expect(step.state).toBe("open");
      expect(step.facts.join(" ")).toContain("0012_content_teachers.sql");
    } finally {
      await sql`insert into schema_migrations (name, applied_at) values (${row.name}, ${row.applied_at})`;
    }
  });

  it("counts only signed payment and refund notices for live invoices", async () => {
    const student = await createUser();
    const product = await createProduct({ priceFils: 2000 });
    const order = await createOrder({ user: student, productIds: [product.id], isTest: false });
    await sql`insert into payments (order_id, provider, environment, status, amount_fils, gateway_invoice_id) values (${order.id}, 'myfatoorah', 'sandbox', 'paid', 2000, '880001')`;
    const event = (key: string, payload: object, valid = true) =>
      sql`insert into payment_events (provider, event_key, event_name, payload, signature_valid, processed_at) values ('myfatoorah', ${key}, 'x', ${sql.json(payload as never)}, ${valid}, now())`;

    // بيئة الاختبار لا تثبت شيئًا عن لوحة الإنتاج
    await event("s1", { Event: { Code: 1 }, Data: { Invoice: { Id: "880001" } } });
    await event("s2", { Event: { Code: 2 }, Data: { ReferencedInvoice: { Id: "880001" }, Refund: { Id: "r1" } } });
    let facts = await launchFacts();
    expect(facts.webhooks).toMatchObject({ livePayment: null, liveRefund: null, dispute: null });
    expect(facts.webhooks?.lastValidAt).toBeInstanceOf(Date);

    const live = await createOrder({ user: student, productIds: [product.id], isTest: false });
    await sql`insert into payments (order_id, provider, environment, status, amount_fils, gateway_invoice_id) values (${live.id}, 'myfatoorah', 'live', 'paid', 2000, '990001')`;
    await event("l0", { Event: { Code: 1 }, Data: { Invoice: { Id: "990001" } } }, false);
    facts = await launchFacts();
    expect(facts.webhooks?.livePayment).toBeNull();

    await event("l1", { Event: { Code: 1 }, Data: { Invoice: { Id: "990001" } } });
    facts = await launchFacts();
    expect(facts.webhooks?.livePayment).toBeInstanceOf(Date);
    expect(facts.webhooks?.liveRefund).toBeNull();
    let step = (await launchStatus()).steps.find((s) => s.key === "webhooks_received")!;
    expect(step.state).toBe("open");

    await event("l2", { Event: { Code: 2 }, Data: { ReferencedInvoice: { Id: "990001" }, Refund: { Id: "r2" } } });
    await event("d1", { Event: { Code: 6 }, Data: { Invoice: { Id: "990001" }, Dispute: { Status: "Open" } } });
    facts = await launchFacts();
    expect(facts.webhooks?.liveRefund).toBeInstanceOf(Date);
    expect(facts.webhooks?.dispute).toBeInstanceOf(Date);
    step = (await launchStatus()).steps.find((s) => s.key === "webhooks_received")!;
    expect(step.state).toBe("done");
  });

  it("sees every trace of test orders, and none once the purge command has run", async () => {
    const student = await createUser();
    const product = await createProduct({ priceFils: 2000 });
    const other = await createProduct({ priceFils: 1500 });
    const paidTest = await createOrder({ user: student, productIds: [product.id], isTest: true });
    await pay(paidTest);
    const openTest = await createOrder({ user: student, productIds: [other.id], isTest: true });
    await sql`insert into payments (order_id, provider, environment, status, amount_fils) values (${openTest.id}, 'myfatoorah', 'sandbox', 'initiated', ${openTest.total_fils})`;

    expect((await launchFacts()).testOrders).toEqual({ openOrders: 1, openPayments: 1, entitlements: 1, redemptions: 0 });
    expect((await launchStatus()).steps.find((s) => s.key === "test_orders")!.state).toBe("open");

    await purgeTestOrders(getDb(), { apply: true });
    expect((await launchFacts()).testOrders).toEqual({ openOrders: 0, openPayments: 0, entitlements: 0, redemptions: 0 });
    expect((await launchStatus()).steps.find((s) => s.key === "test_orders")!.state).toBe("done");
  });

  it("finds teachers whose content sells, at any depth, and what each still lacks", async () => {
    const self = await createTeacher({ mode: "self_managed", shareBps: null });
    const managed = await createTeacher({ mode: "managed", shareBps: 4000 });
    const draftOnly = await createTeacher({ mode: "managed", shareBps: null });
    const freeOnly = await createTeacher({ mode: "managed", shareBps: null });
    const p1 = await createProduct({ priceFils: 3000 });
    const p2 = await createProduct({ priceFils: 2000, status: "hidden" });
    const p3 = await createProduct({ priceFils: 2000, status: "draft" });
    const p4 = await createProduct({ priceFils: 0 });
    await sql`update products set teacher_id = ${self.id} where id = ${p1.id}`;
    await sql`update products set teacher_id = ${managed.id} where id = ${p2.id}`;
    await sql`update products set teacher_id = ${draftOnly.id} where id = ${p3.id}`;
    await sql`update products set teacher_id = ${freeOnly.id} where id = ${p4.id}`;
    await createBundle({ items: [p2.id], priceFils: 4000 });

    expect((await launchFacts()).teachers).toEqual({ selling: 2, missingShare: 1, missingAgreement: 1, managedSelling: 1 });

    // اتفاقية بنسخة قديمة لا تكفي
    await sql`insert into consent_records (user_id, kind, document_version) values (${self.user!.id}, 'teacher_agreement', '2025-old')`;
    expect((await launchFacts()).teachers?.missingAgreement).toBe(1);

    await sql`update teachers set revenue_share_bps = 5000 where id = ${self.id}`;
    await acceptAgreement(self.user!.id);
    expect((await launchFacts()).teachers).toEqual({ selling: 2, missingShare: 0, missingAgreement: 0, managedSelling: 1 });
    expect((await launchStatus()).steps.find((s) => s.key === "teachers")!.state).toBe("done");
  });

  it("counts published products that cannot be bought, and files not scanned or flagged", async () => {
    const ok = await createProduct({ priceFils: 3000 });
    const noPrice = await createProduct({ priceFils: 0 });
    await sql`update products set is_free = false where id = ${noPrice.id}`;
    const ended = await createProduct({ priceFils: 3000 });
    await sql`update products set access_mode = 'until_date', access_until = now() - interval '1 day' where id = ${ended.id}`;
    await createProduct({ priceFils: 3000, status: "draft" });
    await sql`update product_files set check_status = 'unchecked' where id = ${ok.mainFileId}`;
    await sql`update product_files set check_status = 'corrupt' where id = ${noPrice.mainFileId}`;

    const facts = await launchFacts();
    expect(facts.catalog).toEqual({ published: 3, stopped: 2 });
    expect(facts.content).toMatchObject({ unchecked: 1, flagged: 1 });
    const { steps } = await launchStatus();
    expect(steps.find((s) => s.key === "catalog")!.state).toBe("done");
    expect(steps.find((s) => s.key === "stopped_products")).toMatchObject({ state: "open", blocking: false });
    expect(steps.find((s) => s.key === "files_scanned")).toMatchObject({ state: "open", blocking: true });
  });

  it("knows whether every active admin has two-factor, and when mail last went out or failed", async () => {
    let facts = await launchFacts();
    expect(facts.admins).toEqual({ total: 1, enrolled: 0 });
    await sql`insert into user_totp (user_id, secret_ciphertext, enabled_at) values (${owner.id}, ${"c".repeat(40)}, now())`;
    await createUser({ role: "admin", isActive: false });
    await sql`insert into email_log (to_email, subject, template, status, created_at) values ('a@example.com', 's', 't', 'sent', now() - interval '2 days'), ('b@example.com', 's', 't', 'failed', now() - interval '1 day')`;
    facts = await launchFacts();
    expect(facts.admins).toEqual({ total: 1, enrolled: 1 });
    expect(facts.mail?.lastSentAt).toBeInstanceOf(Date);
    expect(facts.mail!.lastFailedAt!.getTime()).toBeGreaterThan(facts.mail!.lastSentAt!.getTime());
  });

  it("reads seller identity and contacts from settings, ignoring blank values", async () => {
    const put = (key: string, value: string) => sql`insert into settings (key, value) values (${key}, ${sql.json(value)}) on conflict (key) do update set value = excluded.value`;
    await put("seller_legal_name", "   ");
    await put("seller_license_number", "12345");
    await put("whatsapp_number", "96599887766");
    let facts = await launchFacts();
    expect(facts.settings?.sellerMissing).toEqual(["legal_name", "address", "mail_provider"]);
    expect(facts.settings).toMatchObject({ contactEmail: false, contactPhone: true });
    await put("seller_legal_name", "شركة فرقد للتعليم");
    await put("seller_address", "الكويت");
    await put("mail_provider_name", "مزود البريد");
    await put("contact_email", "help@farqad.example");
    facts = await launchFacts();
    expect(facts.settings?.sellerMissing).toEqual([]);
    expect(facts.settings).toMatchObject({ contactEmail: true, contactPhone: true });
  });

  it("a section that cannot be read shows as unknown, still blocks, and is logged", async () => {
    await sql`alter table launch_checks rename to launch_checks_moved_for_test`;
    try {
      expect(await launchTicks()).toBeNull();
      const { steps, verdict } = await launchStatus();
      expect(steps.find((s) => s.key === "vercel_pro")).toMatchObject({ state: "unknown", blocking: true });
      expect(verdict.ready).toBe(false);
      const html = renderToStaticMarkup(await LaunchPage());
      expect(html).toContain('data-key="vercel_pro" data-state="unknown"');
    } finally {
      await sql`alter table launch_checks_moved_for_test rename to launch_checks`;
    }
    expect((await sql`select 1 from error_events where source = 'launch:ticks'`).length).toBe(1);
  });
});

describe("manual ticks", () => {
  it("the owner ticks and reopens a step; each change is audited once, with the wording version", async () => {
    let res = await setLaunchCheckAction(null, form({ key: "restore_drill", done: "1" }));
    expect(res).toMatchObject({ ok: true });
    let step = (await launchStatus()).steps.find((s) => s.key === "restore_drill")!;
    expect(step.state).toBe("done");
    expect(step.manual?.tick?.by).toBe("مالك المنصة");

    res = await setLaunchCheckAction(null, form({ key: "restore_drill", done: "1" }));
    expect(res).toMatchObject({ ok: true, message: "الخطوة مؤشَّر عليها مسبقًا" });
    expect((await auditCount("restore_drill")).map((a) => a.action)).toEqual(["launch.step_done"]);

    res = await setLaunchCheckAction(null, form({ key: "restore_drill", done: "0" }));
    expect(res).toMatchObject({ ok: true });
    res = await setLaunchCheckAction(null, form({ key: "restore_drill", done: "0" }));
    expect(res).toMatchObject({ ok: true, message: "الخطوة مفتوحة مسبقًا" });
    step = (await launchStatus()).steps.find((s) => s.key === "restore_drill")!;
    expect(step.state).toBe("open");
    const audits = await auditCount("restore_drill");
    expect(audits.map((a) => a.action)).toEqual(["launch.step_done", "launch.step_reopened"]);
    expect(audits.every((a) => a.actor_id === owner.id && a.metadata.version === MANUAL_VERSIONS.restore_drill)).toBe(true);
  });

  it("reopening a step that was never ticked writes nothing", async () => {
    expect(await setLaunchCheck({ key: "vercel_pro", done: false, actorId: owner.id })).toBe("unchanged");
    expect(await sql`select 1 from launch_checks`).toHaveLength(0);
    expect(await auditCount("vercel_pro")).toHaveLength(0);
  });

  it("a tick for an older wording counts as open until ticked again, and the new tick stores the new version", async () => {
    await sql`insert into launch_checks (key, version, done, changed_by) values ('lawyer_review', 'terms 2025-old', true, ${owner.id})`;
    let step = (await launchStatus()).steps.find((s) => s.key === "lawyer_review")!;
    expect(step).toMatchObject({ state: "open", manual: { stale: true } });
    expect(await setLaunchCheck({ key: "lawyer_review", done: true, actorId: owner.id })).toBe("changed");
    step = (await launchStatus()).steps.find((s) => s.key === "lawyer_review")!;
    expect(step.state).toBe("done");
    const [row] = await sql<{ version: string }[]>`select version from launch_checks where key = 'lawyer_review'`;
    expect(row.version).toBe(MANUAL_VERSIONS.lawyer_review);
  });

  it("a teacher or a student cannot tick, and nothing is written", async () => {
    const teacher = await createTeacher({ mode: "self_managed", shareBps: 4000 });
    for (const user of [teacher.user, await createUser(), null]) {
      ctx.user = user;
      const res = await setLaunchCheckAction(null, form({ key: "vercel_pro", done: "1" }));
      expect(res).toEqual({ error: "غير مصرح لك بتنفيذ هذا الإجراء" });
    }
    expect(await sql`select 1 from launch_checks`).toHaveLength(0);
    expect(await sql`select 1 from audit_logs where entity_type = 'launch_check'`).toHaveLength(0);
  });

  it("refuses an unknown step or value", async () => {
    for (const values of [{ key: "migrations", done: "1" }, { key: "__proto__", done: "1" }, { key: "vercel_pro", done: "yes" }, { key: "vercel_pro" }, { key: "", done: "1" }]) {
      const res = await setLaunchCheckAction(null, form(values as Record<string, string>));
      expect(res, JSON.stringify(values)).toEqual({ error: "طلب غير صالح" });
    }
    expect(await sql`select 1 from launch_checks`).toHaveLength(0);
  });
});

describe("the page", () => {
  it("is for the owner only", async () => {
    const teacher = await createTeacher({ mode: "self_managed", shareBps: 4000 });
    for (const user of [teacher.user, await createUser()]) {
      ctx.user = user;
      await expect(LaunchPage()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    }
  });

  it("shows every step and a not-ready verdict, and prints no secret whatever the environment holds", async () => {
    const SENTINELS = {
      MYFATOORAH_API_KEY: "sentinel-mf-api-key-7c1e",
      MYFATOORAH_WEBHOOK_SECRET: "sentinel-mf-webhook-secret-2b9d",
      CRON_SECRET: "sentinel-cron-secret-5a3f-0123456789",
      SMTP_PASSWORD: "sentinel-smtp-password-81fe",
      SMTP_USER: "sentinel-smtp-user-41aa",
      BUNNY_STREAM_LIBRARY_ID: "sentinel-bunny-library-9911",
      BUNNY_STREAM_API_KEY: "sentinel-bunny-api-key-6d2c",
      BUNNY_STREAM_TOKEN_KEY: "sentinel-bunny-token-key-3e7a",
      BUNNY_STREAM_READONLY_API_KEY: "sentinel-bunny-readonly-4f0b",
      BUNNY_STREAM_CDN_HOSTNAME: "sentinel-cdn-host.b-cdn.net",
      OPS_ALERT_EMAIL: "sentinel-owner@farqad-edu.com",
      APP_URL: "https://sentinel-user:sentinel-url-pass@www.farqad-edu.com/?token=sentinel-query",
    };
    Object.assign(process.env, SENTINELS, { VIDEO_PROVIDER: "bunny", VERCEL_ENV: "production" });
    resetEnvCache();
    const html = renderToStaticMarkup(await LaunchPage());

    for (const [name, value] of Object.entries(SENTINELS)) {
      if (name === "APP_URL") continue;
      expect(html, name).not.toContain(value);
    }
    expect(html).not.toMatch(/sentinel-user|sentinel-url-pass|sentinel-query/);
    expect(html).not.toContain(TEST_ENV.APP_SECRET);
    expect(html).not.toContain("edu_local_pw");
    expect(html).toContain("www.farqad-edu.com");
    expect(html).toContain("https://www.farqad-edu.com/api/payments/myfatoorah/webhook");

    expect(html).toContain('data-testid="launch-verdict" data-ready="false"');
    for (const key of MANUAL_KEYS) expect(html, key).toContain(`data-key="${key}"`);
    expect(html).toContain('data-key="payment_mode" data-state="open" data-blocking="true"');
    expect(html).toContain('data-key="cron_secret" data-state="done"');
    expect(html).toContain('data-key="bunny_cdn_token" data-state="open" data-blocking="true"');
    expect(html).not.toMatch(/—/);
  });

  it("says ready only when every blocking step is done", async () => {
    // بيئة الاختبار لا يمكن أن تكون جاهزة: الدفع تجريبي وAPP_URL محلي، فالحكم لا يقول «جاهزة» مهما أُشّر
    for (const key of MANUAL_KEYS) await setLaunchCheck({ key, done: true, actorId: owner.id });
    const { verdict } = await launchStatus();
    expect(verdict.ready).toBe(false);
    expect(verdict.blockingOpen.map((s) => s.key)).toEqual(expect.arrayContaining(["app_url", "payment_mode", "mail", "catalog"]));
    expect(verdict.blockingOpen.some((s) => MANUAL_KEYS.includes(s.key as never))).toBe(false);
  });
});
