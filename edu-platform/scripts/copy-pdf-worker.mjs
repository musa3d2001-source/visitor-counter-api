// ينسخ ملف عامل PDF.js إلى مجلد public ليُخدم من نفس النطاق (متوافق مع سياسة CSP)
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destDir = join(root, "public/pdfjs");
if (!existsSync(src)) {
  console.warn("[copy-pdf-worker] pdfjs-dist غير مثبت بعد، تم التخطي");
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, "pdf.worker.min.mjs"));
console.log("[copy-pdf-worker] تم نسخ pdf.worker.min.mjs");
