/**
 * سياسة كلمات المرور واستعادتها.
 *
 * الحد الأدنى:
 *  - الطالب: ٨ أحرف. يُفحص أيضًا في registerSchema و passwordSchema.
 *  - المعلم والمدير: ١٢ حرفًا، ولا تكون سهلة التخمين، لأن حساباتهم تصل إلى المحتوى والمال.
 *  يُفرض عند كل تعيين: التغيير من الحساب، الاستعادة بالرابط، التغيير الإجباري، وسكربت إنشاء المدير.
 *  الكلمات القصيرة الموجودة قبل هذه السياسة تبقى صالحة حتى التعيين التالي.
 *
 * الاستعادة:
 *  - الطالب: رابط عبر البريد صالح ساعة واحدة ولمرة واحدة، أو من المالك من صفحة الطالب:
 *    رابط وكلمة مؤقتة صالحان ٢٤ ساعة ولمرة واحدة، وكل ذلك مسجل في سجل التدقيق.
 *  - المعلم: رابط البريد نفسه، أو كلمة يولّدها المالك من صفحة المعلم.
 *  - المدير: لا يستعيد عبر البريد ولا من اللوحة، لأن اختراق صندوق بريد واحد يجب ألا يعطي تحكمًا كاملًا.
 *    الطريق الوحيد: npm run admin:create على خادم يصل إلى قاعدة البيانات.
 *  بعد أي استعادة تُلغى كل جلسات الحساب وكل الروابط السابقة.
 */
export const STUDENT_PASSWORD_MIN = 8;
export const STAFF_PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export type PasswordRole = "student" | "teacher" | "admin";

/** كلمات شائعة بعد حذف الأرقام والرموز منها: Password123! و admin@2026 و farqad_12 تسقط هنا */
const COMMON_CORES = new Set([
  "password",
  "passwd",
  "pass",
  "admin",
  "administrator",
  "qwerty",
  "qwertyuiop",
  "asdfgh",
  "asdfghjkl",
  "zxcvbn",
  "letmein",
  "welcome",
  "teacher",
  "student",
  "farqad",
  "darb",
  "abc",
  "abcd",
  "abcdef",
  "kuwait",
  "فرقد",
  "درب",
  "الكويت",
]);

const STAFF_TOO_SHORT = "كلمة مرور حسابات الإدارة والمعلمين يجب أن تكون ١٢ حرفًا على الأقل";
const STAFF_TOO_EASY = "كلمة المرور سهلة التخمين. اختر عبارة أطول لا تعتمد على كلمة شائعة أو على بريدك أو على تكرار الحروف";

/** يعيد سبب رفض كلمة المرور بالعربية، أو null إن كانت مقبولة */
export function passwordPolicyError(role: PasswordRole, password: string, email?: string | null): string | null {
  if (password.length > PASSWORD_MAX) return "كلمة المرور طويلة جدًا";
  if (role === "student") return password.length < STUDENT_PASSWORD_MIN ? "كلمة المرور يجب أن تكون ٨ أحرف على الأقل" : null;
  if (password.length < STAFF_PASSWORD_MIN) return STAFF_TOO_SHORT;
  const normalized = password.normalize("NFKC").toLowerCase();
  if (new Set(normalized).size < 5) return STAFF_TOO_EASY;
  const letters = normalized.replace(/[^\p{L}]/gu, "");
  // adminadmin تعادل admin
  const core = /^(.+?)\1+$/u.exec(letters)?.[1] ?? letters;
  if (!core || COMMON_CORES.has(core)) return STAFF_TOO_EASY;
  const local = email?.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && normalized.includes(local)) return STAFF_TOO_EASY;
  return null;
}
