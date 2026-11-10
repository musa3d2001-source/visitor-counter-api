import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E_PUBLIC_CACHE_BASE_URL, E2E_PUBLIC_CACHE_SERVER_ENV } from "./e2e-env";
import { asDistinctClient, db, registerStudent } from "./helpers";

/**
 * الذاكرة العامة على خادم إنتاجي فعلي بعمر قصير. الرحلات تعدّل قاعدة البيانات مباشرة، كما لو
 * أن المالك غيّر المنتج من نسخة خادم أخرى لا يصل منها أمر تفريغ إلى هذه.
 */
const LIFETIME_MS = Number(E2E_PUBLIC_CACHE_SERVER_ENV.PUBLIC_CACHE_SECONDS) * 1000;
/** العمر، وهامش لتصيير الصفحة وبدء التحديث */
const WITHIN_LIFETIME = { timeout: LIFETIME_MS + 3000, intervals: [250] };

test.use({ baseURL: E2E_PUBLIC_CACHE_BASE_URL });
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "سلوك خادم لا يتعلق بقياس الجهاز"));

async function newNotes(priceFils: number) {
  const slug = `cache-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const title = `مذكرة الذاكرة ${slug}`;
  const [row] = await db()<{ id: string; grade_slug: string; subject_slug: string }[]>`
    with source as (select * from products where slug = 'g9-math-final-notes-t1'),
    created as (
      insert into products (slug, type, title, grade_id, subject_id, academic_year, term, price_fils, status, published_at)
      select ${slug}, type, ${title}, grade_id, subject_id, academic_year, term, ${priceFils}, 'published', now() from source
      returning id, grade_id, subject_id
    )
    select c.id, g.slug as grade_slug, s.slug as subject_slug from created c join grades g on g.id = c.grade_id join subjects s on s.id = c.subject_id
  `;
  return { id: row.id, slug, title, listing: `/grades/${row.grade_slug}/${row.subject_slug}` };
}

const htmlOf = async (request: APIRequestContext, url: string) => {
  const response = await request.get(url);
  return { status: response.status(), html: await response.text() };
};

test("a new price shows within the lifetime, and the cart and checkout charge it from the first moment", async ({ page, request }) => {
  const product = await newNotes(3125);
  const url = `/products/${product.slug}`;
  await registerStudent(page);
  await page.goto(url);
  await expect(page.locator("main")).toContainText("3.125");
  await page.getByTestId("add-to-cart").first().click();
  await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();

  // تعبئة الذاكرة قبل التغيير مباشرة، حتى يكون ما يلي داخل العمر حتمًا
  expect((await htmlOf(request, url)).html).toContain("3.125");
  await db()`update products set price_fils = 4375 where id = ${product.id}`;

  expect((await htmlOf(request, url)).html, "الصفحة العامة ما زالت على النسخة المحفوظة").toContain("3.125");
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-total")).toContainText("4.375");
  await page.goto("/cart");
  await expect(page.getByTestId("cart-lines")).toContainText("4.375");

  await expect.poll(async () => (await htmlOf(request, url)).html.includes("4.375"), WITHIN_LIFETIME).toBe(true);
  expect((await htmlOf(request, url)).html).not.toContain("3.125");
});

test("an unpublished product leaves its page, its list and the sitemap within the lifetime, and the cart drops it at once", async ({ page, request }) => {
  const product = await newNotes(2250);
  const url = `/products/${product.slug}`;
  await asDistinctClient(page);
  await page.goto(url);
  await page.getByTestId("add-to-cart").first().click();
  await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();

  expect((await htmlOf(request, url)).status).toBe(200);
  expect((await htmlOf(request, product.listing)).html).toContain(product.title);
  expect((await htmlOf(request, "/sitemap.xml")).html).toContain(product.slug);
  await db()`update products set status = 'draft' where id = ${product.id}`;

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "سلتك فارغة" })).toBeVisible();
  await expect(page.getByTestId("cart-lines")).toHaveCount(0);

  await expect.poll(async () => (await htmlOf(request, url)).status, WITHIN_LIFETIME).toBe(404);
  await expect.poll(async () => (await htmlOf(request, product.listing)).html.includes(product.title), WITHIN_LIFETIME).toBe(false);
  await expect.poll(async () => (await htmlOf(request, "/sitemap.xml")).html.includes(product.slug), WITHIN_LIFETIME).toBe(false);
});

test("what one visitor sees of their own never reaches another, whichever of them comes first", async ({ browser, page, request }) => {
  const product = await newNotes(1875);
  const url = `/products/${product.slug}`;
  const name = `صاحبة الحساب ${Date.now()}`;
  const email = await registerStudent(page, { name });
  await db()`
    insert into entitlements (user_id, product_id, source, grant_reason)
    select u.id, ${product.id}, 'manual', 'e2e public cache' from users u where u.email = ${email}
  `;
  const addToCart = '[data-testid="add-to-cart"]';

  // الزائر أولًا يملأ الذاكرة، ثم المالكة: تراه مملوكًا لها
  expect((await htmlOf(request, url)).html).toContain(product.title);
  await page.goto(url);
  await expect(page.getByRole("link", { name: "افتح في مكتبتي" }).first()).toBeVisible();
  await expect(page.locator(addToCart)).toHaveCount(0);

  // المالكة ملأتها الآن، والزائر الجديد والطالب الآخر يريان زر الشراء ولا يريان اسمها
  await page.goto(url);
  const visitor = await browser.newContext({ baseURL: E2E_PUBLIC_CACHE_BASE_URL });
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(url);
  await expect(visitorPage.locator(addToCart).first()).toBeVisible();
  expect(await visitorPage.content()).not.toContain(name);
  await visitor.close();

  const other = await browser.newContext({ baseURL: E2E_PUBLIC_CACHE_BASE_URL });
  const otherPage = await other.newPage();
  await registerStudent(otherPage, { name: "طالب آخر" });
  await otherPage.goto(url);
  await expect(otherPage.locator(addToCart).first()).toBeVisible();
  expect(await otherPage.content()).not.toContain(name);
  await other.close();

  // السحب يصل إلى صاحبة الحق في الطلب التالي: الصفحة لا تزال في الذاكرة، والملكية ليست منها
  await db()`update entitlements set revoked_at = now(), revoke_reason = 'e2e' where product_id = ${product.id}`;
  await page.goto(url);
  await expect(page.locator(addToCart).first()).toBeVisible();
});

test("robots is held by the CDN and the sitemap is not", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.headers()["vercel-cdn-cache-control"]).toBe("public, s-maxage=3600");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["vercel-cdn-cache-control"]).toBeUndefined();
});
