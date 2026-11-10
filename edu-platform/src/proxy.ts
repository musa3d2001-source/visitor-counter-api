import { NextResponse, type NextRequest } from "next/server";
import { SECURITY_HEADERS, STRICT_CSP } from "@/lib/security-headers";

/**
 * Proxy (بديل middleware في Next.js 16)
 * - يولّد nonce جديدًا لكل طلب صفحة ويضبط سياسة CSP صارمة للسكربتات
 * - يمنع الوصول الأولي لمسارات الإدارة/المكتبة بلا كوكي جلسة (التحقق الفعلي من الصلاحية يتم في الخادم داخل كل صفحة)
 */
const SESSION_COOKIE = "session";

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  let supabase = "";
  try {
    if (process.env.SUPABASE_URL) supabase = new URL(process.env.SUPABASE_URL).origin;
  } catch {
    supabase = "";
  }
  const origin = (u: string | undefined, fallback: string) => {
    try {
      return new URL(u || fallback).origin;
    } catch {
      return new URL(fallback).origin;
    }
  };
  // Bunny Stream: مشغل التضمين، الرفع المباشر TUS، صور المعاينة
  const bunny = origin(process.env.BUNNY_STREAM_EMBED_BASE, "https://iframe.mediadelivery.net");
  const bunnyTus = origin(process.env.BUNNY_STREAM_TUS_ENDPOINT, "https://video.bunnycdn.com/tusupload");
  const bunnyCdn = process.env.BUNNY_STREAM_CDN_HOSTNAME ? `https://${process.env.BUNNY_STREAM_CDN_HOSTNAME}` : "";
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https://*.myfatoorah.com ${supabase} ${bunnyCdn}`.trim(),
    `font-src 'self' data:`,
    `connect-src 'self' ${supabase} ${bunnyTus}`.trim(),
    `media-src 'self' blob: ${supabase}`.trim(),
    `worker-src 'self' blob:`,
    `frame-src ${bunny}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    // يسمح بإعادة التوجيه إلى صفحة الدفع بعد إرسال النموذج
    `form-action 'self' https://*.myfatoorah.com`,
    `frame-ancestors 'none'`,
    // ترقية الطلبات غير الآمنة فقط عندما يُخدم الموقع عبر HTTPS (الإنتاج)
    (process.env.APP_URL ?? "").startsWith("https://") ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const needsSession = ["/admin", "/library", "/account", "/read", "/orders", "/checkout"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsSession && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    // رد يصنعه proxy بنفسه: رؤوس الأمان عليه صراحة
    const redirect = NextResponse.redirect(url);
    for (const h of SECURITY_HEADERS) redirect.headers.set(h.key, h.value);
    redirect.headers.set("Content-Security-Policy", STRICT_CSP);
    return redirect;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set("x-pathname", pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/**
 * كل استثناء مُثبت بشرطة مائلة أو بنهاية المسار: /apix و/media-x و/brandnew صفحات عادية (404) تمر من هنا وتأخذ CSP،
 * لا مسارات API أو ملفات ثابتة.
 * لوحة الإدارة تمر من هنا دائمًا، حتى طلبات التحميل المسبق: x-pathname يكتبه proxy فوق أي قيمة أرسلها المتصفح،
 * والتخطيط يعتمد عليه لرفض صفحات المالك مبكرًا (كل صفحة مالك تتحقق بنفسها أيضًا بـ requireOwnerPage).
 * tests/unit/proxy-matcher.test.ts يفحص هذه الأنماط.
 */
export const config = {
  matcher: [
    {
      source: "/((?!api(?:/|$)|_next/static/|_next/image(?:/|$)|media/|brand/|pdfjs/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    "/admin/:path*",
  ],
};
