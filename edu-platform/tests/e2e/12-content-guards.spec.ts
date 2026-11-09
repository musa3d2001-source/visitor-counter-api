import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { E2E_STORAGE_DIR } from "./e2e-env";
import { db, loginAdmin } from "./helpers";

/**
 * ضوابط المحتوى كما يراها المالك والهاتف على الخادم الإنتاجي الفعلي (next start):
 * رفض ملف تالف يقبله pdf-lib ولا يكشفه إلا محرك القارئ يثبت أن خيط المحرك يعمل بعد البناء، لا في الاختبارات فقط.
 */
const fixture = (name: string) => resolve(__dirname, "../fixtures/pdf", name);

async function makePdfFile(pages: number, name: string) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([595, 842]);
  const dir = resolve(__dirname, "../.tmp");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, await pdf.save());
  return path;
}

async function blankPdf(pages: number) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage();
  return pdf.save();
}

async function subject() {
  const [ids] = await db()<{ grade_id: string; subject_id: string }[]>`
    select g.id as grade_id, s.id as subject_id from grades g join subjects s on s.grade_id = g.id where g.level = 7 and s.slug = 'islamic'
  `;
  return ids;
}

async function product(opts: { status?: string; priceFils?: number; teacherId?: string | null; proposedFils?: number | null; title?: string } = {}) {
  const ids = await subject();
  const slug = `e2e-guard-${randomUUID().slice(0, 8)}`;
  const title = opts.title ?? `منتج الضوابط ${slug}`;
  const status = opts.status ?? "draft";
  const [p] = await db()<{ id: string }[]>`
    insert into products (slug, type, title, grade_id, subject_id, academic_year, term, price_fils, proposed_price_fils, status, teacher_id, published_at)
    values (${slug}, 'review_notes', ${title}, ${ids.grade_id}, ${ids.subject_id}, '2026-2027', 1, ${opts.priceFils ?? 2500}, ${opts.proposedFils ?? null}, ${status}, ${opts.teacherId ?? null}, ${status === "published" ? new Date() : null})
    returning id
  `;
  return { id: p.id, slug, title };
}

/** ملف كما كان قبل إضافة الفحص */
async function legacyFile(productId: string, kind: "main" | "preview", bytes: Uint8Array, pages: number, sourceId: string | null = null) {
  const key = `${kind === "main" ? "products" : "previews"}/${productId}/${randomUUID()}.pdf`;
  const full = resolve(E2E_STORAGE_DIR, "private", key);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, bytes);
  const [row] = await db()<{ id: string }[]>`
    insert into product_files (product_id, kind, title, storage_key, original_name, mime_type, size_bytes, page_count, is_auto_preview, source_file_id)
    values (${productId}, ${kind}, 'ملف قديم', ${key}, 'old.pdf', 'application/pdf', ${bytes.length}, ${pages}, ${kind === "preview"}, ${sourceId})
    returning id
  `;
  return row.id;
}

const mainCount = async (id: string) => (await db()<{ n: number }[]>`select count(*)::int as n from product_files where product_id = ${id} and kind = 'main'`)[0].n;

test.describe("ضوابط المحتوى", () => {
  test("الهاتف: انقطاع الاتصال أثناء الرفع يُعاد تلقائيًا ولا يكرر الملف", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "سلوك الهاتف");
    test.setTimeout(90_000);
    const p = await product();
    const file = await makePdfFile(20, "phone-upload.pdf");
    await loginAdmin(page);
    await page.goto(`/admin/products/${p.id}`);

    let puts = 0;
    await page.route(/\/api\/uploads\/local/, async (route) => {
      if (route.request().method() === "PUT" && ++puts === 1) return route.abort("connectionreset");
      return route.continue();
    });
    await page.getByTestId("upload-main").setInputFiles(file);

    await expect(page.getByTestId("upload-retrying")).toBeVisible();
    await expect(page.getByTestId("upload-retrying")).toContainText("أبقِ الصفحة مفتوحة");
    await expect.poll(() => mainCount(p.id), { timeout: 30_000 }).toBe(1);
    expect(puts).toBe(2);
    const [row] = await db()<{ check_status: string; page_count: number }[]>`select check_status, page_count from product_files where product_id = ${p.id} and kind = 'main'`;
    expect(row).toEqual({ check_status: "ok", page_count: 20 });
  });

  test("رفض الملف المحمي والتالف بسبب واضح، ولا يُسجَّل شيء", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "تُشغَّل على الكمبيوتر");
    test.setTimeout(90_000);
    const p = await product();
    await loginAdmin(page);
    await page.goto(`/admin/products/${p.id}`);

    await page.getByTestId("upload-main").setInputFiles(fixture("owner_rc4_128.pdf"));
    await expect(page.getByText(/محمي بكلمة مرور/).first()).toBeVisible({ timeout: 30_000 });

    // هذا الملف يقبله pdf-lib ويختمه، ولا يرفضه إلا محرك القارئ
    await page.getByTestId("upload-main").setInputFiles(fixture("flipped.pdf"));
    await expect(page.getByText(/تالف أو لم يكتمل/).first()).toBeVisible({ timeout: 30_000 });

    expect(await mainCount(p.id)).toBe(0);
    await expect(page.getByTestId("upload-retry")).toHaveCount(0);
    // منتج لم يكتمل رفع ملفه لا يبدو جاهزًا ولا يُنشر
    await page.reload();
    await expect(page.getByText("ارفع ملف PDF واحدًا على الأقل قبل النشر").first()).toBeVisible();
    await page.getByRole("button", { name: "نشر للطلاب" }).click();
    await expect(page.getByText("ارفع ملف PDF واحدًا على الأقل قبل النشر").first()).toBeVisible();
    await expect.poll(async () => (await db()`select status from products where id = ${p.id}`)[0].status).toBe("draft");
  });

  test("نموذج الاعتماد لا ينشر شيئًا دون قرار: السعر فارغ، والنسبة مطلوبة", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "تُشغَّل على الكمبيوتر");
    test.setTimeout(90_000);
    const [teacher] = await db()<{ id: string }[]>`
      insert into teachers (slug, display_name, mode, is_published, revenue_share_bps)
      values (${`e2e-noshare-${randomUUID().slice(0, 8)}`}, 'أ. بلا نسبة', 'managed', true, null) returning id
    `;
    const p = await product({ status: "in_review", priceFils: 0, teacherId: teacher.id, proposedFils: 3000 });
    const main = await legacyFile(p.id, "main", await blankPdf(10), 10);
    await db()`update product_files set check_status = 'ok', checked_at = now() where id = ${main}`;

    await loginAdmin(page);
    await page.goto(`/admin/products/${p.id}`);
    await expect(page.locator("#ap-price")).toHaveValue("");
    await expect(page.getByLabel(/اعتماده مجانيًا/)).not.toBeChecked();
    await expect(page.getByText(/لم تُحدَّد نسبة أ\. بلا نسبة/).first()).toBeVisible();

    const approve = page.getByRole("button", { name: "اعتماد ونشر" });
    const status = async () => (await db()<{ status: string; is_free: boolean }[]>`select status, is_free from products where id = ${p.id}`)[0];

    // الموافقة دون قراءة النموذج
    await approve.click();
    await expect(page.getByText(/حدد سعرًا/).first()).toBeVisible();
    expect(await status()).toEqual({ status: "in_review", is_free: false });

    // بسعر لكن بلا نسبة
    await page.fill("#ap-price", "3.000");
    await approve.click();
    await expect(page.getByText(/حددها في صفحة المعلم/).first()).toBeVisible();
    expect((await status()).status).toBe("in_review");

    // نسبة 0٪ تحتاج تأكيدًا صريحًا
    await db()`update teachers set revenue_share_bps = 0 where id = ${teacher.id}`;
    await page.reload();
    await page.fill("#ap-price", "3.000");
    await approve.click();
    await expect(page.getByText(/أكد النسبة/).first()).toBeVisible();
    expect((await status()).status).toBe("in_review");

    await page.reload();
    await page.fill("#ap-price", "3.000");
    await page.getByLabel(/أؤكد النسبة/).check();
    await approve.click();
    await expect.poll(async () => (await status()).status).toBe("published");
  });

  test("صفحة سلامة المحتوى: تفحص القديم وتصلح المعاينات وتُظهر الخطة", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "desktop", "تُشغَّل على الكمبيوتر");
    test.setTimeout(120_000);
    const broken = await product({ status: "published" });
    await legacyFile(broken.id, "main", new Uint8Array(readFileSync(fixture("owner_rc4_128.pdf"))), 6);

    const whole = await blankPdf(5);
    const leaky = await product({ status: "published" });
    const leakyMain = await legacyFile(leaky.id, "main", whole, 5);
    const leakyPreview = await legacyFile(leaky.id, "preview", whole, 5, leakyMain);

    const anon = await browser.newContext();
    const origin = new URL(info.project.use.baseURL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`).origin;
    expect((await anon.request.get(`${origin}/api/files/${leakyPreview}`, { headers: { "x-reader": "1" } })).status()).toBe(404);

    await loginAdmin(page);
    await page.goto("/admin/content-health");
    await expect(page.getByTestId("health-previews")).toContainText(leaky.title);

    await page.getByRole("button", { name: "فحص الدفعة التالية" }).click();
    await expect(page.getByTestId("health-flagged")).toContainText(broken.title, { timeout: 45_000 });

    await page.getByRole("button", { name: "إعادة توليد الكل" }).click();
    await expect.poll(async () => (await db()<{ page_count: number }[]>`select page_count from product_files where product_id = ${leaky.id} and kind = 'preview'`)[0]?.page_count, { timeout: 45_000 }).toBe(1);
    const [fresh] = await db()<{ id: string }[]>`select id from product_files where product_id = ${leaky.id} and kind = 'preview'`;
    expect((await anon.request.get(`${origin}/api/files/${fresh.id}`, { headers: { "x-reader": "1" } })).status()).toBe(200);

    await page.goto("/admin/settings");
    await expect(page.getByTestId("storage-plan-note")).toBeVisible();
  });
});
