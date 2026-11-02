import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
  serverExternalPackages: ["pdf-lib", "nodemailer"],
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
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
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

export default nextConfig;
