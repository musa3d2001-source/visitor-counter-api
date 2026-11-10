import { test, expect, type Page } from "@playwright/test";
import { checkoutAndPay, db, expectNoHorizontalOverflow, registerStudent } from "./helpers";

/** رسائل ما بعد الدفع على الخادم الإنتاجي: ثابتة، لا تكشف طلبًا لغير صاحبه، وسليمة على الجوال والكمبيوتر */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

async function shot(page: Page, name: string) {
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: false });
}

test.describe("messages after the payment page", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "المقاسان محددان داخل الاختبار"));

  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.width}px`, () => {
      test.use({ viewport });

      test("a return without a session asks to sign in and shows no order", async ({ page }) => {
        await page.goto("/payment/return?paymentId=07070000000001");
        await expect(page).toHaveURL(/\/login\?next=/);
        await expect(page.getByTestId("login-payment-note")).toBeVisible();
        expect(page.url()).not.toContain("/orders/");
        await shot(page, `login-note-${viewport.width}`);
      });

      test("a signed-in visitor sees the neutral note on the account page", async ({ page }) => {
        await registerStudent(page);
        await page.goto("/payment/return?paymentId=07070000000002");
        await expect(page).toHaveURL(/\/account\?payment=checked/);
        await expect(page.getByText("وصلتنا عودتك من صفحة الدفع")).toBeVisible();
        await shot(page, `account-note-${viewport.width}`);
      });

      test("a failed order shows the fixed message and never the stored text", async ({ page }) => {
        await registerStudent(page);
        await page.goto("/products/g9-science-final-notes-t1");
        await page.getByTestId("add-to-cart").first().click();
        await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();
        const orderId = await checkoutAndPay(page, "fail");
        await db()`update payments set error_message = 'RAW-GATEWAY-DETAIL card declined at host' where order_id = ${orderId}`;
        await page.goto(`/orders/${orderId}`);
        await expect(page.getByText("لم تكتمل العملية عند البنك أو بوابة الدفع.")).toBeVisible();
        await expect(page.locator("body")).not.toContainText("RAW-GATEWAY-DETAIL");
        await shot(page, `failed-order-${viewport.width}`);
      });
    });
  }
});
