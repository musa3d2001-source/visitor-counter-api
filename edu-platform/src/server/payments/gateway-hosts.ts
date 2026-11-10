import { appUrlCheck } from "@/lib/launch";

/**
 * أين يذهب مفتاح البوابة، وإلى أين يُوجَّه المشتري. الأسماء من صفحة API Key في وثائق MyFatoorah الرسمية (قُرئت 2026-11-10).
 * ملف بلا قاعدة بيانات ولا بيئة: يأخذ القيم ويعيد حكمًا، فيُختبر مباشرة.
 *
 * القاعدة: مفتاح API لا يخرج إلا إلى عنوان رسمي بـ https. الاستثناء الوحيد محاكي الاختبار وأداة الضغط:
 * الوضع التجريبي على جهاز محلي، خارج أي نشر على Vercel، و APP_URL محلي كذلك. وضع الإنتاج لا استثناء له أبدًا.
 */
export const GATEWAY_API_HOSTS = {
  sandbox: ["apitest.myfatoorah.com"],
  // الكويت والبحرين والأردن وعُمان على العنوان الأول، ولكل دولة أخرى عنوانها
  live: ["api.myfatoorah.com", "api-ae.myfatoorah.com", "api-sa.myfatoorah.com", "api-qa.myfatoorah.com", "api-eg.myfatoorah.com"],
} as const;

const GATEWAY_DOMAIN = "myfatoorah.com";
/** صفحات دفع البيئة التجريبية كما تظهر في أمثلة الوثائق: رابط منها في وضع الإنتاج يعني أن شيئًا اختلط */
const TEST_PAYMENT_PAGE_HOSTS = new Set(["demo.myfatoorah.com", "apitest.myfatoorah.com"]);

export type GatewayEnvironment = keyof typeof GATEWAY_API_HOSTS;
export type GatewayTarget = { ok: true; origin: string; simulator: boolean } | { ok: false; reason: string };

export const GATEWAY_REASONS = {
  liveMismatch: "رابط بوابة الدفع لا يطابق وضع الإنتاج",
  sandboxMismatch: "رابط بوابة الدفع لا يطابق الوضع التجريبي",
  notOfficial: "رابط بوابة الدفع ليس من عناوينها الرسمية، فلم نرسل إليه مفتاح البوابة. احذف MYFATOORAH_BASE_URL ليُستعمل العنوان الرسمي.",
  appUrlLive: "وضع الإنتاج يتطلب APP_URL بعنوان https حقيقي، فعليه يعود المشتري بعد الدفع.",
  appUrlSandbox: "الدفع التجريبي عبر البوابة يتطلب APP_URL بعنوان https، فالبوابة ترفض عنوان الجهاز المحلي.",
} as const;

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** localhost وعناوين 127 الأربعة و::1 بعد تطبيع URL. لا تدخل هنا أسماء تبدأ بـ 127. مثل 127.evil.com */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
}

const isGatewayDomain = (host: string) => host === GATEWAY_DOMAIN || host.endsWith(`.${GATEWAY_DOMAIN}`);

/** عنوان نظيف: بلا اسم مستخدم ولا مسار ولا استعلام. ما عدا ذلك خطأ في الإعداد لا نحاول إصلاحه */
const isBareOrigin = (url: URL) => !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;

/**
 * الحكم على MYFATOORAH_BASE_URL و APP_URL معًا. الدفع يتوقف بسبب ظاهر للمالك عند أي مخالفة، ولا يتعطل الموقع.
 * vercel: هل هذا نشر على Vercel (إنتاج أو معاينة).
 */
export function checkGatewayTarget(input: { environment: GatewayEnvironment; baseUrl: string; appUrl: string; vercel: boolean }): GatewayTarget {
  const { environment, baseUrl, appUrl, vercel } = input;
  const base = parse(baseUrl);
  const app = parse(appUrl);
  if (!base || !isBareOrigin(base)) return { ok: false, reason: GATEWAY_REASONS.notOfficial };
  const host = base.hostname.toLowerCase();

  if (environment === "sandbox" && !vercel && base.protocol === "http:" && isLoopbackHost(host)) {
    if (app && isLoopbackHost(app.hostname)) return { ok: true, origin: base.origin, simulator: true };
    return { ok: false, reason: GATEWAY_REASONS.notOfficial };
  }

  const official = base.protocol === "https:" && !base.port && (GATEWAY_API_HOSTS[environment] as readonly string[]).includes(host);
  if (!official) {
    if (environment === "live" && host === GATEWAY_API_HOSTS.sandbox[0]) return { ok: false, reason: GATEWAY_REASONS.liveMismatch };
    if (environment === "sandbox" && isGatewayDomain(host)) return { ok: false, reason: GATEWAY_REASONS.sandboxMismatch };
    return { ok: false, reason: GATEWAY_REASONS.notOfficial };
  }

  if (environment === "live") {
    const { problem } = appUrlCheck(appUrl);
    // رابط vercel.app عنوان https حقيقي يصل إليه المشتري، وصفحة الإطلاق تطلب النطاق النهائي قبل البيع
    if (!app || app.protocol !== "https:" || app.username || app.password || (problem !== null && problem !== "vercel")) return { ok: false, reason: GATEWAY_REASONS.appUrlLive };
  } else if (!app || app.protocol !== "https:" || isLoopbackHost(app.hostname)) {
    return { ok: false, reason: GATEWAY_REASONS.appUrlSandbox };
  }
  return { ok: true, origin: base.origin, simulator: false };
}

/**
 * هل هذا الرابط صفحة دفع على نطاق البوابة؟ يُفحص قبل الحفظ وقبل توجيه المشتري، ورابط لا يمر لا يصل إلى أحد.
 * simulatorOrigin: أصل المحاكي حين يعمل الاستثناء أعلاه، ولا يُقبل غيره من العناوين المحلية.
 */
export function isGatewayPaymentPage(value: unknown, input: { environment: GatewayEnvironment; simulatorOrigin: string | null }): boolean {
  if (typeof value !== "string") return false;
  const url = parse(value);
  if (!url || url.username || url.password) return false;
  if (input.simulatorOrigin !== null) return url.origin === input.simulatorOrigin;
  if (url.protocol !== "https:" || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (!isGatewayDomain(host)) return false;
  return !(input.environment === "live" && TEST_PAYMENT_PAGE_HOSTS.has(host));
}
