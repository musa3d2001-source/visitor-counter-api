import { test, expect, type Page } from "@playwright/test";
import { simSignDisputeWebhook } from "../mocks/myfatoorah-simulator";
import { db, loginAdmin } from "./helpers";
import { E2E_BASE_URL, E2E_WEBHOOK_SECRET } from "./e2e-env";

/** نزاع موقّع يصل إلى المسار الحقيقي ← تنبيه للمالك ← المالك يغلقه */
test.describe("تنبيهات الدفع للمالك", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "رحلة المالك مغطاة على الكمبيوتر"));

  const disputeId = Math.floor(Math.random() * 1e9);
  const dispute = (status: string) => ({
    Event: { Code: 6, Name: "DISPUTE_STATUS_CHANGED", CountryIsoCode: "KWT", CreationDate: new Date().toISOString(), Reference: `WH-E2E-${disputeId}` },
    Data: {
      Dispute: { Type: "CHARGEBACK", Status: status, CreatedDate: new Date().toISOString(), ChargeBackType: "General", Reason: "CreditNotProcessed", DisputeTransactionId: disputeId, InvoiceTransactionId: 1 },
      Invoice: { Id: `E2E${disputeId}`, Status: "PAID", Reference: "r", CreationDate: new Date().toISOString(), ExternalIdentifier: "" },
      Transaction: { Id: "1", Status: "SUCCESS", PaymentMethod: "KNET", PaymentId: "0707", ReferenceId: "1", TrackId: "1", AuthorizationId: "1", TransactionDate: new Date().toISOString(), ECI: "" },
      Customer: { Name: "x", Mobile: "", Email: "" },
      Amount: { BaseCurrency: "KWD", ValueInBaseCurrency: "3.000" },
    },
  });

  async function send(page: Page, body: ReturnType<typeof dispute>, signature = simSignDisputeWebhook(body.Data, E2E_WEBHOOK_SECRET)) {
    return page.request.post(`${E2E_BASE_URL}/api/payments/myfatoorah/webhook`, { data: body, headers: { "MyFatoorah-Signature": signature } });
  }

  test("نزاع بتوقيع صحيح يظهر للمالك ويمكن إغلاقه، والطلب المزور يُرفض", async ({ page }) => {
    await loginAdmin(page);
    const forged = await send(page, dispute("PENDING"), "AAAA");
    expect(forged.status()).toBe(401);

    const res = await send(page, dispute("PENDING"));
    expect(res.status()).toBe(200);

    await page.goto("/admin");
    await page.getByRole("link", { name: /بخصوص المدفوعات/ }).click();
    await page.waitForURL(/\/admin\/orders/);
    const alerts = page.getByTestId("payment-alerts");
    await expect(alerts).toContainText("رد مبلغ من البنك");
    await expect(alerts).toContainText(`E2E${disputeId}`);

    await page.goto("/admin/settings");
    await expect(page.getByText("آخر إشعار صحيح من البوابة")).toBeVisible();
    await expect(page.getByText("توقيع غير صحيح")).toBeVisible();

    await page.goto("/admin/orders");
    const row = page.getByTestId("payment-alerts").locator("li", { hasText: `E2E${disputeId}` });
    await row.getByRole("button", { name: "تمت المراجعة" }).click();
    await page.getByRole("button", { name: "إغلاق التنبيه" }).click();
    await expect(page.locator("li", { hasText: `E2E${disputeId}` })).toHaveCount(0);

    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from payment_alerts where dedupe_key = ${`dispute:${disputeId}`} and resolved_at is not null`;
    expect(n).toBe(1);
  });
});
