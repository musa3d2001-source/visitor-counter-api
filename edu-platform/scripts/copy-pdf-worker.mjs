// ينسخ ملفات PDF.js اللازمة (العامل، الخطوط القياسية، CMaps، WASM) إلى public/pdfjs/<الإصدار>
// لتُخدم من نفس النطاق وتتوافق مع سياسة CSP. الإصدار جزء من المسار لأن next.config.ts يخزّنها سنة كاملة:
// ترقية pdfjs-dist مسار جديد، فلا يجتمع في متصفح الطالب عامل قديم مع مكتبة جديدة
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules/pdfjs-dist");
if (!existsSync(pkg)) {
  console.warn("[copy-pdf-worker] pdfjs-dist غير مثبت بعد، تم التخطي");
  process.exit(0);
}
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const base = join(root, "public/pdfjs");
const dest = join(base, version);
// ما بقي من إصدار سابق أو من التخطيط القديم بلا إصدار لا يطلبه أحد، ويُخزَّن في النشر بلا فائدة
for (const entry of existsSync(base) ? readdirSync(base) : []) {
  if (entry !== version) rmSync(join(base, entry), { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });
copyFileSync(join(pkg, "build/pdf.worker.min.mjs"), join(dest, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
  if (existsSync(join(pkg, dir))) cpSync(join(pkg, dir), join(dest, dir), { recursive: true });
}
console.log(`[copy-pdf-worker] تم نسخ ملفات PDF.js إلى public/pdfjs/${version}`);
