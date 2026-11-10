import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * مرجع موقّع يوضع في CallBackUrl عند إنشاء الفاتورة: رقم سجل الدفع + توقيع.
 * صفحة العودة بلا جلسة، ورقم paymentId لا نعرفه محليًا قبل التحقق منه، فالمرجع هو ما يثبت أن العودة تخص فاتورة أصدرناها
 * دون أن نسأل البوابة عن كل رقم يكتبه زائر. لا يمنح وصولًا: كل ما يتيحه هو تكرار فحص الفاتورة نفسها لدى البوابة.
 */
const SIGNATURE_LENGTH = 22;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const REF_PATTERN = new RegExp(`^(${UUID})\\.([A-Za-z0-9_-]{${SIGNATURE_LENGTH}})$`);

function sign(paymentRowId: string): string {
  return createHmac("sha256", env().APP_SECRET).update(`payment-return:${paymentRowId}`).digest("base64url").slice(0, SIGNATURE_LENGTH);
}

export function paymentReturnRef(paymentRowId: string): string {
  return `${paymentRowId}.${sign(paymentRowId)}`;
}

/** رقم سجل الدفع إن كان المرجع سليمًا، وإلا null. المقارنة بزمن ثابت */
export function readPaymentReturnRef(ref: string | null | undefined): string | null {
  const match = ref ? REF_PATTERN.exec(ref) : null;
  if (!match) return null;
  const expected = Buffer.from(sign(match[1]));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? match[1] : null;
}
