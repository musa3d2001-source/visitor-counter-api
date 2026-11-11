import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    // حبر حقيقي على كل صفحة: الرسم يُقاس بالنقاط الملونة لا بوجود اللوحة
    p.drawText(`Page ${i + 1}`, { x: 60, y: 760, size: 48, font, color: rgb(0.05, 0.2, 0.45) });
    p.drawRectangle({ x: 60, y: 400, width: 300, height: 200, color: rgb(0.9, 0.3, 0.2) });
  }
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

/** نقاط ملونة في لوحة الصفحة: رُسمت فعلًا، لا مستطيلًا أبيض */
async function inkOn(page: Page, n: number): Promise<number> {
  return page.locator(`#page-${n} canvas`).evaluate((c: HTMLCanvasElement) => {
    if (!c.width || !c.height) return 0;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200)) ink++;
    return ink;
  });
}
const drawn = async (page: Page, n: number) => {
  await expect(page.locator(`#page-${n} canvas`)).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => inkOn(page, n), { timeout: 20_000 }).toBeGreaterThan(1000);
};

/**
 * ما لا يعرفه متصفح أقدم (iOS قبل 26.2، Samsung Internet، Chrome قبل 147) ويستدعيه pdf.js الحديث: يُحذف من الصفحة قبل أي سكربت،
 * ومن العامل بإضافة الحذف إلى أول ملفه. النسخة التي يشحنها القارئ (R018) تعمل رغم ذلك، والحديثة كانت تتعطل هنا.
 */
const NEWER_BUILT_INS = `(() => {
  const P = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  const drop = [[Map.prototype, "getOrInsertComputed"], [Map.prototype, "getOrInsert"], [WeakMap.prototype, "getOrInsertComputed"], [WeakMap.prototype, "getOrInsert"],
    [Math, "sumPrecise"], [Promise, "try"], [Array, "fromAsync"], [ArrayBuffer.prototype, "transferToFixedLength"], [Uint8Array.prototype, "toHex"], [Uint8Array, "fromBase64"]];
  if (typeof window === "undefined") {
    drop.push([Promise, "withResolvers"], [Set.prototype, "union"], [Set.prototype, "difference"]);
    for (const k of ["map", "filter", "toArray", "forEach", "some", "every", "find", "flatMap", "take", "drop"]) drop.push([P, k]);
  }
  for (const [o, k] of drop) { try { delete o[k]; } catch (e) {} }
})();
`;

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
      await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("المنصة مشغولة");
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath(`reader-busy-${viewport.width}.png`) });
    });

    // Vercel عند حد التنفيذ المتزامن يرد 503 بنص لا JSON وبلا Retry-After. كان القارئ يقول «الملف يحتاج إلى إصلاح» ولا يعيد (R017)
    test("a platform 503 with no answer from the app is retried, and never called a damaged file", async ({ page }) => {
      const fileId = await ownedLongNote(page, 3);
      let throttled = 1;
      await page.route(`**/api/files/${fileId}*`, async (route) => {
        if (throttled-- > 0) {
          await route.fulfill({ status: 503, headers: { "content-type": "text/plain; charset=utf-8", "x-vercel-error": "FUNCTION_THROTTLED" }, body: "FUNCTION_THROTTLED" });
          return;
        }
        await route.continue();
      });
      await page.goto(`/read/${fileId}`);
      await expect(page.getByTestId("reader-waiting")).toBeVisible();
      await expect(page.getByText("يحتاج إلى إصلاح")).toHaveCount(0);
      await drawn(page, 1);
    });

    test("a browser without the newest built-ins still opens and draws the file (R018)", async ({ page }) => {
      const fileId = await ownedLongNote(page, 3);
      await page.addInitScript(NEWER_BUILT_INS);
      await page.route("**/pdfjs/*/pdf.worker.r1.min.mjs", async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, body: NEWER_BUILT_INS + (await response.text()) });
      });
      await page.goto(`/read/${fileId}`);
      expect(await page.evaluate(() => typeof (Promise as unknown as { try?: unknown }).try)).toBe("undefined");
      await drawn(page, 1);
      await expect(page.getByTestId("reader-pages")).toContainText("3");
      await expect(page.getByTestId("reader-page-failed")).toHaveCount(0);
    });

    test("a page the browser cannot draw says so on the page, and draws on request (F27)", async ({ page }, info) => {
      const fileId = await ownedLongNote(page, 3);
      await page.addInitScript(() => {
        const w = window as unknown as { __breakPages?: boolean };
        w.__breakPages = true;
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (w.__breakPages && type === "2d" && this.closest("[data-testid=reader-page]")) throw new Error("simulated canvas failure");
          return (original as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
        } as typeof HTMLCanvasElement.prototype.getContext;
      });
      await page.goto(`/read/${fileId}`);
      const failed = page.locator("#page-1").getByTestId("reader-page-failed");
      await expect(failed).toBeVisible({ timeout: 20_000 });
      await expect(failed).toContainText("تعذر عرض هذه الصفحة");
      await expect(failed).not.toContainText("اتصال");
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath(`reader-page-failed-${viewport.width}.png`) });
      await page.evaluate(() => ((window as unknown as { __breakPages?: boolean }).__breakPages = false));
      await page.locator("#page-1").getByTestId("reader-page-retry").click();
      await expect(failed).toHaveCount(0);
      await drawn(page, 1);
    });

    test("an engine that did not load says what happened, and the button opens the file", async ({ page }, info) => {
      const fileId = await ownedLongNote(page, 3);
      await page.route("**/pdfjs/*/pdf.r1.min.mjs*", (route) => route.abort("failed"));
      await page.goto(`/read/${fileId}`);
      const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
      await expect(alert).toContainText("تعذر تشغيل قارئ الملفات", { timeout: 20_000 });
      await expectNoHorizontalOverflow(page);
      await page.screenshot({ path: info.outputPath(`reader-engine-failed-${viewport.width}.png`) });
      await page.unroute("**/pdfjs/*/pdf.r1.min.mjs*");
      await page.getByTestId("reader-retry").click();
      await drawn(page, 1);
    });

    test("the engine and worker load while the file is still arriving, not after it (R020)", async ({ page }) => {
      const fileId = await ownedLongNote(page, 3);
      let fileDone = 0;
      const asked: Record<string, number> = {};
      page.on("request", (r) => {
        const u = r.url();
        if (u.includes("/pdf.r1.min.mjs")) asked.engine ??= Date.now();
        if (u.includes("/pdf.worker.r1.min.mjs")) asked.worker ??= Date.now();
      });
      // الملف يتأخر ثانيتين: المحرك والعامل يُطلبان قبل وصوله
      await page.route(`**/api/files/${fileId}*`, async (route) => {
        await new Promise((r) => setTimeout(r, 2_000));
        fileDone = Date.now();
        await route.continue();
      });
      await page.goto(`/read/${fileId}`);
      await drawn(page, 1);
      expect(asked.engine).toBeLessThan(fileDone);
      expect(asked.worker).toBeLessThan(fileDone);
    });
  });
}

// محرك WebKit (محرك Safari على iPhone) مثبت مع Playwright على هذا الجهاز. لا يقيس iOS قديمًا: هو WebKit حديث.
// يثبت أن المحرك يُحمَّل بـ import تحت CSP بالـ nonce، وأن العامل الوحدوي والرسم يعملان على WebKit (R018)
test.describe("القارئ على WebKit", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "webkit", "مشروع WebKit وحده"));

  /**
   * الخادم الإنتاجي يضع كوكي الجلسة Secure، وWebKit لا يحفظ كوكي Secure على http://localhost (Chromium يستثني localhost).
   * على الموقع الحقيقي (HTTPS) يحفظه Safari كما هو. هنا فقط تُنسخ قيمة الجلسة نفسها إلى كوكي بلا Secure، ولا يتغير شيء في الخادم
   */
  async function keepSessionOverLocalHttp(page: Page, baseURL: string) {
    page.on("response", async (res) => {
      for (const h of await res.headersArray().catch(() => [])) {
        const m = h.name.toLowerCase() === "set-cookie" ? /^session=([^;]+)/.exec(h.value) : null;
        if (m) await page.context().addCookies([{ name: "session", value: m[1], url: baseURL, httpOnly: true, sameSite: "Lax" }]);
      }
    });
  }

  test("a purchased note opens and draws on WebKit", async ({ page, baseURL }, info) => {
    await keepSessionOverLocalHttp(page, baseURL!);
    const fileId = await ownedLongNote(page, 3);
    await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "session")).toBe(true);
    await page.goto(`/read/${fileId}`);
    await drawn(page, 1);
    await expect(page.getByTestId("reader-pages")).toContainText("3");
    await expect(page.getByTestId("reader-page-failed")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath("reader-webkit-390.png") });
  });
});
