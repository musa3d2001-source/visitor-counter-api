import { test, expect, type Browser } from "@playwright/test";
import { asDistinctClient, db, expectNoHorizontalOverflow, loginAdmin, registerStudent, STUDENT_PASSWORD, uniqueEmail } from "./helpers";

/** خطوة ولي الأمر عند التسجيل، والجواب الموحد لبريد جديد ومسجل، وطلب الطالب حذف حسابه الذي ينتظر قرار المالك */
async function ownerPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await asDistinctClient(page);
  await loginAdmin(page);
  return { ctx, page };
}

test.describe("حسابات الطلاب", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === "ipad", "الرحلة نفسها مغطاة على الكمبيوتر والآيفون"));

  test("التسجيل يطلب الإقرار ويعطي الجواب نفسه، ثم يدخل بضغطة واحدة", async ({ page }) => {
    await asDistinctClient(page);
    const email = uniqueEmail("guardian");
    await page.goto("/register");
    await page.fill("#fullName", "طالب الإقرار");
    await page.fill("#email", email);
    await page.fill("#password", STUDENT_PASSWORD);
    await page.fill("#passwordConfirm", STUDENT_PASSWORD);
    await page.check("input[name=terms]");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(page.getByText("أكّد هذا الإقرار لتكمل")).toBeVisible();
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from users where email = ${email}`;
    expect(n).toBe(0);

    await page.check("input[name=guardianAccount]");
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();
    const done = page.getByTestId("register-done");
    await expect(done).toBeVisible();
    const fresh = await done.locator("[role=status]").first().innerText();
    expect((await page.context().cookies()).some((c) => c.name === "session")).toBe(false);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "ادخل إلى حسابك" }).click();
    await page.waitForURL(/\/library/);

    // البريد نفسه من جهاز آخر وبكلمة أخرى: الجواب حرفيًا هو نفسه، والدخول لا يتم
    const other = await page.context().browser()!.newContext();
    const stranger = await other.newPage();
    await asDistinctClient(stranger);
    await stranger.goto("/register");
    await stranger.fill("#fullName", "شخص آخر");
    await stranger.fill("#email", email);
    await stranger.fill("#password", "Another-Pass-77");
    await stranger.fill("#passwordConfirm", "Another-Pass-77");
    await stranger.check("input[name=terms]");
    await stranger.check("input[name=guardianAccount]");
    await stranger.getByRole("button", { name: "إنشاء الحساب" }).click();
    await expect(stranger.getByTestId("register-done").locator("[role=status]").first()).toHaveText(fresh);
    await other.close();
  });

  test("طلب حذف الحساب يصل المالك وينتظر قراره، والطالب يرى النتيجة", async ({ page, browser }) => {
    const email = await registerStudent(page);
    const [{ id }] = await db()<{ id: string }[]>`select id from users where email = ${email}`;
    await page.goto("/account");
    const row = page.getByTestId("data-request-delete");
    await row.getByRole("button", { name: "اطلب حذف حسابي" }).click();
    await expect(row.getByTestId("data-request-open")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const [{ status }] = await db()<{ status: string }[]>`select status from account_data_requests where user_id = ${id}`;
    expect(status).toBe("open");

    const owner = await ownerPage(browser);
    await owner.page.goto("/admin");
    await expect(owner.page.getByRole("link", { name: /تنتظر قرارك/ }).first()).toBeVisible();
    await owner.page.goto("/admin/students");
    await expect(owner.page.getByTestId("open-data-requests")).toContainText(email);
    await expectNoHorizontalOverflow(owner.page);
    await owner.page.goto(`/admin/students/${id}#data-requests`);
    const panel = owner.page.getByTestId("student-data-requests");
    await panel.getByRole("button", { name: "رفض" }).click();
    await owner.page.getByRole("alertdialog").locator("textarea[name=reason]").fill("لديه طلب لم يكتمل");
    await owner.page.getByRole("alertdialog").getByRole("button", { name: "رفض الطلب" }).click();
    await expect(owner.page.getByRole("alertdialog")).toHaveCount(0);
    const [audit] = await db()<{ n: number }[]>`select count(*)::int as n from audit_logs where action = 'data_request.closed' and entity_id = ${id}`;
    expect(audit.n).toBe(1);
    await owner.ctx.close();

    await page.goto("/account");
    await expect(page.getByTestId("data-request-history")).toContainText("لديه طلب لم يكتمل");
    await expect(page.getByRole("button", { name: "اطلب حذف حسابي" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
