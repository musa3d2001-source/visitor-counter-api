import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { E2E_STORAGE_DIR } from "./e2e-env";
import { db, expectNoHorizontalOverflow, registerStudent } from "./helpers";

/**
 * القارئ على الخادم الإنتاجي: ملف طويل لا يرسم كل صفحاته، وانشغال الخادم يُعرض رسالة ودودة ويعيد المحاولة وحده.
 */
async function ownedLongNote(page: Page, pages: number) {
  const email = await registerStudent(page);
  const [user] = await db()<{ id: string }[]>`select id from users where email = ${email}`;
  const [product] = await db()<{ id: string }[]>`select id from products where status = 'published' and type = 'final_notes' order by slug limit 1`;
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  const bytes = await doc.save();
  const key = `products/${product.id}/${randomUUID()}.pdf`;
  const full = resolve(E2E_STORAGE_DIR, "private", key);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, bytes);
  const [file] = await db()<{ id: string }[]>`
    insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, sort_order, check_status, checked_at)
    values (${product.id}, 'main', 'ملف طويل', ${key}, 'long.pdf', 'application/pdf', ${bytes.length}, ${pages}, 900, 'ok', now()) returning id
  `;
  await db()`insert into entitlements (user_id, product_id, source, grant_reason) values (${user.id}, ${product.id}, 'manual', 'e2e') on conflict (user_id, product_id) do nothing`;
  return file.id;
}

const canvases = (page: Page) => page.locator("[data-testid=reader-page] canvas").count();

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`القارئ بعرض ${viewport.width}`, () => {
    test.use({ viewport });
    test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "المقاسان محددان هنا"));

    test("a long file keeps only the pages near the reader on screen", async ({ page }, info) => {
      const fileId = await ownedLongNote(page, 60);
      await page.goto(`/read/${fileId}`);
      await expect(page.locator("#page-1 canvas")).toBeVisible();
      await expect(page.getByTestId("reader-pages")).toContainText("60");
      expect(await canvases(page)).toBeLessThan(12);
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath(`reader-open-${viewport.width}.png`) });

      await page.getByTestId("reader").evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      await expect(page.locator("#page-60 canvas")).toBeVisible();
      await expect(page.locator("#page-1")).toHaveCount(0);
      expect(await canvases(page)).toBeLessThan(12);

      await page.getByTestId("reader").evaluate((el) => el.scrollTo({ top: 0 }));
      await expect(page.locator("#page-1 canvas")).toBeVisible();
    });

    test("a busy server shows a friendly wait and the file opens by itself", async ({ page }, info) => {
      const fileId = await ownedLongNote(page, 4);
      let busy = 1;
      await page.route(`**/api/files/${fileId}*`, async (route) => {
        if (busy-- > 0) {
          await route.fulfill({ status: 503, headers: { "retry-after": "2", "content-type": "application/json" }, body: JSON.stringify({ error: "busy", retry: true }) });
          return;
        }
        await route.continue();
      });
      await page.goto(`/read/${fileId}`);
      await expect(page.getByTestId("reader-waiting")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath(`reader-waiting-${viewport.width}.png`) });
      await expect(page.locator("#page-1 canvas")).toBeVisible({ timeout: 15_000 });
    });

    test("a server still busy after the retries says so and offers a button", async ({ page }, info) => {
      test.slow();
      const fileId = await ownedLongNote(page, 4);
      await page.route(`**/api/files/${fileId}*`, (route) =>
        route.fulfill({ status: 503, headers: { "retry-after": "2", "content-type": "application/json" }, body: JSON.stringify({ error: "busy", retry: true }) }),
      );
      await page.goto(`/read/${fileId}`);
      await expect(page.getByTestId("reader-retry")).toBeVisible({ timeout: 40_000 });
      await expect(page.getByRole("alert")).toContainText("المنصة مشغولة");
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath(`reader-busy-${viewport.width}.png`) });
    });
  });
}
