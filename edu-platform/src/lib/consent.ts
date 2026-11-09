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
 */
export const CONSENT_VERSIONS = {
  terms: "2026-11-draft-2",
  privacy: "2026-11-draft-3",
  guardian_purchase: "2026-11-draft-1",
  teacher_agreement: "2026-11-draft-1",
} as const;

export type ConsentKind = keyof typeof CONSENT_VERSIONS;

/** ما يوافق عليه الحساب مرة واحدة لكل نسخة، بخلاف الإقرار الذي يخص كل طلب */
export const ACCOUNT_CONSENT_KINDS = ["terms", "privacy"] as const satisfies readonly ConsentKind[];

export const CONSENT_KIND_LABELS: Record<ConsentKind, string> = {
  terms: "الشروط والأحكام",
  privacy: "سياسة الخصوصية",
  guardian_purchase: "إقرار البالغ أو ولي الأمر قبل الدفع",
  teacher_agreement: "اتفاقية المعلم",
};

export const GUARDIAN_DECLARATION_TEXT = "أقرّ بأن عمري ١٨ سنة أو أكثر، أو أن ولي أمري معي الآن ووافق على هذا الشراء.";
export const GUARDIAN_DECLARATION_HINT = "عمرك أقل من ١٨ سنة؟ اطلب من ولي أمرك أن يكون معك قبل الدفع.";

/** أسماء حقول النموذج، وهي نفسها مفاتيح أخطاء الحقول */
export type ConsentField = "termsAccepted" | "guardianDeclaration";

export const CONSENT_FIELD_ERRORS: Record<ConsentField, string> = {
  termsAccepted: "وافق على الشروط والأحكام وسياسة الخصوصية لتكمل",
  guardianDeclaration: "أكّد الإقرار قبل الدفع",
};
