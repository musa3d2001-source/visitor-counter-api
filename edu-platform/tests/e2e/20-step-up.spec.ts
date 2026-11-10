import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { hashPassword } from "../../src/server/auth/password-core";
import { adminCode, asDistinctClient, db, expectNoHorizontalOverflow, loginAdmin, passStepUp, uniqueEmail } from "./helpers";
import { E2E_ADMIN } from "./e2e-env";

/** خطوة الإثبات كما يراها المالك على جواله وعلى الكمبيوتر: التصدير، التسوية، والمالك بلا عامل ثانٍ */
const adminAudit = async (action: string) =>
  db()<{ metadata: Record<string, unknown> }[]>`select metadata from audit_logs where action = ${action} and actor_id = (select id from users where email = ${E2E_ADMIN.email}) order by created_at desc`;

/** معلم له رصيد مستحق قديم يكفي لتسوية، بلا المرور برحلة شراء كاملة */
async function teacherOwed(owedFils: number) {
  const suffix = randomUUID().slice(0, 8);
  const [teacher] = await db()<{ id: string }[]>`insert into teachers (slug, display_name, headline, bio, mode, can_upload, is_published, revenue_share_bps) values (${`stepup-${suffix}`}, ${`أ. تسوية ${suffix}`}, 'x', 'x', 'managed', true, false, 5000) returning id`;
  const [buyer] = await db()<{ id: string; email: string }[]>`insert into users (email, password_hash, full_name, role) values (${uniqueEmail("stepup")}, 'x', 'مشتر', 'student') returning id, email`;
  const [product] = await db()<{ id: string; title: string; type: string }[]>`select id, title, type from products limit 1`;
  const gross = owedFils * 2;
  const [order] = await db()<{ id: string }[]>`insert into orders (user_id, status, subtotal_fils, total_fils, customer_name, customer_email, paid_at) values (${buyer.id}, 'paid', ${gross}, ${gross}, 'مشتر', ${buyer.email}, now() - interval '30 days') returning id`;
  const [item] = await db()<{ id: string }[]>`insert into order_items (order_id, product_id, title, product_type, unit_price_fils) values (${order.id}, ${product.id}, ${product.title}, ${product.type}, ${gross}) returning id`;
  await db()`insert into teacher_earnings (order_id, order_item_id, teacher_id, teacher_name, product_id, product_title, gross_fils, net_fils, share_bps, teacher_fils, platform_fils, created_at) values (${order.id}, ${item.id}, ${teacher.id}, 'معلم', ${product.id}, ${product.title}, ${gross}, ${gross}, 5000, ${owedFils}, ${owedFils}, now() - interval '30 days')`;
  return teacher.id;
}

test.describe("إثبات الأوامر الحساسة", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name === "ipad", "الرحلة نفسها مغطاة على الكمبيوتر والآيفون");
    await db()`delete from rate_limits where key like 'report-export:%'`;
  });

  test("التصدير: رفض بلا رمز، خطأ برمز خاطئ، ثم ملف آمن وسجل بالعدد", async ({ page }, info) => {
    await loginAdmin(page);
    await page.goto("/admin/reports");
    await expect(page.getByTestId("export-orders")).toBeVisible();

    // لا طريق بالرابط المباشر
    const direct = await page.request.get("/api/admin/reports/export");
    expect(direct.status()).toBe(405);
    const noProof = await page.request.post("/api/admin/reports/export", { headers: { origin: new URL(page.url()).origin } });
    expect(noProof.status()).toBe(403);

    await page.getByTestId("export-orders").click();
    const sheet = page.getByTestId("step-up-sheet");
    await expect(sheet).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
      const box = (await sheet.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath(`step-up-${width}.png`) });
    }
    await page.setViewportSize(info.project.use.viewport ?? { width: 1366, height: 900 });

    await page.getByTestId("step-up-proof-code").fill("000000");
    await page.getByTestId("step-up-proof-submit").click();
    await expect(sheet.getByRole("alert")).toBeVisible();
    await expect(sheet).toBeVisible();

    await page.getByTestId("step-up-proof-code").fill(await adminCode());
    const download = page.waitForEvent("download");
    await page.getByTestId("step-up-proof-submit").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const csv = readFileSync(await file.path(), "utf8");
    expect(csv.split("\r\n")[0]).toContain("رقم الطلب");

    await expect.poll(async () => (await adminAudit("report.export_end")).length).toBeGreaterThan(0);
    const [start] = await adminAudit("report.export");
    expect(start.metadata).toHaveProperty("rowCount");
  });

  test("التسوية: الإثبات يكمل النموذج نفسه، والتبويب الثاني والمبلغ الزائد يُرفضان", async ({ page, context }) => {
    const teacherId = await teacherOwed(5000);
    await loginAdmin(page);
    await page.goto(`/admin/teachers/${teacherId}`);
    const stale = await context.newPage();
    await stale.goto(`/admin/teachers/${teacherId}`);

    const open = async (p: typeof page, amount: string) => {
      await p.getByRole("button", { name: "تسجيل تسوية يدوية" }).click();
      await p.getByTestId("payout-amount").fill(amount);
      await p.getByLabel("ملاحظة (إلزامي)").fill("تسوية الاختبار");
      await p.getByRole("button", { name: "تسجيل التسوية" }).click();
    };

    await open(page, "9.000");
    await passStepUp(page);
    await expect(page.getByRole("alert").first()).toContainText("5.000");
    expect(await db()`select id from teacher_payouts where teacher_id = ${teacherId}`).toHaveLength(0);

    await page.goto(`/admin/teachers/${teacherId}`);
    await open(page, "2.000");
    await expect.poll(async () => (await db()`select id from teacher_payouts where teacher_id = ${teacherId}`).length).toBe(1);

    // تبويب فُتح قبل التسوية الأولى لا يسجل ثانية
    await open(stale, "1.000");
    await expect(stale.getByText("حدّث الصفحة").first()).toBeVisible();
    expect(await db()`select id from teacher_payouts where teacher_id = ${teacherId}`).toHaveLength(1);
  });

  test("مالك بلا عامل ثانٍ لا يصدّر، ولو كان الدخول بكلمة المرور مسموحًا", async ({ page }) => {
    const email = uniqueEmail("no-2fa-owner");
    const password = "Owner-No-Second-Factor-2026";
    await db()`insert into users (email, password_hash, full_name, role, email_verified_at) values (${email}, ${await hashPassword(password)}, 'مالك بلا تحقق', 'admin', now())`;
    await asDistinctClient(page);
    await page.goto(`/login?next=${encodeURIComponent("/admin/reports")}`);
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await page.waitForURL("**/admin/reports");

    await page.getByTestId("export-orders").click();
    const sheet = page.getByTestId("step-up-sheet");
    await expect(sheet).toHaveAttribute("data-need", "enrol");
    await expect(page.getByTestId("step-up-enrol-link")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(await db()`select id from audit_logs where action = 'report.export' and actor_id = (select id from users where email = ${email})`).toHaveLength(0);
  });
});
