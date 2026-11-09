import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createOrder } from "@/server/commerce/orders";
import { resetEnvCache } from "@/server/env";
import { resetPaymentMethodsCache } from "@/server/payments/service";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createProduct, createUser } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

/** الصفحات الحقيقية تُعرض كاملة خارج Next.js: ما يراه الطالب حين يكون الدفع متوقفًا */
const ctx = vi.hoisted(() => ({ user: null as unknown, cart: [] as string[] }));

vi.mock("@/server/auth/guards", () => ({ requireUser: async () => ctx.user, assertUser: async () => ctx.user }));
vi.mock("@/server/commerce/cart", async (original) => ({
  ...(await original<typeof import("@/server/commerce/cart")>()),
  getCartIds: async () => ctx.cart,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: CheckoutPage } = await import("@/app/(site)/checkout/page");
const { default: OrderPage } = await import("@/app/(site)/orders/[id]/page");

const NO_CONTACTS = { whatsapp_number: "", contact_email: "", contact_phone: "" };
const CONTACTS = { whatsapp_number: "96599887766", contact_email: "help@farqad.example", contact_phone: "" };
/** أزرار الدفع وإعادة المحاولة والتحديث كلها نماذج ترسل رقم الطلب */
const ORDER_ACTION_FORM = 'name="orderId"';

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

function paymentsOff() {
  process.env.PAYMENTS_MODE = "disabled";
  resetEnvCache();
}

async function setContacts(values: typeof NO_CONTACTS) {
  for (const [key, value] of Object.entries(values)) {
    await sql`insert into settings (key, value) values (${key}, to_jsonb(${value}::text)) on conflict (key) do update set value = excluded.value`;
  }
}

async function checkoutHtml(priceFils: number) {
  const user = await createUser();
  const product = await createProduct({ priceFils });
  ctx.user = user;
  ctx.cart = [product.id];
  return renderToStaticMarkup(await CheckoutPage({ searchParams: Promise.resolve({}) }));
}

async function orderHtml(status: "pending" | "failed", search: { error?: string } = {}) {
  const user = await createUser();
  const product = await createProduct({ priceFils: 3000 });
  // كما يصل من نموذج الشراء: هذه الاختبارات عن أزرار الدفع لا عن الموافقة
  const order = await createOrder({ user, productIds: [product.id], isTest: true, consent: { guardianDeclared: true, termsAccepted: true, meta: { ip: null, userAgent: null } } });
  if (status === "failed") await sql`update orders set status = 'failed' where id = ${order.id}`;
  ctx.user = user;
  return renderToStaticMarkup(await OrderPage({ params: Promise.resolve({ id: order.id }), searchParams: Promise.resolve(search) }));
}

const placeOrderButton = (html: string) => /<button\b[^>]*data-testid="place-order"[^>]*>/.exec(html)?.[0] ?? "";

describe("checkout while online payment is off", () => {
  it("says so, offers the real contact channels, and promises nothing", async () => {
    paymentsOff();
    await setContacts(CONTACTS);
    const html = await checkoutHtml(3000);
    expect(html).toContain("الدفع الإلكتروني غير متاح حاليًا");
    expect(html).toContain('href="https://wa.me/96599887766"');
    expect(html).toContain('href="mailto:help@farqad.example"');
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("دفع آمن");
    expect(html).not.toContain("ننقلك");
  });

  it("the button says what is true and cannot be pressed", async () => {
    paymentsOff();
    await setContacts(NO_CONTACTS);
    const html = await checkoutHtml(3000);
    expect(placeOrderButton(html)).toContain("disabled");
    expect(html).toContain("الدفع غير متاح حاليًا");
    expect(html).not.toMatch(/ادفع\s/);
  });

  it("with no channel set there is no contact list at all", async () => {
    paymentsOff();
    await setContacts(NO_CONTACTS);
    const html = await checkoutHtml(3000);
    expect(html).toContain("الدفع الإلكتروني غير متاح حاليًا");
    expect(html).not.toContain("payment-unavailable-contacts");
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("mailto:");
  });

  it("a free order can still be completed", async () => {
    paymentsOff();
    const html = await checkoutHtml(0);
    expect(html).toContain("إتمام الطلب مجانًا");
    expect(placeOrderButton(html)).not.toContain("disabled");
    expect(html).not.toContain("الدفع الإلكتروني غير متاح حاليًا");
  });

  it("with payment on, nothing of this appears", async () => {
    await setContacts(CONTACTS);
    const html = await checkoutHtml(3000);
    expect(html).not.toContain("الدفع الإلكتروني غير متاح حاليًا");
    expect(html).toContain("ادفع");
    expect(placeOrderButton(html)).not.toContain("disabled");
  });
});

describe("the order page while online payment is off", () => {
  it("a pending order offers no action that could only fail, and says why", async () => {
    paymentsOff();
    await setContacts(CONTACTS);
    const html = await orderHtml("pending");
    expect(html).not.toContain(ORDER_ACTION_FORM);
    expect(html).toContain("هذا الطلب لم يكتمل بعد");
    expect(html).toContain("الدفع الإلكتروني غير متاح حاليًا");
    expect(html).toContain('href="mailto:help@farqad.example"');
  });

  it("a failed order does not suggest trying again", async () => {
    paymentsOff();
    await setContacts(CONTACTS);
    const html = await orderHtml("failed");
    expect(html).not.toContain(ORDER_ACTION_FORM);
    expect(html).not.toContain("يمكنك المحاولة مرة أخرى");
    expect(html).toContain("لم يتم خصم أي مبلغ");
  });

  it("offers help only when there is a real channel to reach", async () => {
    paymentsOff();
    await setContacts(NO_CONTACTS);
    expect(await orderHtml("pending")).not.toContain("تحتاج مساعدة؟");
    await setContacts(CONTACTS);
    expect(await orderHtml("pending")).toContain("تحتاج مساعدة؟");
  });

  it("with payment on, the actions are still there", async () => {
    await setContacts(CONTACTS);
    const pending = await orderHtml("pending");
    expect(pending).toContain(ORDER_ACTION_FORM);
    expect(pending).toContain("إكمال الدفع");
    expect(pending).toContain("تحديث الحالة");
    expect(pending).not.toContain("الدفع الإلكتروني غير متاح حاليًا");
    expect(await orderHtml("failed")).toContain("إعادة محاولة الدفع");
  });

  it("an order from the other mode explains what to do next", async () => {
    await setContacts(CONTACTS);
    const html = await orderHtml("pending", { error: "mode" });
    expect(html).toContain("أُنشئ هذا الطلب في وضع دفع مختلف");
    expect(html).toContain('href="/cart"');
  });
});
