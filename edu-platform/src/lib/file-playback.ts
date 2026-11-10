/**
 * استعادة مشغل الملفات عند انتهاء الرابط الموقّع أثناء المشاهدة.
 *
 * الرابط قصير عمدًا، والمتصفح يحتفظ بوجهة التحويل لطلبات الأجزاء التالية، فيفشل طلب بعد انتهائه.
 * العلاج إعادة التحميل عبر مسار البث (الذي يفحص الصلاحية من جديد ويصدر رابطًا جديدًا) والعودة إلى الموضع نفسه.
 * محدود بعدد المحاولات: من سُحبت صلاحيته يرى رسالة الخطأ بعد آخر محاولة ولا يدور بلا نهاية.
 */
export const MAX_RECOVERIES = 3;
export const RECOVERY_WINDOW_MS = 120_000;

/** MEDIA_ERR_NETWORK و MEDIA_ERR_SRC_NOT_SUPPORTED: ما يظهر عند رفض الرابط المنتهي */
const RECOVERABLE_CODES = new Set([2, 4]);

export type RecoveryState = { attempts: number; windowStartedAt: number };

export const NO_RECOVERY: RecoveryState = { attempts: 0, windowStartedAt: 0 };

/** null: لا استعادة، اعرض الخطأ. وإلا الحالة الجديدة بعد احتساب هذه المحاولة */
export function nextRecovery(input: { code: number; loaded: boolean; state: RecoveryState; now: number }): RecoveryState | null {
  // لم يبدأ أصلًا: ليس انتهاء رابط، فالخطأ حقيقي
  if (!input.loaded || !RECOVERABLE_CODES.has(input.code)) return null;
  const expired = input.now - input.state.windowStartedAt >= RECOVERY_WINDOW_MS;
  const attempts = expired ? 0 : input.state.attempts;
  if (attempts >= MAX_RECOVERIES) return null;
  return { attempts: attempts + 1, windowStartedAt: expired ? input.now : input.state.windowStartedAt };
}
