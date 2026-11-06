// [تجربة المرحلة 0 - كود مؤقت] زمن إعادة المحاكاة دون عرض داخل Chromium لكل حزمة (للاستئناف على العميل)،
// بخمس جولات متتالية على التصاميم الثمانية، بلا خنق ومع خنق CPU ×4، كل حزمة في سياق جديد.
// التشغيل: node scripts/game-spike/browser-replay-bench.mjs [--base http://localhost:3200] [--passes 5]
import { chromium } from "@playwright/test";
import fs from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3200");
const PASSES = Number(arg("passes", "5"));
const OUT = arg("out", "docs/game/spike/browser-replay-results.json");
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const login = await browser.newPage();
await login.goto(`${BASE}/login?next=/admin`);
await login.fill("#email", process.env.SPIKE_ADMIN_EMAIL ?? "admin@example.com");
await login.fill("#password", process.env.SPIKE_ADMIN_PASSWORD ?? "Admin-Pass-12345");
await login.getByRole("button", { name: "تسجيل الدخول" }).click();
await login.waitForURL((u) => u.pathname.startsWith("/admin"));
const state = await login.context().storageState();
await login.context().close();

const result = { base: BASE, chromium: browser.version(), passes: PASSES, generatedAt: new Date().toISOString(), runs: {} };
for (const cpu of [1, 4]) {
  for (const pkg of ["standard", "compat"]) {
    const ctx = await browser.newContext({ storageState: state });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    await page.goto(`${BASE}/admin/game/spike?pkg=${pkg}`);
    await page.waitForFunction(() => !!window.__spike, null, { timeout: 120000 });
    const passes = [];
    for (let i = 0; i < PASSES; i++) passes.push(await page.evaluate((p) => window.__spike.hashes(p), pkg));
    const byLayout = {};
    for (const row of passes[0]) {
      const ms = passes.map((pass) => pass.find((r) => r.key === row.key).ms);
      byLayout[row.key] = { firstPassMs: ms[0], warmP50Ms: pct(ms.slice(1), 50), warmMaxMs: Math.max(...ms.slice(1)), allMatch: passes.every((pass) => pass.find((r) => r.key === row.key).match) };
    }
    const warmAll = Object.values(byLayout).map((v) => v.warmP50Ms);
    result.runs[`${pkg}-cpu${cpu}`] = { byLayout, firstPassTotalMs: Math.round(passes[0].reduce((a, r) => a + r.ms, 0)), warmMaxLayoutP50Ms: Math.max(...warmAll) };
    console.log(pkg, "cpu x" + cpu, JSON.stringify(result.runs[`${pkg}-cpu${cpu}`]).slice(0, 500));
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
