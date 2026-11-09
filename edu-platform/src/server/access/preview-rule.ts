import "server-only";
import { sql } from "../db";
import { PREVIEW_POLICY } from "@/lib/preview-policy";

/**
 * شرط عرض المعاينة للجمهور بلغة SQL، يُستخدم في الوصول للملف والكتالوج وصفحة المنتج
 * فلا تظهر معاينة في مكان ويُرفض فتحها في آخر. يفشل مغلقًا: أي قيمة ناقصة تعني عدم العرض.
 * المعاينة تُعرض فقط إذا كانت مصنوعة لأول ملف رئيسي حالي، وضمن القاعدة، وكلاهما غير معيب.
 */
export function servablePreviewSql(alias: string) {
  const f = sql(alias);
  return sql`(
    ${f}.kind = 'preview'
    and ${f}.check_status in ('ok', 'unchecked')
    and ${f}.page_count > 0
    and exists (
      select 1 from product_files source_file
      where source_file.id = ${f}.source_file_id
        and source_file.check_status in ('ok', 'unchecked')
        and source_file.page_count is not null
        and ${f}.page_count <= least(${PREVIEW_POLICY.maxPages}::int, source_file.page_count / ${PREVIEW_POLICY.pagesPerFreePage}::int)
        and source_file.id = (
          select first_main.id from product_files first_main
          where first_main.product_id = ${f}.product_id and first_main.kind = 'main'
          order by first_main.sort_order, first_main.created_at, first_main.id
          limit 1
        )
    )
  )`;
}
