import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { checkoutAndPay, db, loginAdmin, registerStudent } from "./helpers";

/**
 * الاختبار الحاسم (تعريف الإنجاز):
 * المدير يضيف مذكرة PDF ويحدد صفها ومادتها وسعرها وينشرها ← تظهر للطالب ← يعاينها ← يضيفها للسلة
 * ← يسدد عبر بيئة الاختبار ← يتأكد الدفع ← تظهر في مكتبته ← يفتحها ← لا يصل إليها غير المصرح له.
 * ثم: (9) رفع ونشر  (10) تعديل السعر وإخفاء المنتج — مع بقاء وصول المشتري.
 */
test.describe("رحلة المدير والطالب الكاملة", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "تُشغَّل على الكمبيوتر"));

  test("إضافة مذكرة ← نشر ← شراء ← قراءة ← تعديل السعر ← إخفاء", async ({ page, browser }) => {
    test.setTimeout(180_000);
    // ملف PDF حقيقي للرفع (5 صفحات)
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 5; i++) pdf.addPage([595, 842]).drawText(`E2E admin upload - page ${i}`, { x: 60, y: 760, size: 20, font });
    const dir = resolve(__dirname, "../.tmp");
    mkdirSync(dir, { recursive: true });
    const pdfPath = join(dir, "admin-upload.pdf");
    writeFileSync(pdfPath, await pdf.save());

    const [ids] = await db()<{ grade_id: string; subject_id: string }[]>`
      select g.id as grade_id, s.id as subject_id from grades g join subjects s on s.grade_id = g.id
      where g.level = 7 and s.slug = 'islamic'
    `;
    const title = `مذكرة المدير التجريبية ${Date.now()}`;

    // ---------- المدير ينشئ المنتج ----------
    await loginAdmin(page);
    await page.goto("/admin/products/new");
    await page.selectOption("#gradeId", ids.grade_id);
    await page.selectOption("#subjectId", ids.subject_id);
    await page.selectOption("#type", "review_notes");
    await page.fill("#title", title);
    await page.fill("#price", "2.750");
    await page.getByRole("button", { name: "حفظ كمسودة ومتابعة الرفع" }).click();
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}/);
    const productId = page.url().match(/products\/([0-9a-f-]{36})/)![1];

    // لا يمكن النشر قبل رفع الملف
    const [draft] = await db()<{ status: string; slug: string; price_fils: number }[]>`select status, slug, price_fils from products where id = ${productId}`;
    expect(draft.status).toBe("draft");
    expect(draft.price_fils).toBe(2750);
    expect((await page.request.get(`/products/${draft.slug}`)).status()).toBe(200); // المدير يرى المسودة
    const anonCtx = await browser.newContext();
    expect((await anonCtx.request.get(`${new URL(page.url()).origin}/products/${draft.slug}`)).status()).toBe(404);

    // رفع الملف مع مؤشر التقدم
    await page.getByTestId("upload-main").setInputFiles(pdfPath);
    await expect(page.getByRole("textbox", { name: "اسم الملف" })).toHaveCount(1, { timeout: 30_000 });
    await expect
      .poll(async () => (await db()`select count(*)::int as n from product_files where product_id = ${productId} and kind = 'preview' and is_auto_preview`)[0].n)
      .toBe(1);
    const [mainFile] = await db()<{ id: string; page_count: number }[]>`select id, page_count from product_files where product_id = ${productId} and kind = 'main'`;
    expect(mainFile.page_count).toBe(5);

    // النشر
    await page.getByRole("button", { name: "نشر للطلاب" }).click();
    await expect(page.getByRole("button", { name: "إخفاء عن الطلاب" })).toBeVisible();
    const [pub] = await db()<{ status: string; slug: string }[]>`select status, slug from products where id = ${productId}`;
    expect(pub.status).toBe("published");

    // ---------- الطالب: يجد المنتج ← يعاين ← يشتري ← يقرأ ----------
    const studentCtx = await browser.newContext();
    const student = await studentCtx.newPage();
    await registerStudent(student);
    await student.goto("/grades/grade-7/islamic");
    await student.getByRole("link", { name: title }).click();
    await expect(student.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(student.getByText("2.750").first()).toBeVisible();
    await student.getByTestId("free-preview").click();
    await expect(student.locator("#page-1 canvas")).toBeVisible();
    await student.goBack();
    await student.getByTestId("add-to-cart").first().click();
    await expect(student.getByText("أضيفت إلى السلة").first()).toBeVisible();
    await checkoutAndPay(student, "success");
    await expect(student.getByText("تم الدفع بنجاح")).toBeVisible();
    await student.getByTestId("go-library").click();
    await expect(student.getByTestId("library-items")).toContainText(title);
    await student.getByTestId("open-file").first().click();
    await expect(student.locator("#page-1 canvas")).toBeVisible();
    await expect(student.getByTestId("reader-pages")).toContainText("/ 5");

    // غير المصرح له لا يصل
    expect((await anonCtx.request.get(`${new URL(page.url()).origin}/api/files/${mainFile.id}`, { headers: { "x-reader": "1" } })).status()).toBe(401);
    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await registerStudent(other);
    expect((await other.request.get(`/api/files/${mainFile.id}`, { headers: { "x-reader": "1" } })).status()).toBe(403);

    // ---------- المدير: تعديل السعر ----------
    await page.reload();
    await page.fill("#price", "3.250");
    await page.getByRole("button", { name: "حفظ التعديلات" }).click();
    await expect.poll(async () => (await db()`select price_fils from products where id = ${productId}`)[0].price_fils).toBe(3250);
    await other.goto(`/products/${pub.slug}`);
    await expect(other.getByText("3.250").first()).toBeVisible();
    // سعر الطلب السابق لا يتغير
    const [paidItem] = await db()<{ unit_price_fils: number }[]>`select unit_price_fils from order_items where product_id = ${productId}`;
    expect(paidItem.unit_price_fils).toBe(2750);

    // ---------- المدير: إخفاء المنتج ----------
    await page.getByRole("button", { name: "إخفاء عن الطلاب" }).click();
    await expect(page.getByRole("button", { name: "نشر للطلاب" })).toBeVisible();
    expect((await anonCtx.request.get(`${new URL(page.url()).origin}/products/${pub.slug}`)).status()).toBe(404);
    await other.goto("/grades/grade-7/islamic");
    await expect(other.getByRole("link", { name: title })).toHaveCount(0);
    // المشتري يحتفظ بالوصول
    await student.goto("/library");
    await expect(student.getByTestId("library-items")).toContainText(title);
    expect((await student.request.get(`/api/files/${mainFile.id}`, { headers: { "x-reader": "1" } })).status()).toBe(200);

    // سجل التدقيق
    const actions = (await db()<{ action: string }[]>`select action from audit_logs where entity_id = ${productId}`).map((r) => r.action);
    expect(actions.length).toBeGreaterThanOrEqual(3);

    await Promise.all([anonCtx.close(), studentCtx.close(), otherCtx.close()]);
  });
});
