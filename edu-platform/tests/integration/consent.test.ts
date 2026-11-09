import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createOrder, OrderError, type OrderRow } from "@/server/commerce/orders";
import { resetPaymentMethodsCache, startPayment as realStartPayment } from "@/server/payments/service";
import { registerStudent } from "@/server/auth/service";
import { ConsentRequiredError, consentMeta, missingAccountConsents, orderConsentNeeds, recordConsent } from "@/server/platform/consent";
import { resetEnvCache } from "@/server/env";
import { getStudent } from "@/server/admin/records";
import { ACCOUNT_CONSENT_KINDS, CONSENT_FIELD_ERRORS, CONSENT_VERSIONS, GUARDIAN_DECLARATION_TEXT } from "@/lib/consent";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { invoicesCreated, orderRow, paymentRows } from "../helpers/payment-flow";
import { createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

const ctx = vi.hoisted(() => ({ user: null as unknown, cart: [] as string[], redirected: [] as string[], headers: new Headers(), formState: null as unknown }));

vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), useActionState: (_action: unknown, initial: unknown) => [ctx.formState ?? initial, () => {}, false] }));

vi.mock("next/headers", () => ({
  headers: async () => ctx.headers,
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("@/server/auth/guards", async (original) => ({ ...(await original<typeof import("@/server/auth/guards")>()), assertUser: async () => ctx.user, requireUser: async () => ctx.user }));
vi.mock("@/server/commerce/cart", async (original) => ({
  ...(await original<typeof import("@/server/commerce/cart")>()),
  getCartIds: async () => ctx.cart,
  writeCartIds: async (ids: string[]) => {
    ctx.cart = ids;
  },
}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (url: string) => {
    ctx.redirected.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { placeOrderAction, retryPaymentAction } = await import("@/app/(site)/checkout/actions");
const { registerAction } = await import("@/app/(site)/(auth)/actions");
const { default: OrderPage } = await import("@/app/(site)/orders/[id]/page");
const { CheckoutForm } = await import("@/app/(site)/checkout/checkout-form");

type ConsentRow = { user_id: string; kind: string; document_version: string; order_id: string | null; ip: string | null; user_agent: string | null };

let sim: Simulator;
const META = { ip: "192.0.2.77", userAgent: "vitest-browser" };

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
  ctx.redirected.length = 0;
  ctx.formState = null;
  ctx.headers = new Headers({ "x-forwarded-for": META.ip, "user-agent": META.userAgent });
  await sql`delete from rate_limits`;
});
afterEach(() => {
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

const form = (values: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};
const consents = (userId: string) => sql<ConsentRow[]>`select user_id, kind, document_version, order_id, ip, user_agent from consent_records where user_id = ${userId} order by kind`;
const orderCount = async (userId: string) => (await sql<{ n: number }[]>`select count(*)::int as n from orders where user_id = ${userId}`)[0].n;
const paymentCount = async () => (await sql<{ n: number }[]>`select count(*)::int as n from payments`)[0].n;

async function buyer(priceFils = 3000, opts: { legacyConsent?: boolean } = {}) {
  const user = await createUser(opts);
  const product = await createProduct({ priceFils });
  ctx.user = user;
  ctx.cart = [product.id];
  return { user, product };
}

async function placed(values: Record<string, string>) {
  await expect(placeOrderAction(null, form(values))).rejects.toThrow(/NEXT_REDIRECT/);
  return ctx.redirected.at(-1)!;
}

/** طلب بلا إقرار: أقدم من السجل، أو أنشأته أداة، أو نموذج التف على النموذج */
async function orderWithoutDeclaration(user: Awaited<ReturnType<typeof createUser>>, priceFils = 3000) {
  const product = await createProduct({ priceFils });
  return createOrder({ user, productIds: [product.id], isTest: true });
}

describe("registration records what the student accepted", () => {
  const input = (email: string, acceptedDocuments: boolean) => ({ fullName: "طالب جديد", email, password: "Student-Pass-1", phone: null, acceptedDocuments });

  it("stores terms and privacy at the current versions with the request details, in one go with the account", async () => {
    const res = await registerStudent(input("consent-new@farqad.test", true), META);
    if (!res.ok) throw new Error(res.error);
    const rows = await consents(res.userId);
    expect(rows.map((r) => r.kind)).toEqual(["privacy", "terms"]);
    for (const r of rows) {
      expect(r.document_version).toBe(CONSENT_VERSIONS[r.kind as "terms" | "privacy"]);
      expect(r).toMatchObject({ order_id: null, ip: META.ip, user_agent: META.userAgent });
    }
    expect(await missingAccountConsents(res.userId)).toEqual([]);
  });

  it("the service refuses without acceptance and writes nothing", async () => {
    const res = await registerStudent(input("consent-no@farqad.test", false), META);
    expect(res.ok).toBe(false);
    expect(await sql`select 1 from users where email = 'consent-no@farqad.test'`).toHaveLength(0);
  });

  it("the form action refuses an unticked box even when the rest of the request is valid", async () => {
    const res = await registerAction(null, form({ fullName: "طالب", email: "consent-action@farqad.test", password: "Student-Pass-1", passwordConfirm: "Student-Pass-1" }));
    expect(res?.fieldErrors?.terms).toBeTruthy();
    expect(await sql`select 1 from users where email = 'consent-action@farqad.test'`).toHaveLength(0);
  });

  it("a failed registration leaves no orphan consent", async () => {
    const first = await registerStudent(input("consent-dup@farqad.test", true), META);
    expect(first.ok).toBe(true);
    const before = (await sql<{ n: number }[]>`select count(*)::int as n from consent_records`)[0].n;
    const again = await registerStudent(input("consent-dup@farqad.test", true), META);
    expect(again.ok).toBe(false);
    expect((await sql<{ n: number }[]>`select count(*)::int as n from consent_records`)[0].n).toBe(before);
  });
});

describe("the guardian declaration at checkout", () => {
  it("is required on the server: a request without it makes no order and reaches no gateway", async () => {
    const { user } = await buyer();
    const res = await placeOrderAction(null, form());
    expect(Object.keys(res?.fieldErrors ?? {})).toEqual(["guardianDeclaration"]);
    expect(await orderCount(user.id)).toBe(0);
    expect(invoicesCreated(sim)).toBe(0);
    expect(await consents(user.id)).toHaveLength(2);
  });

  it.each(["off", "true", "", "ON"])("only the checkbox value counts, not %j", async (value) => {
    const { user } = await buyer();
    const res = await placeOrderAction(null, form({ guardianDeclaration: value }));
    expect(res?.fieldErrors?.guardianDeclaration).toBeTruthy();
    expect(await orderCount(user.id)).toBe(0);
  });

  it("is stored for that order, with version, time and request details, before the gateway is called", async () => {
    const { user } = await buyer();
    expect(await placed({ guardianDeclaration: "on" })).toMatch(/\/pay\/\d+$/);
    const [order] = await sql<OrderRow[]>`select * from orders where user_id = ${user.id}`;
    const rows = (await consents(user.id)).filter((r) => r.kind === "guardian_purchase");
    expect(rows).toEqual([{ user_id: user.id, kind: "guardian_purchase", document_version: CONSENT_VERSIONS.guardian_purchase, order_id: order.id, ip: META.ip, user_agent: META.userAgent }]);
  });

  it("a free order has no payment, so it asks no declaration", async () => {
    const { user } = await buyer(0);
    await placed({});
    const [order] = await sql<OrderRow[]>`select * from orders where user_id = ${user.id}`;
    expect(order.status).toBe("paid");
    expect((await consents(user.id)).filter((r) => r.kind === "guardian_purchase")).toHaveLength(0);
  });

  it("a coupon that makes the order free needs no declaration either", async () => {
    const { user, product } = await buyer(1000);
    const [coupon] = await sql<{ code: string }[]>`insert into coupons (code, kind, value, is_active) values ('FREEALL', 'percent', 100, true) returning code`;
    ctx.cart = [product.id];
    await placed({ coupon: coupon.code });
    const [order] = await sql<OrderRow[]>`select * from orders where user_id = ${user.id}`;
    expect(order.total_fils).toBe(0);
    expect((await consents(user.id)).filter((r) => r.kind === "guardian_purchase")).toHaveLength(0);
  });

  it("a legacy buyer who accepts the documents still has to declare", async () => {
    const { user } = await buyer(3000, { legacyConsent: true });
    const res = await placeOrderAction(null, form({ termsAccepted: "on" }));
    expect(Object.keys(res?.fieldErrors ?? {})).toEqual(["guardianDeclaration"]);
    expect(await orderCount(user.id)).toBe(0);
    expect(await consents(user.id)).toHaveLength(0);
  });

  it("a refusal the page did not expect still shows its box and its message", () => {
    ctx.formState = { fieldErrors: { guardianDeclaration: CONSENT_FIELD_ERRORS.guardianDeclaration, termsAccepted: CONSENT_FIELD_ERRORS.termsAccepted } };
    const html = renderToStaticMarkup(createElement(CheckoutForm, { coupon: "", total: 0, methods: [], disabled: false, sandbox: false, needsTerms: false }));
    expect(html).toContain('data-testid="guardian-declaration"');
    expect(html).toContain('data-testid="guardian-declaration-error"');
    expect(html).toContain('data-testid="terms-accepted"');
    expect(html).toContain('data-testid="terms-accepted-error"');
  });

  it("a page with nothing to ask shows no boxes", () => {
    const html = renderToStaticMarkup(createElement(CheckoutForm, { coupon: "", total: 0, methods: [], disabled: false, sandbox: false, needsTerms: false }));
    expect(html).not.toContain('data-testid="purchase-consent"');
  });

  it("the wording says what is declared, and the code marks it a draft", () => {
    expect(GUARDIAN_DECLARATION_TEXT).toContain("١٨");
    expect(GUARDIAN_DECLARATION_TEXT).toContain("ولي أمري");
    expect(Object.values(CONSENT_VERSIONS).every((v) => v.includes("draft"))).toBe(true);
  });
});

describe("startPayment refuses without a declaration, whatever the caller", () => {
  it("an order created without one gets no invoice and no payment row", async () => {
    const user = await createUser();
    const order = await orderWithoutDeclaration(user);
    await expect(realStartPayment(order, null)).rejects.toBeInstanceOf(ConsentRequiredError);
    expect(await paymentRows(order.id)).toHaveLength(0);
    expect(invoicesCreated(sim)).toBe(0);
  });

  it("another order's declaration does not count", async () => {
    const { user } = await buyer();
    await placed({ guardianDeclaration: "on" });
    const second = await orderWithoutDeclaration(user);
    await expect(realStartPayment(second, null)).rejects.toMatchObject({ missing: ["guardianDeclaration"] });
  });

  it("another student's declaration on the same order does not count", async () => {
    const owner = await createUser();
    const other = await createUser();
    const order = await orderWithoutDeclaration(owner);
    await sql`insert into consent_records (user_id, kind, document_version, order_id) values (${other.id}, 'guardian_purchase', ${CONSENT_VERSIONS.guardian_purchase}, ${order.id})`;
    await expect(realStartPayment(order, null)).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  it("retry on the order page without the box goes back to the form and creates nothing", async () => {
    const user = await createUser();
    const order = await orderWithoutDeclaration(user);
    ctx.user = user;
    await expect(retryPaymentAction(form({ orderId: order.id }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected.at(-1)).toBe(`/orders/${order.id}?error=consent`);
    expect(await paymentRows(order.id)).toHaveLength(0);
    expect((await consents(user.id)).filter((r) => r.kind === "guardian_purchase")).toHaveLength(0);
  });

  it("ticking the box on the order page records it and continues to the gateway", async () => {
    const user = await createUser();
    const order = await orderWithoutDeclaration(user);
    ctx.user = user;
    await expect(retryPaymentAction(form({ orderId: order.id, guardianDeclaration: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected.at(-1)).toMatch(/\/pay\/\d+$/);
    const rows = (await consents(user.id)).filter((r) => r.kind === "guardian_purchase");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ order_id: order.id, ip: META.ip, user_agent: META.userAgent });
  });

  it("the order page can take the documents and the declaration together", async () => {
    const user = await createUser({ legacyConsent: true });
    const order = await orderWithoutDeclaration(user);
    ctx.user = user;
    await expect(retryPaymentAction(form({ orderId: order.id, guardianDeclaration: "on", termsAccepted: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected.at(-1)).toMatch(/\/pay\/\d+$/);
    expect((await consents(user.id)).map((r) => r.kind)).toEqual(["guardian_purchase", "privacy", "terms"]);
    for (const r of await consents(user.id)) expect(r.order_id).toBe(order.id);
  });

  it("ticking only the documents records no declaration and reaches no gateway", async () => {
    const user = await createUser({ legacyConsent: true });
    const order = await orderWithoutDeclaration(user);
    ctx.user = user;
    await expect(retryPaymentAction(form({ orderId: order.id, termsAccepted: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected.at(-1)).toBe(`/orders/${order.id}?error=consent`);
    expect((await consents(user.id)).map((r) => r.kind)).toEqual(["privacy", "terms"]);
    expect(await paymentRows(order.id)).toHaveLength(0);
  });

  it("ticking only the declaration records no documents and reaches no gateway", async () => {
    const user = await createUser({ legacyConsent: true });
    const order = await orderWithoutDeclaration(user);
    ctx.user = user;
    await expect(retryPaymentAction(form({ orderId: order.id, guardianDeclaration: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected.at(-1)).toBe(`/orders/${order.id}?error=consent`);
    expect((await consents(user.id)).map((r) => r.kind)).toEqual(["guardian_purchase"]);
    expect(await paymentRows(order.id)).toHaveLength(0);
  });

  it("nobody can declare on another student's order", async () => {
    const owner = await createUser();
    const order = await orderWithoutDeclaration(owner);
    const stranger = await createUser();
    ctx.user = stranger;
    await expect(retryPaymentAction(form({ orderId: order.id, guardianDeclaration: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected.at(-1)).toBe("/account");
    expect(await sql`select 1 from consent_records where order_id = ${order.id}`).toHaveLength(0);
    expect(await paymentRows(order.id)).toHaveLength(0);
  });

  it("a settled order takes no new declaration", async () => {
    const user = await createUser();
    const order = await orderWithoutDeclaration(user);
    await sql`update orders set status = 'cancelled' where id = ${order.id}`;
    ctx.user = user;
    await expect(retryPaymentAction(form({ orderId: order.id, guardianDeclaration: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected.at(-1)).toBe("/account");
    expect(await sql`select 1 from consent_records where order_id = ${order.id}`).toHaveLength(0);
  });

  it("retrying twice keeps one declaration", async () => {
    const user = await createUser();
    const order = await orderWithoutDeclaration(user);
    ctx.user = user;
    for (let i = 0; i < 2; i++) await expect(retryPaymentAction(form({ orderId: order.id, guardianDeclaration: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect((await consents(user.id)).filter((r) => r.kind === "guardian_purchase")).toHaveLength(1);
  });
});

describe("accounts older than the consent record", () => {
  it("are asked at their next checkout: not locked out, and nothing is written until they accept", async () => {
    const { user } = await buyer(3000, { legacyConsent: true });
    const res = await placeOrderAction(null, form({ guardianDeclaration: "on" }));
    expect(Object.keys(res?.fieldErrors ?? {})).toEqual(["termsAccepted"]);
    expect(await orderCount(user.id)).toBe(0);
    expect(await consents(user.id)).toHaveLength(0);
  });

  it("accepting records both documents against that order and is not asked again", async () => {
    const { user, product } = await buyer(3000, { legacyConsent: true });
    expect(await placed({ guardianDeclaration: "on", termsAccepted: "on" })).toMatch(/\/pay\/\d+$/);
    const [order] = await sql<OrderRow[]>`select * from orders where user_id = ${user.id}`;
    const rows = await consents(user.id);
    expect(rows.map((r) => r.kind)).toEqual(["guardian_purchase", "privacy", "terms"]);
    for (const r of rows) expect(r.order_id).toBe(order.id);
    expect(await missingAccountConsents(user.id)).toEqual([]);

    await sql`update orders set status = 'cancelled' where id = ${order.id}`;
    const another = await createProduct({ priceFils: 1000 });
    ctx.cart = [another.id, product.id];
    expect(await placed({ guardianDeclaration: "on" })).toMatch(/\/pay\/\d+$/);
  });

  it("a free order from an old account still asks for the documents, but no declaration", async () => {
    const { user } = await buyer(0, { legacyConsent: true });
    const res = await placeOrderAction(null, form());
    expect(Object.keys(res?.fieldErrors ?? {})).toEqual(["termsAccepted"]);
    expect(await orderCount(user.id)).toBe(0);
    await placed({ termsAccepted: "on" });
    const rows = await consents(user.id);
    expect(rows.map((r) => r.kind)).toEqual(["privacy", "terms"]);
    expect(rows[0].order_id).toBeTruthy();
  });

  it("acceptance of an older document version does not count", async () => {
    const user = await createUser({ legacyConsent: true });
    for (const kind of ACCOUNT_CONSENT_KINDS) await sql`insert into consent_records (user_id, kind, document_version) values (${user.id}, ${kind}, 'old-version')`;
    expect(await missingAccountConsents(user.id)).toEqual(["terms", "privacy"]);
    const order = await orderWithoutDeclaration(user);
    await expect(realStartPayment(order, null)).rejects.toMatchObject({ missing: ["termsAccepted", "guardianDeclaration"] });
  });

  it("a document that changes while an order is open can be accepted on that order", async () => {
    const user = await createUser({ legacyConsent: true });
    const order = await orderWithoutDeclaration(user);
    for (const kind of ACCOUNT_CONSENT_KINDS) await sql`insert into consent_records (user_id, kind, document_version, order_id) values (${user.id}, ${kind}, 'old-version', ${order.id})`;
    ctx.user = user;
    await expect(retryPaymentAction(form({ orderId: order.id, guardianDeclaration: "on", termsAccepted: "on" }))).rejects.toThrow(/NEXT_REDIRECT/);
    expect(ctx.redirected.at(-1)).toMatch(/\/pay\/\d+$/);
    expect(await missingAccountConsents(user.id)).toEqual([]);
  });

  it("startPayment also refuses an order with a declaration when the documents are missing", async () => {
    const user = await createUser({ legacyConsent: true });
    const order = await orderWithoutDeclaration(user);
    await sql`insert into consent_records (user_id, kind, document_version, order_id) values (${user.id}, 'guardian_purchase', ${CONSENT_VERSIONS.guardian_purchase}, ${order.id})`;
    await expect(realStartPayment(order, null)).rejects.toMatchObject({ missing: ["termsAccepted"] });
    expect(await orderConsentNeeds({ orderId: order.id, userId: user.id })).toEqual({ guardian: false, terms: true });
  });
});

describe("the order page of an order without a declaration", () => {
  const page = async (order: OrderRow, sp: Record<string, string> = {}) => renderToStaticMarkup(await OrderPage({ params: Promise.resolve({ id: order.id }), searchParams: Promise.resolve(sp) }));

  it("asks for it in one form with an unticked box, and hides the direct pay button", async () => {
    const user = await createUser();
    const order = await orderWithoutDeclaration(user);
    ctx.user = user;
    const html = await page(order);
    expect(html).toContain('data-testid="order-consent"');
    expect(html).toContain('data-testid="guardian-declaration"');
    expect(html).not.toContain('data-testid="order-retry"');
    expect(html).not.toMatch(/<input[^>]*name="guardianDeclaration"[^>]*checked/);
    expect(html).not.toContain('data-testid="terms-accepted"');
  });

  it("the failed page hides its retry button too", async () => {
    const user = await createUser();
    const order = await orderWithoutDeclaration(user);
    await sql`update orders set status = 'failed' where id = ${order.id}`;
    ctx.user = user;
    const html = await page(await orderRow(order.id));
    expect(html).toContain('data-testid="order-consent"');
    expect(html).not.toContain("إعادة محاولة الدفع");
  });

  it("an order that is no longer open asks nothing", async () => {
    const user = await createUser({ legacyConsent: true });
    const order = await orderWithoutDeclaration(user);
    await sql`update orders set status = 'cancelled' where id = ${order.id}`;
    ctx.user = user;
    expect(await page(order)).not.toContain('data-testid="order-consent"');
  });

  it("explains itself after a refused attempt", async () => {
    const user = await createUser();
    const order = await orderWithoutDeclaration(user);
    ctx.user = user;
    expect(await page(order, { error: "consent" })).toContain("لم تكتمل الموافقة");
  });

  it("nothing is asked once the declaration exists", async () => {
    const { user } = await buyer();
    await placed({ guardianDeclaration: "on" });
    const [order] = await sql<OrderRow[]>`select * from orders where user_id = ${user.id}`;
    const html = await page(order);
    expect(html).not.toContain('data-testid="order-consent"');
    expect(html).toContain('data-testid="order-retry"');
  });
});

describe("the record cannot be rewritten", () => {
  async function row() {
    const user = await createUser({ legacyConsent: true });
    const [c] = await sql<{ id: string }[]>`insert into consent_records (user_id, kind, document_version, ip, user_agent) values (${user.id}, 'terms', 'v1', '192.0.2.1', 'ua') returning id`;
    return { user, id: c.id };
  }

  it("refuses deleting a row", async () => {
    const { id } = await row();
    await expect(sql`delete from consent_records where id = ${id}`).rejects.toThrow(/append-only/);
  });

  it.each([
    ["the version", sql`document_version = 'v2'`],
    ["the kind", sql`kind = 'privacy'`],
    ["the time", sql`created_at = now() - interval '1 day'`],
    ["the address alone, keeping the device", sql`ip = '192.0.2.9'`],
  ])("refuses changing %s", async (_label, change) => {
    const { id } = await row();
    await expect(sql`update consent_records set ${change} where id = ${id}`).rejects.toThrow(/append-only/);
  });

  it("refuses changing the account", async () => {
    const { id } = await row();
    const other = await createUser();
    await expect(sql`update consent_records set user_id = ${other.id} where id = ${id}`).rejects.toThrow(/append-only/);
  });

  it("a live account's address and device cannot be erased", async () => {
    const { id } = await row();
    await expect(sql`update consent_records set ip = null, user_agent = null where id = ${id}`).rejects.toThrow(/append-only/);
    const [after] = await sql<ConsentRow[]>`select * from consent_records where id = ${id}`;
    expect(after).toMatchObject({ ip: "192.0.2.1", user_agent: "ua" });
  });

  it("the one permitted change is removing the address and device together, once the account is anonymised", async () => {
    const { user, id } = await row();
    await sql`update users set email = ${`deleted-${user.id}@anonymized.invalid`}, phone = null, password_hash = '!anonymized', is_active = false, anonymized_at = now() where id = ${user.id}`;
    await sql`update consent_records set ip = null, user_agent = null where id = ${id}`;
    const [after] = await sql<ConsentRow[]>`select * from consent_records where id = ${id}`;
    expect(after).toMatchObject({ kind: "terms", document_version: "v1", ip: null, user_agent: null });
    await expect(sql`update consent_records set document_version = 'v2' where id = ${id}`).rejects.toThrow(/append-only/);
    await expect(sql`delete from consent_records where id = ${id}`).rejects.toThrow(/append-only/);
  });

  it("even after the deletion, the proof itself cannot change", async () => {
    const user = await createUser({ legacyConsent: true });
    const [order, other] = [await orderWithoutDeclaration(user), await orderWithoutDeclaration(user)];
    const stranger = await createUser();
    const [c] = await sql<{ id: string }[]>`insert into consent_records (user_id, kind, document_version, order_id, ip, user_agent) values (${user.id}, 'terms', 'v1', ${order.id}, '192.0.2.1', 'ua') returning id`;
    await sql`update users set email = ${`deleted-${user.id}@anonymized.invalid`}, phone = null, password_hash = '!anonymized', is_active = false, anonymized_at = now() where id = ${user.id}`;
    const changes = [
      sql`ip = '192.0.2.9', user_agent = null`,
      sql`ip = null, user_agent = 'other'`,
      sql`ip = null`,
      sql`ip = null, user_agent = null, order_id = ${other.id}`,
      sql`ip = null, user_agent = null, order_id = null`,
      sql`ip = null, user_agent = null, kind = 'privacy'`,
      sql`ip = null, user_agent = null, document_version = 'v2'`,
      sql`ip = null, user_agent = null, created_at = now() - interval '1 day'`,
      sql`ip = null, user_agent = null, user_id = ${stranger.id}`,
    ];
    for (const change of changes) await expect(sql`update consent_records set ${change} where id = ${c.id}`).rejects.toThrow(/append-only/);
    const [after] = await sql<ConsentRow[]>`select * from consent_records where id = ${c.id}`;
    expect(after).toMatchObject({ user_id: user.id, kind: "terms", document_version: "v1", order_id: order.id, ip: "192.0.2.1", user_agent: "ua" });
  });

  it("a declaration must name its order, and an order has one", async () => {
    const user = await createUser();
    await expect(sql`insert into consent_records (user_id, kind, document_version) values (${user.id}, 'guardian_purchase', 'v1')`).rejects.toThrow(/check/);
    const order = await orderWithoutDeclaration(user);
    await sql`insert into consent_records (user_id, kind, document_version, order_id) values (${user.id}, 'guardian_purchase', 'v1', ${order.id})`;
    await expect(sql`insert into consent_records (user_id, kind, document_version, order_id) values (${user.id}, 'guardian_purchase', 'v1', ${order.id})`).rejects.toThrow(/consent_records_one_per_order/);
  });

  it("deleting the student or the order is refused while a consent points at them", async () => {
    const user = await createUser();
    await expect(sql`delete from users where id = ${user.id}`).rejects.toThrow(/foreign key/);
    const order = await orderWithoutDeclaration(user);
    await sql`insert into consent_records (user_id, kind, document_version, order_id) values (${user.id}, 'guardian_purchase', 'v1', ${order.id})`;
    await sql`delete from order_items where order_id = ${order.id}`;
    await expect(sql`delete from orders where id = ${order.id}`).rejects.toThrow(/foreign key/);
  });
});

describe("what is stored about the request", () => {
  it("an unknown address stays empty, and long values are cut to fit the record", async () => {
    expect(consentMeta({ ip: "unknown", userAgent: null })).toEqual({ ip: null, userAgent: null });
    const long = consentMeta({ ip: "1".repeat(200), userAgent: "u".repeat(2000) });
    expect(long.ip).toHaveLength(64);
    expect(long.userAgent).toHaveLength(300);
    const user = await createUser({ legacyConsent: true });
    await recordConsent(sql, { userId: user.id, kind: "terms", meta: long });
    expect(await consents(user.id)).toHaveLength(1);
  });
});

describe("what the owner sees", () => {
  it("the student's record lists each consent with its version, order and details", async () => {
    const { user } = await buyer();
    await placed({ guardianDeclaration: "on" });
    const data = await getStudent(user.id);
    expect(data?.consents.map((c) => c.kind).sort()).toEqual(["guardian_purchase", "privacy", "terms"]);
    const declared = data!.consents.find((c) => c.kind === "guardian_purchase")!;
    expect(declared).toMatchObject({ document_version: CONSENT_VERSIONS.guardian_purchase, ip: META.ip, user_agent: META.userAgent });
    expect(declared.order_number).toMatch(/^ORD-/);
  });
});

describe("a declaration never reaches an account that was deleted", () => {
  it("createOrder refuses once the account is anonymised, whatever the session still says", async () => {
    const user = await createUser();
    const product = await createProduct({ priceFils: 1000 });
    await sql`update users set email = ${`deleted-${user.id}@anonymized.invalid`}, phone = null, password_hash = '!anonymized', is_active = false, anonymized_at = now() where id = ${user.id}`;
    await expect(createOrder({ user, productIds: [product.id], isTest: true, consent: { guardianDeclared: true, termsAccepted: true, meta: { ip: null, userAgent: null } } })).rejects.toBeInstanceOf(OrderError);
    expect(await orderCount(user.id)).toBe(0);
  });
});
