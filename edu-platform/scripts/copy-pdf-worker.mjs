// ينسخ ملفات PDF.js اللازمة (العامل، الخطوط القياسية، CMaps، WASM) إلى public/pdfjs
// لتُخدم من نفس النطاق وتتوافق مع سياسة CSP
import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules/pdfjs-dist");
const dest = join(root, "public/pdfjs");
if (!existsSync(pkg)) {
  console.warn("[copy-pdf-worker] pdfjs-dist غير مثبت بعد، تم التخطي");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
copyFileSync(join(pkg, "build/pdf.worker.min.mjs"), join(dest, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
  if (existsSync(join(pkg, dir))) cpSync(join(pkg, dir), join(dest, dir), { recursive: true });
}
console.log("[copy-pdf-worker] تم نسخ ملفات PDF.js إلى public/pdfjs");
