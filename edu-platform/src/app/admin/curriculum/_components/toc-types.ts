import type { ActionState } from "@/lib/action-state";
import type { TocPreview } from "@/server/questions/curriculum";

/** نتيجة إجراءي استيراد الفهرس: الحالة الموحدة + نتيجة التشغيل التجريبي (إن وُجدت) */
/** labels: عبارات الملخص منسّقة على الخادم (count) حتى لا تدخل دوال العدّ حزمة العميل المشتركة */
export type TocSummaryLabels = { units: string; create: string; update: string; same: string; errors: string | null };
export type TocActionState = (NonNullable<ActionState> & { preview?: TocPreview; labels?: TocSummaryLabels; mode?: "preview" | "apply" }) | null;
