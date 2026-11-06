/**
 * تجربة المرحلة 0 في المتصفحات: يفتح ‎/admin/game/spike?auto=1‎ على خادم ‎next start‎ محلي ويجمع النتائج.
 *  - Chromium (المضمّن مع Playwright) و Chrome (channel) و WebKit: تطابق بصمات كل التصاميم مع Node، وfps.
 *  - Chromium مع خنق المعالج ×4 وشبكة Fast 4G وذاكرة فارغة: زمن الجاهزية لكل حزمة على حدة.
 *
 *   npx tsx scripts/game-spike/browser-measure.ts [--base http://localhost:3100] [--out docs/game/perf/spike-browsers.json]
 *
 * يتطلب خادمًا يعمل بقاعدة بيانات محلية فيها حساب المدير التجريبي (tests/e2e/e2e-env.ts)، ويعمل خارج الحماية.
 */
import { chromium, webkit, type Browser, type BrowserContext } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { E2E_ADMIN } from "../../tests/e2e/e2e-env";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3100";
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const GL_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
/** إعداد Fast 4G في أدوات مطوّري Chrome */
const FAST_4G = { offline: false, latency: 165, downloadThroughput: 1_012_500, uploadThroughput: 168_750 };

let ipSeq = 10;
/**
 * WebKit يرفض الكوكي Secure على http://localhost (Chromium يعدّه سياقًا آمنًا)، فنسجّل الدخول في Chromium
 * وننقل كوكي الجلسة إلى WebKit بلا علم Secure. هذا للقياس المحلي فقط.
 */
let sessionCookie: { name: string; value: string } | null = null;
async function loggedInContext(browser: Browser, viewport = { width: 1280, height: 800 }) {
  if (browser.browserType().name() === "webkit") {
    if (!sessionCookie) throw new Error("login in chromium first");
    const ctx = await browser.newContext({ viewport, locale: "ar-KW" });
    await ctx.addCookies([{ ...sessionCookie, domain: new URL(base).hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
    return ctx;
  }
  const ctx = await browser.newContext({ viewport, locale: "ar-KW", extraHTTPHeaders: { "x-forwarded-for": `10.9.8.${ipSeq++}` } });
  const page = await ctx.newPage();
  await page.goto(`${base}/login?next=%2Fadmin`);
  await page.fill("#email", E2E_ADMIN.email);
  await page.fill("#password", E2E_ADMIN.password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/admin"), { timeout: 60_000 });
  await page.close();
  const c = (await ctx.cookies()).find((x) => x.name === "session");
  if (c) sessionCookie = { name: c.name, value: c.value };
  return ctx;
}

async function runSpike(ctx: BrowserContext, query: string, throttle?: { cpu: number; net: boolean }) {
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  if (throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (throttle.net) await cdp.send("Network.emulateNetworkConditions", FAST_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle.cpu });
  }
  const t0 = Date.now();
  await page.goto(`${base}/admin/game/spike?${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => document.body.dataset.spikeDone === "1", undefined, { timeout: 240_000 });
  const res = await page.evaluate(() => (window as unknown as { __spike: unknown }).__spike);
  const wallMs = Date.now() - t0;
  await page.close();
  return { query, throttle: throttle ?? null, wallMs, errors, res };
}

async function main() {
  const report: Record<string, unknown> = { base, at: new Date().toISOString(), runs: [] as unknown[] };
  const runs = report.runs as unknown[];
  const engines: { name: string; launch: () => Promise<Browser> }[] = [
    { name: "chromium", launch: () => chromium.launch({ args: GL_ARGS }) },
    { name: "chrome", launch: () => chromium.launch({ channel: "chrome", args: GL_ARGS }) },
    { name: "webkit", launch: () => webkit.launch() },
  ];
  for (const e of engines) {
    if (only && !only.includes(e.name)) continue;
    let browser: Browser | null = null;
    try {
      browser = await e.launch();
      const ctx = await loggedInContext(browser);
      const r = await runSpike(ctx, "auto=1&flavors=split,compat");
      runs.push({ engine: e.name, version: browser.version(), ...r });
      console.log(`${e.name} ${browser.version()}: ${summary(r.res)}`);
      await ctx.close();
    } catch (err) {
      runs.push({ engine: e.name, error: String(err) });
      console.log(`${e.name}: ERROR ${String(err).slice(0, 300)}`);
    } finally {
      await browser?.close();
    }
  }
  // الجاهزية مع الخنق: كل حزمة في سياق جديد بلا ذاكرة مخبأة
  if (only && !only.includes("throttled")) {
    if (out) writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
    return;
  }
  const browser = await chromium.launch({ args: GL_ARGS });
  for (const flavor of ["split", "compat"]) {
    const ctx = await loggedInContext(browser, { width: 390, height: 844 });
    const r = await runSpike(ctx, `auto=1&flavors=${flavor}`, { cpu: 4, net: true });
    runs.push({ engine: "chromium-throttled-x4-fast4g", version: browser.version(), ...r });
    console.log(`throttled ${flavor}: ${summary(r.res)}`);
    await ctx.close();
  }
  await browser.close();
  if (out) writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
}

function summary(res: unknown): string {
  const r = res as {
    webgl2: boolean;
    engineReadyMs: number;
    threeLoadMs: number;
    flavors: { flavor: string; ok: boolean; loadMs: number; allMatch: boolean; usPerStep: number; bytes: { encoded: number }; error?: string }[];
    visual: { quality: string; fps: number; medianMs: number; p95Ms: number; drawCalls: number }[];
  };
  const f = r.flavors.map((x) => (x.ok ? `${x.flavor}: load ${x.loadMs}ms ${Math.round(x.bytes.encoded / 1024)}KB match=${x.allMatch} ${x.usPerStep}µs/step` : `${x.flavor}: FAIL ${x.error}`)).join(" | ");
  const v = r.visual.map((x) => `${x.quality} ${x.fps}fps p95 ${x.p95Ms}ms dc=${x.drawCalls}`).join(" | ");
  return `webgl2=${r.webgl2} ready=${r.engineReadyMs}ms three=${r.threeLoadMs}ms || ${f} || ${v}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
