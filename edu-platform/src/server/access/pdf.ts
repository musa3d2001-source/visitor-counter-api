import "server-only";
import { PDFDocument, PDFName, PDFParser, PDFStreamWriter, ParseSpeeds, StandardFonts, degrees, rgb, type PDFContext, type PDFPage } from "pdf-lib";
import { maxPreviewPages } from "@/lib/preview-policy";
import { STAMP_MAX_PAGES } from "@/lib/pdf-limits";
import { assertIsolated, isolatePages, PreviewNotIsolatedError } from "./pdf-isolate";
import { openInReader } from "./pdf-reader-engine";
import { reportError } from "../platform/report-error";

export { PreviewNotIsolatedError };

/**
 * معالجة PDF على الخادم:
 * - فحص الملف عند الرفع على مسار الختم الفعلي
 * - قراءة عدد الصفحات عند الرفع
 * - استخراج صفحات المعاينة المجانية
 * - ختم علامة مائية ديناميكية تحمل هوية المشتري (بريده/رقمه المرجعي) على كل صفحة
 * ملاحظة: العلامة بأحرف لاتينية لأن خطوط PDF القياسية لا تدعم تشكيل العربية.
 */

/** over_limit: أكبر من حد الختم (الحجم أو عدد الصفحات في lib/pdf-limits.ts) */
export type PdfProblem = "not_pdf" | "encrypted" | "corrupt" | "too_complex" | "over_limit";

/** ملف لا يمكن تسليمه لمشترٍ: محمي أو تالف. يختلف عن تعطل التخزين أو الشبكة */
export class PdfUnusableError extends Error {
  constructor(public readonly problem: PdfProblem) {
    super(`pdf unusable: ${problem}`);
    this.name = "PdfUnusableError";
  }
}

/** مهلة الختم التجريبي عند الرفع. انظر قياسات docs/PDF_STAMPING.md */
export const TRIAL_STAMP_BUDGET_MS = 30_000;
/**
 * مهلة الختم عند التسليم: ثلاثة أضعاف التجربة عند الرفع، والتجربة تشمل فوقها فتح الملف بمحرك القارئ مرتين،
 * فما نجح عند الرفع ينتهي هنا ولو كان الخادم أبطأ تحت الضغط. ملف قديم لم يُفحص يتوقف عندها برسالة صادقة.
 */
export const DELIVERY_STAMP_BUDGET_MS = 90_000;

/** الختم تجاوز مهلته فتوقف فعلًا. نوعه too_complex كما كان، فيُعامل ملف لم يُفحص كما سبق */
export class StampDeadlineError extends PdfUnusableError {
  constructor() {
    super("too_complex");
    this.name = "StampDeadlineError";
  }
}

export type Deadline = { readonly at: number; check(): void };

export function deadlineIn(ms: number): Deadline {
  const at = Date.now() + ms;
  return {
    at,
    check() {
      if (Date.now() > at) throw new StampDeadlineError();
    },
  };
}

/**
 * pdf-lib لا يُلغى: سباق مع مؤقت يعيد الجواب للطلب ويترك العمل يأكل المعالج والذاكرة حتى ينتهي (K107).
 * لذلك يوضع فحص المهلة في النقطة التي يستدعيها pdf-lib نفسه بعد كل كائن يقرؤه أو يكتبه (shouldWaitForTick)،
 * فيُرمى الخطأ من داخل الحلقة ويتوقف العمل فعلًا. هذه نقطة داخلية في pdf-lib 1.17.1 (النسخة مثبتة في package.json)،
 * واختبار tests/unit/pdf-deadline.test.ts يفشل إن تغيرت فلم يعد الفحص يُستدعى.
 */
type Ticking = { shouldWaitForTick: (...args: number[]) => boolean };

function guardTicks(target: unknown, deadline: Deadline) {
  const ticking = target as Ticking;
  const original = ticking.shouldWaitForTick;
  if (typeof original !== "function") throw new Error("pdf-lib internals changed: shouldWaitForTick is missing");
  ticking.shouldWaitForTick = (...args: number[]) => {
    deadline.check();
    return original(...args);
  };
}

type DocumentConstructor = new (context: PDFContext, ignoreEncryption: boolean, updateMetadata: boolean) => PDFDocument;

/** مثل PDFDocument.load بخيارات الختم نفسها، والمهلة تُفحص بعد كل كائن يُقرأ */
async function loadWithDeadline(bytes: Uint8Array, deadline: Deadline): Promise<PDFDocument> {
  const parser = PDFParser.forBytesWithOptions(bytes, ParseSpeeds.Fast, false, false);
  guardTicks(parser, deadline);
  const context = await parser.parseDocument();
  deadline.check();
  // ما يفعله load بعد القراءة. المُنشئ «خاص» في الأنواع فقط
  return new (PDFDocument as unknown as DocumentConstructor)(context, true, false);
}

/**
 * مثل doc.save({ objectsPerTick }) بباقي الخيارات الافتراضية، والمهلة تُفحص بعد كل كائن يُكتب:
 * - addDefaultPage لا يلزم: الملف المفتوح له صفحة على الأقل (openForEditing يرفض غير ذلك).
 * - updateFieldAppearances في save يعمل فقط على نموذج سبق فتحه بـ getForm، ولا نفتحه هنا.
 * tests/unit/pdf-deadline.test.ts يقارن الناتج بايتًا ببايت مع save.
 */
export async function saveWithDeadline(doc: PDFDocument, deadline: Deadline, objectsPerTick = 500): Promise<Uint8Array> {
  await doc.flush();
  deadline.check();
  const writer = PDFStreamWriter.forContext(doc.context, objectsPerTick);
  guardTicks(writer, deadline);
  return writer.serializeToBuffer();
}

/**
 * يفتح الملف كما يفتحه الختم. نترك ignoreEncryption حتى نقرأ الملف المحمي بكلمة مالك ونصنّفه،
 * ثم نرفضه: pdf-lib لا يفك التشفير، فنسخته المختومة تتلف عند القارئ.
 */
async function openForEditing(bytes: Uint8Array, deadline?: Deadline): Promise<PDFDocument> {
  let doc: PDFDocument;
  try {
    doc = deadline ? await loadWithDeadline(bytes, deadline) : await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, parseSpeed: ParseSpeeds.Fast });
  } catch (err) {
    if (err instanceof StampDeadlineError) throw err;
    throw new PdfUnusableError("corrupt");
  }
  if (doc.isEncrypted) throw new PdfUnusableError("encrypted");
  let pages = 0;
  try {
    pages = doc.getPageCount();
  } catch {
    // شجرة صفحات مكسورة: pdf-lib يحمّل الملف ثم يتعثر عند أول سؤال عن صفحاته
  }
  if (pages < 1) throw new PdfUnusableError("corrupt");
  return doc;
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  return (await openForEditing(bytes)).getPageCount();
}

/**
 * الجزء الظاهر من الصفحة: تقاطع CropBox وMediaBox كما يحسبه القارئ، وقد لا يبدأ من الصفر.
 * عند الدوران تتبادل الصفحة عرضها وارتفاعها أمام القارئ.
 */
function visibleBox(page: PDFPage) {
  const corners = (b: { x: number; y: number; width: number; height: number }) => ({
    x0: Math.min(b.x, b.x + b.width),
    y0: Math.min(b.y, b.y + b.height),
    x1: Math.max(b.x, b.x + b.width),
    y1: Math.max(b.y, b.y + b.height),
  });
  const media = corners(page.getMediaBox());
  const crop = corners(page.getCropBox());
  const common = { x0: Math.max(media.x0, crop.x0), y0: Math.max(media.y0, crop.y0), x1: Math.min(media.x1, crop.x1), y1: Math.min(media.y1, crop.y1) };
  const box = common.x1 > common.x0 && common.y1 > common.y0 ? common : media;
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  if (![box.x0, box.y0, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new PdfUnusableError("corrupt");
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  const rotation = angle % 90 === 0 ? angle : 0;
  const sideways = rotation === 90 || rotation === 270;
  return { x: box.x0, y: box.y0, width, height, rotation, viewWidth: sideways ? height : width, viewHeight: sideways ? width : height };
}

type VisibleBox = ReturnType<typeof visibleBox>;

/** يحول موضعًا كما يراه القارئ إلى إحداثيات الصفحة. علامة تقع خارج الجزء الظاهر لا تُكتب أصلًا: الملف يُرفض */
function pointOnPage(box: VisibleBox, viewX: number, viewY: number) {
  if (!(viewX >= 0 && viewY >= 0 && viewX <= box.viewWidth && viewY <= box.viewHeight)) throw new PdfUnusableError("corrupt");
  if (box.rotation === 90) return { x: box.x + box.width - viewY, y: box.y + viewX };
  if (box.rotation === 180) return { x: box.x + box.width - viewX, y: box.y + box.height - viewY };
  if (box.rotation === 270) return { x: box.x + viewY, y: box.y + box.height - viewX };
  return { x: box.x + viewX, y: box.y + viewY };
}

/**
 * أول count صفحة، معزولة عن بقية الملف. يتحقق من النتيجة بعد حفظها، فلا يخرج ملف لم يثبت عزله.
 * المهلة تُفحص في الحفظ وفي قراءة النتيجة للتحقق كما في الختم (البند R008)، فلا يبقى بناء معاينة يعمل بلا نهاية.
 */
async function buildIsolatedPreview(src: PDFDocument, count: number, label: boolean, deadline: Deadline): Promise<Uint8Array> {
  try {
    isolatePages(
      src.context,
      src.getPages().slice(0, count).map((p) => p.node),
    );
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, Array.from({ length: count }, (_, i) => i));
    deadline.check();
    for (const p of copied) out.addPage(p);
    if (label) {
      const font = await out.embedFont(StandardFonts.HelveticaBold);
      for (const page of out.getPages()) {
        const box = visibleBox(page);
        // صفحة فارغة بلا محتوى: الرسم يُسجل غلاف q/Q ولا يربطه بها فيبقى كائنًا يتيمًا
        if (!page.node.Contents()) page.node.set(PDFName.of("Contents"), out.context.obj([]));
        page.drawText("FREE PREVIEW", { ...pointOnPage(box, Math.max(4, box.viewWidth - 110), Math.min(14, box.viewHeight / 2)), size: 10, font, color: rgb(0.06, 0.32, 0.34), opacity: 0.7, rotate: degrees(box.rotation) });
        // الرسم يضيف قائمة روابط فارغة. لا روابط في المعاينة، والفحص لا يقبل وجود القائمة أصلًا
        page.node.delete(PDFName.of("Annots"));
      }
    }
    out.setTitle("Preview");
    out.setProducer("edu-platform");
    const saved = await saveWithDeadline(out, deadline, 500);
    assertIsolated(await loadWithDeadline(saved, deadline), count);
    return saved;
  } catch (err) {
    if (err instanceof PreviewNotIsolatedError || err instanceof StampDeadlineError) throw err;
    await reportError("pdf:preview-isolation", err);
    throw new PreviewNotIsolatedError("could not rebuild pages");
  }
}

/**
 * يطبق قاعدة المعاينة على الملف الفعلي. null: الملف أقصر من أن تكون له معاينة.
 * بمهلة الفحص عند الرفع نفسها: ما يُفتح ويُختم تجريبيًا فيها يُبنى منه بضع صفحات فيها. تجاوزها StampDeadlineError
 */
export async function extractPreview(bytes: Uint8Array, pages: number, budgetMs = TRIAL_STAMP_BUDGET_MS): Promise<{ bytes: Uint8Array; pageCount: number } | null> {
  const deadline = deadlineIn(budgetMs);
  const src = await openForEditing(bytes, deadline);
  const allowed = maxPreviewPages(src.getPageCount());
  if (allowed === 0) return null;
  const count = Math.min(Math.max(1, pages), allowed);
  return { bytes: await buildIsolatedPreview(src, count, true, deadline), pageCount: count };
}

/** معاينة رفعها صاحب الملف: تُبنى من جديد بالطريقة نفسها، فقد تحمل صفحات مخفية أو روابط لبقية عمله */
export async function rebuildCustomPreview(bytes: Uint8Array, budgetMs = TRIAL_STAMP_BUDGET_MS): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const deadline = deadlineIn(budgetMs);
  const src = await openForEditing(bytes, deadline);
  const count = src.getPageCount();
  return { bytes: await buildIsolatedPreview(src, count, false, deadline), pageCount: count };
}

/** الختم نفسه يستخدمه التسليم والفحص عند الرفع، فلا يختلف ما نجرّبه عما يصل للطالب */
async function stampDocument(doc: PDFDocument, lines: { primary: string; secondary: string }, deadline: Deadline): Promise<Uint8Array> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const safe = (s: string) => s.replace(/[^\x20-\x7E]/g, "").slice(0, 90);
  const primary = safe(lines.primary);
  const secondary = safe(lines.secondary);
  for (const page of doc.getPages()) {
    deadline.check();
    // المواضع تُحسب على ما يراه القارئ، فلا تقع العلامة خارج صفحة أصلها ليس الصفر أو مدوّرة
    const box = visibleBox(page);
    const size = Math.max(10, Math.min(box.viewWidth, box.viewHeight) / 32);
    // علامة قطرية خفيفة في منتصف الصفحة
    for (const share of [0.3, 0.65]) {
      page.drawText(primary, {
        ...pointOnPage(box, box.viewWidth * 0.12, box.viewHeight * share),
        size: size * 1.3,
        font,
        color: rgb(0.45, 0.45, 0.45),
        opacity: 0.12,
        rotate: degrees(35 + box.rotation),
      });
    }
    // سطر تذييل صغير
    page.drawText(secondary, { ...pointOnPage(box, 18, 10), size: Math.max(6, size * 0.55), font, color: rgb(0.4, 0.4, 0.4), opacity: 0.55, rotate: degrees(box.rotation) });
  }
  doc.setProducer("edu-platform");
  doc.setSubject(`Licensed copy - ${secondary}`);
  // الدور للمؤقتات كل 500 كائن: الإعداد الافتراضي (كل 50) يضيّع في الانتظار أكثر مما يعمل
  return saveWithDeadline(doc, deadline, 500);
}

/** صفحات أكثر من حد الختم: لا يُختم الملف أصلًا، فلا يحمل الخادم ما لا يتسع له */
function assertWithinPageLimit(doc: PDFDocument) {
  if (doc.getPageCount() > STAMP_MAX_PAGES) throw new PdfUnusableError("over_limit");
}

/**
 * يختم نسخة المشتري. لا يعود قبل أن يتوقف العمل نفسه: عند المهلة يرمي StampDeadlineError من داخل الحلقة،
 * فمن يعدّ الختمات الجارية (stamp-gate.ts) لا يحرر مكانًا لعمل ما زال يجري.
 */
export async function watermarkPdf(bytes: Uint8Array, lines: { primary: string; secondary: string }, budgetMs = DELIVERY_STAMP_BUDGET_MS): Promise<Uint8Array> {
  const deadline = deadlineIn(budgetMs);
  const doc = await openForEditing(bytes, deadline);
  assertWithinPageLimit(doc);
  try {
    return await stampDocument(doc, lines, deadline);
  } catch (err) {
    if (err instanceof PdfUnusableError) throw err;
    // الختم يعمل على بايتات في الذاكرة، فأي تعثر فيه سببه بنية الملف وليس الشبكة أو التخزين
    throw new PdfUnusableError("corrupt");
  }
}

/** أطول هوية يقبلها الختم، حتى تكون التجربة عند الرفع أثقل مما يصل للطالب فعلًا */
const TRIAL_STAMP = {
  primary: `${"s".repeat(64)}@example.com  ORD-000000`,
  secondary: `Licensed to ${"s".repeat(40)}@example.com | ORD-000000 | 2000-01-01 | Personal use only`,
};

export type PdfInspection = { ok: true; pageCount: number } | { ok: false; problem: PdfProblem };

const view = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/**
 * الفحص الذي يقف بين الملف والطالب، ويُشغَّل على المسار نفسه الذي سيمر به الملف:
 * يختم نسخة تجريبية بأطول هوية ممكنة ثم يفتحها بمحرك القارئ نفسه ويمر على صفحاتها.
 * النتيجة: محمي (بكلمة مالك أو مستخدم، بأي تشفير) أو تالف أو مقطوع أو ليس PDF، وإلا فالملف صالح.
 * أخطاء الملف نتيجة وليست استثناء، ليصل صاحب الملف إلى سبب واضح.
 */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  if (bytes.length < 5 || view(bytes).subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, problem: "not_pdf" };
  // ملف مقطوع قد يفتح جزئيًا ويضيع آخره بلا خطأ. Acrobat يشترط العلامة في آخر 1024 بايت
  if (!view(bytes).subarray(-1024).includes("%%EOF")) return { ok: false, problem: "corrupt" };

  // القارئ أولًا: يعرف التشفير حتى في الملفات التي يعجز عنها pdf-lib، فتكون الرسالة صحيحة
  const original = await openInReader(bytes);
  if (original.status === "failed") return { ok: false, problem: original.problem };
  if (original.status === "ok" && original.encrypted) return { ok: false, problem: "encrypted" };

  let stamped: Uint8Array;
  let pageCount: number;
  try {
    const deadline = deadlineIn(TRIAL_STAMP_BUDGET_MS);
    const doc = await openForEditing(bytes, deadline);
    // أكثر من حد الختم: يُرفض قبل أن تُصرف ذاكرة الختم التجريبي عليه
    assertWithinPageLimit(doc);
    pageCount = doc.getPageCount();
    stamped = await stampDocument(doc, TRIAL_STAMP, deadline);
  } catch (err) {
    return { ok: false, problem: err instanceof PdfUnusableError ? err.problem : "corrupt" };
  }

  const delivered = await openInReader(stamped);
  if (delivered.status === "failed") return { ok: false, problem: delivered.problem };
  if (delivered.status === "ok" && delivered.pages !== pageCount) return { ok: false, problem: "corrupt" };
  return { ok: true, pageCount };
}
