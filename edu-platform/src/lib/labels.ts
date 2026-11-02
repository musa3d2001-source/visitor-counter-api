/** المسميات العربية الموحدة لأنواع المنتجات والحالات */

export const PRODUCT_TYPES = [
  "final_notes",
  "exam_night",
  "exam_model",
  "answer_key",
  "review_notes",
  "bundle",
  "video_course",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  final_notes: "مذكرة نهائية",
  exam_night: "مذكرة ليلة الاختبار",
  exam_model: "نموذج اختبار",
  answer_key: "نموذج إجابة",
  review_notes: "مذكرة شرح ومراجعة",
  bundle: "باقة",
  video_course: "دروس فيديو",
};

/** ترتيب عرض الأنواع في صفحة المادة */
export const PRODUCT_TYPE_ORDER: ProductType[] = [
  "final_notes",
  "review_notes",
  "exam_night",
  "exam_model",
  "answer_key",
  "video_course",
  "bundle",
];

export const PDF_PRODUCT_TYPES: ProductType[] = ["final_notes", "exam_night", "exam_model", "answer_key", "review_notes"];

export const PRODUCT_STATUSES = ["draft", "published", "hidden", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "مسودة",
  published: "منشور",
  hidden: "مخفي",
  archived: "مؤرشف",
};

export const ORDER_STATUSES = ["pending", "paid", "failed", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "بانتظار الدفع",
  paid: "مدفوع",
  failed: "فشل الدفع",
  cancelled: "ملغي",
  refunded: "مسترد",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  initiated: "تم الإنشاء",
  pending: "قيد المعالجة",
  paid: "ناجح",
  failed: "فشل",
  expired: "منتهي",
  refunded: "مسترد",
};

export const ENTITLEMENT_SOURCE_LABELS: Record<string, string> = {
  purchase: "شراء",
  bundle: "ضمن باقة",
  manual: "منح يدوي",
  free: "مجاني",
};

export const TERM_LABELS: Record<number, string> = {
  1: "الفصل الدراسي الأول",
  2: "الفصل الدراسي الثاني",
};

export function termLabel(term: number | null | undefined): string {
  if (!term) return "العام الدراسي كاملًا";
  return TERM_LABELS[term] ?? "";
}

/** أيقونات المواد المتاحة (أسماء أيقونات lucide) */
export const SUBJECT_ICONS = [
  "book",
  "book-open",
  "languages",
  "calculator",
  "flask",
  "globe",
  "moon",
  "monitor",
  "palette",
  "music",
  "landmark",
  "atom",
] as const;
