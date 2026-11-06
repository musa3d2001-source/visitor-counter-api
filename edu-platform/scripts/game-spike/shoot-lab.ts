/**
 * تصوير الاتجاهات الفنية الثلاثة للجنة الحكم: ‎/lab/game/{a,b,c}?state={aim,question,result}‎ على 390 و820 و1440.
 *   npx tsx scripts/game-spike/shoot-lab.ts [--base http://localhost:3200] [--out docs/game/art]
 * يتطلب ‎next dev‎ (المختبر 404 في الإنتاج) ويعمل خارج الحماية، ويفشل صراحة إن لم يتوفر WebGL2.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3200";
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "docs/game/art";
/** ‎--docs‎: صور JPEG بكثافة 1 لملفات الوثائق (أخف للمستودع)؛ بدونها PNG بكثافة 2 للجوال للحكّام */
const docs = args.includes("--docs");
const VIEWPORTS = [
  { w: 390, h: 844, mobile: true },
  { w: 820, h: 1180, mobile: true },
  { w: 1440, h: 900, mobile: false },
];

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.mobile && !docs ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile, locale: "ar-KW" });
    const page = await ctx.newPage();
    for (const dir of ["a", "b", "c"]) {
      for (const state of ["aim", "question", "result"]) {
        await page.goto(`${base}/lab/game/${dir}?state=${state}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
        const gl2 = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
        if (!gl2) throw new Error("WebGL2 unavailable");
        await page.waitForSelector('[data-ready="1"]', { timeout: 180_000 });
        // شارة أدوات التطوير في next dev ليست من التصميم
        await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await page.screenshot(docs ? { path: `${out}/${dir}-${state}-${vp.w}.jpg`, type: "jpeg", quality: 80 } : { path: `${out}/${dir}-${state}-${vp.w}.png` });
        console.log(`${dir} ${state} ${vp.w} overflowX=${overflow}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
