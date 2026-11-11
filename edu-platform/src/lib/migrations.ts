/**
 * الترحيلات التي يحتاجها هذا الكود. ملف نقي بلا اعتماديات: يقرؤه حارس قاعدة البيانات (db.ts) وصفحة الإطلاق معًا.
 * اختبار الوحدة tests/unit/launch-verdict.test.ts يفشل إذا أُضيف ملف ترحيل بعد 0010 ولم يُذكر هنا.
 * كود يعمل على قاعدة ينقصها واحد منها يرد «المنصة قيد التحديث» بدل أن يكسر الدخول والدفع (F26).
 */
export const REQUIRED_MIGRATIONS = ["0010_payments_hardening.sql", "0011_accounts_hardening.sql", "0012_content_teachers.sql", "0013_site_ops.sql", "0014_hardening.sql"] as const;
