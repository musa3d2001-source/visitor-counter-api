import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/**
 * معالجة PDF على الخادم:
 * - قراءة عدد الصفحات عند الرفع
 * - استخراج صفحات المعاينة المجانية
 * - ختم علامة مائية ديناميكية تحمل هوية المشتري (بريده/رقمه المرجعي) على كل صفحة
 * ملاحظة: العلامة بأحرف لاتينية لأن خطوط PDF القياسية لا تدعم تشكيل العربية.
 */

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  return doc.getPageCount();
}

export async function extractPreview(bytes: Uint8Array, pages: number): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const count = Math.min(Math.max(1, pages), src.getPageCount());
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, Array.from({ length: count }, (_, i) => i));
  for (const p of copied) out.addPage(p);
  const font = await out.embedFont(StandardFonts.HelveticaBold);
  for (const page of out.getPages()) {
    const { width } = page.getSize();
    page.drawText("FREE PREVIEW", { x: width - 110, y: 14, size: 10, font, color: rgb(0.06, 0.32, 0.34), opacity: 0.7 });
  }
  out.setTitle("Preview");
  out.setProducer("edu-platform");
  return { bytes: await out.save(), pageCount: count };
}

export async function watermarkPdf(bytes: Uint8Array, lines: { primary: string; secondary: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const safe = (s: string) => s.replace(/[^\x20-\x7E]/g, "").slice(0, 90);
  const primary = safe(lines.primary);
  const secondary = safe(lines.secondary);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.max(10, Math.min(width, height) / 32);
    // علامة قطرية خفيفة في منتصف الصفحة
    page.drawText(primary, {
      x: width * 0.12,
      y: height * 0.3,
      size: size * 1.3,
      font,
      color: rgb(0.45, 0.45, 0.45),
      opacity: 0.12,
      rotate: degrees(35),
    });
    page.drawText(primary, {
      x: width * 0.12,
      y: height * 0.65,
      size: size * 1.3,
      font,
      color: rgb(0.45, 0.45, 0.45),
      opacity: 0.12,
      rotate: degrees(35),
    });
    // سطر تذييل صغير
    page.drawText(secondary, { x: 18, y: 10, size: Math.max(6, size * 0.55), font, color: rgb(0.4, 0.4, 0.4), opacity: 0.55 });
  }
  doc.setProducer("edu-platform");
  doc.setSubject(`Licensed copy - ${secondary}`);
  return doc.save();
}
