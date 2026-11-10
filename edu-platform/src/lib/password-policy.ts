/**
 * سياسة كلمات المرور واستعادتها.
 *
 * الحد الأدنى:
 *  - الطالب: ٨ أحرف، ولا تكون رقمًا فقط أو تسلسلًا على لوحة المفاتيح أو كلمة أو اسمًا شائعًا أو بريده.
 *    القيد خفيف عن قصد: طفل يكتب جملة قصيرة بلا رموز تُقبل منه، ومن يكتب ٠٥٠١٢٣٤٥ أو ahmed2012 لا تُقبل.
 *    الطول يُفحص أيضًا في registerSchema و passwordSchema.
 *  - المعلم والمدير: ١٢ حرفًا، ولا تكون سهلة التخمين، لأن حساباتهم تصل إلى المحتوى والمال.
 *  يُفرض عند كل تعيين: التغيير من الحساب، الاستعادة بالرابط، التغيير الإجباري، وسكربت إنشاء المدير.
 *  المعلم الذي يدخل بكلمة دون هذه السياسة (طالب رُقّي قبل D17 مثلًا) لا تفتح له إلا صفحة اختيار كلمة جديدة.
 *  كلمة المدير القصيرة الموجودة قبل هذه السياسة تبقى صالحة حتى التعيين التالي.
 *
 * الاستعادة:
 *  - الطالب: رابط عبر البريد صالح ساعة واحدة ولمرة واحدة، أو من المالك من صفحة الطالب:
 *    رابط وكلمة مؤقتة صالحان ٢٤ ساعة ولمرة واحدة، وكل ذلك مسجل في سجل التدقيق.
 *  - المعلم: رابط البريد نفسه، أو كلمة مؤقتة يولّدها المالك من صفحة المعلم: تعمل ٢٤ ساعة ومرة واحدة،
 *    ولا تفتح إلا صفحة اختيار كلمة جديدة (قرار D17).
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

/** تُفحص للطلاب فقط، فلا تتغير كلمات معلمين قُبلت من قبل ولا يُجبر أحد على تغيير كلمته */
const STUDENT_COMMON_CORES = new Set([
  "iloveyou",
  "love",
  "hello",
  "football",
  "princess",
  "dragon",
  "monkey",
  "sunshine",
  "master",
  "school",
  "family",
  "secret",
  "barcelona",
  "realmadrid",
  "madrid",
  "messi",
  "ronaldo",
  "mohammed",
  "mohammad",
  "muhammad",
  "mohamed",
  "ahmed",
  "ahmad",
  "ali",
  "abdullah",
  "abdulla",
  "fatima",
  "fatma",
  "sara",
  "sarah",
  "maryam",
  "mariam",
  "noor",
  "nour",
  "hussain",
  "hussein",
  "محمد",
  "احمد",
  "أحمد",
  "علي",
  "عبدالله",
  "عبدالرحمن",
  "فاطمة",
  "فاطمه",
  "سارة",
  "ساره",
  "مريم",
  "نور",
  "حسين",
  "كلمةالسر",
  "كلمةسر",
  "مدرسة",
  "مدرسه",
  "طالب",
  "طالبة",
  "طالبه",
  "معلم",
  "الله",
  "سبحانالله",
  "احبك",
  "أحبك",
]);

/** صفوف لوحة المفاتيح والأبجدية، تُفحص الكلمة كاملة في الاتجاهين */
const SEQUENCES = ["abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm", "!@#$%^&*()", "ابتثجحخدذرزسشصضطظعغفقكلمنهوي", "ضصثقفغعهخحجدشسيبلاتنمكطئءؤرلاىةوزظ"];

const collapseRepeat = (s: string) => /^(.+?)\1+$/u.exec(s)?.[1] ?? s;
const isSequence = (s: string) => {
  if (!s) return false;
  const reversed = [...s].reverse().join("");
  return SEQUENCES.some((row) => row.includes(s) || row.includes(reversed));
};

/** p@ssw0rd تقرأ password. الأرقام والرموز في طرفي الكلمة ليست بديل حرف: ahmed2012 يكفيها حذفها */
function deLeet(normalized: string): string {
  return normalized
    .replace(/^[^\p{L}@$]+|[^\p{L}]+$/gu, "")
    .replace(/[@4]/g, "a")
    .replace(/[$5]/g, "s")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/[1!]/g, "i")
    .replace(/7/g, "t");
}

const STUDENT_TOO_SHORT = "كلمة المرور يجب أن تكون ٨ أحرف على الأقل";
const STUDENT_TOO_EASY = "كلمة المرور سهلة التخمين. جرّب كلمتين تتذكرهما بينهما رقم، ولا تستخدم أرقامًا فقط أو اسمك أو بريدك";

/** ما يظهر تحت حقل كلمة المرور في نماذج الطالب */
export const STUDENT_PASSWORD_HINT = "٨ أحرف على الأقل، وليست أرقامًا فقط أو اسمًا شائعًا";

function studentPasswordError(password: string, email?: string | null): string | null {
  if (password.length < STUDENT_PASSWORD_MIN) return STUDENT_TOO_SHORT;
  const normalized = password.normalize("NFKC").toLowerCase();
  // رقم هاتف أو تاريخ ميلاد، ولو بفواصل بينها
  if (!/\p{L}/u.test(normalized)) return STUDENT_TOO_EASY;
  if (new Set(normalized).size < 4) return STUDENT_TOO_EASY;
  const letters = normalized.replace(/[^\p{L}]/gu, "");
  if ([normalized, letters].some((s) => isSequence(collapseRepeat(s)))) return STUDENT_TOO_EASY;
  for (const candidate of [letters, deLeet(normalized).replace(/[^\p{L}]/gu, "")]) {
    const core = collapseRepeat(candidate);
    if (COMMON_CORES.has(core) || STUDENT_COMMON_CORES.has(core)) return STUDENT_TOO_EASY;
  }
  const local = email?.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && normalized.includes(local)) return STUDENT_TOO_EASY;
  return null;
}

const STAFF_TOO_SHORT = "كلمة مرور حسابات الإدارة والمعلمين يجب أن تكون ١٢ حرفًا على الأقل";
const STAFF_TOO_EASY = "كلمة المرور سهلة التخمين. اختر عبارة أطول لا تعتمد على كلمة شائعة أو على بريدك أو على تكرار الحروف";

/** يعيد سبب رفض كلمة المرور بالعربية، أو null إن كانت مقبولة */
export function passwordPolicyError(role: PasswordRole, password: string, email?: string | null): string | null {
  if (password.length > PASSWORD_MAX) return "كلمة المرور طويلة جدًا";
  if (role === "student") return studentPasswordError(password, email);
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
