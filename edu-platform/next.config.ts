import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { bunnyConfigProblem } from "./src/lib/bunny-keys";
import { envProblems, normaliseEnv } from "./src/server/env-schema";
import { API_CSP_SOURCE, SECURITY_HEADERS, STRICT_CSP } from "./src/lib/security-headers";

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
  },
  images: {
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/brand/**" }],
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
    formats: ["image/avif", "image/webp"],
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

/** بناء بلا npm install جديد (next build مباشرة، أو شجرة أقدم من ترقية pdfjs-dist) يجب ألا يخرج بقارئ بلا عامل */
function ensurePdfReaderAssets() {
  const { version } = JSON.parse(readFileSync(join(__dirname, "node_modules/pdfjs-dist/package.json"), "utf8")) as { version: string };
  if (!existsSync(join(__dirname, "public/pdfjs", version, "pdf.worker.min.mjs"))) {
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
