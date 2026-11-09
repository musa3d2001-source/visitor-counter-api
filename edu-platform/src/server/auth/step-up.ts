import "server-only";
import { adminTwoFactorRequired } from "../env";
import { STEP_UP_FIELD } from "@/lib/two-factor";
import { AdminError } from "../admin/common";
import { audit } from "../platform/audit";
import { twoFactorIsActive, verifyStepUpCode } from "./two-factor";

/** هل تطلب أوامر إخراج المال من هذا المدير رمز تحقق الآن؟ تعرضها الواجهة كما هي، ولا تقرر شيئًا */
export async function refundStepUpActive(adminId: string): Promise<boolean> {
  return twoFactorIsActive(adminId);
}

/**
 * نقطة التحقق الإضافي قبل كل أمر يخرج مالًا عبر البوابة: استرداد الطلب وإعادة إرساله واسترداد الدفعة الزائدة.
 * رمز TOTP جديد أو رمز استرداد يُرسل مع نموذج الأمر. الرمز يُستهلك هنا، قبل أن يصل الأمر إلى البوابة.
 * إعادة التحقق والإغلاق لا يخرجان مالًا (يسألان البوابة أو يكتبان في قاعدتنا فقط)، فلا يمران من هنا.
 *
 * إن لم يكن التحقق بخطوتين مفعّلًا وهو غير إلزامي في هذا النشر، يمر الأمر، وتقول ذلك صفحة الطلب صراحة.
 * وإن كان إلزاميًا والحساب بلا تحقق فالرفض هو الافتراضي، مع أن بوابة الجلسة تمنع الوصول إلى هنا أصلًا.
 */
export async function assertRefundStepUp(input: { adminId: string; fd: FormData; ip?: string }): Promise<void> {
  if (!(await twoFactorIsActive(input.adminId))) {
    if (adminTwoFactorRequired()) throw new AdminError("فعّل التحقق بخطوتين أولًا، فهو إلزامي لهذا الأمر.");
    return;
  }
  const res = await verifyStepUpCode({ userId: input.adminId, code: input.fd.get(STEP_UP_FIELD), ip: input.ip });
  if (res.ok) return;
  await audit({ actorId: input.adminId, action: "two_factor.step_up_refused", entityType: "user", entityId: input.adminId, ip: input.ip ?? null });
  throw new AdminError(res.error);
}
