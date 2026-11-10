import { test, expect } from "@playwright/test";
import { db, expectNoHorizontalOverflow, login, registerStudent, STUDENT_PASSWORD, uniqueEmail, waitForMailLink } from "./helpers";
import { E2E_MAIL_BASE_URL } from "./e2e-env";

/** (2) إنشاء حساب + تسجيل الدخول + استعادة كلمة المرور + حماية لوحة الإدارة */
test.describe("الحسابات", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تكفي مرة واحدة على الكمبيوتر"));

  test("إنشاء حساب ثم الخروج والدخول", async ({ page }) => {
    const email = await registerStudent(page);
    await expect(page).toHaveURL(/\/library/);
    await expect(page.getByRole("heading", { name: "مكتبتي" })).toBeVisible();
    await page.goto("/account");
    await page.getByRole("button", { name: "تسجيل الخروج" }).click();
    await expect(page).toHaveURL("/");
    await login(page, email, STUDENT_PASSWORD);
    await expect(page.getByRole("heading", { name: "مكتبتي" })).toBeVisible();
  });

  test("بريد مكرر لا يكشف شيئًا، وكلمة مرور خاطئة", async ({ page }) => {
    const email = await registerStudent(page);
    await page.context().clearCookies();
    await page.goto("/register");
    await page.fill("#fullName", "طالب");
    await page.fill("#email", email);
    await page.fill("#password", "Another-Pass-77");
    await page.fill("#passwordConfirm", "Another-Pass-77");
    await page.check("input[name=terms]");
    await page.check("input[name=guardianAccount]");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    // لا يكشف أن البريد مسجل: الجواب نفسه، ولا جلسة تُفتح
    await expect(page.getByTestId("register-done")).toBeVisible();
    await expect(page.getByText("هذا البريد مسجل مسبقًا")).toHaveCount(0);
    expect((await page.context().cookies()).some((c) => c.name === "session")).toBe(false);

    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", "wrong-password");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.getByText("البريد الإلكتروني أو كلمة المرور غير صحيحة")).toBeVisible();
  });

  test("تحديد محاولات تسجيل الدخول", async ({ page }) => {
    const email = await registerStudent(page);
    await page.context().clearCookies();
    for (let i = 0; i < 6; i++) {
      await page.goto("/login");
      await page.fill("#email", email);
      await page.fill("#password", `wrong-${i}`);
      await page.getByRole("button", { name: "تسجيل الدخول" }).click();
      await page.getByRole("alert").first().waitFor();
    }
    await expect(page.getByText("تم إيقاف تسجيل الدخول مؤقتًا")).toBeVisible();
  });

  test("والبريد غير مفعّل: صفحة الاستعادة لا تعد برسالة لن تصل", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByTestId("recovery-mail-off")).toBeVisible();
    await expect(page.locator("#email")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("الطالب لا يصل إلى لوحة الإدارة", async ({ page }) => {
    await registerStudent(page, { email: uniqueEmail() });
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
    const api = await page.request.post("/api/admin/uploads/init", { data: { kind: "pdf" }, headers: { origin: page.url().split("/admin")[0] } });
    expect([401, 403, 404]).toContain(api.status());
  });
});

// الرابط لم يعد يُحفظ خامًا في email_log، فيُقرأ من الرسالة التي وصلت فعلًا إلى خادم SMTP
test.describe("استعادة كلمة المرور عبر البريد", () => {
  test.use({ baseURL: E2E_MAIL_BASE_URL });
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تكفي مرة واحدة على الكمبيوتر"));

  test("استعادة كلمة المرور عبر رابط البريد", async ({ page }) => {
    const email = await registerStudent(page);
    await page.context().clearCookies();
    await page.goto("/forgot-password");
    await page.fill("#email", email);
    await page.getByRole("button", { name: "إرسال رابط الاستعادة" }).click();
    await expect(page.getByText("إذا كان البريد مسجلًا لدينا")).toBeVisible();
    const link = await waitForMailLink(email, /https?:\/\/\S+reset-password\?token=\S+/);
    const [row] = await db()<{ body: string | null }[]>`select body from email_log where to_email = ${email} and template = 'password_reset' order by id desc limit 1`;
    expect(row.body).toBeNull();
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await page.fill("#password", "Brand-New-Pass-1");
    await page.fill("#passwordConfirm", "Brand-New-Pass-1");
    await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    await login(page, email, "Brand-New-Pass-1");
    // الرابط لا يُستخدم مرتين
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await page.fill("#password", "Another-Pass-22");
    await page.fill("#passwordConfirm", "Another-Pass-22");
    await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();
    await expect(page.getByText("انتهت صلاحية الرابط أو سبق استخدامه")).toBeVisible();
  });
});
