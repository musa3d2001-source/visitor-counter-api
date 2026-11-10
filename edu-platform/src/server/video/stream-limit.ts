import "server-only";
import { hitRateLimit } from "../auth/rate-limit";

/**
 * حدود مسار بث الفيديو: توقف من يغرق الخادم بالطلبات، ولا تقطع مشاهدة حقيقية أبدًا.
 *
 * المشاهدة العادية كثيرة الطلبات بطبيعتها: التخزين المحلي يرد بأجزاء 4MB، فدرس 20Mbps بسرعة 2x
 * يطلب نحو 750 جزءًا في 10 دقائق، يضاف إليها التحميل المسبق والتقديم والرجوع (كل قفزة طلبان أو ثلاثة).
 * وجهازان على الحساب نفسه واردان. مع Supabase طلب واحد لكل بدء أو قفزة، فالحد أبعد.
 *
 * عنوان IP لا يحدد المشاهد المسجَّل: فصل كامل قد يخرج من عنوان واحد (شبكة مدرسة)، فالحساب وحده هو المفتاح.
 * الزائر بلا حساب لا يصل إلا للمعاينات المجانية ولا مفتاح له سوى العنوان، فحده يتسع لفصل كامل:
 * 40 جهازًا يطلب كل منهم 75 جزءًا (300MB، أي 10 دقائق كاملة بجودة 4Mbps).
 *
 * المرفوض بعدّاد مستقل، فلا يستهلك رصيد المشاهدة، ولا يحجب خطأ جهاز واحد بقية الشبكة.
 * المرفوض غير طبيعي أصلًا: صفحة المشاهدة لا تضع المشغل لدرس مقفل.
 */
export const STREAM_WINDOW_SECONDS = 10 * 60;
export const STREAM_LIMITS = {
  account: 1200,
  anonymousPerIp: 3000,
  deniedPerAccount: 120,
  deniedPerIp: 300,
} as const;

/**
 * تجديد رابط التضمين. المشغل يطلب مرة كل نحو 55 دقيقة، فالحد يتسع لعدة أجهزة وتبويبات ويوقف من يجمع الروابط.
 * الزائر لا يصل إلا للمعاينات المجانية، وعنوانه قد يكون شبكة مدرسة كاملة.
 */
export const EMBED_RENEW_WINDOW_SECONDS = 60 * 60;
export const EMBED_RENEW_LIMITS = { account: 30, anonymousPerIp: 300 } as const;

export function hitEmbedRenewLimit(userId: string | null, ip: string) {
  return userId ? hitRateLimit(`embed:user:${userId}`, EMBED_RENEW_LIMITS.account, EMBED_RENEW_WINDOW_SECONDS) : hitRateLimit(`embed:ip:${ip}`, EMBED_RENEW_LIMITS.anonymousPerIp, EMBED_RENEW_WINDOW_SECONDS);
}

export function hitStreamLimit(userId: string | null, ip: string) {
  return userId ? hitRateLimit(`stream:user:${userId}`, STREAM_LIMITS.account, STREAM_WINDOW_SECONDS) : hitRateLimit(`stream:ip:${ip}`, STREAM_LIMITS.anonymousPerIp, STREAM_WINDOW_SECONDS);
}

export function hitDeniedStreamLimit(userId: string | null, ip: string) {
  return userId ? hitRateLimit(`stream-denied:user:${userId}`, STREAM_LIMITS.deniedPerAccount, STREAM_WINDOW_SECONDS) : hitRateLimit(`stream-denied:ip:${ip}`, STREAM_LIMITS.deniedPerIp, STREAM_WINDOW_SECONDS);
}
