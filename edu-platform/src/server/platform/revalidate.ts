import "server-only";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { invalidatePublicCache } from "./public-cache";

/**
 * كل تعديل من الإدارة يمر من هنا: يفرغ ذاكرة البيانات العامة في هذه النسخة، فيرى المالك أثره مباشرة،
 * ثم يبطل مسارات Next. اختبار public-cache-boundary يمنع استيراد revalidatePath من next/cache في الإدارة.
 * النسخ الأخرى من الخادم تلحق خلال عمر الذاكرة نفسه (أقل من دقيقة).
 */
export function revalidatePath(path: string, type?: "layout" | "page"): void {
  invalidatePublicCache();
  nextRevalidatePath(path, type);
}
