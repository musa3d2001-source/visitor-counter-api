import { expect, type Page, type Browser } from "@playwright/test";
import postgres from "postgres";
import { E2E_ADMIN, E2E_DATABASE_URL, E2E_SINK_URL } from "./e2e-env";

let _sql: postgres.Sql | null = null;
export function db() {
  if (!_sql) _sql = postgres(E2E_DATABASE_URL, { max: 2, onnotice: () => {} });
  return _sql;
}

export const STUDENT_PASSWORD = "Student-Pass-123";

export function uniqueEmail(prefix = "student") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** كل طالب في الاختبارات يأتي من عنوان IP مختلف (كما في الواقع) حتى لا تتداخل حدود المحاولات */
export async function asDistinctClient(page: Page) {
  const r = () => Math.floor(Math.random() * 250) + 1;
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${r()}.${r()}.${r()}` });
}

export async function registerStudent(page: Page, opts: { email?: string; name?: string; next?: string } = {}) {
  const email = opts.email ?? uniqueEmail();
  await asDistinctClient(page);
  await page.goto(`/register${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ""}`);
  await page.fill("#fullName", opts.name ?? "طالب الاختبار");
  await page.fill("#email", email);
  await page.fill("#password", STUDENT_PASSWORD);
  await page.fill("#passwordConfirm", STUDENT_PASSWORD);
  await page.check("input[name=terms]");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/register"));
  return email;
}

export async function login(page: Page, email: string, password: string, next = "/library") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((u) => u.pathname === next || u.pathname.startsWith(next));
}

export async function loginAdmin(page: Page) {
  await login(page, E2E_ADMIN.email, E2E_ADMIN.password, "/admin");
}

export async function newStudentPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = await registerStudent(page);
  return { ctx, page, email };
}

/** شراء المنتجات الموجودة في السلة عبر محاكي البوابة */
export async function checkoutAndPay(page: Page, outcome: "success" | "fail") {
  await page.goto("/checkout");
  await page.getByTestId("place-order").click();
  await page.waitForURL(/\/pay\//);
  await page.getByTestId(outcome === "success" ? "sim-pay-success" : "sim-pay-fail").click();
  await page.waitForURL(/\/orders\//);
  return page.url().split("/orders/")[1].split("?")[0];
}

/** ينتظر رسالة وصلت فعلًا إلى خادم SMTP المحلي، ويعيد أول رابط يطابق النمط في أحدث رسالة */
export async function waitForMailLink(address: string, pattern: RegExp): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const res = await fetch(`${E2E_SINK_URL}/__sink/messages?to=${encodeURIComponent(address)}`);
        const messages = (await res.json()) as { text: string }[];
        for (const m of messages.reverse()) {
          const hit = pattern.exec(m.text);
          if (hit) {
            link = hit[0];
            return true;
          }
        }
        return false;
      },
      { timeout: 15_000, message: `لم تصل رسالة إلى ${address}` },
    )
    .toBe(true);
  return link;
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "لا يجب أن يكون هناك تمرير أفقي").toBeLessThanOrEqual(1);
}

export async function productBySlug(slug: string) {
  const [p] = await db()<{ id: string; slug: string; title: string; price_fils: number }[]>`select id, slug, title, price_fils from products where slug = ${slug}`;
  return p;
}

export async function mainFileId(productId: string) {
  const [f] = await db()<{ id: string }[]>`select id from product_files where product_id = ${productId} and kind = 'main' order by sort_order limit 1`;
  return f?.id;
}
