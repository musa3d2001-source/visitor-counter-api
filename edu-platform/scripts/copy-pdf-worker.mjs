// يجهز ملفات قارئ PDF في public/pdfjs/<الإصدار> لتُخدم من نفس النطاق وتتوافق مع سياسة CSP:
// المحرك والعامل للمتصفح، والخطوط القياسية و CMaps و WASM. الإصدار جزء من المسار لأن next.config.ts يخزّنها سنة كاملة:
// ترقية pdfjs-dist مسار جديد، فلا يجتمع في متصفح الطالب عامل قديم مع مكتبة جديدة.
//
// المحرك والعامل من نسخة pdf.js «القديمة» (legacy) للإصدار نفسه (القرار F27، البند R018)، ويُضاف إليهما ما ينقص حد المتصفحات
// في src/lib/reader-assets.ts (iOS 15.4 و Chrome 110):
//  - مقدمة صغيرة تعرّف Promise.withResolvers و ArrayBuffer#transferToFixedLength حيث لا توجد (النسخة القديمة تستدعيهما بلا بديل)،
//    وتخفي OffscreenCanvas حيث لا يرسم ثنائي الأبعاد (Safari 16.0 إلى 16.3) فيرسم pdf.js على اللوحة العادية
//  - كتل static داخل الأصناف (Safari 16.4) تصير حقولًا ساكنة خاصة تنفذ الكود نفسه بالترتيب نفسه
// اختبار tests/unit/reader-floor.test.ts يشغّل الملفين الناتجين بعد حذف كل دالة أحدث من الحد، ويرفض أي صياغة أحدث منه.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules/pdfjs-dist");
if (!existsSync(pkg)) {
  console.warn("[copy-pdf-worker] pdfjs-dist غير مثبت بعد، تم التخطي");
  process.exit(0);
}
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));

// يطابق PDF_READER_RECIPE في src/lib/reader-assets.ts، والاختبار يقارنهما. غيّره مع أي تغيير في طريقة البناء أدناه
const RECIPE = "r1";
const ENGINE_FILE = `pdf.${RECIPE}.min.mjs`;
const WORKER_FILE = `pdf.worker.${RECIPE}.min.mjs`;

const PRELUDE = `/* Darb reader floor prelude (${RECIPE}): what pdf.js legacy ${version} calls but iOS 15.4 and Chrome 110 lack. */
(function () {
  var define = function (target, name, value) {
    Object.defineProperty(target, name, { configurable: true, writable: true, enumerable: false, value: value });
  };
  if (typeof Promise.withResolvers !== "function") {
    define(Promise, "withResolvers", function withResolvers() {
      var resolve, reject;
      var promise = new this(function (a, b) { resolve = a; reject = b; });
      return { promise: promise, resolve: resolve, reject: reject };
    });
  }
  var AB = ArrayBuffer.prototype;
  if (typeof AB.transferToFixedLength !== "function") {
    var transfer = function (newLength) {
      var length = newLength === undefined ? this.byteLength : Math.max(0, Math.trunc(Number(newLength)) || 0);
      var out = new ArrayBuffer(length);
      new Uint8Array(out).set(new Uint8Array(this, 0, Math.min(length, this.byteLength)));
      return out;
    };
    define(AB, "transferToFixedLength", transfer);
    if (typeof AB.transfer !== "function") define(AB, "transfer", transfer);
  }
  if (typeof OffscreenCanvas !== "undefined") {
    var draws = false;
    try { draws = !!new OffscreenCanvas(1, 1).getContext("2d"); } catch (e) { draws = false; }
    if (!draws) define(globalThis, "OffscreenCanvas", undefined);
  }
})();
`;

const require = createRequire(import.meta.url);
function typescript() {
  try {
    return require("typescript");
  } catch {
    // تثبيت بلا devDependencies (npm ci --omit=dev) لا يفشل هنا: لا تُكتب ملفات، فيعيد next build تشغيل السكربت (next.config.ts)
    if (process.env.npm_lifecycle_event === "postinstall") {
      console.warn("[copy-pdf-worker] typescript غير مثبتة بعد، تم التخطي. next build يجهز القارئ أو يتوقف");
      process.exit(0);
    }
    // بلا المحلل لا تُحوَّل الصياغة، وقارئ بلا تحويل لا يفتح على iPhone أقدم من 16.4. البناء يتوقف هنا بدل أن يُنشر
    console.error("[copy-pdf-worker] حزمة typescript غير مثبتة (من devDependencies)، ولا يُبنى القارئ بدونها");
    process.exit(1);
  }
}

/** كتل static في الأصناف، الأعمق أولًا، وكل مرة من تحليل جديد فلا تختل المواضع */
function lowerStaticBlocks(ts, code, file) {
  let out = code;
  for (let i = 0; ; i++) {
    const sf = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (sf.parseDiagnostics.length) throw new Error(`${file}: ${sf.parseDiagnostics.length} parse errors`);
    let target = null;
    const visit = (node) => {
      if (ts.isClassStaticBlockDeclaration(node)) target = node;
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (!target) return { code: out, lowered: i };
    if (i > 50) throw new Error(`${file}: too many static blocks`);
    // static { ... } صار static #name = (() => { ... })(); — this و super والأسماء الخاصة كما هي، والترتيب بين الحقول نفسه
    const body = out.slice(target.body.getStart(sf), target.body.end);
    out = `${out.slice(0, target.getStart(sf))}static #readerFloorStatic${i}=(()=>${body})();${out.slice(target.end)}`;
  }
}

function buildForFloor(ts, from, to) {
  const source = readFileSync(join(pkg, from), "utf8");
  const { code, lowered } = lowerStaticBlocks(ts, source, from);
  const check = ts.createSourceFile(to, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (check.parseDiagnostics.length) throw new Error(`${to}: the lowered file does not parse`);
  // الكتابة إلى ملف مؤقت ثم إعادة التسمية: بناء انقطع في منتصفه لا يترك ملفًا ناقصًا بالاسم الذي يُخدم
  const tmp = `${to}.tmp`;
  writeFileSync(tmp, PRELUDE + code);
  renameSync(tmp, to);
  return lowered;
}

const base = join(root, "public/pdfjs");
const dest = join(base, version);
// ما بقي من إصدار سابق أو من التخطيط القديم بلا إصدار لا يطلبه أحد، ويُخزَّن في النشر بلا فائدة
for (const entry of existsSync(base) ? readdirSync(base) : []) {
  if (entry !== version) rmSync(join(base, entry), { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });
const ts = typescript();
const engineBlocks = buildForFloor(ts, "legacy/build/pdf.min.mjs", join(dest, ENGINE_FILE));
const workerBlocks = buildForFloor(ts, "legacy/build/pdf.worker.min.mjs", join(dest, WORKER_FILE));
// الاسم القديم للعامل: صفحة قارئ فُتحت قبل النشر تطلبه بعده. العامل نفسه للإصدار نفسه، فيعمل مع محركها
copyFileSync(join(dest, WORKER_FILE), join(dest, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
  if (existsSync(join(pkg, dir))) cpSync(join(pkg, dir), join(dest, dir), { recursive: true });
}
console.log(`[copy-pdf-worker] تم تجهيز قارئ PDF في public/pdfjs/${version} (${ENGINE_FILE} و ${WORKER_FILE}، كتل static محوّلة: ${engineBlocks} و ${workerBlocks})`);
