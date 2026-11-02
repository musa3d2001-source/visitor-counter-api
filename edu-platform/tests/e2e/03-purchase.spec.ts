import { test, expect } from "@playwright/test";
import { checkoutAndPay, db, mainFileId, newStudentPage, productBySlug, registerStudent } from "./helpers";
import { E2E_BASE_URL } from "./e2e-env";

/**
 * (4) شراء مذكرة في بيئة الاختبار  (5) نجاح الدفع ومنح الصلاحية
 * (6) فشل الدفع دون منح الملفات    (7) وصول Webhook مرتين دون تكرار
 * (8) طالب يحاول فتح ملف اشتراه طالب آخر  (11) شراء باقة تحتوي منتجات متعددة
 * الدفع يتم عبر محاكي MyFatoorah المحلي (بديل اختبار مطابق للعقد الرسمي)
 */
test.describe("الشراء والدفع", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({}, info) => test.skip(info.project.name === "ipad", "الرحلة نفسها مغطاة على الكمبيوتر والآيفون"));

  test("شراء ناجح: الدفع ← التحقق من الخادم ← المكتبة ← القارئ", async ({ page }, info) => {
    const slug = info.project.name === "iphone" ? "g9-english-final-notes-t1" : "g9-math-final-notes-t1";
    const product = await productBySlug(slug);
    const email = await registerStudent(page);
    await page.goto(`/products/${slug}`);
    await page.getByTestId("add-to-cart").first().click();
    await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();
    await page.goto("/cart");
    await expect(page.getByTestId("cart-lines")).toContainText(product.title);

    const orderId = await checkoutAndPay(page, "success");
    await expect(page.getByText("تم الدفع بنجاح")).toBeVisible();
    await expect(page.getByTestId("order-status")).toHaveText("مدفوع");
    await expect(page.getByText("طلب تجريبي")).toBeVisible();

    await page.getByTestId("go-library").click();
    await expect(page.getByTestId("library-items")).toContainText(product.title);
    await page.getByTestId("open-file").first().click();
    await expect(page.locator("#page-1 canvas")).toBeVisible();

    // Webhook وصل مرتين (المحاكي يرسل نسخة مكررة) — لا تكرار في الطلب أو الصلاحية
    await expect
      .poll(async () => (await db()`select count(*)::int as n from payment_events where result is not null`)[0].n, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const [{ n: ents }] = await db()<{ n: number }[]>`
      select count(*)::int as n from entitlements e join users u on u.id = e.user_id where u.email = ${email} and e.product_id = ${product.id}
    `;
    expect(ents).toBe(1);
    const [order] = await db()<{ status: string; is_test: boolean }[]>`select status, is_test from orders where id = ${orderId}`;
    expect(order.status).toBe("paid");
    expect(order.is_test).toBe(true);
    const [{ n: paidPayments }] = await db()<{ n: number }[]>`select count(*)::int as n from payments where order_id = ${orderId} and status = 'paid'`;
    expect(paidPayments).toBe(1);
    const dup = await db()<{ result: string }[]>`
      select pe.result from payment_events pe
      where pe.payload->'Data'->'Invoice'->>'Id' = (select gateway_invoice_id from payments where order_id = ${orderId} limit 1)
    `;
    // حدث واحد مسجّل لكل توقيع؛ النسخة المكررة تُتجاهل
    expect(dup.length).toBe(1);
  });

  test("فشل الدفع لا يمنح أي صلاحية", async ({ page }) => {
    const product = await productBySlug("g9-science-final-notes-t1");
    const email = await registerStudent(page);
    await page.goto(`/products/${product.slug}`);
    await page.getByTestId("add-to-cart").first().click();
    await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();
    const orderId = await checkoutAndPay(page, "fail");
    await expect(page.getByTestId("payment-failed")).toBeVisible();
    await expect(page.getByTestId("order-status")).toHaveText("فشل الدفع");

    const [{ n }] = await db()<{ n: number }[]>`
      select count(*)::int as n from entitlements e join users u on u.id = e.user_id where u.email = ${email}
    `;
    expect(n).toBe(0);
    await page.goto("/library");
    await expect(page.getByText("مكتبتك فارغة حاليًا")).toBeVisible();
    const fileId = await mainFileId(product.id);
    const res = await page.request.get(`/api/files/${fileId}`, { headers: { "x-reader": "1" } });
    expect(res.status()).toBe(403);
    const [order] = await db()<{ status: string }[]>`select status from orders where id = ${orderId}`;
    expect(order.status).toBe("failed");
    // صفحة الطلب تتيح إعادة المحاولة
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByRole("button", { name: "إعادة محاولة الدفع" })).toBeVisible();
  });

  test("لا يمكن فتح ملف اشتراه طالب آخر (IDOR)", async ({ page, browser }) => {
    const product = await productBySlug("g8-math-final-notes-t1");
    await registerStudent(page);
    await page.goto(`/products/${product.slug}`);
    await page.getByTestId("buy-now").first().click();
    await page.waitForURL(/\/checkout/);
    await checkoutAndPay(page, "success");
    await expect(page.getByText("تم الدفع بنجاح")).toBeVisible();
    const fileId = await mainFileId(product.id);
    // المالك يصل
    expect((await page.request.get(`/api/files/${fileId}`, { headers: { "x-reader": "1" } })).status()).toBe(200);

    // طالب آخر
    const other = await newStudentPage(browser);
    const res = await other.page.request.get(`/api/files/${fileId}`, { headers: { "x-reader": "1" } });
    expect(res.status()).toBe(403);
    await other.page.goto(`/read/${fileId}`);
    await expect(other.page.getByText("لا تملك صلاحية فتح هذا الملف")).toBeVisible();
    // زائر بلا حساب
    const anon = await browser.newContext();
    expect((await anon.request.get(`${E2E_BASE_URL}/api/files/${fileId}`, { headers: { "x-reader": "1" } })).status()).toBe(401);
    await anon.close();
    await other.ctx.close();
  });

  test("شراء باقة يمنح كل المذكرات بداخلها", async ({ page }) => {
    const bundle = await productBySlug("g7-final-bundle-t1");
    const items = await db()<{ title: string }[]>`
      select p.title from bundle_items bi join products p on p.id = bi.product_id where bi.bundle_id = ${bundle.id}
    `;
    expect(items.length).toBeGreaterThan(1);
    await registerStudent(page);
    // إضافة مذكرة ثم الباقة التي تحتويها ← تُزال المذكرة من السلة تلقائيًا
    await page.goto("/products/g7-arabic-final-notes-t1");
    await page.getByTestId("add-to-cart").first().click();
    await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();
    await page.goto(`/products/${bundle.slug}`);
    await page.getByTestId("add-to-cart").first().click();
    await expect(page.getByText("أزلنا المحتويات المضمّنة فيها").first()).toBeVisible();
    await page.goto("/checkout");
    await expect(page.getByTestId("checkout-total")).toContainText((bundle.price_fils / 1000).toFixed(3));
    await checkoutAndPay(page, "success");
    await expect(page.getByText("تم الدفع بنجاح")).toBeVisible();
    await page.goto("/library");
    for (const it of items) await expect(page.getByTestId("library-items")).toContainText(it.title);
  });

  test("كوبون خصم يُحتسب من الخادم", async ({ page }) => {
    await db()`insert into coupons (code, kind, value, max_per_user) values ('E2E20', 'percent', 20, 1) on conflict do nothing`;
    await registerStudent(page);
    await page.goto("/products/g6-math-exam-model-t1");
    await page.getByTestId("buy-now").first().click();
    await page.waitForURL(/\/checkout/);
    await page.fill("input[name=coupon]", "E2E20");
    await page.getByRole("button", { name: "تطبيق" }).click();
    await expect(page.getByText("تم تطبيق الخصم بنجاح")).toBeVisible();
    await expect(page.getByTestId("checkout-total")).toContainText("1.600");
    await page.goto("/checkout?coupon=NOPE123");
    await expect(page.getByText("كود الخصم غير صحيح أو غير مفعّل")).toBeVisible();
  });
});
