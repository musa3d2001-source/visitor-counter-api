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

/** أنواع رسائل البريد كما تظهر للمالك في قائمة الإخفاقات */
export const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  password_reset: "رابط استعادة كلمة المرور",
  password_reset_refused: "تنبيه طلب استعادة حساب المالك",
  password_reset_notice: "تنبيه إعادة تعيين كلمة المرور",
  email_verification: "رابط تأكيد البريد",
  email_in_use_notice: "تنبيه استخدام البريد لحساب آخر",
  email_changed_notice: "تنبيه تغيير البريد",
  order_confirmation: "تأكيد طلب",
  order_refund: "استرداد قيد التنفيذ",
  order_refund_completed: "اكتمال استرداد",
  order_refund_cancelled: "إلغاء استرداد",
  order_extra_payment: "دفعة زائدة",
  ops_alert: "تنبيه تشغيل للمالك",
};

/** القيم الموثقة في حدث DISPUTE_STATUS_CHANGED */
export const DISPUTE_TYPE_LABELS: Record<string, string> = {
  CHARGEBACK: "رد مبلغ من البنك",
  DOCUMENTREQUEST: "طلب مستندات",
  FRAUDALERT: "تنبيه احتيال",
  UNVERIFY: "عدم تحقق",
};
export const DISPUTE_STATUS_LABELS: Record<string, string> = { PENDING: "قيد المتابعة", RESOLVED: "تمت التسوية", LOST: "خُسر النزاع" };

/** أسباب رفض إشعارات Webhook (تظهر للمالك في الإعدادات) */
export const WEBHOOK_REJECTION_LABELS: Record<string, string> = {
  payments_disabled: "الدفع غير مفعّل",
  body_too_large: "حجم أكبر من المسموح",
  invalid_json: "محتوى غير صالح",
  unsupported_version: "إصدار غير مدعوم",
  unsupported_shape: "صيغة غير مدعومة",
  missing_signature: "بدون توقيع",
  unsupported_event: "حدث غير معروف",
  invalid_signature: "توقيع غير صحيح",
};

/** الدفعات الزائدة: مال وصل ولا يكمل طلبًا (تظهر للمالك) */
export const EXTRA_PAYMENT_KIND_LABELS: Record<string, string> = {
  duplicate: "دفعة ثانية على طلب مدفوع",
  after_refund: "دفعة على طلب مسترد",
  late_review: "دفعة متأخرة على طلب مغلق",
  amount_mismatch: "مبلغ لا يطابق الطلب",
};
export const EXTRA_PAYMENT_STATE_LABELS: Record<string, string> = {
  open: "بانتظار قرارك",
  refund_sending: "يُرسل الآن",
  refund_unknown: "نتيجة غير مؤكدة",
  refund_requested: "أُرسل للبوابة",
  refunded: "مسترد",
  refund_failed: "رفضته البوابة",
  dismissed: "مغلق",
};

const PAYMENT_METHOD_NAMES: Record<string, string> = {
  knet: "كي نت",
  "visa/master": "فيزا أو ماستركارد",
  visa: "فيزا",
  mastercard: "ماستركارد",
  "apple pay": "Apple Pay",
  applepay: "Apple Pay",
  "google pay": "Google Pay",
  amex: "أمريكان إكسبريس",
  "american express": "أمريكان إكسبريس",
};

/**
 * اسم وسيلة الدفع للعرض. قبل تأكيد الدفع نخزن رقم الوسيلة لدى البوابة، فلا نعرض رقمًا أبدًا: null يعني أن الاسم غير معروف.
 * بعد التأكيد تُخزن قيمة PaymentGateway من البوابة، وما لا نعرف ترجمته يُعرض كما وصل.
 */
export function paymentMethodLabel(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value || /^\d+$/.test(value)) return null;
  if (value.toLowerCase() === "all") return "MyFatoorah";
  return PAYMENT_METHOD_NAMES[value.toLowerCase()] ?? value;
}

/** حالات الاسترداد كما يراها المالك */
export const REFUND_STATUS_LABELS: Record<string, string> = {
  recorded: "مسجل محليًا ولم يُرسل",
  sending: "يُرسل الآن",
  unknown: "نتيجة غير مؤكدة",
  not_sent: "لم يصل البوابة",
  requested: "بانتظار تنفيذ البوابة",
  completed: "مكتمل",
  failed: "رفضته البوابة أو ألغته",
  dismissed: "مغلق دون إرسال",
};

/** ما يعنيه السجل وما يجب فعله، سطر واحد تحت السجل */
export const REFUND_STATUS_HINTS: Record<string, string> = {
  recorded: "سجل قديم غيّر الطلب محليًا فقط. أرسله إلى البوابة إن لم يكن المبلغ قد أُعيد، أو أغلقه إن سويته خارجها.",
  unknown: "قد يكون الطلب وصل البوابة. لم يتغير الطلب، ولا إرسال قبل إعادة التحقق.",
  not_sent: "تأكدنا أن الطلب لم يصل البوابة، ولم يتغير الطلب.",
  requested: "وصل الطلب وأُغلق وصول الطالب. يراجعه فريق مالية MyFatoorah إلا إن كان الاسترداد التلقائي مفعلًا، ولا يُنفذ إلا برصيد متاح.",
  failed: "لم يتغير الطلب. إن كان السبب الرصيد فأعد المحاولة لاحقًا: المبالغ المقبوضة اليوم قد لا تدخل في الرصيد المتاح للاسترداد.",
};

/** حالة الاسترداد كما يراها الطالب في طلبه */
export const REFUND_PUBLIC_STATUS_LABELS: Record<string, string> = {
  recorded: "قيد المعالجة",
  requested: "قيد التنفيذ لدى بوابة الدفع",
  completed: "تم تنفيذه",
};

/** لماذا لم يُطبق حدث استرداد تلقائيًا */
export const REFUND_ALERT_REASON_LABELS: Record<string, string> = {
  unknown_invoice: "الفاتورة ليست من فواتيرنا",
  other_environment: "الفاتورة من وضع دفع مختلف",
  not_confirmed: "لم تؤكد البوابة تنفيذ هذا الاسترداد عند سؤالها",
  amount_mismatch: "المبلغ لا يساوي كامل قيمة الطلب (استرداد جزئي)",
  order_not_paid: "الطلب ليس مدفوعًا",
  conflicting_refund: "على الطلب استرداد آخر جارٍ",
  cancelled_after_completion: "ألغت البوابة استردادًا سجلناه مكتملًا",
  cancelled_unknown: "إلغاء لاسترداد لا نعرفه",
  extra_mismatch: "لا يطابق مبلغ الدفعة الزائدة",
  extra_ambiguous: "على الفاتورة دفعتان ولا نعرف أيهما استُردت",
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

/** سبب تعليق طلب مدفوع كما يراه المالك */
export const HOLD_KIND_LABELS: Record<"dispute" | "partial_refund", string> = { dispute: "نزاع على الدفعة", partial_refund: "استرداد جزئي من لوحة البوابة" };
