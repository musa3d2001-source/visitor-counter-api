import { test, expect, type Browser } from "@playwright/test";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { E2E_BUNNY, E2E_SERVER_ENV, E2E_STORAGE_DIR } from "./e2e-env";
import { db, expectNoHorizontalOverflow, loginAdmin, newStudentPage } from "./helpers";

/**
 * ضوابط الفيديو على الخادم الإنتاجي الفعلي: مشغل Bunny (على المحاكي) بعلامة هوية المشاهد،
 * وتعذر بدء الخادم دون المفتاح، وتجربة من اشترى ومن لم يشترِ حين يكون الملف الخام مغلقًا.
 * خادم E2E إنتاجي بلا ALLOW_FILE_VIDEO، فأي درس provider='file' يجعل منتجه مغلقًا دون لمس الإعدادات المشتركة.
 */
async function videoProduct(opts: { provider: "file" | "bunny"; status?: string; freePreview?: boolean }) {
  const [ids] = await db()<{ grade_id: string; subject_id: string }[]>`
    select g.id as grade_id, s.id as subject_id from grades g join subjects s on s.grade_id = g.id where g.level = 7 and s.slug = 'islamic'
  `;
  const slug = `e2e-video-${randomUUID().slice(0, 8)}`;
  const status = opts.status ?? "published";
  const [p] = await db()<{ id: string }[]>`
    insert into products (slug, type, title, grade_id, subject_id, academic_year, term, price_fils, status, published_at)
    values (${slug}, 'video_lesson', ${`درس ضوابط ${slug}`}, ${ids.grade_id}, ${ids.subject_id}, '2026-2027', 1, 2500, ${status}, ${status === "published" ? new Date() : null})
    returning id
  `;
  let ref: string;
  let size: number | null = null;
  if (opts.provider === "bunny") {
    const res = await fetch(`${E2E_BUNNY.base}/library/${E2E_BUNNY.library}/videos`, { method: "POST", headers: { AccessKey: E2E_BUNNY.apiKey, "content-type": "application/json" }, body: JSON.stringify({ title: slug }) });
    expect(res.status).toBe(200);
    ref = ((await res.json()) as { guid: string }).guid;
  } else {
    ref = `lessons/${p.id}/${randomUUID()}.mp4`;
    const bytes = new Uint8Array(4096).fill(7);
    const full = resolve(E2E_STORAGE_DIR, "private", ref);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
    size = bytes.length;
  }
  const [l] = await db()<{ id: string }[]>`
    insert into lessons (product_id, unit_title, title, provider, video_ref, mime_type, size_bytes, duration_seconds, is_free_preview, is_published, sort_order, processing_status)
    values (${p.id}, 'الوحدة الأولى', 'الدرس الأول', ${opts.provider}, ${ref}, 'video/mp4', ${size}, 60, ${opts.freePreview ?? false}, true, 0, 'ready')
    returning id
  `;
  return { id: p.id, slug, lessonId: l.id };
}

/** رفع ملف إلى المحاكي بتوقيع صحيح، وانتظار اكتمال معالجته */
async function uploadToSim(guid: string) {
  const expire = Math.floor(Date.now() / 1000) + 3600;
  const signature = createHash("sha256").update(`${E2E_BUNNY.library}${E2E_BUNNY.apiKey}${expire}${guid}`).digest("hex");
  const bytes = new Uint8Array(4096).fill(9);
  const res = await fetch(`${E2E_BUNNY.base}/tusupload`, {
    method: "POST",
    headers: { AuthorizationSignature: signature, AuthorizationExpire: String(expire), VideoId: guid, LibraryId: E2E_BUNNY.library, "Tus-Resumable": "1.0.0", "Upload-Length": String(bytes.length), "Content-Type": "application/offset+octet-stream" },
    body: bytes,
  });
  expect(res.status).toBe(201);
  await expect
    .poll(async () => ((await (await fetch(`${E2E_BUNNY.base}/library/${E2E_BUNNY.library}/videos/${guid}`, { headers: { AccessKey: E2E_BUNNY.apiKey } })).json()) as { status: number }).status, { timeout: 10_000 })
    .toBe(4);
}

async function ownerOf(browser: Browser, productId: string) {
  const student = await newStudentPage(browser);
  await db()`
    insert into entitlements (user_id, product_id, source, grant_reason)
    select id, ${productId}, 'manual', 'e2e' from users where email = ${student.email}
  `;
  return student;
}

test.describe("Bunny player", () => {
  test("shows who is watching, and keeps it inside fullscreen", async ({ browser }) => {
    const p = await videoProduct({ provider: "bunny" });
    const { ctx, page, email } = await ownerOf(browser, p.id);
    await page.goto(`/watch/${p.id}?lesson=${p.lessonId}`);
    const player = page.getByTestId("watch-player");
    await expect(player).toHaveAttribute("data-kind", "bunny");
    await expect(page.frameLocator('[data-testid="watch-player"] iframe').getByTestId("sim-embed-ok")).toBeVisible({ timeout: 15_000 });

    const mark = player.getByTestId("viewer-watermark");
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText(email);

    // ما لم يُمنح الإطار ملء الشاشة لا يغطي العلامة
    const allow = await player.locator("iframe").getAttribute("allow");
    expect(allow).not.toContain("fullscreen");
    expect(allow).not.toContain("picture-in-picture");
    expect(await player.locator("iframe").getAttribute("allowfullscreen")).toBeNull();

    // العلامة فوق الإطار ولا تعترض النقرات على أزرار المشغل
    expect(await mark.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");

    await page.getByTestId("bunny-fullscreen").click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute("data-testid") ?? null)).toBe("watch-player");
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement?.querySelector('[data-testid="viewer-watermark"]')))).toBe(true);
    await expect(mark).toBeVisible();
    await page.getByTestId("bunny-fullscreen").click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await expectNoHorizontalOverflow(page);
    await ctx.close();
  });
});

/** ساعة الصفحة مزيفة وساعة الخادم حقيقية: رابط يصدر في ثانية الرابط الأول نفسها يطابقه حرفًا، فلا يظهر التبديل */
async function waitPastIssuingSecond(src: string | null) {
  const issuedAt = Number(new URL(src!).searchParams.get("expires")) - 3600;
  await expect.poll(() => Math.floor(Date.now() / 1000), { intervals: [100] }).toBeGreaterThan(issuedAt);
}

test.describe("the embed link", () => {
  test("is renewed before it runs out, and stops at once when access is withdrawn", async ({ browser }) => {
    const p = await videoProduct({ provider: "bunny" });
    const { ctx, page } = await ownerOf(browser, p.id);
    await page.clock.install();
    await page.goto(`/watch/${p.id}?lesson=${p.lessonId}`);
    const player = page.getByTestId("watch-player");
    const iframe = player.locator("iframe");
    await expect(page.frameLocator('[data-testid="watch-player"] iframe').getByTestId("sim-embed-ok")).toBeVisible({ timeout: 15_000 });
    const first = await iframe.getAttribute("src");
    await waitPastIssuingSecond(first);

    const isRenewal = (url: string) => url.endsWith(`/api/lessons/${p.lessonId}/embed`);
    const renewed = page.waitForResponse((r) => isRenewal(r.url()));
    await page.clock.fastForward("56:00");
    expect((await renewed).status()).toBe(200);
    await expect.poll(() => iframe.getAttribute("src")).not.toBe(first);
    await expect(page.frameLocator('[data-testid="watch-player"] iframe').getByTestId("sim-embed-ok")).toBeVisible({ timeout: 15_000 });

    await db()`update entitlements set revoked_at = now() where product_id = ${p.id}`;
    const refused = page.waitForResponse((r) => isRenewal(r.url()));
    await page.clock.fastForward("56:00");
    expect((await refused).status()).toBe(403);
    const ended = page.getByTestId("lesson-access-ended");
    await expect(ended).toBeVisible();
    await expect(ended).toHaveAttribute("data-reason", "access-ended");
    await expect(iframe).toHaveCount(0);
    await expect(player.getByTestId("viewer-watermark")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await ctx.close();
  });

  test("keeps the video running through a temporary failure", async ({ browser }) => {
    const p = await videoProduct({ provider: "bunny" });
    const { ctx, page } = await ownerOf(browser, p.id);
    await page.clock.install();
    await page.goto(`/watch/${p.id}?lesson=${p.lessonId}`);
    const iframe = page.getByTestId("watch-player").locator("iframe");
    await expect(page.frameLocator('[data-testid="watch-player"] iframe').getByTestId("sim-embed-ok")).toBeVisible({ timeout: 15_000 });
    const first = await iframe.getAttribute("src");
    await waitPastIssuingSecond(first);
    let calls = 0;
    await page.route(`**/api/lessons/${p.lessonId}/embed`, (route) => {
      calls++;
      return calls === 1 ? route.fulfill({ status: 503, headers: { "retry-after": "5" } }) : route.continue();
    });
    await page.clock.fastForward("56:00");
    await expect.poll(() => calls).toBe(1);
    await expect(page.getByTestId("lesson-access-ended")).toHaveCount(0);
    expect(await iframe.getAttribute("src")).toBe(first);
    await page.clock.fastForward("00:06");
    await expect.poll(() => iframe.getAttribute("src")).not.toBe(first);
    expect(calls).toBe(2);
    await ctx.close();
  });
});

test.describe("a video replaced after approval", () => {
  test("waits for the owner, who sees it in the health page and accepts it from the product", async ({ page, browser }) => {
    const p = await videoProduct({ provider: "bunny" });
    const [{ video_ref: guid }] = await db()<{ video_ref: string }[]>`select video_ref from lessons where id = ${p.lessonId}`;
    await uploadToSim(guid);
    await db()`update lessons set processing_status = 'held', video_hold_fingerprint = null where id = ${p.lessonId}`;

    const buyer = await ownerOf(browser, p.id);
    await buyer.page.goto(`/watch/${p.id}?lesson=${p.lessonId}`);
    await expect(buyer.page.getByTestId("watch-player")).toHaveCount(0);
    await buyer.ctx.close();

    await loginAdmin(page);
    await page.goto("/admin/ops");
    const held = page.getByTestId("ops-video-held");
    await expect(held).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await held.getByRole("link", { name: "الدرس الأول" }).first().click();
    await page.waitForURL(`**/admin/products/${p.id}`);
    await expect(page.getByTestId("lesson-status")).toHaveText("بانتظار قرار المالك");
    await page.getByTestId("lesson-list").locator("summary").first().click();
    const alert = page.getByTestId("lesson-held");
    await expect(alert).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await alert.getByRole("button", { name: "قبول الفيديو الحالي" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "نعم، أقبله" }).click();
    await expect(page.getByTestId("lesson-status")).toHaveText("جاهز");
    expect((await db()<{ processing_status: string }[]>`select processing_status from lessons where id = ${p.lessonId}`)[0].processing_status).toBe("ready");
  });
});

test.describe("a raw video file on production", () => {
  test("is closed to a visitor, in the page and on the server", async ({ browser }) => {
    const p = await videoProduct({ provider: "file", freePreview: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`/products/${p.slug}`);
    await expect(page.getByTestId("video-closed-notice").first()).toBeVisible();
    await expect(page.getByTestId("add-to-cart")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/watch/${p.id}`);
    await expect(page.getByTestId("videos-closed-stage")).toBeVisible();
    await expect(page.getByTestId("watch-player")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    expect((await page.request.get(`/api/lessons/${p.lessonId}/stream`)).status()).toBe(401);
    await ctx.close();
  });

  test("keeps playing for the student who already bought it", async ({ browser }) => {
    const p = await videoProduct({ provider: "file" });
    const { ctx, page, email } = await ownerOf(browser, p.id);
    await page.goto(`/products/${p.slug}`);
    await expect(page.getByTestId("video-closed-notice")).toHaveCount(0);
    await expect(page.getByTestId("add-to-cart")).toHaveCount(0);

    await page.goto(`/watch/${p.id}`);
    const player = page.getByTestId("watch-player");
    await expect(player).toHaveAttribute("data-kind", "file");
    await expect(player.getByTestId("viewer-watermark")).toHaveText(email);
    await expect(page.getByTestId("videos-closed-stage")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    const stream = await page.request.get(`/api/lessons/${p.lessonId}/stream`, { headers: { range: "bytes=0-1023" } });
    expect(stream.status()).toBe(206);
    await ctx.close();
  });

  test("the owner is warned on the health page while a paid one is on sale", async ({ page }) => {
    await videoProduct({ provider: "file" });
    await loginAdmin(page);
    await page.goto("/admin/ops");
    await expect(page.getByTestId("ops-warning-raw-video")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("the owner is told why it cannot be published", async ({ page }) => {
    const p = await videoProduct({ provider: "file", status: "draft" });
    await loginAdmin(page);
    await page.goto(`/admin/products/${p.id}`);
    await expect(page.getByText("ALLOW_FILE_VIDEO=true").first()).toBeVisible();
    expect((await db()<{ status: string }[]>`select status from products where id = ${p.id}`)[0].status).toBe("draft");
  });
});

test.describe("starting the server", () => {
  test("without the read-only key it refuses to start, and says which key", async ({}, info) => {
    test.skip(info.project.name !== "desktop", "one start is enough");
    test.setTimeout(90_000);
    const env: NodeJS.ProcessEnv = { ...process.env, ...E2E_SERVER_ENV, PORT: "3197", APP_URL: "http://localhost:3197" };
    delete env.BUNNY_STREAM_READONLY_API_KEY;
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3197"], { cwd: resolve(__dirname, "../.."), env });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const code = await new Promise<number | null>((done) => {
      const timer = setTimeout(() => {
        child.kill();
        done(-1);
      }, 60_000);
      child.on("exit", (c) => {
        clearTimeout(timer);
        done(c);
      });
    });
    expect(output).toContain("BUNNY_STREAM_READONLY_API_KEY");
    expect(code, output).not.toBe(0);
    expect(code, "the server must exit by itself, not sit there waiting").not.toBe(-1);
    expect(output).not.toContain(E2E_BUNNY.apiKey);
    expect(output).not.toContain(E2E_BUNNY.tokenKey);
  });
});
