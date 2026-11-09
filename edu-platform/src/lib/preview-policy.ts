import { ar } from "./design";

/**
 * قاعدة المعاينة المجانية، في مكان واحد يستخدمه التوليد والرفع والعرض والنماذج:
 * صفحة مجانية واحدة لكل 5 صفحات من الملف، بحد أقصى 10 صفحات.
 * ملف أقل من 5 صفحات لا معاينة له، فلا تغطي المعاينة الملف كله مهما قصر.
 */
export const PREVIEW_POLICY = { pagesPerFreePage: 5, maxPages: 10 } as const;

/** أكبر عدد صفحات معاينة مسموح لملف بهذا الطول */
export function maxPreviewPages(totalPages: number | null | undefined): number {
  if (!totalPages || !Number.isInteger(totalPages) || totalPages <= 0) return 0;
  return Math.min(PREVIEW_POLICY.maxPages, Math.floor(totalPages / PREVIEW_POLICY.pagesPerFreePage));
}

/** هل معاينة بهذا الطول مقبولة لملف بهذا الطول؟ قيمة مجهولة تعني لا */
export function previewWithinPolicy(previewPages: number | null | undefined, totalPages: number | null | undefined): boolean {
  if (!previewPages || previewPages <= 0) return false;
  return previewPages <= maxPreviewPages(totalPages);
}

export type PreviewIssue = "stale" | "flagged" | "too_long";

const brokenCheck = (status: string) => status !== "ok" && status !== "unchecked";

/** سبب عدم عرض المعاينة للجمهور، أو null إن كانت سليمة. يقابل شرط servablePreviewSql في الخادم */
export function previewIssue(
  preview: { page_count: number | null; check_status: string; source_file_id: string | null },
  firstMain: { id: string; page_count: number | null; check_status: string } | undefined,
): PreviewIssue | null {
  if (!firstMain || preview.source_file_id !== firstMain.id) return "stale";
  if (brokenCheck(preview.check_status) || brokenCheck(firstMain.check_status)) return "flagged";
  if (!previewWithinPolicy(preview.page_count, firstMain.page_count)) return "too_long";
  return null;
}

export const PREVIEW_ISSUE_LABELS: Record<PreviewIssue, string> = {
  stale: "صُنعت لملف آخر أو تغيّر الملف الرئيسي بعدها",
  flagged: "الملف الرئيسي أو المعاينة معيب",
  too_long: "أطول من المسموح لهذا الملف",
};

/** نص القاعدة كما يظهر للمالك والمعلم */
export const PREVIEW_RULE_TEXT = `صفحة مجانية لكل ${ar(PREVIEW_POLICY.pagesPerFreePage)} صفحات من الملف، وبحد أقصى ${ar(PREVIEW_POLICY.maxPages)} صفحات. الملف الأقل من ${ar(PREVIEW_POLICY.pagesPerFreePage)} صفحات بلا معاينة.`;
