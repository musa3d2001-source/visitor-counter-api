/** المسميات العربية الموحدة لأنواع المنتجات والحالات */

export const PRODUCT_TYPES = [
  "final_notes",
  "exam_night",
  "exam_model",
  "answer_key",
  "review_notes",
  "video_lesson",
  "unit",
  "quiz_review",
  "exam_review",
  "video_course",
  "bundle",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  final_notes: "مذكرة نهائية",
  exam_night: "مذكرة ليلة الاختبار",
  exam_model: "نموذج اختبار",
  answer_key: "نموذج إجابة",
  review_notes: "مذكرة شرح ومراجعة",
  video_lesson: "درس فيديو",
  unit: "شرح وحدة",
  quiz_review: "مراجعة اختبار قصير",
  exam_review: "مراجعة ليلة الاختبار",
  video_course: "دورة كاملة",
  bundle: "باقة",
};

/** أسماء الأقسام بصيغة الجمع (صفحات المادة والمعلم) */
export const PRODUCT_TYPE_SECTION_LABELS: Record<ProductType, string> = {
  final_notes: "المذكرات النهائية",
  exam_night: "مذكرات ليلة الاختبار",
  exam_model: "نماذج الاختبارات",
  answer_key: "نماذج الإجابة",
  review_notes: "مذكرات الشرح والمراجعة",
  video_lesson: "دروس منفردة",
  unit: "شرح الوحدات",
  quiz_review: "مراجعات الاختبارات القصيرة",
  exam_review: "مراجعات ليلة الاختبار",
  video_course: "الدورات الكاملة",
  bundle: "الباقات",
};

/** مذكرات PDF — تتطلب ملف PDF رئيسيًا للنشر */
export const PDF_PRODUCT_TYPES: ProductType[] = ["final_notes", "exam_night", "exam_model", "answer_key", "review_notes"];

/** منتجات الفيديو — تحتوي دروسًا مرئية (ويمكن إرفاق ملفات PDF معها) */
export const VIDEO_PRODUCT_TYPES: ProductType[] = ["video_lesson", "unit", "quiz_review", "exam_review", "video_course"];

/** الحاويات التي يمكن أن تضم منتجات أخرى (باقة ← دورة ← وحدات ← دروس منفردة) */
export const CONTAINER_PRODUCT_TYPES: ProductType[] = ["bundle", "video_course", "unit"];

export function isVideoType(t: string): boolean {
  return (VIDEO_PRODUCT_TYPES as string[]).includes(t);
}
export function isPdfType(t: string): boolean {
  return (PDF_PRODUCT_TYPES as string[]).includes(t);
}
export function isContainerType(t: string): boolean {
  return (CONTAINER_PRODUCT_TYPES as string[]).includes(t);
}

/** ترتيب عرض الأنواع في صفحة المادة: الفيديو أولًا ثم المذكرات */
export const PRODUCT_TYPE_ORDER: ProductType[] = [
  "unit",
  "video_course",
  "quiz_review",
  "exam_review",
  "video_lesson",
  "final_notes",
  "review_notes",
  "exam_night",
  "exam_model",
  "answer_key",
  "bundle",
];

/** ترتيب صفحة المعلم: ما يحتاجه الطالب قبل الاختبار أولًا */
export const TEACHER_PAGE_ORDER: ProductType[] = [
  "exam_review",
  "quiz_review",
  "unit",
  "video_course",
  "video_lesson",
  "bundle",
  "final_notes",
  "review_notes",
  "exam_night",
  "exam_model",
  "answer_key",
];

export const PRODUCT_STATUSES = ["draft", "in_review", "published", "hidden", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "مسودة",
  in_review: "بانتظار المراجعة",
  published: "منشور",
  hidden: "مخفي",
  archived: "مؤرشف",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "المالك",
  teacher: "معلم",
  student: "طالب",
};

export const TEACHER_MODE_LABELS: Record<string, string> = {
  managed: "يديره المالك (بدون حساب دخول)",
  self_managed: "حساب معلم (يرفع محتواه بنفسه)",
};

export const ACCESS_MODE_LABELS: Record<string, string> = {
  unlimited: "بلا تاريخ انتهاء",
  until_date: "حتى تاريخ محدد",
  days: "عدد أيام من تاريخ الشراء",
};

export const PROCESSING_STATUS_LABELS: Record<string, string> = {
  uploading: "قيد الرفع",
  processing: "قيد المعالجة",
  ready: "جاهز",
  failed: "فشلت المعالجة",
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
