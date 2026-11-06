// [تجربة المرحلة 0] يلخص ملفات تتبع الخادم (.nft.json) لمسارات محددة بعد next build:
// عدد الملفات وحجمها وأي ملفات .wasm أو حزم three/@dimforge فيها. يقيس خطر تجاوز حد دوال Vercel.
// التشغيل: node scripts/game-spike/trace-report.mjs [route.nft.json ...]   (المسارات نسبية إلى .next/server/app)
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
const base = resolve(".next/server/app");
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["admin/game/spike/page.js.nft.json", "admin/game/spike/replay/route.js.nft.json", "admin/settings/page.js.nft.json", "(site)/page.js.nft.json", "api/progress/route.js.nft.json"];
const out = {};
for (const t of targets) {
  const file = resolve(base, t);
  let j;
  try {
    j = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    out[t] = { error: "missing" };
    continue;
  }
  let bytes = 0;
  let n = 0;
  const wasm = [];
  const pk = { three: 0, "@dimforge": 0 };
  for (const f of j.files) {
    const p = resolve(dirname(file), f);
    try {
      const s = statSync(p);
      if (s.isFile()) {
        bytes += s.size;
        n++;
      }
    } catch {}
    if (f.endsWith(".wasm")) wasm.push(f.replace(/^(\.\.\/)+/, ""));
    if (f.includes("node_modules/three/")) pk.three++;
    if (f.includes("node_modules/@dimforge/")) pk["@dimforge"]++;
  }
  out[t] = { files: j.files.length, existingFiles: n, mb: Math.round(bytes / 1e5) / 10, wasm, pkgFiles: pk };
}
console.log(JSON.stringify(out, null, 2));
