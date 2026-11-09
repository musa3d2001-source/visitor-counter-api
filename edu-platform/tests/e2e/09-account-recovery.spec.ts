import { test, expect, type Browser } from "@playwright/test";
import { asDistinctClient, checkoutAndPay, db, expectNoHorizontalOverflow, login, loginAdmin, productBySlug, registerStudent, STUDENT_PASSWORD, uniqueEmail, waitForMailLink } from "./helpers";
import { E2E_MAIL_BASE_URL } from "./e2e-env";

/** الاستعادة بيد المالك (البريد غير مفعّل هنا)، وتأكيد البريد قبل أول دفع (خادم ثانٍ ببريد SMTP حقيقي إلى خادم اختبار محلي) */
const NEW_PASSWORD = "My-Own-Fresh-Pass-9";
const pathOf = (link: string) => link.replace(/^https?:\/\/[^/]+/, "");

async function studentId(email: string) {
  const [u] = await db()<{ id: string }[]>`select id from users where email = ${email}`;
  return u.id;
}

async function ownerPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await asDistinctClient(page);
  await loginAdmin(page);
  return { ctx, page };
}

async function issueReset(browser: Browser, email: string) {
  const owner = await ownerPage(browser);
  await owner.page.goto(`/admin/students/${await studentId(email)}`);
  await owner.page.fill("#reset-reason", "طلب ولي الأمر عبر واتساب");
  await owner.page.getByRole("button", { name: "إصدار رابط وكلمة مؤقتة" }).click();
  await expect(owner.page.getByTestId("student-reset-secrets")).toBeVisible();
  await expectNoHorizontalOverflow(owner.page);
  const link = (await owner.page.getByTestId("student-reset-link").textContent())!.trim();
  const temporaryPassword = (await owner.page.getByTestId("student-temp-password").textContent())!.trim();
  await owner.page.getByRole("button", { name: "تم، متابعة" }).click();
  await expect(owner.page.getByTestId("student-reset-form")).toBeVisible();
  await expect(owner.page.getByTestId("student-account-state")).toContainText("بانتظار اختيار كلمة مرور جديدة");
  await owner.ctx.close();
  return { link, temporaryPassword };
}

test.describe("الاستعادة بيد المالك والبريد غير مفعّل", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === "ipad", "الرحلة نفسها مغطاة على الكمبيوتر والآيفون"));

  test("المالك يرى صراحة أن الرسائل لا تخرج", async ({ browser }) => {
    const owner = await ownerPage(browser);
    await owner.page.goto("/admin");
    await expect(owner.page.getByText("البريد غير مفعّل: لا تصل أي رسالة")).toBeVisible();
    await owner.page.goto("/admin/mail");
    await expect(owner.page.getByTestId("mail-page")).toContainText("البريد غير مفعّل على هذا النشر");
    await expectNoHorizontalOverflow(owner.page);
    await owner.ctx.close();
  });

  test("كلمة مؤقتة: تفتح صفحة واحدة، ثم كلمة الطالب الخاصة", async ({ page, browser }) => {
    const email = await registerStudent(page);
    const { temporaryPassword } = await issueReset(browser, email);

    // الجلسة السابقة انتهت
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login/);

    // الكلمة القديمة لم تعد تعمل
    await page.fill("#email", email);
    await page.fill("#password", STUDENT_PASSWORD);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.getByRole("alert").first()).toContainText("غير صحيحة");

    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", temporaryPassword);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page).toHaveURL(/\/change-password/);
    await expectNoHorizontalOverflow(page);

    // لا صفحة أخرى تفتح قبل تعيين الكلمة
    for (const path of ["/library", "/account", "/checkout", "/login"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/change-password/);
    }

    await page.fill("#password", NEW_PASSWORD);
    await page.fill("#passwordConfirm", NEW_PASSWORD);
    await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();
    await expect(page).toHaveURL(/\/library/);

    await page.context().clearCookies();
    await login(page, email, NEW_PASSWORD);
  });

  test("رابط المالك يعمل مرة واحدة", async ({ page, browser }) => {
    const email = await registerStudent(page);
    const { link } = await issueReset(browser, email);
    await page.context().clearCookies();
    await page.goto(pathOf(link));
    await page.fill("#password", NEW_PASSWORD);
    await page.fill("#passwordConfirm", NEW_PASSWORD);
    await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    await login(page, email, NEW_PASSWORD);
    await page.context().clearCookies();
    await page.goto(pathOf(link));
    await page.fill("#password", "Another-Pass-22");
    await page.fill("#passwordConfirm", "Another-Pass-22");
    await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();
    await expect(page.getByText("انتهت صلاحية الرابط أو سبق استخدامه")).toBeVisible();
  });

  test("تصحيح البريد: يدخل الطالب بالعنوان الصحيح، والمحجوز مرفوض", async ({ page, browser }) => {
    const email = await registerStudent(page);
    const fixed = uniqueEmail("fixed");
    const owner = await ownerPage(browser);
    await owner.page.goto(`/admin/students/${await studentId(email)}`);
    await owner.page.fill("#correct-email", "admin-e2e@example.com");
    await owner.page.fill("#correct-reason", "خطأ إملائي");
    await owner.page.getByRole("button", { name: "حفظ البريد الصحيح" }).click();
    await expect(owner.page.getByText("هذا البريد مستخدم في حساب آخر").first()).toBeVisible();

    await owner.page.fill("#correct-email", fixed);
    await owner.page.fill("#correct-reason", "خطأ إملائي");
    await owner.page.getByRole("button", { name: "حفظ البريد الصحيح" }).click();
    await expect(owner.page.getByText("تم تصحيح البريد")).toBeVisible();
    await expect(owner.page.getByTestId("student-account-state")).toContainText("البريد غير مؤكد");
    await owner.ctx.close();

    await page.context().clearCookies();
    await login(page, fixed, STUDENT_PASSWORD);
  });
});

test.describe("تأكيد البريد قبل أول دفع، والبريد حقيقي", () => {
  test.use({ baseURL: E2E_MAIL_BASE_URL });
  test.beforeEach(({}, info) => test.skip(info.project.name === "ipad", "الرحلة نفسها مغطاة على الكمبيوتر والآيفون"));

  async function openCheckout(page: import("@playwright/test").Page, slug: string) {
    await page.goto(`/products/${slug}`);
    await page.getByTestId("add-to-cart").first().click();
    await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();
    await page.goto("/checkout");
  }

  test("الدفع ينتظر التأكيد، ثم يكمل الطالب شراءه", async ({ page }, info) => {
    const email = await registerStudent(page);
    await expect(page).toHaveURL(/\/library/); // التسجيل فوري، بلا خطوة بريد
    await openCheckout(page, info.project.name === "iphone" ? "g9-english-final-notes-t1" : "g9-math-final-notes-t1");

    await expect(page).toHaveURL(/\/verify-email\?next=%2Fcheckout/);
    await expect(page.getByTestId("verify-target")).toHaveText(email);
    await expectNoHorizontalOverflow(page);

    const link = await waitForMailLink(email, /https?:\/\/\S+\/verify-email\/confirm\?token=\S+/);
    await page.goto(pathOf(link));
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "تأكيد البريد" }).click();
    await expect(page.getByTestId("email-confirmed")).toBeVisible();

    await checkoutAndPay(page, "success");
    await expect(page.getByText("تم الدفع بنجاح")).toBeVisible();
  });

  test("الرابط لا يُستخدم مرتين، وطلب رابط جديد محدود", async ({ page }) => {
    const email = await registerStudent(page);
    const link = await waitForMailLink(email, /https?:\/\/\S+\/verify-email\/confirm\?token=\S+/);
    await page.goto("/verify-email");
    await page.getByRole("button", { name: "إرسال رابط جديد" }).click();
    await expect(page.getByText("أرسلنا رابطًا جديدًا")).toBeVisible();
    await page.getByRole("button", { name: "إرسال رابط جديد" }).click();
    await expect(page.getByText("أرسلنا رابطًا قبل قليل")).toBeVisible();
    // الرابط الأول أبطله الجديد
    await page.goto(pathOf(link));
    await page.getByRole("button", { name: "تأكيد البريد" }).click();
    await expect(page.getByText("انتهت صلاحية الرابط أو سبق استخدامه")).toBeVisible();
  });

  test("بريد مكتوب خطأ: يبقى الحساب كما هو حتى يُفتح الرابط من العنوان الصحيح", async ({ page }) => {
    const typo = uniqueEmail("typo");
    const right = uniqueEmail("right");
    await registerStudent(page, { email: typo });
    await page.goto("/verify-email");
    await page.getByText("كتبت بريدك خطأ؟").click();
    await page.fill("#email", right);
    await page.fill("#currentPassword", STUDENT_PASSWORD);
    await page.getByRole("button", { name: "إرسال رابط إلى البريد الصحيح" }).click();
    await expect(page.getByText("لن يتغير بريد حسابك قبل فتح الرابط")).toBeVisible();
    await expect.poll(async () => (await db()<{ n: number }[]>`select count(*)::int as n from users where email = ${typo}`)[0].n).toBe(1);

    await expect(page.getByTestId("verify-target")).toHaveText(right);
    const link = await waitForMailLink(right, /https?:\/\/\S+\/verify-email\/confirm\?token=\S+/);
    await page.goto(pathOf(link));
    await page.getByRole("button", { name: "تأكيد البريد" }).click();
    await expect(page.getByTestId("email-confirmed")).toBeVisible();
    await expect.poll(async () => (await db()<{ n: number }[]>`select count(*)::int as n from users where email = ${right} and email_verified_at is not null`)[0].n).toBe(1);
  });

  test("من له طلب مدفوع حقيقي سابق لا يُطلب منه التأكيد", async ({ page }) => {
    const email = await registerStudent(page);
    const product = await productBySlug("g9-math-final-notes-t1");
    const id = await studentId(email);
    await db()`insert into orders (user_id, subtotal_fils, total_fils, status, is_test, paid_at, customer_name, customer_email) values (${id}, ${product.price_fils}, ${product.price_fils}, 'paid', false, now(), 'طالب', ${email})`;
    await openCheckout(page, "g9-english-final-notes-t1");
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByTestId("place-order")).toBeVisible();
  });
});
