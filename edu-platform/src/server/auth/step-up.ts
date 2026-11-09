import "server-only";

/**
 * نقطة التحقق الإضافي (2FA) قبل أوامر الاسترداد. تستدعيها كل الأوامر التي تخرج مالًا عبر البوابة،
 * وهي اليوم لا تفعل شيئًا: مرحلة التحقق بخطوتين (Track B) تضيف منطقها هنا فقط.
 * عند الرفض ترمي AdminError برسالة للمالك، فلا يصل الأمر إلى البوابة.
 */
export async function assertRefundStepUp(_input: { adminId: string; fd: FormData; ip?: string }): Promise<void> {}
