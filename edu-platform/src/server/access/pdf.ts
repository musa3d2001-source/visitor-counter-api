import "server-only";
import { PDFDocument, PDFName, ParseSpeeds, StandardFonts, degrees, rgb, type PDFPage } from "pdf-lib";
import { maxPreviewPages } from "@/lib/preview-policy";
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

export type PdfProblem = "not_pdf" | "encrypted" | "corrupt" | "too_complex";

/** ملف لا يمكن تسليمه لمشترٍ: محمي أو تالف. يختلف عن تعطل التخزين أو الشبكة */
export class PdfUnusableError extends Error {
  constructor(public readonly problem: PdfProblem) {
    super(`pdf unusable: ${problem}`);
    this.name = "PdfUnusableError";
  }
}

/** مهلة الختم التجريبي عند الرفع. انظر قياسات docs/PDF_STAMPING.md */
export const TRIAL_STAMP_BUDGET_MS = 30_000;
/** مهلة الختم عند التسليم: ملف قديم لم يُفحص يتوقف هنا برسالة صادقة بدل أن تقطعه مهلة الدالة */
export const DELIVERY_STAMP_BUDGET_MS = 180_000;

/** pdf-lib يعطي الدور للمؤقتات بين دفعات الكائنات، فتصل المهلة في وقتها */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfUnusableError("too_complex")), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/**
 * يفتح الملف كما يفتحه الختم. نترك ignoreEncryption حتى نقرأ الملف المحمي بكلمة مالك ونصنّفه،
 * ثم نرفضه: pdf-lib لا يفك التشفير، فنسخته المختومة تتلف عند القارئ.
 */
async function openForEditing(bytes: Uint8Array): Promise<PDFDocument> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, parseSpeed: ParseSpeeds.Fast });
  } catch {
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

/** أول count صفحة، معزولة عن بقية الملف. يتحقق من النتيجة بعد حفظها، فلا يخرج ملف لم يثبت عزله */
async function buildIsolatedPreview(src: PDFDocument, count: number, label: boolean): Promise<Uint8Array> {
  try {
    isolatePages(
      src.context,
      src.getPages().slice(0, count).map((p) => p.node),
    );
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, Array.from({ length: count }, (_, i) => i));
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
    const saved = await out.save();
    assertIsolated(await PDFDocument.load(saved, { updateMetadata: false }), count);
    return saved;
  } catch (err) {
    if (err instanceof PreviewNotIsolatedError) throw err;
    await reportError("pdf:preview-isolation", err);
    throw new PreviewNotIsolatedError("could not rebuild pages");
  }
}

/** يطبق قاعدة المعاينة على الملف الفعلي. null: الملف أقصر من أن تكون له معاينة */
export async function extractPreview(bytes: Uint8Array, pages: number): Promise<{ bytes: Uint8Array; pageCount: number } | null> {
  const src = await openForEditing(bytes);
  const allowed = maxPreviewPages(src.getPageCount());
  if (allowed === 0) return null;
  const count = Math.min(Math.max(1, pages), allowed);
  return { bytes: await buildIsolatedPreview(src, count, true), pageCount: count };
}

/** معاينة رفعها صاحب الملف: تُبنى من جديد بالطريقة نفسها، فقد تحمل صفحات مخفية أو روابط لبقية عمله */
export async function rebuildCustomPreview(bytes: Uint8Array): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const src = await openForEditing(bytes);
  const count = src.getPageCount();
  return { bytes: await buildIsolatedPreview(src, count, false), pageCount: count };
}

/** الختم نفسه يستخدمه التسليم والفحص عند الرفع، فلا يختلف ما نجرّبه عما يصل للطالب */
async function stampDocument(doc: PDFDocument, lines: { primary: string; secondary: string }): Promise<Uint8Array> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const safe = (s: string) => s.replace(/[^\x20-\x7E]/g, "").slice(0, 90);
  const primary = safe(lines.primary);
  const secondary = safe(lines.secondary);
  for (const page of doc.getPages()) {
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
  return doc.save({ objectsPerTick: 500 });
}

export async function watermarkPdf(bytes: Uint8Array, lines: { primary: string; secondary: string }): Promise<Uint8Array> {
  return withDeadline(
    openForEditing(bytes).then((doc) =>
      // الختم يعمل على بايتات في الذاكرة، فأي تعثر فيه سببه بنية الملف وليس الشبكة أو التخزين
      stampDocument(doc, lines).catch(() => {
        throw new PdfUnusableError("corrupt");
      }),
    ),
    DELIVERY_STAMP_BUDGET_MS,
  );
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
    const trial = await withDeadline(
      openForEditing(bytes).then(async (doc) => ({ pages: doc.getPageCount(), out: await stampDocument(doc, TRIAL_STAMP) })),
      TRIAL_STAMP_BUDGET_MS,
    );
    pageCount = trial.pages;
    stamped = trial.out;
  } catch (err) {
    return { ok: false, problem: err instanceof PdfUnusableError ? err.problem : "corrupt" };
  }

  const delivered = await openInReader(stamped);
  if (delivered.status === "failed") return { ok: false, problem: delivered.problem };
  if (delivered.status === "ok" && delivered.pages !== pageCount) return { ok: false, problem: "corrupt" };
  return { ok: true, pageCount };
}
