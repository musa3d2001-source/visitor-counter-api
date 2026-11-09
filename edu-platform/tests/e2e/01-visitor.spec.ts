import { test, expect } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

/** (1) زائر يستعرض المواد + (12) القياسات + (13) اتجاه RTL والنصوص العربية */
test.describe("الزائر", () => {
  test("الصفحة الرئيسية عربية RTL وتعرض الصفوف", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "اختر صفك الدراسي" }).getByTestId("grade-picker")).toBeVisible();
    for (const g of ["الصف السادس", "الصف السابع", "الصف الثامن", "الصف التاسع"]) {
      await expect(page.locator("#grades").getByText(g, { exact: true })).toBeVisible();
    }
    // المرحلتان المخفيتان لا تظهران للطالب
    await expect(page.getByText("المرحلة الثانوية")).toHaveCount(0);
    const direction = await page.evaluate(() => getComputedStyle(document.body).direction);
    expect(direction).toBe("rtl");
    await expectNoHorizontalOverflow(page);
  });

  test("التصفح: الصف ← المادة ← المنتج مع مسار التنقل", async ({ page }) => {
    await page.goto("/");
    await page.locator("#grades").getByRole("link", { name: /الصف الثامن/ }).click();
    await expect(page).toHaveURL(/\/grades\/grade-8$/);
    await expect(page.getByRole("heading", { level: 1, name: "الصف الثامن" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("link", { name: /العلوم/ }).first().click();
    await expect(page).toHaveURL(/\/grades\/grade-8\/science/);
    await expect(page.getByRole("navigation", { name: "مسار التنقل" })).toContainText("الصف الثامن");
    await expect(page.getByRole("heading", { name: "المذكرات النهائية" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("link", { name: "المذكرة النهائية لمادة العلوم" }).first().click();
    await expect(page).toHaveURL(/\/products\//);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("المذكرة النهائية");
    await expect(page.getByText("3.000").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("(3) المعاينة المجانية تعمل بدون حساب", async ({ page }) => {
    await page.goto("/products/g6-arabic-final-notes-t1");
    await page.getByTestId("free-preview").click();
    await expect(page).toHaveURL(/\/preview\//);
    await expect(page.locator("#page-1 canvas")).toBeVisible();
    await expect(page.getByTestId("reader-pages")).toContainText("/ 2");
    // لا يوجد زر تنزيل في المعاينة
    await expect(page.getByTestId("reader-download")).toHaveCount(0);
  });

  test("المنتجات غير المنشورة والمسارات المحمية", async ({ page }) => {
    const res = await page.goto("/products/not-a-real-product");
    expect(res?.status()).toBe(404);
    await page.goto("/library");
    await expect(page).toHaveURL(/\/login\?next=%2Flibrary/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("SEO: robots و sitemap و Open Graph", async ({ page, request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Sitemap:");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/grades/grade-6");
    expect(sitemap).toContain("/products/");
    expect(sitemap).not.toContain("/library");
    await page.goto("/grades/grade-6");
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toContain("/grades/grade-6");
    await page.goto("/");
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/^http:\/\/localhost:\d+\/?$/);
  });
});
