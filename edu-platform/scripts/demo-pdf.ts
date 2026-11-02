/**
 * توليد ملفات PDF تعليمية تجريبية أصلية بالعربية (عبر Chromium لضمان تشكيل الحروف بشكل صحيح).
 * تُستخدم للبيانات التجريبية والاختبارات فقط.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright-core";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser) return browser;
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.PW_CHROMIUM_PATH;
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  process.once("beforeExit", () => {
    void browser?.close();
  });
  return browser;
}

export async function closeDemoBrowser() {
  await browser?.close();
  browser = null;
}

function fontFace(weight: number) {
  const file = join(process.cwd(), `node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-${weight}-normal.woff2`);
  const b64 = readFileSync(file).toString("base64");
  return `@font-face{font-family:Plex;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
}

const LESSONS = [
  "الدرس الأول: المفاهيم الأساسية",
  "الدرس الثاني: التطبيقات والأمثلة",
  "الدرس الثالث: حل المسائل خطوة بخطوة",
  "الدرس الرابع: المراجعة الشاملة",
  "الدرس الخامس: أسئلة متوقعة",
  "الدرس السادس: تدريبات إضافية",
  "الدرس السابع: أخطاء شائعة وكيف تتجنبها",
];

export async function buildDemoPdf(opts: { gradeName: string; subjectName: string; typeTitle: string; pages: number }): Promise<Uint8Array> {
  const b = await getBrowser();
  const page = await b.newPage();
  const pages: string[] = [];
  pages.push(`
    <section class="cover">
      <div class="badge">نسخة تجريبية للعرض</div>
      <h1>${opts.typeTitle}</h1>
      <h2>${opts.subjectName}</h2>
      <p>${opts.gradeName} — الفصل الدراسي الأول</p>
      <p class="muted">العام الدراسي 2026 / 2027</p>
    </section>`);
  for (let i = 1; i < opts.pages; i++) {
    const lesson = LESSONS[(i - 1) % LESSONS.length];
    pages.push(`
      <section>
        <h3>${lesson}</h3>
        <p>هذه صفحة تجريبية من ${opts.typeTitle} لمادة ${opts.subjectName} — ${opts.gradeName}. المحتوى أصلي ومُعد لأغراض اختبار المنصة فقط.</p>
        <div class="box"><strong>تذكّر:</strong> اقرأ السؤال جيدًا، وحدد المطلوب، ثم رتّب خطوات الحل.</div>
        <ol>
          <li>تدريب رقم ${i}.1: اكتب تعريفًا مختصرًا للمفهوم الرئيسي في هذا الدرس.</li>
          <li>تدريب رقم ${i}.2: اذكر مثالين من حياتك اليومية على ما تعلمته.</li>
          <li>تدريب رقم ${i}.3: قارن بين فكرتين أساسيتين في جدول من عمودين.</li>
        </ol>
        <table><tr><th>الفكرة</th><th>المثال</th></tr><tr><td>الفكرة الأولى</td><td>مثال توضيحي</td></tr><tr><td>الفكرة الثانية</td><td>مثال توضيحي</td></tr></table>
        <footer>صفحة ${i + 1}</footer>
      </section>`);
  }
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    ${fontFace(400)}${fontFace(700)}
    *{box-sizing:border-box} body{font-family:Plex,sans-serif;margin:0;color:#1f2a2b}
    section{height:297mm;padding:22mm 18mm;page-break-after:always;position:relative}
    .cover{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(160deg,#0f5257,#163d40);color:#fff}
    .cover h1{font-size:40px;margin:0 0 8px}.cover h2{font-size:30px;margin:0 0 16px;color:#f2c879}.cover p{font-size:18px;margin:4px}
    .muted{opacity:.8}.badge{border:1px solid #f2c879;color:#f2c879;border-radius:999px;padding:4px 14px;margin-bottom:24px;font-size:14px}
    h3{color:#0f5257;font-size:24px;border-bottom:3px solid #d4973b;padding-bottom:6px}
    p,li{font-size:16px;line-height:2}.box{background:#f4efe6;border-radius:10px;padding:12px 16px;margin:16px 0}
    table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #cfd8d8;padding:8px;text-align:right}th{background:#e8f1f1}
    footer{position:absolute;bottom:12mm;left:18mm;font-size:12px;color:#7a8a8b}
  </style></head><body>${pages.join("")}</body></html>`;
  await page.setContent(html, { waitUntil: "load" });
  const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
  await page.close();
  return new Uint8Array(pdf);
}
