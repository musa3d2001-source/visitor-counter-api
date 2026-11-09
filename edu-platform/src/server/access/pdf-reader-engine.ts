/**
 * فتح الملف بالمحرك نفسه الذي يعرضه للطالب (pdfjs-dist بالإصدار ذاته)، لأن pdf-lib أكثر تساهلًا منه:
 * ملفات يقبلها pdf-lib ويختمها ثم يرفضها القارئ عند الطالب.
 *
 * يعمل في خيط منفصل لثلاثة أسباب:
 * - المحرك يترك Promise مرفوضة بلا معالج عند ملف تالف الشجرة، وهي في الخيط الرئيسي قد تُسقط العملية كلها
 * - الملف الثقيل لا يعطل طلبات الآخرين
 * - المهلة حقيقية: إنهاء الخيط يوقف العمل فعلًا
 *
 * إن تعذر تشغيل المحرك نفسه تكون النتيجة unavailable وتبقى فحوص pdf-lib وحدها، حتى لا يتوقف كل رفع بسبب خلل في التشغيل.
 * أما حكم المحرك على ملف فلا يُتجاوز.
 */
import "server-only";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

export type ReaderVerdict =
  | { status: "ok"; pages: number; encrypted: boolean }
  | { status: "failed"; problem: "encrypted" | "corrupt" | "too_complex" }
  | { status: "unavailable" };

/** أقصى وقت لفتح الملف والمرور على صفحاته. ملف من 6000 صفحة أخذ ثانيتين، انظر docs/PDF_STAMPING.md */
export const READER_BUDGET_MS = 30_000;

/** الكود نص لأن الحزم لا تُجمَّع داخل خيط، والمسارات تصله جاهزة */
const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const { pathToFileURL } = require("node:url");
process.on("unhandledRejection", () => {});
(async () => {
  let pdfjs;
  try {
    globalThis.pdfjsWorker = await import(pathToFileURL(workerData.workerPath).href);
    pdfjs = await import(pathToFileURL(workerData.libPath).href);
  } catch (err) {
    parentPort.postMessage({ status: "unavailable", detail: String(err) });
    return;
  }
  const task = pdfjs.getDocument({ data: workerData.bytes, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    const { info } = await doc.getMetadata();
    for (let n = 1; n <= doc.numPages; n++) await doc.getPage(n);
    parentPort.postMessage({ status: "ok", pages: doc.numPages, encrypted: Boolean(info.EncryptFilterName) });
  } catch (err) {
    parentPort.postMessage({ status: "failed", problem: err && err.name === "PasswordException" ? "encrypted" : "corrupt" });
  }
})();
`;

function enginePaths(): { libPath: string; workerPath: string } {
  // يُحل وقت التشغيل من جذر المشروع؛ الملفات مضمومة للنشر في next.config.ts
  const resolver = createRequire(join(process.cwd(), "package.json"));
  return { libPath: resolver.resolve("pdfjs-dist/legacy/build/pdf.mjs"), workerPath: resolver.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs") };
}

type WorkerMessage = ReaderVerdict & { detail?: string };

export function openInReader(bytes: Uint8Array): Promise<ReaderVerdict> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      // المحرك يأخذ ملكية المصفوفة، فننقل إليه نسخة
      const copy = new Uint8Array(bytes);
      worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { ...enginePaths(), bytes: copy }, transferList: [copy.buffer], stdout: true, stderr: true });
    } catch (err) {
      console.error("[pdf] reader engine unavailable", err);
      resolve({ status: "unavailable" });
      return;
    }

    let settled = false;
    const finish = (verdict: ReaderVerdict) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(verdict);
    };
    const timer = setTimeout(() => finish({ status: "failed", problem: "too_complex" }), READER_BUDGET_MS);

    worker.once("message", ({ detail, ...verdict }: WorkerMessage) => {
      if (verdict.status === "unavailable") console.error("[pdf] reader engine unavailable", detail);
      finish(verdict as ReaderVerdict);
    });
    worker.once("error", (err: NodeJS.ErrnoException) => {
      // ملف استنفد ذاكرة الخيط سيعجز عنه هاتف الطالب أيضًا. غير ذلك فخلل تشغيل لا يدين الملف
      if (err.code === "ERR_WORKER_OUT_OF_MEMORY") return finish({ status: "failed", problem: "too_complex" });
      console.error("[pdf] reader engine crashed", err);
      finish({ status: "unavailable" });
    });
    worker.once("exit", () => finish({ status: "unavailable" }));
  });
}
