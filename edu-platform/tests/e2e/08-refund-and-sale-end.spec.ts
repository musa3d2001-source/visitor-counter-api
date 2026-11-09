import { test, expect } from "@playwright/test";
import { checkoutAndPay, db, expectNoHorizontalOverflow, loginAdmin, newStudentPage, productBySlug } from "./helpers";

test.describe("استرداد الطلب كاملًا عبر البوابة", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "رحلة المالك مغطاة على الكمبيوتر"));

  test("أمر واحد من المالك: يُغلق الوصول، ويظهر في القائمة وعلى إيصال الطالب", async ({ page, browser }) => {
    const slug = "g9-science-final-notes-t1";
    const product = await productBySlug(slug);
    const { ctx, page: student } = await newStudentPage(browser);

    await student.goto(`/products/${slug}`);
    await student.getByTestId("add-to-cart").first().click();
    await expect(student.getByText("أضيفت إلى السلة").first()).toBeVisible();
    const orderId = await checkoutAndPay(student, "success");

    await expect(student.getByTestId("order-status")).toHaveText("مدفوع");
    await expect(student.getByTestId("receipt-method")).toHaveText("كي نت");
    await expect(student.getByTestId("receipt-invoice")).toHaveText(/^\d+$/);
    await expect(student.getByTestId("receipt-payment-id")).toHaveText(/^\d+$/);

    await loginAdmin(page);
    await page.goto(`/admin/orders/${orderId}`);
    // لا حقل مبلغ: الاسترداد دائمًا كامل قيمة الطلب
    await expect(page.locator('input[name="amount"]')).toHaveCount(0);
    await page.getByRole("button", { name: "استرداد كامل المبلغ" }).click();
    await page.getByLabel("سبب الاسترداد (إلزامي)").fill("طلب ولي الأمر");
    await page.getByRole("button", { name: "إرسال طلب الاسترداد" }).click();

    const row = page.getByTestId("refund-row");
    await expect(row).toHaveAttribute("data-status", "requested");
    await expect(row).toContainText("بانتظار تنفيذ البوابة");

    const [refund] = await db()<{ status: string; gateway_refund_id: string | null }[]>`select status, gateway_refund_id from refunds where order_id = ${orderId}`;
    expect(refund.status).toBe("requested");
    expect(refund.gateway_refund_id).toBeTruthy();
    const [order] = await db()<{ status: string; number: string }[]>`select status, number from orders where id = ${orderId}`;
    expect(order.status).toBe("refunded");

    await page.goto("/admin/orders");
    await expect(page.locator("#refund-queue").getByTestId("refund-row").filter({ hasText: order.number })).toHaveAttribute("data-status", "requested");

    await student.goto(`/orders/${orderId}`);
    await expect(student.getByTestId("order-refunded")).toBeVisible();
    await expect(student.getByTestId("receipt-refund-amount")).toContainText((product.price_fils / 1000).toFixed(3));
    await expect(student.getByTestId("receipt-refund-state")).toHaveText("قيد التنفيذ لدى بوابة الدفع");

    await student.goto("/library");
    await expect(student.getByText(product.title)).toHaveCount(0);

    const mails = await db()<{ template: string }[]>`
      select l.template from email_log l join users u on u.email = l.to_email join orders o on o.user_id = u.id
      where o.id = ${orderId} and l.template in ('order_confirmation', 'order_refund') order by l.created_at
    `;
    expect(mails.map((m) => m.template)).toEqual(["order_confirmation", "order_refund"]);
    await ctx.close();
  });
});

test.describe("منتج انتهى تاريخ إتاحته", () => {
  test("لا يُشترى، ويظهر ذلك للطالب وللمالك", async ({ page }, info) => {
    const slug = `ended-${info.project.name}-${Date.now()}`;
    await db()`
      insert into products (slug, type, title, grade_id, subject_id, academic_year, term, price_fils, status, published_at, access_mode, access_until)
      select ${slug}, type, ${`انتهى بيعه ${slug}`}, grade_id, subject_id, academic_year, term, price_fils, 'published', now(), 'until_date', now() - interval '1 day'
      from products where slug = 'g9-science-final-notes-t1'
    `;
    await page.goto(`/products/${slug}`);
    await expect(page.getByTestId("sale-ended-notice").first()).toBeVisible();
    await expect(page.getByTestId("add-to-cart")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    test.skip(info.project.name !== "desktop", "شاشة المالك مغطاة على الكمبيوتر");
    await loginAdmin(page);
    await page.goto(`/admin/products?q=${encodeURIComponent(slug)}`);
    await expect(page.getByTestId("admin-sale-ended").first()).toBeVisible();
  });
});
