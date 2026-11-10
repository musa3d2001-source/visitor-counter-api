import { test, expect, type Browser, type Page } from "@playwright/test";
import { asDistinctClient, db, expectNoHorizontalOverflow, login, loginAdmin, passStepUp, productBySlug, registerStudent, STUDENT_PASSWORD, uniqueEmail } from "./helpers";

/** إقرار الدفع قبل كل فاتورة، وسؤال الحسابات الأقدم من السجل، وحذف بيانات الطالب بيد المالك */
const SLUG = "g9-math-final-notes-t1";

async function userId(email: string) {
  const [u] = await db()<{ id: string }[]>`select id from users where email = ${email}`;
  return u.id;
}

async function consentKinds(id: string) {
  const rows = await db()<{ kind: string }[]>`select kind from consent_records where user_id = ${id} order by kind`;
  return rows.map((r) => r.kind);
}

async function addToCart(page: Page) {
  await page.goto(`/products/${SLUG}`);
  await page.getByTestId("add-to-cart").first().click();
  await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();
}

async function ownerPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await asDistinctClient(page);
  await loginAdmin(page);
  return { ctx, page };
}

/** حساب أنشئ قبل سجل الموافقات: لا يكتب له النموذج شيئًا */
async function legacyStudent(page: Page) {
  const donor = await registerStudent(page);
  const email = uniqueEmail("legacy");
  await db()`insert into users (email, password_hash, full_name, role) select ${email}, password_hash, 'طالب قديم', 'student' from users where email = ${donor}`;
  await page.context().clearCookies();
  await login(page, email, STUDENT_PASSWORD);
  return { email, id: await userId(email) };
}

async function orderWithoutDeclaration(id: string, email: string) {
  const product = await productBySlug(SLUG);
  const [order] = await db()<{ id: string; number: string }[]>`
    insert into orders (user_id, subtotal_fils, discount_fils, total_fils, is_test, customer_name, customer_email)
    values (${id}, ${product.price_fils}, 0, ${product.price_fils}, true, 'طالب', ${email}) returning id, number
  `;
  await db()`insert into order_items (order_id, product_id, title, product_type, unit_price_fils) values (${order.id}, ${product.id}, ${product.title}, 'final_notes', ${product.price_fils})`;
  return order;
}

test.describe("الموافقات", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === "ipad", "الرحلة نفسها مغطاة على الكمبيوتر والآيفون"));

  test("خانة الموافقة في التسجيل غير مؤشرة", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("input[name=terms]")).not.toBeChecked();
  });

  test("التسجيل يسجل الموافقة، والإقرار غير مؤشر ولا دفع بدونه، ويُحفظ للطلب", async ({ page }) => {
    const email = await registerStudent(page);
    const id = await userId(email);
    expect(await consentKinds(id)).toEqual(["privacy", "terms"]);

    await addToCart(page);
    await page.goto("/checkout");
    const box = page.getByTestId("guardian-declaration");
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    await expect(page.getByTestId("purchase-consent")).toContainText("ولي أمري");
    await expect(page.getByTestId("terms-accepted")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // المتصفح يمنع الإرسال
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/\/checkout/);

    // طلب يتجاوز المتصفح: الخادم يرفضه ولا ينشئ شيئًا
    await box.evaluate((el) => {
      (el as HTMLInputElement).required = false;
    });
    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("guardian-declaration-error")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(await db()`select 1 from orders where user_id = ${id}`).toHaveLength(0);

    await page.getByTestId("guardian-declaration").check();
    await page.getByTestId("place-order").click();
    await page.waitForURL(/\/pay\//);
    const [record] = await db()<{ order_id: string; document_version: string; user_agent: string | null }[]>`select order_id, document_version, user_agent from consent_records where user_id = ${id} and kind = 'guardian_purchase'`;
    const [order] = await db()<{ id: string }[]>`select id from orders where user_id = ${id}`;
    expect(record.order_id).toBe(order.id);
    expect(record.document_version).toContain("draft");
    expect(record.user_agent).toBeTruthy();
  });

  test("الحساب الأقدم من السجل يُسأل عند الشراء التالي ولا يُقفل", async ({ page }) => {
    const { id } = await legacyStudent(page);
    await addToCart(page);
    await page.goto("/checkout");
    await expect(page.getByTestId("terms-accepted")).not.toBeChecked();
    await expect(page.getByTestId("guardian-declaration")).not.toBeChecked();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId("guardian-declaration").check();
    await page.getByTestId("terms-accepted").check();
    await page.getByTestId("place-order").click();
    await page.waitForURL(/\/pay\//);
    expect(await consentKinds(id)).toEqual(["guardian_purchase", "privacy", "terms"]);
  });

  test("طلب قديم بلا إقرار: النموذج في صفحة الطلب بدل زر الدفع المباشر", async ({ page }) => {
    const email = await registerStudent(page);
    const id = await userId(email);
    const order = await orderWithoutDeclaration(id, email);
    await page.goto(`/orders/${order.id}`);
    await expect(page.getByTestId("order-consent")).toBeVisible();
    await expect(page.getByTestId("order-retry")).toHaveCount(0);
    await expect(page.getByTestId("guardian-declaration")).not.toBeChecked();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId("guardian-declaration").check();
    await page.getByTestId("order-consent-submit").click();
    await page.waitForURL(/\/pay\//);
    const rows = await db()<{ kind: string }[]>`select kind from consent_records where order_id = ${order.id}`;
    expect(rows.map((r) => r.kind)).toEqual(["guardian_purchase"]);
  });
});

test.describe("حذف بيانات الطالب", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === "ipad", "الرحلة نفسها مغطاة على الكمبيوتر والآيفون"));

  test("المالك يرى الموافقات، ثم يحذف بخطوتين، ولا يبقى دخول", async ({ page, browser }) => {
    const email = await registerStudent(page, { name: "ريم العلي" });
    const id = await userId(email);
    const owner = await ownerPage(browser);
    await owner.page.goto(`/admin/students/${id}`);

    const consents = owner.page.getByTestId("student-consents");
    await expect(consents).toContainText("الشروط والأحكام");
    await expect(consents).toContainText("سياسة الخصوصية");
    await expect(owner.page.getByTestId("anonymize-deleted-list")).toContainText("تقدم القراءة");
    await expect(owner.page.getByTestId("anonymize-kept-list")).toContainText("سجل الموافقات");
    await expect(owner.page.getByText("لا يمكن التراجع عنه")).toBeVisible();
    await expectNoHorizontalOverflow(owner.page);

    await owner.page.getByTestId("anonymize-start").click();
    const submit = owner.page.getByTestId("anonymize-submit");
    await expect(submit).toBeDisabled();
    await owner.page.getByTestId("anonymize-confirm-email").fill("someone.else@example.com");
    await owner.page.getByTestId("anonymize-reason").fill("طلب ولي الأمر");
    await expect(submit).toBeDisabled();
    await owner.page.getByTestId("anonymize-confirm-email").fill(email);
    await expect(submit).toBeEnabled();
    await expectNoHorizontalOverflow(owner.page);
    await submit.click();
    await passStepUp(owner.page);

    await expect(owner.page.getByTestId("student-anonymized-note")).toBeVisible();
    await expect(owner.page.getByTestId("anonymize-start")).toHaveCount(0);
    await expect(owner.page.getByRole("heading", { name: "ريم العلي" })).toHaveCount(0);
    await expect(owner.page.getByTestId("student-consents")).toContainText("الشروط والأحكام");
    await expectNoHorizontalOverflow(owner.page);
    await owner.ctx.close();

    const [row] = await db()<{ email: string; full_name: string; is_active: boolean }[]>`select email, full_name, is_active from users where id = ${id}`;
    expect(row.email).toBe(`deleted-${id}@anonymized.invalid`);
    expect(row.is_active).toBe(false);
    const [entry] = await db()<{ n: number }[]>`select count(*)::int as n from audit_logs where action = 'student.anonymized' and entity_id = ${id}`;
    expect(entry.n).toBe(1);

    // الجلسة انتهت، والبريد القديم لا يفتح شيئًا
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login/);
    await page.fill("#email", email);
    await page.fill("#password", STUDENT_PASSWORD);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.getByRole("alert").first()).toContainText("غير صحيحة");
  });

  test("طلب مفتوح يمنع الحذف ويظهر للمالك، ولا زر للبدء", async ({ page, browser }) => {
    const email = await registerStudent(page);
    const id = await userId(email);
    const order = await orderWithoutDeclaration(id, email);
    const owner = await ownerPage(browser);
    await owner.page.goto(`/admin/students/${id}`);
    await expect(owner.page.getByTestId("anonymize-blockers")).toContainText(order.number);
    await expect(owner.page.getByTestId("anonymize-start")).toHaveCount(0);
    await expectNoHorizontalOverflow(owner.page);
    await owner.ctx.close();
  });
});
