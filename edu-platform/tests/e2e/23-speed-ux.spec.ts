import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { E2E_PUBLIC_CACHE_BASE_URL } from "./e2e-env";
import { db, expectNoHorizontalOverflow, loginAdmin, registerStudent } from "./helpers";

/**
 * السرعة وما يراه الزائر أثناء الانتظار، على بناء إنتاجي وذاكرة عامة معطلة: كل صفحة تقرأ قاعدة البيانات، فيحدث البث فعلًا.
 */
const STATUS = { name: "جاري التحميل" };
const GRADE = "grade-9";
const PRODUCT = "g9-math-final-notes-t1";
const pdfVersion = (JSON.parse(readFileSync(resolve(process.cwd(), "node_modules/pdfjs-dist/package.json"), "utf8")) as { version: string }).version;

/**
 * CSS قبل الرسم، مضغوطًا (gzip)، بالبايت. قبل البند R021: الرئيسية والمنتج والصف نحو 56000، والدخول نحو 36000.
 * بعده: نحو 38500 و 34500 و 35100 و 25700. إعادة أصناف اللوحة (+9500) أو دمج الوحدات (+10000 إلى 20000) تتجاوز الحد
 */
const CSS_BUDGET = { home: 42_000, page: 38_000, plain: 28_000 };

const desktopOnly = (name: string) => test.skip(name !== "desktop", "سلوك خادم لا يتعلق بقياس الجهاز");

/** يوقف طلب الانتقال وحده (لا الجلب المسبق) حتى يُسمح له */
async function holdNavigation(page: Page, url: RegExp, { alsoPrefetch = false } = {}) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(url, async (route) => {
    const headers = route.request().headers();
    if (headers.rsc && (alsoPrefetch || !headers["next-router-prefetch"])) await gate;
    await route.continue().catch(() => {});
  });
  return release;
}

/** يعرض HTML الصفحة كما وصل، بلا سكربتات ولا قاعدة noscript: الهيكل يبقى ثابتًا ليُفحص */
async function fallbackPage(browser: Browser, request: APIRequestContext, path: string, width: number) {
  const response = await request.get(path);
  const html = (await response.text()).replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, javaScriptEnabled: false, locale: "ar-KW" });
  const page = await ctx.newPage();
  await page.route((url) => url.pathname + url.search === path, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
  await page.goto(path);
  return { ctx, page, html };
}

async function previewPaths() {
  const [note] = await db()<{ id: string }[]>`select pf.id from product_files pf join products p on p.id = pf.product_id where p.slug = ${PRODUCT} and pf.kind = 'preview' limit 1`;
  const [video] = await db()<{ product_id: string; id: string }[]>`select l.product_id, l.id from lessons l join products p on p.id = l.product_id where l.is_free_preview and p.status = 'published' limit 1`;
  return { read: `/preview/${note.id}`, watch: `/watch/${video.product_id}?lesson=${video.id}` };
}

test.describe("streaming with a nonce policy", () => {
  test("the skeleton is sent first and every script in the stream carries the nonce", async ({ request }, info) => {
    desktopOnly(info.project.name);
    const { read } = await previewPaths();
    for (const path of ["/", `/grades/${GRADE}`, `/products/${PRODUCT}`, "/teachers", "/cart", "/terms", read]) {
      const response = await request.get(path);
      const html = await response.text();
      expect(response.status(), path).toBe(200);
      expect(html, `${path}: بث فعلي`).toContain('<template id="B:');
      const nonce = response.headers()["content-security-policy"].match(/'nonce-([^']+)'/)?.[1];
      expect(nonce, path).toBeTruthy();
      const tags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]).filter((tag) => !tag.includes('type="application/ld+json"'));
      expect(tags.length, path).toBeGreaterThan(3);
      expect(tags.filter((tag) => !tag.includes(`nonce="${nonce}"`)), path).toEqual([]);
    }
  });

  test("no page raises a policy violation in the browser while it streams", async ({ page }) => {
    const { read, watch } = await previewPaths();
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/content security policy/i.test(m.text())) violations.push(m.text());
    });
    await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`Content Security Policy ${e.violatedDirective} ${e.blockedURI}`)));
    for (const path of ["/", `/grades/${GRADE}`, `/grades/${GRADE}/math`, `/products/${PRODUCT}`, "/cart", "/terms", read, watch]) {
      await page.goto(path, { waitUntil: "load" });
      await expect(page.locator("h1").first()).toBeVisible();
    }
    await registerStudent(page);
    for (const path of ["/library", "/account", "/checkout"]) await page.goto(path, { waitUntil: "load" });
    expect(violations).toEqual([]);
  });

  test("a soft navigation also streams without a violation", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/content security policy/i.test(m.text())) violations.push(m.text());
    });
    await page.goto("/");
    await page.getByTestId("grade-picker").locator(`a[href="/grades/${GRADE}"]`).first().click();
    await page.waitForURL(`**/grades/${GRADE}`);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(violations).toEqual([]);
  });
});

test.describe("what a click shows at once", () => {
  test("the bar appears on the click and leaves when the page arrives", async ({ page }) => {
    await page.goto("/");
    const release = await holdNavigation(page, new RegExp(`/grades/${GRADE}`));
    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
    await page.getByTestId("grade-picker").locator(`a[href="/grades/${GRADE}"]`).first().click();
    await expect(page.getByTestId("nav-progress")).toBeVisible({ timeout: 1000 });
    release();
    await page.waitForURL(`**/grades/${GRADE}`);
    await expect(page.getByTestId("nav-progress")).toHaveCount(0);
  });

  test("after resting on a link, the skeleton shows while the page is still on its way", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.goto("/");
    const release = await holdNavigation(page, new RegExp(`/grades/${GRADE}`));
    const prefetched = page.waitForResponse((r) => r.url().includes(`/grades/${GRADE}`) && Boolean(r.request().headers()["next-router-prefetch"]));
    const link = page.getByTestId("grade-picker").locator(`a[href="/grades/${GRADE}"]`).first();
    await link.hover();
    await prefetched;
    await page.waitForTimeout(250);
    await link.click();
    await expect(page.getByRole("status", STATUS).first()).toBeVisible({ timeout: 2000 });
    await expect(page.locator("header").first()).toBeVisible();
    release();
    await expect(page.getByRole("status", STATUS)).toHaveCount(0);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("a card on the screen costs no request until someone means to open it", async ({ page }, info) => {
    desktopOnly(info.project.name);
    const prefetches: string[] = [];
    page.on("request", (r) => {
      if (r.headers()["next-router-prefetch"]) prefetches.push(r.url());
    });
    await page.goto("/");
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    expect(prefetches).toEqual([]);
    await page.getByTestId("grade-picker").locator(`a[href="/grades/${GRADE}"]`).first().hover();
    await expect.poll(() => prefetches.length).toBeGreaterThan(0);
  });

  test("with reduced motion the bar and the skeleton stand still", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const everything = await holdNavigation(page, new RegExp(`/grades/${GRADE}`), { alsoPrefetch: true });
    const link = page.getByTestId("grade-picker").locator(`a[href="/grades/${GRADE}"]`).first();
    await link.click();
    const bar = page.getByTestId("nav-progress").locator("div");
    await expect(bar).toBeVisible({ timeout: 1000 });
    expect(await bar.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    everything();
    await page.waitForURL(`**/grades/${GRADE}`);

    await page.unroute(new RegExp(`/grades/${GRADE}`));
    await page.goto("/");
    const release = await holdNavigation(page, new RegExp(`/grades/${GRADE}`));
    const again = page.getByTestId("grade-picker").locator(`a[href="/grades/${GRADE}"]`).first();
    const prefetched = page.waitForResponse((r) => r.url().includes(`/grades/${GRADE}`) && Boolean(r.request().headers()["next-router-prefetch"]));
    await again.hover();
    await prefetched;
    await page.waitForTimeout(250);
    await again.click();
    const status = page.getByRole("status", STATUS).first();
    await expect(status).toBeVisible({ timeout: 2000 });
    const looping = await status.evaluate((el) => [...el.querySelectorAll("*")].filter((x) => getComputedStyle(x).animationIterationCount === "infinite").length);
    expect(looping).toBe(0);
    release();
  });
});

test.describe("the skeletons", () => {
  test("fill the screen under the real header, without spinners or sideways scroll", async ({ browser, request }, info) => {
    desktopOnly(info.project.name);
    const { read, watch } = await previewPaths();
    for (const path of ["/", `/grades/${GRADE}`, `/grades/${GRADE}/math`, `/products/${PRODUCT}`, "/teachers", "/bundles", "/cart", "/terms", read, watch]) {
      for (const width of [360, 390, 820, 1440]) {
        const { ctx, page } = await fallbackPage(browser, request, path, width);
        const status = page.getByRole("status", STATUS).first();
        await expect(status, `${path} @${width}`).toBeVisible();
        expect((await status.boundingBox())!.height, `${path} @${width}: يملأ الشاشة`).toBeGreaterThanOrEqual(700);
        await expect(status.locator(".animate-spin, svg.lucide-loader-circle"), `${path} @${width}`).toHaveCount(0);
        await expectNoHorizontalOverflow(page);
        if (path.startsWith("/preview") || path.startsWith("/watch")) await expect(page.locator("footer")).toHaveCount(0);
        await ctx.close();
      }
    }
  });

  test("keep the footer off the first screen, so nothing visible jumps when the page arrives", async ({ browser, request }, info) => {
    desktopOnly(info.project.name);
    for (const path of ["/", `/grades/${GRADE}`, `/products/${PRODUCT}`, "/cart"]) {
      for (const width of [390, 1440]) {
        const { ctx, page } = await fallbackPage(browser, request, path, width);
        const top = await page.locator("footer").evaluate((el) => el.getBoundingClientRect().top);
        expect(top, `${path} @${width}`).toBeGreaterThan(844);
        await ctx.close();
      }
    }
  });

  test("the first load does not shift the layout", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    for (const path of ["/", `/grades/${GRADE}`, `/products/${PRODUCT}`, "/cart"]) {
      await page.goto(path, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls, path).toBeLessThan(0.1);
    }
  });
});

test.describe("addresses keep their meaning under streaming", () => {
  const UNKNOWN = ["/products/not-a-real-product", "/grades/not-a-grade", `/grades/${GRADE}/not-a-subject`, "/teachers/not-a-teacher", "/stages/not-a-stage"];

  test("an unknown address is a real 404 inside one header and one main", async ({ page }, info) => {
    desktopOnly(info.project.name);
    for (const path of UNKNOWN) {
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1 }), path).toContainText("غير موجودة");
      await expect(page.locator("header"), path).toHaveCount(1);
      await expect(page.locator("main"), path).toHaveCount(1);
      await expect(page.locator("footer"), path).toHaveCount(1);
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
    }
  });

  test("a signed-in student asking for an unknown product also gets a real 404", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await registerStudent(page);
    const response = await page.goto("/products/not-a-real-product");
    expect(response?.status()).toBe(404);
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
  });

  test("search engines get the whole text and the true status from the first response", async ({ playwright }, info) => {
    desktopOnly(info.project.name);
    const bots = {
      google: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      htmlOnly: "Mozilla/5.0 (compatible; Twitterbot/1.0)",
    };
    for (const [name, agent] of Object.entries(bots)) {
      const bot = await playwright.request.newContext({ baseURL: info.project.use.baseURL, extraHTTPHeaders: { "user-agent": agent } });
      const response = await bot.get(`/products/${PRODUCT}`);
      const html = await response.text();
      expect(response.status(), name).toBe(200);
      expect(html, name).toMatch(/<h1\b/);
      expect(html, name).toContain('type="application/ld+json"');
      expect((await bot.get("/products/not-a-real-product")).status(), name).toBe(404);
      if (name === "htmlOnly") expect(html.slice(0, html.indexOf("</head>")), "البوت الذي لا يشغّل JavaScript يأخذ العنوان في الرأس").toMatch(/<title>[^<]+<\/title>/);
      await bot.dispose();
    }
  });

  test("without JavaScript a page from the public cache arrives whole and in order", async ({ browser, request }, info) => {
    desktopOnly(info.project.name);
    const paths = ["/", `/grades/${GRADE}`, `/products/${PRODUCT}`];
    for (const path of paths) await request.get(E2E_PUBLIC_CACHE_BASE_URL + path);
    const ctx = await browser.newContext({ javaScriptEnabled: false, locale: "ar-KW", viewport: { width: 390, height: 844 }, baseURL: E2E_PUBLIC_CACHE_BASE_URL });
    const page = await ctx.newPage();
    for (const path of paths) {
      await request.get(E2E_PUBLIC_CACHE_BASE_URL + path);
      await page.goto(path);
      await expect(page.locator("h1").first(), path).toBeVisible();
      await expect(page.getByRole("status", STATUS), path).toHaveCount(0);
      const order = await page.evaluate(() => ({ h1: document.querySelector("h1")!.getBoundingClientRect().top, footer: document.querySelector("footer")!.getBoundingClientRect().top, header: document.querySelector("header")!.getBoundingClientRect().top }));
      expect(order.h1, path).toBeGreaterThan(order.header);
      expect(order.footer, `${path}: التذييل بعد المحتوى`).toBeGreaterThan(order.h1 + 200);
    }
    await ctx.close();
  });

  test("without JavaScript on a cold cache the text is still readable and no skeleton stays", async ({ browser }, info) => {
    desktopOnly(info.project.name);
    const ctx = await browser.newContext({ javaScriptEnabled: false, locale: "ar-KW", viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    for (const path of ["/", `/grades/${GRADE}`, `/products/${PRODUCT}`, "/terms"]) {
      await page.goto(path);
      await expect(page.locator("h1").first(), path).toBeVisible();
      await expect(page.getByRole("status", STATUS), path).toHaveCount(0);
      await expect(page.locator("footer"), path).toBeVisible();
    }
    await ctx.close();
  });
});

test.describe("reader files and images (K077, K073)", () => {
  const YEAR = /public, max-age=31536000, immutable/;

  test("the worker, its files and the social image are immutable under a versioned path", async ({ request }, info) => {
    desktopOnly(info.project.name);
    for (const path of [`/pdfjs/${pdfVersion}/pdf.worker.min.mjs`, "/brand/v2/og.jpg"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["cache-control"], path).toMatch(YEAR);
    }
    expect((await (await request.get("/brand/v2/og.jpg")).body()).length).toBeLessThan(120 * 1024);
    for (const old of ["/pdfjs/pdf.worker.min.mjs", "/brand/og.png"]) expect((await request.get(old)).status(), old).toBe(404);
  });

  test("the reader asks for the worker under its version", async ({ page }, info) => {
    desktopOnly(info.project.name);
    const { read } = await previewPaths();
    const asked = page.waitForRequest((r) => r.url().includes(`/pdfjs/${pdfVersion}/pdf.worker`));
    await page.goto(read);
    await asked;
  });

  test("covers are WebP only, even for a browser that accepts AVIF, and huge widths are refused", async ({ request }, info) => {
    desktopOnly(info.project.name);
    const ok = await request.get("/_next/image?url=%2Fbrand%2Fv2%2Fog.jpg&w=640&q=75", { headers: { accept: "image/avif,image/webp,*/*" } });
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("image/webp");
    expect((await request.get("/_next/image?url=%2Fbrand%2Fv2%2Fog.jpg&w=1920&q=75")).status()).toBe(400);
  });
});

test.describe("fonts (K076)", () => {
  test("the first-paint faces are preloaded from this site with no other origin involved", async ({ page, request }, info) => {
    desktopOnly(info.project.name);
    const response = await request.get("/");
    const links = (response.headers()["link"] ?? "").split(",").filter((l) => l.includes("font/woff2"));
    expect(links).toHaveLength(4);
    for (const l of links) expect(l).toMatch(/<\/_next\/static\//);
    const external: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "font" && !r.url().startsWith(new URL(page.url() || info.project.use.baseURL!).origin)) external.push(r.url());
    });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    expect(external).toEqual([]);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
    expect(loaded.join(" ")).toMatch(/tajawal/i);
    expect(loaded.join(" ")).toMatch(/cairo/i);
    const display = await page.evaluate(() => [...document.fonts].map((f) => f.display));
    expect(new Set(display)).toEqual(new Set(["fallback"]));
  });
});

test.describe("stylesheets (R021)", () => {
  /** أوراق الصفحة بترتيبها في المستند (وهو ترتيبها في التتالي)، وما فيها، وحجمها مضغوطًا */
  async function sheetsOf(page: Page, request: APIRequestContext) {
    const hrefs = await page.evaluate(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href));
    const out: { href: string; gz: number; site: boolean; staff: boolean }[] = [];
    for (const href of hrefs) {
      const text = await (await request.get(href)).text();
      // ورقة الموقع وحدها فيها preflight. ورقة اللوحة فيها أصناف Tailwind بلا preflight. وحدات CSS بلا طبقات
      const site = text.includes("::file-selector-button");
      out.push({ href, gz: gzipSync(text).length, site, staff: !site && /@layer utilities\s*\{/.test(text) });
    }
    return out;
  }

  test("public pages load the site sheet alone, within the CSS budget", async ({ page, request }, info) => {
    desktopOnly(info.project.name);
    for (const [path, budget] of [["/", CSS_BUDGET.home], [`/products/${PRODUCT}`, CSS_BUDGET.page], [`/grades/${GRADE}`, CSS_BUDGET.page], ["/login", CSS_BUDGET.plain]] as const) {
      await page.goto(path);
      const sheets = await sheetsOf(page, request);
      expect(sheets.filter((s) => s.site), path).toHaveLength(1);
      expect(sheets.filter((s) => s.staff), path).toEqual([]);
      const total = sheets.reduce((a, s) => a + s.gz, 0);
      info.annotations.push({ type: "css", description: `${path}: ${sheets.length} files, ${total} B gzip` });
      expect(total, path).toBeLessThan(budget);
    }
  });

  test("the dashboard adds its own sheet after the site sheet, so its copies of each class decide", async ({ page, request }, info) => {
    desktopOnly(info.project.name);
    await loginAdmin(page);
    for (const path of ["/admin", "/admin/products"]) {
      await page.goto(path);
      const sheets = await sheetsOf(page, request);
      const site = sheets.findIndex((s) => s.site);
      const staff = sheets.findIndex((s) => s.staff);
      expect(site, path).toBeGreaterThanOrEqual(0);
      expect(staff, path).toBeGreaterThan(site);
    }
  });
});

test.describe("adding to the cart (K070)", () => {
  test("one small request, the count updates, and the page is not drawn again", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.goto(`/products/${PRODUCT}`);
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
    const sent: string[] = [];
    page.on("request", (r) => {
      const h = r.headers();
      if (r.url().includes("/api/cart")) sent.push("cart");
      else if (h["next-action"] || h.rsc) sent.push(`page ${r.url()}`);
    });
    await page.getByTestId("add-to-cart").first().click();
    await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText(/١|1/);
    expect(sent).toEqual(["cart"]);
    await page.getByRole("link", { name: /السلة/ }).first().click();
    await page.waitForURL("**/cart");
    await expect(page.locator("main")).toContainText(/ر|د\.ك/);
  });

  test("going back to the cart after adding shows the new item", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.goto("/cart");
    await page.goto(`/products/${PRODUCT}`);
    await page.getByTestId("add-to-cart").first().click();
    await expect(page.getByText("أضيفت إلى السلة").first()).toBeVisible();
    await page.goBack();
    await page.waitForURL("**/cart");
    await expect(page.getByTestId("place-order").or(page.locator(`a[href="/products/${PRODUCT}"]`)).first()).toBeVisible();
  });

  test("without JavaScript the form still adds the item", async ({ browser }, info) => {
    desktopOnly(info.project.name);
    const ctx = await browser.newContext({ javaScriptEnabled: false, locale: "ar-KW", baseURL: E2E_PUBLIC_CACHE_BASE_URL });
    const page = await ctx.newPage();
    await page.goto(`/products/${PRODUCT}`);
    await page.getByTestId("add-to-cart").first().click();
    await page.waitForLoadState("load");
    const cookies = await ctx.cookies();
    expect(cookies.find((c) => c.name === "cart")?.value).toBeTruthy();
    await ctx.close();
  });
});

test.describe("the subject tabs (K078)", () => {
  test("the home page carries one panel, others load on demand, and the keyboard works", async ({ page, request }, info) => {
    desktopOnly(info.project.name);
    const html = await (await request.get("/")).text();
    expect(html.match(/data-testid="subject-panel"/g)).toHaveLength(1);
    const gradesWithSubjectLinks = new Set([...html.matchAll(/href="\/grades\/([^/"]+)\/[^/"?]+"/g)].map((m) => m[1]));
    expect(gradesWithSubjectLinks.size, "روابط مواد صف واحد فقط في HTML").toBe(1);
    await page.goto("/");
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    const panel = page.getByTestId("subject-panel");
    const firstLinks = await panel.locator("a").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
    const loaded = page.waitForResponse((r) => /\/api\/grades\/[0-9a-f-]+\/subjects/.test(r.url()));
    await tabs.nth(1).click();
    await loaded;
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => panel.locator("a").evaluateAll((a) => a.map((x) => x.getAttribute("href")))).not.toEqual(firstLinks);
    await tabs.nth(1).press("ArrowLeft");
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(2)).toBeFocused();
  });

  test("without JavaScript each tab is a link to that grade", async ({ browser, request }, info) => {
    desktopOnly(info.project.name);
    await request.get(`${E2E_PUBLIC_CACHE_BASE_URL}/`);
    const ctx = await browser.newContext({ javaScriptEnabled: false, locale: "ar-KW", baseURL: E2E_PUBLIC_CACHE_BASE_URL });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByTestId("subject-panel").locator("a").first()).toBeVisible();
    await page.getByRole("tab").nth(2).click();
    await page.waitForURL(/\/grades\/[^/]+$/);
    await expect(page.locator("h1").first()).toBeVisible();
    await ctx.close();
  });
});
