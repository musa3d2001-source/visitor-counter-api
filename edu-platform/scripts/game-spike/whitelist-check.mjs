// [تجربة المرحلة 0 - كود مؤقت] فحص القائمة البيضاء على مجلد المحرك (_engine) كما يطلبه الأمر §6.3:
// من Math فقط abs/min/max/floor/ceil/round/trunc/sign/sqrt/imul/fround، وممنوع ** وDate وperformance وcrypto.
// (في المرحلة 2 يصبح هذا اختبار vitest على src/game/core و src/game/rules.)
// التشغيل: node scripts/game-spike/whitelist-check.mjs  → يخرج بالرمز 1 عند أي مخالفة.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src/app/admin/game/spike/_engine");
const ALLOWED_MATH = new Set(["abs", "min", "max", "floor", "ceil", "round", "trunc", "sign", "sqrt", "imul", "fround"]);
const files = fs.readdirSync(ROOT, { recursive: true }).filter((f) => /\.ts$/.test(String(f))).map((f) => path.join(ROOT, String(f)));
const violations = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  // نزيل التعليقات والنصوص كي لا تُحسب الكلمات الموثقة فيها
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => " ".repeat(m.length));
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/\bMath\.([A-Za-z0-9_]+)/g)) if (!ALLOWED_MATH.has(m[1])) violations.push({ file, line: i + 1, rule: `Math.${m[1]}` });
    if (/\*\*/.test(line)) violations.push({ file, line: i + 1, rule: "**" });
    for (const w of ["Date", "performance", "crypto"]) if (new RegExp(`\\b${w}\\b`).test(line)) violations.push({ file, line: i + 1, rule: w });
    if (/\bMath\s*\[/.test(line)) violations.push({ file, line: i + 1, rule: "Math[...]" });
  });
}
const rel = (f) => path.relative(process.cwd(), f);
console.log(JSON.stringify({ scanned: files.map(rel), violations: violations.map((v) => ({ ...v, file: rel(v.file) })) }, null, 2));
process.exit(violations.length ? 1 : 0);
