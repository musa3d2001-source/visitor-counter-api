/** رسالة القارئ حين يتعذر فتح الملف، مبنية على ما يعيده الخادم أو محرك pdf.js */
export const FILE_NEEDS_REPAIR_MESSAGE = "هذا الملف يحتاج إلى إصلاح من إدارة المنصة، وقد سُجلت المشكلة لديهم. وصولك إليه محفوظ.";

export function readerErrorMessage(err: unknown): string {
  const { status, name } = (err ?? {}) as { status?: number; name?: string };
  if (status === 401) return "انتهت جلستك، سجّل الدخول مرة أخرى.";
  if (status === 403) return "لا تملك صلاحية فتح هذا الملف.";
  // ملف محمي بكلمة مرور لا يفيده الاتصال ولا إعادة المحاولة
  if (status === 503 || name === "PasswordException") return FILE_NEEDS_REPAIR_MESSAGE;
  return "تعذر فتح الملف. تحقق من اتصالك وحاول مرة أخرى.";
}
