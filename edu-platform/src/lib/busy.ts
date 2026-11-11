/**
 * «المنصة مشغولة»: قاعدة البيانات لم ترد في المهلة، أو لم يتوفر اتصال. ليس عطلًا في الطلب نفسه، فيُعاد بعد لحظات.
 * بلا اعتماديات خادم: صفحات الخطأ (مكونات عميل) تقرأ البصمة والنص من هنا.
 */

/** بصمة الخطأ التي يحملها DatabaseBusyError، فيعرفه حد الخطأ في المتصفح دون أي تفصيل من الخادم */
export const DB_BUSY_DIGEST = "DB_BUSY";

/** الثواني المقترحة قبل إعادة المحاولة (ترويسة Retry-After) */
export const DB_BUSY_RETRY_AFTER_SECONDS = 5;

export const DB_BUSY_TITLE = "المنصة مشغولة الآن";
export const DB_BUSY_MESSAGE = "الضغط كبير على المنصة في هذه اللحظة. انتظر بضع ثوانٍ ثم أعد المحاولة.";

export function isBusyDigest(digest: string | undefined | null): boolean {
  return digest === DB_BUSY_DIGEST;
}

/**
 * «المنصة قيد التحديث»: هذا الإصدار من الكود يحتاج تحديثًا لقاعدة البيانات لم يُطبق بعد (F26)، فلا يخدم أحدًا حتى يُطبق.
 * ليس ضغطًا ولا عطلًا في الطلب. البيانات لم تُمس: الكود يرفض قبل أن يرسل أي أمر.
 */
export const DB_MAINTENANCE_DIGEST = "DB_MAINTENANCE";
export const DB_MAINTENANCE_RETRY_AFTER_SECONDS = 30;
export const DB_MAINTENANCE_TITLE = "المنصة قيد التحديث";
export const DB_MAINTENANCE_MESSAGE = "نجري تحديثًا على المنصة فتوقفت مؤقتًا. حسابك ومشترياتك محفوظة كما هي، فأعد المحاولة بعد قليل.";

export function isMaintenanceDigest(digest: string | undefined | null): boolean {
  return digest === DB_MAINTENANCE_DIGEST;
}

/** نص صفحة الخطأ لحالة مؤقتة يعرفها المتصفح من البصمة وحدها، أو null لخطأ عادي */
export function temporaryStateCopy(digest: string | undefined | null): { title: string; message: string; kind: "busy" | "maintenance" } | null {
  if (isMaintenanceDigest(digest)) return { title: DB_MAINTENANCE_TITLE, message: DB_MAINTENANCE_MESSAGE, kind: "maintenance" };
  if (isBusyDigest(digest)) return { title: DB_BUSY_TITLE, message: DB_BUSY_MESSAGE, kind: "busy" };
  return null;
}

/** الثواني قبل إعادة محاولة دخول رُفض لأن فحوص كلمات المرور ممتلئة على هذه النسخة */
export const HASH_BUSY_RETRY_AFTER_SECONDS = 5;
/** ليست «كلمة مرور خاطئة»: لم تُفحص أصلًا ولم تُحتسب */
export const LOGIN_BUSY_MESSAGE = "طلاب كثيرون يسجلون الدخول الآن، فلم نفحص كلمة مرورك بعد ولم تُحتسب هذه المحاولة عليك. أعد المحاولة بعد لحظات.";
/** التسجيل وتغيير كلمة المرور وما شابه: رُفض الطلب قبل أن يتغير شيء */
export const HASH_BUSY_MESSAGE = "المنصة مشغولة الآن ولم يُحفظ شيء بعد. أعد المحاولة بعد لحظات.";
