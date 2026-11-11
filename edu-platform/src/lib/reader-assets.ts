import pdfjsPackage from "pdfjs-dist/package.json";

/**
 * ملفات محرك القارئ كما تُخدم للمتصفح (القرار F27، البند R018).
 *
 * المحرك والعامل يُبنيان من نسخة pdf.js «القديمة» (legacy) للإصدار المثبت نفسه، لا من النسخة الحديثة التي تستدعي
 * دوال لا يعرفها iOS قبل 26.2 ولا Samsung Internet ولا Chrome قبل 147. scripts/copy-pdf-worker.mjs يضيف إليهما
 * ما ينقص حد المتصفحات المدعومة (READER_BROWSER_FLOOR) ويحوّل الصياغة الأحدث منه، واختبار tests/unit/reader-floor.test.ts
 * يشغّلهما بعد حذف كل دالة أحدث من هذا الحد.
 *
 * الإصدار جزء من المسار لأن next.config.ts يخزّن /pdfjs/<الإصدار>/ سنة كاملة. RECIPE جزء من اسم الملف: أي تغيير في طريقة
 * البناء اسم جديد، فلا يبقى في متصفح الطالب ملف قديم بالاسم نفسه. السكربت يكتب الاسمين نفسيهما، والاختبار يقارنهما.
 */
export const PDF_READER_RECIPE = "r1";
export const PDFJS_VERSION: string = pdfjsPackage.version;
export const PDF_READER_ASSETS = `/pdfjs/${PDFJS_VERSION}`;
export const PDF_READER_ENGINE_FILE = `pdf.${PDF_READER_RECIPE}.min.mjs`;
export const PDF_READER_WORKER_FILE = `pdf.worker.${PDF_READER_RECIPE}.min.mjs`;
export const PDF_READER_ENGINE = `${PDF_READER_ASSETS}/${PDF_READER_ENGINE_FILE}`;
export const PDF_READER_WORKER = `${PDF_READER_ASSETS}/${PDF_READER_WORKER_FILE}`;

/**
 * أقدم متصفحات يفتح فيها القارئ ملفًا (F27): iOS 15.4 فما بعد، و Chrome و Android WebView 110 فما بعد
 * (Samsung Internet 21 فما بعد مبني عليه). iOS 15.0 إلى 15.3 خارج الحد: ينقصها structuredClone و Object.hasOwn و at،
 * وكل جهاز عليها يصله تحديث 15.8 المجاني. الموقع نفسه (Next 16 و Tailwind 4) مبني لـ Safari 16.4 فما بعد.
 */
export const READER_BROWSER_FLOOR = { safari: "15.4", chrome: "110" } as const;
