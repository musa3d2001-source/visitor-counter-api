/**
 * رؤوس الأمان المشتركة: next.config.ts يضيفها لكل مسار، وproxy.ts يضيفها لردود التحويل التي يصنعها بنفسه
 * (لا نعتمد على أن إعدادات next.config تصل إلى رد يصنعه proxy).
 */
export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/**
 * ردود API بيانات لا صفحات: لا سكربت ولا نمط ولا إطار. تحويلات proxy كذلك (لا جسم يُعرض).
 */
export const STRICT_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * صفحة HTML صغيرة ثابتة يرسمها مسار API بنفسه (خطأ فتح ملف، «المنصة مشغولة»): أنماط مضمنة فقط.
 */
export const INLINE_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * مسارات API التي تأخذ STRICT_CSP من next.config. يُستثنى منها ما يسلم ملفًا يعرضه المتصفح نفسه:
 * PDF (عارض المتصفح المدمج يتعطل مع default-src 'none' في بعض المتصفحات) وبث فيديو الدرس.
 * صفحة الخطأ في مسار الملفات تضع INLINE_PAGE_CSP بنفسها.
 */
export const API_CSP_SOURCE = "/api/:path((?!files/|lessons/[^/]+/stream$).*)";
