// [تجربة المرحلة 0 - كود مؤقت] أحجام التجربة من مخرجات `next build` الفعلية (.next).
// التشغيل (بعد npx next build، من edu-platform): node scripts/game-spike/measure-sizes.mjs > docs/game/spike/sizes.json
// - يصنّف أجزاء .next/static/chunks حسب محتواها (three، غراء Rapier العادي، -compat، wasm، المحرك، واجهة التجربة).
// - gzip = zlib مستوى 6 لكل ملف كامل (نفس طريقة baseline/measured)، وbrotli = جودة 11 (ما تقدمه CDN عادة) للعلم.
// - يتحقق أن أي جزء فيه three أو Rapier ليس من JS التحميل الأول لأي مسار (من page_client-reference-manifest.js).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";

const dir = path.resolve(".next");
const chunksDir = path.join(dir, "static/chunks");
const sizeOf = (abs) => {
  const buf = fs.readFileSync(abs);
  return {
    raw: buf.length,
    gzip: zlib.gzipSync(buf, { level: 6 }).length,
    brotli: zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length,
  };
};

function classify(name, text) {
  if (name.endsWith(".wasm")) return "rapier-wasm";
  const tags = [];
  if (/WebGLRenderer/.test(text) && /"1[89][0-9]"/.test(text)) tags.push("three");
  if (/rawbroadphase_castRay/.test(text)) tags.push(text.length > 2_000_000 ? "rapier-compat" : "rapier-standard-glue");
  if (/step cap exceeded/.test(text)) tags.push("spike-engine");
  if (/بطاقة أهداف المستوى/.test(text)) tags.push("spike-stage");
  if (/instantiateStreaming\(i,r\)/.test(text) && text.length < 2_000_000) tags.push("turbopack-wasm-loader");
  return tags.join("+") || null;
}

const files = fs.readdirSync(chunksDir).filter((f) => f.endsWith(".js") || f.endsWith(".wasm"));
const tagged = {};
for (const f of files) {
  const abs = path.join(chunksDir, f);
  const text = f.endsWith(".wasm") ? "" : fs.readFileSync(abs, "utf8");
  const tag = classify(f, text);
  if (tag) tagged[`static/chunks/${f}`] = { tag, ...sizeOf(abs) };
}

// JS التحميل الأول لكل مسار (rootMainFiles + entryJSFiles)
const bm = JSON.parse(fs.readFileSync(path.join(dir, "build-manifest.json"), "utf8"));
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "page_client-reference-manifest.js" ? [path.join(d, e.name)] : []));
const routes = {};
const offenders = [];
for (const file of walk(path.join(dir, "server/app"))) {
  const ctx = { globalThis: {} };
  ctx.globalThis.__RSC_MANIFEST = {};
  vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx);
  const [key, m] = Object.entries(ctx.globalThis.__RSC_MANIFEST)[0];
  const route = ("/" + key.replace(/\/(page|route)$/, "").split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/")).replace(/^\/$/, "/");
  const js = new Set(bm.rootMainFiles);
  for (const list of Object.values(m.entryJSFiles ?? {})) for (const f of list) js.add(f);
  let raw = 0;
  let gzip = 0;
  for (const f of js) {
    const s = sizeOf(path.join(dir, f));
    raw += s.raw;
    gzip += s.gzip;
    const t = tagged[f]?.tag ?? "";
    if (/three|rapier/.test(t)) offenders.push({ route, file: f, tag: t });
  }
  routes[route] = { initialJs: { raw, gzip }, files: js.size };
}

const sum = (pred) =>
  Object.values(tagged)
    .filter(pred)
    .reduce((a, s) => ({ raw: a.raw + s.raw, gzip: a.gzip + s.gzip, brotli: a.brotli + s.brotli }), { raw: 0, gzip: 0, brotli: 0 });

const out = {
  method: "next build output (.next/static/chunks), gzip level 6 per whole file, brotli quality 11; chunks classified by content signature",
  buildId: fs.readFileSync(path.join(dir, "BUILD_ID"), "utf8").trim(),
  chunks: tagged,
  groups: {
    three: sum((s) => s.tag.includes("three")),
    rapierStandardGlue: sum((s) => s.tag.includes("rapier-standard-glue")),
    rapierWasm: sum((s) => s.tag === "rapier-wasm"),
    rapierCompat: sum((s) => s.tag.includes("rapier-compat")),
    spikeEngine: sum((s) => s.tag.includes("spike-engine")),
    spikeStage: sum((s) => s.tag.includes("spike-stage")),
  },
  spikeRouteInitialJs: routes["/admin/game/spike"],
  initialJsOffenders: offenders,
  routes,
};
console.log(JSON.stringify(out, null, 2));
