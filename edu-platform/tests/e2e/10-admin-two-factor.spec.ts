import { test, expect, type Browser, type Page } from "@playwright/test";
import { hashPassword } from "../../src/server/auth/password-core";
import { base32Decode, hotp, timeStep } from "../../src/server/auth/two-factor-core";
import { E2E_TWO_FACTOR_BASE_URL } from "./e2e-env";
import { asDistinctClient, checkoutAndPay, db, expectNoHorizontalOverflow, newStudentPage, uniqueEmail } from "./helpers";

/**
 * المسار الإلزامي من أوله إلى آخره، على خادم إنتاج ADMIN_2FA_REQUIRED فيه غير مضبوط (الافتراضي الحقيقي).
 * حساب مدير خاص بهذا الملف: قاعدة البيانات مشتركة مع بقية الرحلات، ومديرها يبقى بلا تحقق.
 */
test.use({ baseURL: E2E_TWO_FACTOR_BASE_URL });
test.describe.configure({ mode: "serial" });

const PASSWORD = "Owner-Two-Factor-Pass-2026";

async function createAdmin() {
  const email = uniqueEmail("owner-2fa");
  await db()`insert into users (email, password_hash, full_name, role, email_verified_at) values (${email}, ${await hashPassword(PASSWORD)}, 'مالك التحقق', 'admin', now())`;
  const [row] = await db()<{ id: string }[]>`select id from users where email = ${email}`;
  return { email, id: row.id };
}

async function fillPassword(page: Page, email: string, next = "/admin") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
}

/** أقرب خطوة لم تُقبل بعد: الخادم يرفض كل خطوة ليست بعد آخر خطوة مقبولة، ويقبل خطوة واحدة في المستقبل */
async function nextCode(userId: string, secret: Buffer): Promise<string> {
  for (;;) {
    const [row] = await db()<{ last_used_step: string | null }[]>`select last_used_step from user_totp where user_id = ${userId}`;
    const current = timeStep(Date.now());
    const step = Math.max(Number(row.last_used_step ?? 0) + 1, current);
    if (step <= current + 1) return hotp(secret, step);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function notAValidCode(secret: Buffer) {
  const step = timeStep(Date.now());
  const valid = new Set([-1, 0, 1, 2].map((d) => hotp(secret, step + d)));
  for (let n = 0; ; n++) {
    const candidate = String(n).padStart(6, "0");
    if (!valid.has(candidate)) return candidate;
  }
}

async function freshContext(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await asDistinctClient(page);
  return { ctx, page };
}

const sessionCount = async (userId: string) => (await db()<{ n: number }[]>`select count(*)::int as n from sessions where user_id = ${userId}`)[0].n;

test.describe("التحقق بخطوتين الإلزامي للمالك", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "رحلة المالك مغطاة على الكمبيوتر، والقياسات داخلها"));

  test("من أول دخول حتى استرداد برمز", async ({ page, browser }) => {
    const owner = await createAdmin();
    await asDistinctClient(page);

    // كلمة المرور وحدها تقود إلى التسجيل، ولا يفتح شيء آخر في اللوحة
    await fillPassword(page, owner.email);
    await page.waitForURL("**/two-factor/setup");
    for (const path of ["/admin", "/admin/orders", "/admin/security", "/admin/settings", "/admin/students/shared-access"]) {
      await page.goto(path);
      await expect(page, `${path} يجب أن يعود إلى التسجيل`).toHaveURL(/\/two-factor\/setup$/);
    }
    const denied = await page.goto("/library");
    expect(denied?.status()).toBeLessThan(500);
    await expect(page).not.toHaveURL(/\/library/);

    // الشاشة: QR مرسوم في الصفحة، ومفتاح يدوي، ورابط
    await page.goto("/two-factor/setup");
    await expect(page.getByTestId("totp-qr")).toBeVisible();
    await expect(page.getByTestId("totp-otpauth-link")).toHaveAttribute("href", /^otpauth:\/\/totp\//);
    const manualKey = (await page.getByTestId("totp-manual-key").textContent())!.replace(/\s/g, "");
    const secret = base32Decode(manualKey);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1366, height: 900 });

    // رمز خاطئ لا يفعّل شيئًا
    await page.getByTestId("two-factor-code").fill(notAValidCode(secret));
    await page.getByTestId("two-factor-submit").click();
    await expect(page.getByText("الرمز غير صحيح")).toBeVisible();
    expect(await db()`select 1 from user_totp where user_id = ${owner.id} and enabled_at is not null`).toHaveLength(0);

    // رمز صحيح: عشرة رموز استرداد تظهر مرة واحدة، والصفحة لا تعاد تحميلها فتضيع
    await page.getByTestId("two-factor-code").fill(hotp(secret, timeStep(Date.now())));
    await page.getByTestId("two-factor-submit").click();
    const codes = page.getByTestId("recovery-codes").locator("li");
    await expect(codes).toHaveCount(10);
    const recovery = (await codes.allTextContents()).map((c) => c.trim());
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.getByTestId("recovery-codes-done").click();
    await page.waitForURL("**/admin");

    // صفحة الأمان
    await page.goto("/admin/security");
    await expect(page.getByTestId("two-factor-status")).toHaveAttribute("data-enabled", "true");
    await expect(page.getByTestId("recovery-remaining")).toContainText("١٠");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1366, height: 900 });

    // دخول جديد: كلمة المرور لا تفتح جلسة
    const second = await freshContext(browser);
    const before = await sessionCount(owner.id);
    await fillPassword(second.page, owner.email, "/admin/orders");
    await second.page.waitForURL(/\/login\/two-factor/);
    expect(await sessionCount(owner.id)).toBe(before);
    await expect(second.page.getByTestId("two-factor-login-form")).toBeVisible();
    for (const width of [390, 1440]) {
      await second.page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(second.page);
    }
    await second.page.setViewportSize({ width: 1366, height: 900 });
    const challengeUrl = second.page.url();
    await second.page.goto("/admin/orders");
    await expect(second.page).toHaveURL(/\/login\?next=/);
    await second.page.goto(challengeUrl);

    await second.page.getByTestId("two-factor-code").fill(notAValidCode(secret));
    await second.page.getByTestId("two-factor-submit").click();
    await expect(second.page.getByText("الرمز غير صحيح")).toBeVisible();
    expect(await sessionCount(owner.id)).toBe(before);

    await second.page.getByTestId("two-factor-code").fill(await nextCode(owner.id, secret));
    await second.page.getByTestId("two-factor-submit").click();
    await second.page.waitForURL("**/admin/orders");
    expect(await sessionCount(owner.id)).toBe(before + 1);
    await second.ctx.close();

    // دخول برمز استرداد، ولا يعمل الرمز نفسه مرة ثانية
    const third = await freshContext(browser);
    await fillPassword(third.page, owner.email);
    await third.page.waitForURL(/\/login\/two-factor/);
    await third.page.getByTestId("two-factor-toggle-recovery").click();
    await third.page.getByTestId("two-factor-code").fill(recovery[0]);
    await third.page.getByTestId("two-factor-submit").click();
    await third.page.waitForURL("**/admin");
    await third.ctx.close();

    const fourth = await freshContext(browser);
    await fillPassword(fourth.page, owner.email);
    await fourth.page.waitForURL(/\/login\/two-factor/);
    await fourth.page.getByTestId("two-factor-code").fill(recovery[0]);
    await fourth.page.getByTestId("two-factor-submit").click();
    await expect(fourth.page.getByText("الرمز غير صحيح")).toBeVisible();
    await fourth.ctx.close();

    // أمر الاسترداد يحتاج رمزًا، والرمز الخاطئ لا يصل إلى البوابة
    const { ctx: studentCtx, page: student } = await newStudentPage(browser);
    await student.goto("/products/g9-science-final-notes-t1");
    await student.getByTestId("add-to-cart").first().click();
    await expect(student.getByText("أضيفت إلى السلة").first()).toBeVisible();
    const orderId = await checkoutAndPay(student, "success");
    await studentCtx.close();

    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByTestId("step-up-off-note")).toHaveCount(0);
    await page.getByRole("button", { name: "استرداد كامل المبلغ" }).click();
    await page.getByLabel("سبب الاسترداد (إلزامي)").fill("طلب ولي الأمر");
    await page.getByTestId("step-up-code").fill(notAValidCode(secret));
    await page.getByRole("button", { name: "إرسال طلب الاسترداد" }).click();
    await expect(page.getByText("الرمز غير صحيح")).toBeVisible();
    expect(await db()`select 1 from refunds where order_id = ${orderId}`).toHaveLength(0);

    await page.getByTestId("step-up-code").fill(recovery[1]);
    await page.getByRole("button", { name: "إرسال طلب الاسترداد" }).click();
    await expect(page.getByTestId("refund-row")).toHaveAttribute("data-status", "requested");
    const [refund] = await db()<{ gateway_refund_id: string | null }[]>`select gateway_refund_id from refunds where order_id = ${orderId}`;
    expect(refund.gateway_refund_id).toBeTruthy();

    await page.goto("/admin/security");
    await expect(page.getByTestId("recovery-remaining")).toContainText("٨");

    // رموز جديدة: تظهر مرة واحدة، وتختفي فعلًا عند «حفظتها»
    await page.getByTestId("regenerate-code").fill(recovery[2]);
    await page.getByTestId("regenerate-submit").click();
    await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
    await page.getByTestId("recovery-codes-done").click();
    await expect(page.getByTestId("recovery-codes")).toHaveCount(0);
    await expect(page.getByTestId("regenerate-recovery-form")).toBeVisible();
    await expect(page.getByTestId("recovery-remaining")).toContainText("١٠");

    // مؤشر العناوين للمالك، وللقياسين
    await page.goto("/admin/students/shared-access");
    await expect(page.getByText("وليس دليلًا")).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
    }
  });

  test("الطالب لا يرى صفحات الأمان ولا مؤشر العناوين", async ({ browser }) => {
    const { ctx, page } = await newStudentPage(browser);
    for (const path of ["/admin/security", "/admin/students/shared-access"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
    const setup = await page.goto("/two-factor/setup");
    expect(setup?.status()).toBe(404);
    await ctx.close();
  });
});
