import { test, expect } from "@playwright/test";
import { db, loginAdmin, newStudentPage, productBySlug } from "./helpers";

/** طالب يدفع الفاتورتين القديمة والجديدة ← تُسجل الثانية ولا تضيع ← المالك يستردها وحدها */
test.describe("دفعة ثانية على طلب مدفوع", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "رحلة المالك مغطاة على الكمبيوتر"));

  test("تُسجل وتظهر للمالك، ويستردها دون المساس بالطلب أو الوصول", async ({ page, browser }) => {
    const slug = "g9-science-final-notes-t1";
    const product = await productBySlug(slug);
    const { ctx, page: student } = await newStudentPage(browser);

    await student.goto(`/products/${slug}`);
    await student.getByTestId("add-to-cart").first().click();
    await expect(student.getByText("أضيفت إلى السلة").first()).toBeVisible();

    await student.goto("/checkout");
    await student.getByTestId("guardian-declaration").check();
    await student.getByTestId("place-order").click();
    await student.waitForURL(/\/pay\//);
    const firstInvoiceUrl = student.url();
    const firstInvoice = firstInvoiceUrl.split("/pay/")[1].split("?")[0];

    // انتهى الرابط عندنا فقط: يبقى مفتوحًا عند البوابة، وهذا ما يجعل الدفعة الثانية ممكنة
    await db()`update payments set expires_at = now() - interval '1 hour' where gateway_invoice_id = ${firstInvoice}`;
    const [{ order_id: orderId }] = await db()<{ order_id: string }[]>`select order_id from payments where gateway_invoice_id = ${firstInvoice}`;

    await student.goto(`/orders/${orderId}`);
    await student.getByRole("button", { name: "إكمال الدفع" }).click();
    await student.waitForURL((u) => u.pathname.includes("/pay/") && !u.pathname.endsWith(`/${firstInvoice}`));
    await student.getByTestId("sim-pay-success").click();
    await student.waitForURL(/\/orders\//);
    await expect(student.getByTestId("order-status")).toHaveText("مدفوع");

    await student.goto(firstInvoiceUrl);
    await student.getByTestId("sim-pay-success").click();
    await student.waitForURL(/\/orders\//);
    await expect(student.getByTestId("order-status")).toHaveText("مدفوع");
    await student.reload();
    await expect(student.getByText("وصلتنا دفعة أخرى على هذا الطلب")).toBeVisible();

    const entitlementsBefore = await db()`select id, revoked_at from entitlements where order_id = ${orderId} order by id`;
    expect(entitlementsBefore).toHaveLength(1);

    await loginAdmin(page);
    await page.getByRole("link", { name: /عرض الدفعات/ }).click();
    await page.waitForURL(/\/admin\/orders/);
    const row = page.getByTestId("extra-payment").filter({ hasText: firstInvoice });
    await expect(row).toContainText("دفعة ثانية على طلب مدفوع");
    await expect(row).toContainText("بانتظار قرارك");

    await row.getByRole("button", { name: "استرداد هذه الدفعة" }).click();
    await page.getByLabel("سبب الاسترداد (إلزامي)").fill("دفعة مكررة من الطالب");
    await page.getByRole("button", { name: "إرسال طلب الاسترداد" }).click();

    await expect(page.getByTestId("extra-payment").filter({ hasText: firstInvoice })).toContainText("أُرسل للبوابة");

    const [extra] = await db()<{ state: string; gateway_refund_id: string | null }[]>`
      select e.state, e.gateway_refund_id from payment_extras e join payments p on p.id = e.payment_id where p.gateway_invoice_id = ${firstInvoice}
    `;
    expect(extra.state).toBe("refund_requested");
    expect(extra.gateway_refund_id).toBeTruthy();

    const [order] = await db()<{ status: string }[]>`select status from orders where id = ${orderId}`;
    expect(order.status).toBe("paid");
    expect(await db()`select id, revoked_at from entitlements where order_id = ${orderId} order by id`).toEqual(entitlementsBefore);
    const [{ n: refunds }] = await db()<{ n: number }[]>`select count(*)::int as n from refunds where order_id = ${orderId}`;
    expect(refunds).toBe(0);

    await student.goto("/library");
    await expect(student.getByTestId("library-items")).toContainText(product.title);
    await ctx.close();
  });
});
