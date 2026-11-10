/** الشكل الموحد لنتيجة Server Actions (يُستخدم مع useActionState) */
export type ActionState = {
  ok?: boolean;
  message?: string;
  /** تم الإجراء الأساسي وتعذر جزء منه: تظهر الرسالة تنبيهًا لا تأكيدًا */
  partial?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** قيم الحقول لإعادة تعبئة النموذج عند الخطأ */
  values?: Record<string, string>;
  /** أسرار تُعرض مرة واحدة للمالك: تعيش في حالة React فقط */
  secrets?: Record<string, string>;
  /** رفض الخادم هذا الأمر الحساس حتى يثبت المالك هويته بعامله الثاني، أو يسجّله إن لم يكن عنده */
  stepUp?: "proof" | "enrol";
} | null;

export function formValues(fd: FormData, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = fd.get(k);
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
