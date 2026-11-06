// [تجربة المرحلة 0 - كود مؤقت] قياس WebKit عبر WebKitGTK (نفس محرك WebKit/JavaScriptCore في Safari، على Linux x86_64)
// لأن تنزيل WebKit الخاص بـ Playwright محجوب في هذه البيئة (403 من cdn.playwright.dev وplaywright.download.prss.microsoft.com).
// المتطلبات: apt-get install -y webkit2gtk-driver xvfb xauth ، ثم:
//   xvfb-run -a WebKitWebDriver --port=4444 &
//   node scripts/game-spike/webkit-bench.mjs [--base http://localhost:3200] [--driver http://127.0.0.1:4444]
// يسجّل الدخول بالنموذج، ثم يحسب بصمات التصاميم الثمانية بالحزمتين في WebKit، ويقارنها بالذهبية (Node) وبالخادم.
import fs from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3200");
const DRIVER = arg("driver", "http://127.0.0.1:4444");
const OUT = arg("out", "docs/game/spike/webkit-results.json");
const ADMIN = { email: process.env.SPIKE_ADMIN_EMAIL ?? "admin@example.com", password: process.env.SPIKE_ADMIN_PASSWORD ?? "Admin-Pass-12345" };
const BINARY = "/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser";

async function wd(method, path, body) {
  const r = await fetch(`${DRIVER}${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(`${path}: ${j.value.error} ${j.value.message}`);
  return j.value;
}

async function main() {
  const session = await wd("POST", "/session", {
    capabilities: { alwaysMatch: { "webkitgtk:browserOptions": { binary: BINARY, args: ["--automation"] }, acceptInsecureCerts: true } },
  });
  const sid = session.sessionId;
  const S = (m, p, b) => wd(m, `/session/${sid}${p}`, b);
  const exec = (script, args = []) => S("POST", "/execute/sync", { script, args });
  const execAsync = (script, args = []) => S("POST", "/execute/async", { script, args });
  await S("POST", "/timeouts", { script: 600000, pageLoad: 180000, implicit: 0 });
  const result = { base: BASE, browser: { name: session.capabilities.browserName, version: session.capabilities.browserVersion, platform: session.capabilities.platformName }, generatedAt: new Date().toISOString() };
  try {
    // كوكي الجلسة في `next start` يحمل Secure، وWebKitGTK لا يحفظ كوكي Secure على http://localhost (Chromium يفعل).
    // لذلك نسجّل الدخول بالنموذج نفسه في Chromium (Playwright) وننقل قيمة الكوكي إلى WebKit دون Secure.
    const { chromium } = await import("@playwright/test");
    const cb = await chromium.launch();
    const cp = await cb.newPage();
    await cp.goto(`${BASE}/login?next=/admin`);
    await cp.fill("#email", ADMIN.email);
    await cp.fill("#password", ADMIN.password);
    await cp.getByRole("button", { name: "تسجيل الدخول" }).click();
    await cp.waitForURL((u) => u.pathname.startsWith("/admin"), { timeout: 60000 });
    const cookie = (await cp.context().cookies()).find((c) => c.name === "session");
    await cb.close();
    await S("POST", "/url", { url: `${BASE}/robots.txt` });
    result.userAgent = await exec("return navigator.userAgent");
    await S("POST", "/cookie", { cookie: { name: "session", value: cookie.value, path: "/", domain: "localhost", httpOnly: true, secure: false, sameSite: "Lax" } });
    result.cookiesInWebkit = (await S("GET", "/cookie")).map((c) => ({ name: c.name, domain: c.domain, secure: c.secure }));
    console.log("cookies", JSON.stringify(result.cookiesInWebkit));
    result.afterLoginUrl = await S("GET", "/url");
    await S("POST", "/url", { url: `${BASE}/admin/game/spike` });
    result.spikeUrl = await S("GET", "/url");
    for (let i = 0; i < 120; i++) {
      if (await exec("return !!window.__spike")) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!(await exec("return !!window.__spike"))) {
      fs.writeFileSync("/tmp/claude-0/-home-user/e361d345-2d68-5683-a08a-09a4ce05cead/scratchpad/game/webkit-probe/debug.png", Buffer.from(await S("GET", "/screenshot"), "base64"));
      throw new Error(`spike api missing at ${result.spikeUrl} (after login: ${result.afterLoginUrl})`);
    }
    result.wasm = await exec("return { instantiateStreaming: typeof WebAssembly.instantiateStreaming, webgl2: !!document.createElement('canvas').getContext('webgl2') }");
    for (const pkg of ["standard", "compat"]) {
      const t0 = Date.now();
      const rows = await execAsync(
        `const done = arguments[arguments.length - 1];
         window.__spike.hashes(arguments[0]).then((r) => done({ ok: true, rows: r })).catch((e) => done({ ok: false, error: String(e && e.stack || e) }));`,
        [pkg],
      );
      result[pkg] = { ...rows, wallMs: Date.now() - t0, allMatchGolden: rows.ok ? rows.rows.every((r) => r.match) : false };
      console.log("webkit", pkg, JSON.stringify(result[pkg]).slice(0, 600));
    }
    const server = await execAsync(
      `const done = arguments[arguments.length - 1];
       window.__spike.server('compat').then((r) => done(r)).catch((e) => done({ error: String(e) }));`,
    );
    result.server = server;
    result.serverMatchesWebkit = (server.results ?? []).every((r) => result.standard.rows?.find((x) => x.key === r.key)?.hash === r.hash);
    // تحميل المحرك والرسم بالجودة المنخفضة (WebGL2 في WebKitGTK تحت Xvfb برمجي)
    await S("POST", "/url", { url: `${BASE}/admin/game/spike?auto=1&pkg=standard&quality=low&layout=t4-grand-observatory&debug=perf` });
    let info = null;
    for (let i = 0; i < 240; i++) {
      info = await exec("return window.__spike ? { ready: window.__spike.ready, timings: window.__spike.timings, errors: window.__spike.errors } : null");
      if (info && (info.ready || info.errors.length)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    result.engine = info;
    if (info?.ready) {
      result.fpsLow = await execAsync(`const done = arguments[arguments.length - 1]; window.__spike.measureFps(10000).then(done);`);
      const shot = await S("GET", "/screenshot");
      fs.writeFileSync("docs/game/spike/spike-webkitgtk-low.png", Buffer.from(shot, "base64"));
    }
    console.log("webkit engine", JSON.stringify(result.engine), "fps", JSON.stringify(result.fpsLow));
  } finally {
    await wd("DELETE", `/session/${sid}`).catch(() => {});
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
