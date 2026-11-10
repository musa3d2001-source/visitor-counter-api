/**
 * قرارات تجديد رابط تضمين الدرس، بلا مؤقتات ولا DOM فتُختبر وحدها.
 *
 * يُطلب الرابط الجديد قبل الانتهاء بخمس دقائق تقريبًا (مع تفاوت عشوائي حتى لا يجدد فصل كامل في الثانية نفسها).
 * المتوقف يُبدّل فورًا، والجاري تشغيله قرب الانتهاء فقط، لأن تبديل الإطار يقطع الصورة لحظة.
 */
export const EMBED_RENEW_BEFORE_MS = 5 * 60_000;
export const EMBED_RENEW_JITTER_MS = 60_000;
export const EMBED_SWAP_BEFORE_EXPIRY_MS = 60_000;
export const EMBED_RETRY_MAX_MS = 60_000;
const EMBED_RETRY_FIRST_MS = 2_000;

/** متى يُطلب التجديد بعد إصدار رابط عمره expiresInSeconds */
export function renewDelayMs(expiresInSeconds: number, random: number = Math.random()): number {
  const life = expiresInSeconds * 1000;
  return Math.max(1_000, life - EMBED_RENEW_BEFORE_MS - Math.floor(random * EMBED_RENEW_JITTER_MS));
}

/** متى يُبدّل الإطار أثناء التشغيل */
export function swapDelayMs(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, expiresAtMs - EMBED_SWAP_BEFORE_EXPIRY_MS - nowMs);
}

/** الانتظار قبل إعادة المحاولة: ما طلبه الخادم إن طلب، وإلا تصاعد بسقف دقيقة */
export function retryDelayMs(attempt: number, retryAfterSeconds: number | null, random: number = Math.random()): number {
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return Math.min(EMBED_RETRY_MAX_MS, retryAfterSeconds * 1000);
  const base = Math.min(EMBED_RETRY_MAX_MS, EMBED_RETRY_FIRST_MS * 2 ** Math.max(0, attempt));
  return Math.floor(base / 2 + (random * base) / 2);
}

export type RenewalVerdict = "renewed" | "session-ended" | "access-ended" | "retry";

/** ماذا يعني رد مسار التجديد: انقطاع مؤقت لا يُنهي مشاهدة قائمة، أما رفض الصلاحية فيُنهيها */
export function renewalVerdict(status: number): RenewalVerdict {
  if (status >= 200 && status < 300) return "renewed";
  if (status === 401) return "session-ended";
  if (status === 403 || status === 404 || status === 409) return "access-ended";
  return "retry";
}

/** الرابط الجديد مع موضع الاستكمال. التوقيع لا يشمل t و autoplay فتبقى صالحة */
export function resumeUrl(embedUrl: string, positionSeconds: number, autoplay: boolean): string {
  const url = new URL(embedUrl);
  if (positionSeconds > 0) url.searchParams.set("t", String(Math.floor(positionSeconds)));
  url.searchParams.set("autoplay", autoplay ? "true" : "false");
  return url.toString();
}
