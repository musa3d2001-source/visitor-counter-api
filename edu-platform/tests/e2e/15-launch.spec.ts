import { test, expect } from "@playwright/test";
import { E2E_BUNNY, E2E_CRON_SECRET, E2E_OPS_ALERT_EMAIL, E2E_SERVER_ENV, E2E_WEBHOOK_SECRET } from "./e2e-env";
import { db, expectNoHorizontalOverflow, loginAdmin, newStudentPage } from "./helpers";

/**
 * صفحة خطوات الإطلاق على الخادم الإنتاجي الفعلي: الحكم، والتأشير اليدوي المحفوظ، وأنها للمالك وحده،
 * وأنها لا تطبع أي سر من متغيرات الخادم، وأنها تتسع للجوال.
 */
const step = (key: string) => `[data-testid="launch-step"][data-key="${key}"]`;

test("the owner sees every step and a verdict that is not ready, with no secret on the page", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin/launch");
  await expect(page.getByTestId("launch-page")).toBeVisible();
  await expect(page.getByTestId("launch-verdict")).toHaveAttribute("data-ready", "false");
  expect(await page.getByTestId("launch-step").count()).toBeGreaterThanOrEqual(30);
  // يكشفها النظام من بيئة هذا الخادم
  await expect(page.locator(step("cron_secret"))).toHaveAttribute("data-state", "done");
  await expect(page.locator(step("ops_alert_email"))).toHaveAttribute("data-state", "done");
  await expect(page.locator(step("payment_mode"))).toHaveAttribute("data-state", "open");
  await expect(page.locator(step("bunny_cdn_token"))).toHaveAttribute("data-blocking", "true");

  const html = await page.content();
  for (const secret of [E2E_WEBHOOK_SECRET, E2E_CRON_SECRET, E2E_SERVER_ENV.APP_SECRET, E2E_BUNNY.apiKey, E2E_BUNNY.tokenKey, E2E_BUNNY.readonlyKey, E2E_OPS_ALERT_EMAIL]) {
    expect(html).not.toContain(secret);
  }
  await expectNoHorizontalOverflow(page);
});

test.describe("manual ticks", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تكفي مرة واحدة على الكمبيوتر"));

  test("the owner ticks a step, it stays ticked after a reload, and can be reopened", async ({ page }) => {
    await db()`delete from launch_checks where key = 'restore_drill'`;
    await loginAdmin(page);
    await page.goto("/admin/launch");
    const row = page.locator("#step-restore_drill");
    await expect(page.locator(step("restore_drill"))).toHaveAttribute("data-state", "open");

    await row.getByRole("button", { name: "أنجزتها" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "نعم، أنجزتها" }).click();
    await expect(page.locator(step("restore_drill"))).toHaveAttribute("data-state", "done");
    await page.reload();
    await expect(page.locator(step("restore_drill"))).toHaveAttribute("data-state", "done");
    await expect(row.getByTestId("launch-step-tick")).toContainText("مدير الاختبار");

    await row.getByRole("button", { name: "إعادة فتح" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "إعادة الفتح" }).click();
    await expect(page.locator(step("restore_drill"))).toHaveAttribute("data-state", "open");

    const audits = await db()<{ action: string }[]>`select action from audit_logs where entity_type = 'launch_check' and entity_id = 'restore_drill' order by id`;
    expect(audits.map((a) => a.action)).toEqual(["launch.step_done", "launch.step_reopened"]);
  });

  test("the sidebar leads to the page", async ({ page }) => {
    await loginAdmin(page);
    await page.getByRole("link", { name: "خطوات الإطلاق" }).first().click();
    await expect(page).toHaveURL(/\/admin\/launch$/);
    await expect(page.getByTestId("launch-verdict")).toBeVisible();
  });

  test("a student cannot reach the page", async ({ browser }) => {
    const { page: student, ctx } = await newStudentPage(browser);
    const res = await student.goto("/admin/launch");
    expect(res?.status()).toBe(404);
    await ctx.close();
  });
});
