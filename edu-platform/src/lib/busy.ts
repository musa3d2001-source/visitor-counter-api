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
