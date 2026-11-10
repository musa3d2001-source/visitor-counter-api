import { test, expect } from "@playwright/test";
import { expectNoHorizontalOverflow, loginAdmin } from "./helpers";

/** صفحة صحة المنصة: ما لم يكتمل من المدفوعات، وزر المالك */
test.describe("مدفوعات لم يكتمل أثرها", () => {
  test("يرى المالك القسم ويضغط «افحص الآن» مرتين دون ضرر", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/admin/ops");
    const section = page.getByTestId("ops-unhealed-section");
    await expect(section).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const button = section.getByRole("button", { name: "افحص الآن" });
    await button.click();
    await expect(section.getByRole("status").or(section.getByRole("alert")).first()).toBeVisible({ timeout: 45_000 });
    await button.click();
    await expect(button).toBeEnabled({ timeout: 45_000 });
  });

  test("الطالب لا يصل إلى القسم", async ({ page }) => {
    const res = await page.goto("/admin/ops");
    expect(page.url()).not.toContain("/admin/ops");
    expect(res?.status()).toBeLessThan(500);
  });
});
