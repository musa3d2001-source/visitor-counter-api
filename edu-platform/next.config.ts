import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { bunnyConfigProblem } from "./src/lib/bunny-keys";
import { envProblems, normaliseEnv } from "./src/server/env-schema";
import { API_CSP_SOURCE, SECURITY_HEADERS, STRICT_CSP } from "./src/lib/security-headers";
import { PDF_READER_ENGINE_FILE, PDF_READER_WORKER_FILE, PDFJS_VERSION } from "./src/lib/reader-assets";

/**
 * إعدادات Next.js
 * - رؤوس أمان عامة لكل الصفحات (CSP تُضاف ديناميكيًا عبر proxy.ts باستخدام nonce)
 * - منع فهرسة مسارات الملفات الخاصة والمكتبة ولوحة الإدارة
 */
const supabaseHost = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

/** مدة تخزين الملفات التي يحمل مسارها إصدارها: تغيير الملف يعني مسارًا جديدًا، فلا حاجة لأن يعيد المتصفح السؤال عنها */
const IMMUTABLE_ASSET = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const PDF_READER_ENGINE = ["./node_modules/pdfjs-dist/legacy/build/pdf.mjs", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  serverExternalPackages: ["pdf-lib", "nodemailer"],
  // فحص PDF يشغّل محرك القارئ في خيط منفصل (server/access/pdf-reader-engine.ts)، فلا يراه تتبع الملفات تلقائيًا
  outputFileTracingIncludes: {
    "/api/admin/uploads/complete": PDF_READER_ENGINE,
    "/admin/**": PDF_READER_ENGINE,
  },
  experimental: {
    serverActions: {
      // رفع الملفات لا يمر عبر Server Actions (يتم بروابط رفع مباشرة)، لذلك نُبقي الحد صغيرًا
      bodySizeLimit: "2mb",
    },
    // البند R021: الافتراضي يدمج وحدات CSS للموقع (الرئيسية والمنتج والتصفح والمعلمين والباقات والبطاقات) في ملف واحد
    // تحمّله كل صفحة منها. «graph» (Turbopack وحده) يزن البايتات مقابل الطلبات، و requestCost هو ما يساويه طلب إضافي
    // بالبايت (الافتراضي نحو 20000، فتبقى الوحدات الصغيرة مدموجة). المرجع: node_modules/next/dist/docs/01-app/
    // 03-api-reference/05-config/01-next-config-js/cssChunking.md. لا صنف من وحدة يقع مع صنف من وحدة أخرى على عنصر واحد
    // إلا شبكات browse المضاعفة (.x.x) فوق catalog، فترتيب التحميل بين الملفات لا يغير شكل الصفحة (tests/unit/css-split.test.ts)
    cssChunking: { type: "graph", requestCost: 8_000 },
  },
  images: {
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/brand/**" }],
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
    // صيغة واحدة: كل صيغة إضافية تضاعف عدد التحويلات المحسوبة على الخطة، و WebP يعمل في كل متصفح يصل إليه الموقع
    formats: ["image/webp"],
    // كل غلاف يُرفع بمفتاح جديد ولا يُكتب فوق ملف موجود (newStorageKey و x-upsert)، فنسخته المحوّلة صالحة ما بقي رابطه
    minimumCacheTTL: 2678400,
    // أقل قائمة تغطي التخطيط (صور صغيرة من 52 حتى 184 بكسل، وبطاقات حتى 480) على شاشات كثافتها حتى 3. كل عرض هنا تحويل محتمل لكل غلاف
    imageSizes: [64, 96, 128, 256, 384],
    deviceSizes: [640, 828, 1080],
  },
  async headers() {
    const noIndex = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];
    return [
      {
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
      // الصفحات تأخذ CSP بـ nonce من proxy.ts؛ ردود API لا يمر عليها proxy فتأخذ سياسة ثابتة صارمة هنا
      { source: API_CSP_SOURCE, headers: [{ key: "Content-Security-Policy", value: STRICT_CSP }] },
      // robots لا يتغير إلا بنشر جديد، والنشر الجديد يفرغ ذاكرة الشبكة. خريطة الموقع عمدًا بلا هذا السطر: حذف منتج يظهر فيها خلال دقيقة
      { source: "/robots.txt", headers: [{ key: "Vercel-CDN-Cache-Control", value: "public, s-maxage=3600" }] },
      // ملفات قارئ PDF وصورة المشاركة: الإصدار في المسار (scripts/copy-pdf-worker.mjs و public/brand/v2)
      { source: "/pdfjs/:version(\\d+\\.\\d+\\.\\d+)/:path*", headers: IMMUTABLE_ASSET },
      { source: "/brand/:version(v\\d+)/:path*", headers: IMMUTABLE_ASSET },
      { source: "/api/:path*", headers: noIndex },
      { source: "/admin/:path*", headers: noIndex },
      { source: "/library/:path*", headers: noIndex },
      { source: "/account/:path*", headers: noIndex },
      { source: "/orders/:path*", headers: noIndex },
      { source: "/checkout", headers: noIndex },
      { source: "/cart", headers: noIndex },
    ];
  },
};

/**
 * بناء بلا npm install جديد (next build مباشرة، أو شجرة أقدم من ترقية pdfjs-dist أو من طريقة بناء جديدة للقارئ)
 * يجب ألا يخرج بقارئ بلا محرك أو عامل. السكربت يتوقف بخطأ إن لم يستطع تجهيزهما، فيتوقف البناء معه
 */
function ensurePdfReaderAssets() {
  const dir = join(__dirname, "public/pdfjs", PDFJS_VERSION);
  if (![PDF_READER_ENGINE_FILE, PDF_READER_WORKER_FILE].every((f) => existsSync(join(dir, f)))) {
    execFileSync(process.execPath, [join(__dirname, "scripts/copy-pdf-worker.mjs")], { stdio: "inherit" });
  }
}

/**
 * على Vercel لا توجد خطوة بدء: نشر ناقص يجب أن يفشل عند البناء فتبقى النسخة السابقة تعمل. بدء الخادم يفحصه instrumentation.
 * البناء على Vercel يقرأ متغيرات بيئته (Production أو Preview)، ففيه الفحص الكامل الذي يوقف الخادم عند البدء.
 * البناء المحلي والاختبارات قد تبني بلا متغيرات التشغيل، فيبقى لها فحص Bunny وحده. الرسالة أسماء متغيرات بلا قيم
 */
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    ensurePdfReaderAssets();
    const onVercel = process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
    const problems = onVercel ? envProblems(process.env) : [bunnyConfigProblem(normaliseEnv(process.env))].filter((p): p is string => p !== null);
    if (onVercel && process.env.NODE_ENV === "production" && !process.env.APP_URL?.trim()) problems.push("APP_URL مطلوب على الإنتاج");
    if (problems.length) throw new Error(`إعدادات البيئة لا تسمح بتشغيل الخادم، فأُوقف البناء وبقيت النسخة السابقة تعمل:\n${problems.join("\n")}`);
  }
  return nextConfig;
}
