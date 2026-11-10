/**
 * موافقات المستخدمين: هذا هو المكان الوحيد لأرقام النسخ ولنص إقرار الدفع.
 *
 * مسودة بانتظار مراجعة المحامي، ولم يُعتمد شيء منها قانونيًا:
 *  - صياغة الإقرار أدناه، ومن يكون الطرف المتعاقد حين يكون المشتري قاصرًا (طلاب الصفوف ٦ إلى ٩ قاصرون).
 *  - حد ١٨ سنة: مطلوب في هذه المرحلة، وعلى المحامي تأكيده أمام سن الرشد في القانون الكويتي.
 * النظام يسجل ما أقر به المشتري ولا يتحقق من عمره أو من حضور ولي أمره، فلا تكتب في الواجهة ما يوحي بغير ذلك.
 *
 * تغيير جوهري في نص وثيقة = رقم نسخة جديد هنا. من وافق على نسخة أقدم يُسأل عند شرائه التالي ولا يُقفل حسابه.
 * كل رقم يطابق نصًا بعينه: terms ← صفحة /terms و privacy ← صفحة /privacy و teacher_agreement ← lib/teacher-agreement.ts، ويظهر الرقم في الصفحة نفسها.
 * tests/integration/legal-pages.test.ts يفشل إذا تغير نص الصفحة ولم يتغير رقمها.
 * الشروط والخصوصية تطبعان إعدادات من لوحة الإدارة، فيُسجَّل معهما بصمة تلك الإعدادات (server/platform/consent.ts).
 */
export const CONSENT_VERSIONS = {
  terms: "2026-11-draft-4",
  privacy: "2026-11-draft-7",
  guardian_purchase: "2026-11-draft-1",
  teacher_agreement: "2026-11-draft-1",
  guardian_account: "2026-11-draft-1",
} as const;

export type ConsentKind = keyof typeof CONSENT_VERSIONS;

/**
 * صفحات قانونية بلا موافقة مسجلة لكن المحامي يراجعها. رقم نسختها يظهر في الصفحة ويدخل في خطوة «مراجعة المحامي»،
 * فتغيير نصها يعيد الخطوة مفتوحة. tests/integration/legal-pages.test.ts يفشل إذا تغير النص ولم يتغير الرقم.
 */
export const LEGAL_PAGE_VERSIONS = {
  refund_policy: "2026-11-draft-1",
  copyright: "2026-11-draft-1",
} as const;

/** ما يوافق عليه الحساب مرة واحدة لكل نسخة، بخلاف الإقرار الذي يخص كل طلب */
export const ACCOUNT_CONSENT_KINDS = ["terms", "privacy"] as const satisfies readonly ConsentKind[];

export const CONSENT_KIND_LABELS: Record<ConsentKind, string> = {
  terms: "الشروط والأحكام",
  privacy: "سياسة الخصوصية",
  guardian_purchase: "إقرار البالغ أو ولي الأمر قبل الدفع",
  teacher_agreement: "اتفاقية المعلم",
  guardian_account: "إقرار البالغ أو علم ولي الأمر عند إنشاء الحساب",
};

export const GUARDIAN_DECLARATION_TEXT = "أقرّ بأن عمري ١٨ سنة أو أكثر، أو أن ولي أمري معي الآن ووافق على هذا الشراء.";
export const GUARDIAN_DECLARATION_HINT = "عمرك أقل من ١٨ سنة؟ اطلب من ولي أمرك أن يكون معك قبل الدفع.";

/**
 * إقرار خطوة التسجيل (القرار F8): يسجل ما أعلنه من ينشئ الحساب، ولا يطلب بيانات ولي الأمر ولا يتحقق من شيء.
 * يبقى إقرار الدفع أعلاه كما هو لكل طلب. والتحقق من ولي الأمر نفسه بند للمحامي في GO_LIVE.
 */
export const GUARDIAN_ACCOUNT_TEXT = "أقرّ بأن عمري ١٨ سنة أو أكثر، أو بأن ولي أمري يعلم بإنشاء هذا الحساب ووافق عليه.";
export const GUARDIAN_ACCOUNT_HINT = "نسجّل إقرارك هذا ولا نتحقق من عمرك. ويمكن لولي الأمر طلب حذف الحساب في أي وقت.";
export const GUARDIAN_ACCOUNT_ERROR = "أكّد هذا الإقرار لتكمل";

/** أسماء حقول النموذج، وهي نفسها مفاتيح أخطاء الحقول */
export type ConsentField = "termsAccepted" | "guardianDeclaration";

export const CONSENT_FIELD_ERRORS: Record<ConsentField, string> = {
  termsAccepted: "وافق على الشروط والأحكام وسياسة الخصوصية لتكمل",
  guardianDeclaration: "أكّد الإقرار قبل الدفع",
};
