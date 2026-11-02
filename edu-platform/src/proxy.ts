import { NextResponse, type NextRequest } from "next/server";

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
  const bunny = "https://iframe.mediadelivery.net";
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: ${supabase}`.trim(),
    `font-src 'self' data:`,
    `connect-src 'self' ${supabase}`.trim(),
    `media-src 'self' blob: ${supabase}`.trim(),
    `worker-src 'self' blob:`,
    `frame-src ${bunny}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    // يسمح بإعادة التوجيه إلى صفحة الدفع بعد إرسال النموذج
    `form-action 'self' https://*.myfatoorah.com`,
    `frame-ancestors 'none'`,
    isDev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const needsSession = ["/admin", "/library", "/account", "/read", "/watch", "/orders", "/checkout"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsSession && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
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

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|media|brand|pdfjs|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
