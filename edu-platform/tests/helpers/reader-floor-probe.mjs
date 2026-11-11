// يشغّل محرك القارئ وعامله كما يُخدمان للمتصفح، بعد حذف كل دالة مدمجة أحدث من حد المتصفحات (iOS 15.4 و Chrome 110)،
// ثم يفتح ملفًا ويرسم صفحاته ويقرأ نصها. يُشغَّل في عملية منفصلة لأن الحذف يمس العملية كلها.
// الاستخدام: node reader-floor-probe.mjs <engine.mjs> <worker.mjs> <assetsDir> <file.pdf>
// المخرج سطر JSON واحد: { ok, absent, installed, pages, painted, text } أو { ok: false, error }
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [engine, worker, assets, pdf] = process.argv.slice(2);

// ما تحمّله Node نفسها لاحقًا يستعمل بعض هذه الدوال: يُحمَّل أولًا، ثم تُحذف الدوال عن pdf.js وحده
void globalThis.fetch;
await Promise.all(["node:http", "node:https", "node:zlib", "node:stream/web", "node:url", "node:fs"].map((m) => import(m)));
createRequire(pathToFileURL(engine).href)("@napi-rs/canvas");

const TypedArrayProto = Object.getPrototypeOf(Uint8Array).prototype;
const IteratorProto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
/** [الكائن، الاسم، التسمية]: كل ما لا يعرفه iOS 15.4 أو Chrome 110 */
const NEWER_THAN_FLOOR = [
  [Map.prototype, "getOrInsertComputed", "Map#getOrInsertComputed"],
  [Map.prototype, "getOrInsert", "Map#getOrInsert"],
  [WeakMap.prototype, "getOrInsertComputed", "WeakMap#getOrInsertComputed"],
  [WeakMap.prototype, "getOrInsert", "WeakMap#getOrInsert"],
  [Math, "sumPrecise", "Math.sumPrecise"],
  [Math, "f16round", "Math.f16round"],
  [Promise, "try", "Promise.try"],
  [Promise, "withResolvers", "Promise.withResolvers"],
  [Array, "fromAsync", "Array.fromAsync"],
  ...["toSorted", "toReversed", "with", "toSpliced"].map((k) => [Array.prototype, k, `Array#${k}`]),
  ...["toSorted", "toReversed", "with"].map((k) => [TypedArrayProto, k, `TypedArray#${k}`]),
  [Object, "groupBy", "Object.groupBy"],
  [Map, "groupBy", "Map.groupBy"],
  [ArrayBuffer.prototype, "transfer", "ArrayBuffer#transfer"],
  [ArrayBuffer.prototype, "transferToFixedLength", "ArrayBuffer#transferToFixedLength"],
  ...["union", "intersection", "difference", "symmetricDifference", "isSubsetOf", "isSupersetOf", "isDisjointFrom"].map((k) => [Set.prototype, k, `Set#${k}`]),
  [String.prototype, "isWellFormed", "String#isWellFormed"],
  [String.prototype, "toWellFormed", "String#toWellFormed"],
  [RegExp, "escape", "RegExp.escape"],
  [Uint8Array, "fromBase64", "Uint8Array.fromBase64"],
  [Uint8Array, "fromHex", "Uint8Array.fromHex"],
  ...["toBase64", "toHex", "setFromBase64", "setFromHex"].map((k) => [Uint8Array.prototype, k, `Uint8Array#${k}`]),
  [URL, "parse", "URL.parse"],
  [URL, "canParse", "URL.canParse"],
  [Error, "isError", "Error.isError"],
  [AbortSignal, "any", "AbortSignal.any"],
  [ReadableStream.prototype, Symbol.asyncIterator, "ReadableStream#@@asyncIterator"],
  [ReadableStream, "from", "ReadableStream.from"],
  [Response.prototype, "bytes", "Response#bytes"],
  [Blob.prototype, "bytes", "Blob#bytes"],
  ...["map", "filter", "take", "drop", "flatMap", "reduce", "toArray", "forEach", "some", "every", "find"].map((k) => [IteratorProto, k, `Iterator#${k}`]),
  [globalThis, "Iterator", "Iterator"],
  [globalThis, "Float16Array", "Float16Array"],
];
const absent = [];
const stuck = [];
for (const [owner, key, label] of NEWER_THAN_FLOOR) {
  const d = Object.getOwnPropertyDescriptor(owner, key);
  if (d && !d.configurable) {
    stuck.push(label);
    continue;
  }
  if (d) delete owner[key];
  absent.push(label);
}

const steps = [];
const finish = (result) => {
  console.log(JSON.stringify({ absent, stuck, steps, ...result }));
  process.exit(result.ok ? 0 : 1);
};
const fail = (kind) => (err) => finish({ ok: false, error: `${kind}: ${err && err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : String(err)}` });
process.on("unhandledRejection", fail("unhandled rejection"));
process.on("uncaughtException", fail("uncaught exception"));
// وعد لا ينتهي تعثر أيضًا: pdf.js يبلع بعض الأخطاء داخل الرسم فتعلق الصفحة
setTimeout(() => fail("timeout")(new Error(`stuck after: ${steps.at(-1) ?? "start"}`)), 30_000).unref();

try {
  globalThis.pdfjsWorker = await import(pathToFileURL(worker).href);
  steps.push("worker loaded");
  const pdfjs = await import(pathToFileURL(engine).href);
  steps.push(`engine ${pdfjs.version}`);
  const installed = absent.filter((label) => {
    const [owner, key] = NEWER_THAN_FLOOR.find((x) => x[2] === label);
    return owner[key] !== undefined;
  });
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdf)),
    standardFontDataUrl: join(assets, "standard_fonts") + "/",
    cMapUrl: join(assets, "cmaps") + "/",
    cMapPacked: true,
    wasmUrl: join(assets, "wasm") + "/",
    verbosity: 0,
  }).promise;
  steps.push(`pages ${doc.numPages}`);
  let painted = 0;
  const text = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1.5 });
    const { canvas } = doc.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, viewport }).promise;
    const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] && (px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200)) painted++;
    text.push((await page.getTextContent()).items.map((t) => t.str).join(" "));
    steps.push(`page ${n} drawn`);
  }
  await doc.loadingTask.destroy();
  finish({ ok: true, installed, pages: doc.numPages, painted, text });
} catch (err) {
  fail("error")(err);
}
