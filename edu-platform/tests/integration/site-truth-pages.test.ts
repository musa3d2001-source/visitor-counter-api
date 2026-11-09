import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resetEnvCache } from "@/server/env";
import { resetPaymentMethodsCache } from "@/server/payments/service";
import { EMPTY_HERO, PAYMENT_CLAIM } from "@/lib/site-truth";
import { startSimulator, type Simulator } from "../mocks/myfatoorah-simulator";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createProduct, createTeacher, createUser, createVideoProduct } from "../helpers/factories";
import { SIM_API_KEY, SIM_PORT, TEST_ENV, WEBHOOK_SECRET } from "../test-env";

/** الصفحات الحقيقية كاملة: ما يقرؤه الزائر في كل حال من أحوال الدفع والمحتوى */
const ctx = vi.hoisted(() => ({ user: null as unknown, cart: [] as string[] }));
vi.mock("@/server/auth/session", async (original) => ({ ...(await original<typeof import("@/server/auth/session")>()), getCurrentUser: async () => ctx.user, getCurrentSession: async () => null }));
vi.mock("@/server/auth/guards", () => ({ requireUser: async () => ctx.user, assertUser: async () => ctx.user }));
vi.mock("@/server/commerce/cart", async (original) => ({ ...(await original<typeof import("@/server/commerce/cart")>()), getCartIds: async () => ctx.cart }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const { default: HomePage } = await import("@/app/(site)/page");
const { default: TeachersPage } = await import("@/app/(site)/teachers/page");
const { default: ProductPage } = await import("@/app/(site)/products/[slug]/page");
const { default: CartPage } = await import("@/app/(site)/cart/page");
const { default: CheckoutPage } = await import("@/app/(site)/checkout/page");
const { default: ContactPage } = await import("@/app/(site)/contact/page");
const { SiteFooter } = await import("@/components/site/footer");
const { AuthCard } = await import("@/components/site/auth-card");
const { MobilePerks } = await import("@/app/(site)/(auth)/_components/mobile-perks");
const { SandboxBanner } = await import("@/components/site/sandbox-banner");
const { default: LoginPage } = await import("@/app/(site)/(auth)/login/page");
const { default: RegisterPage } = await import("@/app/(site)/(auth)/register/page");
const { authPagePerks } = await import("@/server/platform/site-facts");
const { generateMetadata } = await import("@/app/layout");

let sim: Simulator;
beforeAll(async () => {
  await resetDb();
  sim = await startSimulator({ port: SIM_PORT, apiKey: SIM_API_KEY, webhookSecret: WEBHOOK_SECRET });
});
afterAll(async () => {
  await sim?.close();
  await closeDb();
});
beforeEach(async () => {
  await sql`delete from bundle_items`;
  await sql`delete from order_items`;
  await sql`delete from orders`;
  await sql`delete from lessons`;
  await sql`delete from product_files`;
  await sql`delete from products`;
  await sql`delete from teachers`;
  await sql`delete from settings`;
  ctx.user = null;
  ctx.cart = [];
});
afterEach(() => {
  delete process.env.ALLOW_FILE_VIDEO;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
  resetPaymentMethodsCache();
});

type Mode = "live" | "sandbox" | "off";
function payments(mode: Mode) {
  process.env.PAYMENTS_MODE = mode === "off" ? "disabled" : mode;
  process.env.MYFATOORAH_LIVE_CONFIRMED = mode === "live" ? "true" : "false";
  resetEnvCache();
  resetPaymentMethodsCache();
}
const set = (key: string, value: unknown) => sql`insert into settings (key, value) values (${key}, ${sql.json(value as never)}) on conflict (key) do update set value = excluded.value`;
const videosOff = () => set("videos_enabled", false);
const html = (node: React.ReactNode) => renderToStaticMarkup(node as React.ReactElement);
const home = async () => html(await HomePage());
/** أسماء وسائل الدفع وشعاراتها التي ترجعها البوابة خيارات يضغط عليها الطالب، لا ادعاء */
const withoutMethods = (h: string) => h.replace(/<fieldset[\s\S]*?<\/fieldset>/g, "").replace(/<link rel="preload"[^>]*>/g, "");
const textOf = (h: string) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const VIDEO = /فيديو|مرئي/;

async function pages() {
  const note = await createProduct({ withFile: true, withPreview: true });
  const video = await createVideoProduct({ freePreviewIndex: 0 });
  const user = await createUser();
  ctx.user = user;
  ctx.cart = [note.id];
  return {
    home: await home(),
    footer: html(await SiteFooter()),
    login: html(AuthCard({ title: "دخول", perks: await authPagePerks(), children: null })),
    perks: html(MobilePerks({ perks: await authPagePerks() })),
    note: html(await ProductPage({ params: Promise.resolve({ slug: note.slug }) })),
    video: html(await ProductPage({ params: Promise.resolve({ slug: video.slug }) })),
    cart: html(await CartPage()),
    checkout: withoutMethods(html(await CheckoutPage({ searchParams: Promise.resolve({}) }))),
  };
}

describe("payment claims on every public surface", () => {
  it.each(["sandbox", "off"] as const)("%s: no page calls the payment secure or names the gateway", async (mode) => {
    payments(mode);
    const all = await pages();
    for (const [name, page] of Object.entries(all)) expect(page.match(PAYMENT_CLAIM)?.[0] ?? null, name).toBeNull();
  });

  it("live: each surface states it", async () => {
    payments("live");
    const all = await pages();
    for (const [name, page] of Object.entries(all)) expect(page, name).toMatch(PAYMENT_CLAIM);
  });

  it("the sandbox banner says it is a test without naming the gateway", () => {
    payments("sandbox");
    const banner = html(createElement(SandboxBanner));
    expect(banner).toContain("لن يُخصم أي مبلغ حقيقي");
    expect(banner).not.toMatch(PAYMENT_CLAIM);
  });

  it.each(["live", "off"] as const)("no sandbox banner while %s", (mode) => {
    payments(mode);
    expect(html(createElement(SandboxBanner))).toBe("");
  });

  it("sandbox checkout shows no shield and says no money moves", async () => {
    payments("sandbox");
    const { checkout } = await pages();
    expect(checkout).toContain("بيئة اختبار");
    const note = checkout.slice(checkout.lastIndexOf("بيئة اختبار: لن يُخصم أي مبلغ") - 500, checkout.lastIndexOf("بيئة اختبار: لن يُخصم أي مبلغ"));
    expect(note).toContain("lucide-flask-conical");
    expect(note).not.toContain("lucide-shield");
  });

  it("payment off: nothing promises a confirmation that cannot come", async () => {
    payments("off");
    await createProduct({ withFile: true });
    expect(await home()).not.toContain("تأكيد الدفع");
    expect(html(AuthCard({ title: "دخول", perks: await authPagePerks(), children: null }))).not.toContain("تأكيد الدفع");
  });
});

describe("the sign-in pages hand their card the real perks", () => {
  it.each(["off", "sandbox", "live"] as const)("payment %s", async (state) => {
    payments(state);
    ctx.user = null;
    await createProduct({ withFile: true });
    const perks = await authPagePerks();
    for (const markup of [html(await LoginPage({ searchParams: Promise.resolve({}) })), html(await RegisterPage({ searchParams: Promise.resolve({}) }))]) {
      const text = textOf(markup);
      for (const { text: perk } of perks) expect(text).toContain(perk);
      if (state !== "live") expect(text).not.toMatch(/دفع آمن|تأكيد الدفع/);
    }
  });
});

describe("the home page with nothing published", () => {
  it("does not offer what is not there", async () => {
    const h = await home();
    expect(textOf(h)).toContain(EMPTY_HERO.title);
    expect(h).toContain("لم يُنشر محتوى بعد");
    expect(h).not.toContain("كل شيء جاهز");
    expect(h).not.toContain('href="#grades"');
    expect(h).not.toContain("hero-trust");
    expect(h).not.toContain('id="how"');
    expect(h).not.toContain('id="faq"');
    expect(h).not.toContain('data-testid="grade-picker"');
    expect(h).not.toMatch(VIDEO);
  });

  it("the owner's own hero cannot promise lessons over an empty catalog", async () => {
    await set("hero_title", "مئات الدروس بانتظارك");
    await set("hero_subtitle", "كل ما تحتاجه جاهز الآن");
    const h = await home();
    expect(textOf(h)).toContain(EMPTY_HERO.title);
    expect(h).not.toContain("مئات الدروس");
  });

  it("offers contact only when a channel exists", async () => {
    expect(await home()).not.toContain('href="/contact"');
    await set("contact_email", "help@farqad.example");
    expect(await home()).toContain('href="/contact"');
  });

  it("the browser title and description are honest too", async () => {
    const meta = await generateMetadata();
    expect(JSON.stringify([meta.title, meta.description])).not.toMatch(VIDEO);
    expect(meta.description).toBe(EMPTY_HERO.subtitle);
  });
});

describe("the home page with notes and video closed", () => {
  beforeEach(async () => {
    await createProduct({ withFile: true, withPreview: true });
    await createVideoProduct({ freePreviewIndex: 0 });
    await videosOff();
  });

  it("mentions no video, by default", async () => {
    expect(await home()).not.toMatch(VIDEO);
  });

  it("mentions no video even with the old defaults saved in the database", async () => {
    await set("tagline", "شروحات فيديو ومذكرات لطلاب الكويت");
    await set("hero_subtitle", "شرح بالفيديو لكل وحدة، ومراجعات قبل الاختبارات القصيرة وليلة الاختبار، ومذكرات جاهزة للطباعة. ادفع لما تحتاجه فقط، ويظهر في مكتبتك فور تأكيد الدفع.");
    await set("faq", [{ q: "أين أجد ما اشتريته؟", a: "بعد تأكيد الدفع يظهر الشرح أو المذكرة مباشرة في صفحة «مكتبتي»، وتفتحه من أي جهاز بعد تسجيل الدخول، وتكمل الفيديو من حيث توقفت." }]);
    const h = await home();
    expect(h).not.toMatch(VIDEO);
    expect(html(await SiteFooter())).not.toMatch(VIDEO);
    expect(JSON.stringify(await generateMetadata())).not.toMatch(VIDEO);
    expect(html(await ContactPage())).not.toMatch(VIDEO);
  });

  it("says where to start, and not that everything is ready", async () => {
    const h = await home();
    expect(h).toContain("ابدأ من هنا");
    expect(h).not.toContain("كل شيء جاهز");
    expect(h).toContain('data-testid="grade-picker"');
  });
});

describe("the home page when video is on sale", () => {
  it("talks about video", async () => {
    await createProduct({ withFile: true });
    await createVideoProduct({ freePreviewIndex: 0 });
    const h = await home();
    expect(h).toContain("تكمل الفيديو من حيث توقفت");
    expect(h).toContain("أحدث الدروس المرئية");
  });
});

describe("the contact email in the footer", () => {
  it("appears as a working link when set", async () => {
    await set("contact_email", "help@farqad.example");
    const footer = html(await SiteFooter());
    expect(footer).toContain('href="mailto:help@farqad.example"');
    expect(footer).toContain('dir="ltr"');
    expect(footer).toContain("help@farqad.example");
  });

  it("leaves nothing behind when empty", async () => {
    await set("contact_email", "");
    const footer = html(await SiteFooter());
    expect(footer).not.toContain("mailto:");
    expect(footer).not.toContain('dir="ltr"');
  });
});

describe("/teachers counts real teachers", () => {
  const teachers = async (search: Record<string, string> = {}) => html(await TeachersPage({ searchParams: Promise.resolve(search) }));

  it("none: says so, with no filters and no plural greeting", async () => {
    const h = await teachers();
    expect(h).toContain("لم يُنشر أي معلم بعد");
    expect(h).not.toContain("معلميك");
    expect(h).not.toContain("تصفية حسب الصف");
  });

  it("one: is not called teachers", async () => {
    await createTeacher();
    const h = await teachers();
    expect(h).toContain("معلم المنصة");
    expect(h).not.toContain("معلميك");
  });

  it("two: the plural is true", async () => {
    await createTeacher();
    await createTeacher();
    expect(await teachers()).toContain("معلميك");
  });

  it("with video closed, no free lesson is promised", async () => {
    const t = await createTeacher();
    await createVideoProduct({ teacherId: t.id, freePreviewIndex: 0 });
    await createProduct({ withFile: true });
    await createTeacher();
    await videosOff();
    const h = await teachers();
    expect(h).not.toMatch(VIDEO);
    expect(h).not.toContain("درس");
  });
});
