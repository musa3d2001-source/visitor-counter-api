import "server-only";
import { sql } from "../db";
import { env } from "../env";

/**
 * مساحة النسخ المختومة المحفوظة وقواعد إخراجها (القرار F24). ملف خفيف بلا pdf-lib: تقرؤه صفحة الإطلاق والإعدادات
 * والتنظيف اليومي دون أن تحمل محرك الختم. التسليم نفسه في delivery.ts.
 */

/** النسخة المختومة تُحذف بعد هذه المدة بلا فتح (مهمة التنظيف اليومية). الرقم في سياسة الخصوصية */
export const STAMPED_COPY_IDLE_DAYS = 14;
/**
 * المساحة الافتراضية للنسخ المختومة في التخزين، حسب STORAGE_PLAN، ما لم يضبط المالك STAMPED_COPY_BUDGET_GB.
 * free: خطة Supabase المجانية فيها 1GB للمشروع كله مع المذكرات نفسها، فلا تأخذ النسخ منها إلا القليل.
 * paid: Supabase Pro يشمل 100GB تخزينًا (https://supabase.com/pricing، قُرئ 2026-11-11)، فتأخذ النسخ 60GB ويبقى الباقي للأصول.
 * امتلاء المساحة لا يمنع حفظ نسخة جديدة: تُحذف الأقدم استعمالًا أولًا (makeRoom). الحساب في docs/PDF_STAMPING.md.
 */
export const STAMPED_CACHE_BUDGET_BYTES = { free: 150 * 1024 * 1024, paid: 60 * 1024 * 1024 * 1024 } as const;
/** نسخة جُهزت في هذه المدة لمشترٍ ما زال يملك المنتج لا تُحذف لإفساح المكان قبل النسخ الأقدم الخاملة */
export const STAMPED_COPY_PROTECT_DAYS = 7;
/** نسخة فُتحت في هذه المدة لا تُحذف لإفساح المكان: قد يكون رابطها في يد الطالب الآن */
export const STAMPED_COPY_IN_USE_MINUTES = 15;

/** المساحة القصوى للنسخ المختومة بالبايت: STAMPED_COPY_BUDGET_GB إن ضُبط، وإلا حسب STORAGE_PLAN */
export function stampedCopyBudgetBytes(): number {
  const e = env();
  if (e.STAMPED_COPY_BUDGET_GB > 0) return e.STAMPED_COPY_BUDGET_GB * 1024 * 1024 * 1024;
  return e.STORAGE_PLAN === "paid" ? STAMPED_CACHE_BUDGET_BYTES.paid : STAMPED_CACHE_BUDGET_BYTES.free;
}

/**
 * هل نسخة الصف c محمية من الإخراج لإفساح المكان: جُهزت في آخر STAMPED_COPY_PROTECT_DAYS لمشترٍ ما زال يملك منتج ملفها
 * (صلاحية مباشرة، وهي تُمنح لمحتويات الباقة أيضًا عند شرائها). يُستعمل في makeRoom وفي التنظيف اليومي، والصف فيهما باسم c.
 */
export function protectedCopySql() {
  return sql`(c.created_at > now() - make_interval(days => ${STAMPED_COPY_PROTECT_DAYS}) and exists (
    select 1 from product_files f join entitlements e on e.product_id = f.product_id
    where f.id = c.file_id and e.user_id = c.user_id and e.revoked_at is null and (e.expires_at is null or e.expires_at > now())
  ))`;
}
