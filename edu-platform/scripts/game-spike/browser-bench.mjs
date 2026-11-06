// [تجربة المرحلة 0 - كود مؤقت] قياسات Chromium (Playwright) على `next start` (افتراضيًا المنفذ 3200).
// التشغيل (من edu-platform، بعد npx next build ثم npx next start -p 3200):
//   node scripts/game-spike/browser-bench.mjs [--base http://localhost:3200] [--runs 3] [--out docs/game/spike/browser-results.json]
// يقيس: بصمات التصاميم الثمانية بالحزمتين مقابل Node والخادم، وجاهزية المحرك مع خنق CPU ×4 وشبكة Fast 4G،
// وfps/زمن الإطار 10 ث بالجودتين مع خنق ×4، وانتهاكات CSP، وعزل الحزم في الرئيسية والصف والمنتج والمكتبة.
// ملاحظة: Chromium هنا يرسم برمجيًا (SwiftShader)، فأرقام fps متشائمة مقارنة بجهاز حقيقي.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const BASE = arg("base", "http://localhost:3200");
const RUNS = Number(arg("runs", "3"));
const OUT = arg("out", "docs/game/spike/browser-results.json");
const ADMIN = { email: process.env.SPIKE_ADMIN_EMAIL ?? "admin@example.com", password: process.env.SPIKE_ADMIN_PASSWORD ?? "Admin-Pass-12345" };
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
// Fast 4G كما يعرّفه Chrome DevTools: 9Mbps×0.9 تنزيل، 1.5Mbps×0.9 رفع، 60ms×2.75 كمون
const FAST_4G = { offline: false, latency: 165, downloadThroughput: (9 * 1000 * 1000) / 8 * 0.9, uploadThroughput: (1.5 * 1000 * 1000) / 8 * 0.9 };
const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 };

const sizes = JSON.parse(fs.readFileSync("docs/game/spike/sizes.json", "utf8"));
const heavyFiles = Object.entries(sizes.chunks)
  .filter(([, v]) => /three|rapier/.test(v.tag))
  .map(([k, v]) => ({ file: k.replace("static/chunks/", ""), tag: v.tag }));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

const CSP_INIT = () => {
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample }));
  window.__fcp = null;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__fcp = e.startTime;
    }).observe({ type: "paint", buffered: true });
  } catch {}
};

async function login(browser) {
  const ctx = await browser.newContext(DESKTOP);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login?next=/admin`);
  await p.fill("#email", ADMIN.email);
  await p.fill("#password", ADMIN.password);
  await p.getByRole("button", { name: "تسجيل الدخول" }).click();
  await p.waitForURL((u) => u.pathname.startsWith("/admin"), { timeout: 60000 });
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function openSpike(browser, state, { profile = DESKTOP, query = "", cpu = 1, network = null, recordNet = false } = {}) {
  const ctx = await browser.newContext({ ...profile, storageState: state });
  const page = await ctx.newPage();
  await page.addInitScript(CSP_INIT);
  const consoleCsp = [];
  const errors = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|CSP/i.test(t)) consoleCsp.push(t.slice(0, 300));
    if (m.type() === "error") errors.push(t.slice(0, 300));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`.slice(0, 300)));
  const cdp = await ctx.newCDPSession(page);
  const net = new Map();
  if (recordNet) {
    await cdp.send("Network.enable");
    cdp.on("Network.responseReceived", (e) => net.set(e.requestId, { url: e.response.url, status: e.response.status, type: e.response.mimeType, enc: e.response.headers["content-encoding"] ?? e.response.headers["Content-Encoding"] ?? null }));
    cdp.on("Network.loadingFinished", (e) => {
      const r = net.get(e.requestId);
      if (r) r.transfer = e.encodedDataLength;
    });
  }
  if (network) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", network);
  }
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.goto(`${BASE}/admin/game/spike${query}`, { timeout: 180000 });
  return { ctx, page, cdp, net, consoleCsp, errors };
}

async function waitReady(page, timeout = 180000) {
  await page.waitForFunction(() => window.__spike?.ready || (window.__spike?.errors?.length ?? 0) > 0, null, { timeout, polling: 50 });
  return page.evaluate(() => ({ ready: window.__spike.ready, timings: { ...window.__spike.timings }, errors: [...window.__spike.errors] }));
}

async function main() {
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const result = { base: BASE, chromium: browser.version(), launchArgs: LAUNCH_ARGS, fast4g: FAST_4G, generatedAt: new Date().toISOString(), heavyFiles };
  const state = await login(browser);
  const allCsp = [];

  // 1) البصمات: المتصفح (الحزمتان) مقابل Node الذهبية والخادم
  {
    const s = await openSpike(browser, state, { query: "?pkg=standard" });
    await s.page.waitForFunction(() => !!window.__spike, null, { timeout: 120000 });
    const std = await s.page.evaluate(() => window.__spike.hashes("standard"));
    const cmp = await s.page.evaluate(() => window.__spike.hashes("compat"));
    const server = await s.page.evaluate(() => window.__spike.server("compat"));
    const csp = await s.page.evaluate(() => window.__csp);
    allCsp.push(...csp, ...s.consoleCsp);
    result.hashes = {
      standard: std,
      compat: cmp,
      server,
      allBrowserMatchGolden: [...std, ...cmp].every((r) => r.match),
      serverMatchesGolden: (server.results ?? []).every((r) => std.find((x) => x.key === r.key)?.golden === r.hash),
      errors: s.errors,
    };
    console.log("hashes: browser all match golden =", result.hashes.allBrowserMatchGolden, "server match =", result.hashes.serverMatchesGolden);
    await s.ctx.close();
  }

  // 2) الجاهزية الباردة: خنق CPU ×4 + Fast 4G، ملف هاتف، بلا ذاكرة مؤقتة (سياق جديد لكل تشغيل)
  result.engineReady = {};
  for (const pkg of ["standard", "compat"]) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const s = await openSpike(browser, state, { profile: PHONE, query: `?auto=1&pkg=${pkg}&quality=high&layout=t4-grand-observatory`, cpu: 4, network: FAST_4G, recordNet: true });
      const stageAt = await s.page.waitForFunction(() => (document.querySelector("canvas") ? performance.now() : 0), null, { timeout: 180000, polling: "raf" }).then((h) => h.jsonValue());
      const info = await waitReady(s.page);
      const fcp = await s.page.evaluate(() => window.__fcp);
      const nav = await s.page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0];
        return n ? { ttfb: n.responseStart, domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd } : null;
      });
      const csp = await s.page.evaluate(() => window.__csp);
      allCsp.push(...csp, ...s.consoleCsp);
      const reqs = [...s.net.values()].filter((r) => r.url.startsWith(BASE));
      const js = reqs.filter((r) => /\.js(\?|$)/.test(r.url));
      const wasm = reqs.filter((r) => /\.wasm(\?|$)/.test(r.url));
      const bytes = (arr) => arr.reduce((a, r) => a + (r.transfer ?? 0), 0);
      runs.push({
        fcpMs: fcp && Math.round(fcp),
        stageMountedMs: Math.round(stageAt),
        engineReadySinceNavMs: info.timings.engine_ready_since_navigation_ms,
        engineReadyFromMountMs: info.timings.engine_ready_from_click_ms,
        rapierLoadMs: info.timings[`rapier_${pkg}_load_ms`],
        threeImportMs: info.timings.three_import_ms,
        nav,
        transfer: { totalBytes: bytes(reqs), jsBytes: bytes(js), wasmBytes: bytes(wasm), jsFiles: js.length, wasmFiles: wasm.map((r) => ({ url: r.url.replace(BASE, ""), type: r.type, enc: r.enc, transfer: r.transfer })) },
        encodings: [...new Set(js.map((r) => r.enc))],
        heavyRequested: heavyFiles.filter((h) => reqs.some((r) => r.url.includes(h.file))).map((h) => h.tag),
        errors: [...info.errors, ...s.errors],
      });
      console.log(pkg, "run", i, JSON.stringify(runs[runs.length - 1]).slice(0, 400));
      await s.ctx.close();
    }
    result.engineReady[pkg] = {
      runs,
      median: {
        fcpMs: median(runs.map((r) => r.fcpMs)),
        stageMountedMs: median(runs.map((r) => r.stageMountedMs)),
        engineReadySinceNavMs: median(runs.map((r) => r.engineReadySinceNavMs)),
        engineReadyFromMountMs: median(runs.map((r) => r.engineReadyFromMountMs)),
        transferBytes: median(runs.map((r) => r.transfer.totalBytes)),
      },
    };
  }

  // 3) fps وزمن الإطار 10 ث: خنق ×4، التصميم الأثقل (90 جسمًا) بإعادة متكررة، جودتان، ملفان
  result.fps = {};
  for (const [pname, profile] of [["phone", PHONE], ["desktop", DESKTOP]]) {
    for (const quality of ["high", "low"]) {
      const s = await openSpike(browser, state, { profile, query: `?auto=1&pkg=standard&quality=${quality}&layout=t4-grand-observatory&debug=perf`, cpu: 4 });
      await waitReady(s.page);
      await s.page.waitForTimeout(2000);
      const sample = await s.page.evaluate(() => window.__spike.measureFps(10000));
      const canvas = await s.page.evaluate(() => {
        const c = document.querySelector("canvas");
        return c ? { cssW: c.clientWidth, cssH: c.clientHeight, w: c.width, h: c.height } : null;
      });
      result.fps[`${pname}-${quality}`] = { ...sample, canvas, cpuThrottle: 4 };
      console.log("fps", pname, quality, JSON.stringify(result.fps[`${pname}-${quality}`]));
      if (pname === "phone" && quality === "high") await s.page.screenshot({ path: "docs/game/spike/spike-phone-high.png" });
      if (pname === "desktop" && quality === "high") await s.page.screenshot({ path: "docs/game/spike/spike-desktop-high.png" });
      allCsp.push(...(await s.page.evaluate(() => window.__csp)), ...s.consoleCsp);
      await s.ctx.close();
    }
  }

  // 4) العزل: لا three ولا Rapier ولا wasm في الرئيسية والصف والمنتج والمكتبة
  {
    const ctx = await browser.newContext({ ...DESKTOP, storageState: state });
    const page = await ctx.newPage();
    const seen = [];
    page.on("request", (r) => seen.push(r.url()));
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const grade = await page.locator('a[href^="/grades/"]').first().getAttribute("href").catch(() => null);
    const product = await page.locator('a[href^="/products/"]').first().getAttribute("href").catch(() => null);
    const visited = {};
    for (const path of ["/", grade, product, "/library"].filter(Boolean)) {
      seen.length = 0;
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      const heavy = heavyFiles.filter((h) => seen.some((u) => u.includes(h.file))).map((h) => h.tag);
      visited[path] = { requests: seen.length, jsRequests: seen.filter((u) => /\.js(\?|$)/.test(u)).length, wasm: seen.filter((u) => u.includes(".wasm")).length, heavy };
    }
    result.isolation = { visited, ok: Object.values(visited).every((v) => v.heavy.length === 0 && v.wasm === 0) };
    console.log("isolation", JSON.stringify(result.isolation));
    await ctx.close();
  }

  result.csp = { violations: allCsp, count: allCsp.length };
  console.log("csp violations", allCsp.length);
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
