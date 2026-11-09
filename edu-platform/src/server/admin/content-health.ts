import "server-only";
import { sql } from "../db";
import { audit } from "../platform/audit";
import { checkStoredFile, FLAGGED_STATUSES, type FlaggedStatus } from "../access/file-check";
import { servablePreviewSql } from "../access/preview-rule";
import { regenerateAutoPreview, type PreviewResult } from "./products";
import type { ProductStatus } from "@/lib/labels";
import { previewIssue, type PreviewIssue } from "@/lib/preview-policy";

/**
 * سلامة المحتوى: ما يجب أن يراه المالك قبل أن يصل إلى مشترٍ.
 * ملفات معيبة، ملفات قديمة لم تُفحص، معاينات تخالف القاعدة أو صارت قديمة،
 * ومنتجات نُشرت قبل هذه الضوابط بسعر صفر أو لمعلم بلا نسبة.
 */

/** وقت الدفعة الواحدة: أقل من مهلة الصفحة (60 ثانية) حتى تعود النتيجة للمالك */
const BATCH_BUDGET_MS = 40_000;

export type ContentHealthCounts = { flagged: number; unchecked: number; badPreviews: number; unpriced: number; noShare: number };

export async function contentHealthCounts(): Promise<ContentHealthCounts> {
  const [row] = await sql<ContentHealthCounts[]>`
    select
      (select count(*)::int from product_files f join products p on p.id = f.product_id where f.check_status = any(${FLAGGED_STATUSES}::text[]) and p.status <> 'archived') as flagged,
      (select count(*)::int from product_files f join products p on p.id = f.product_id where f.check_status = 'unchecked' and p.status <> 'archived') as unchecked,
      (select count(*)::int from product_files pf join products p on p.id = pf.product_id where pf.kind = 'preview' and p.status <> 'archived' and not ${servablePreviewSql("pf")}) as "badPreviews",
      (select count(*)::int from products p where p.status = 'published' and p.price_fils = 0 and not p.is_free) as unpriced,
      (select count(*)::int from products p join teachers t on t.id = p.teacher_id where p.status = 'published' and not p.is_free and t.revenue_share_bps is null) as "noShare"
  `;
  return row;
}

export const needsOwnerAttention = (c: ContentHealthCounts) => c.flagged + c.badPreviews + c.unpriced + c.noShare > 0;

export type FlaggedFile = { id: string; title: string; kind: "main" | "preview"; check_status: FlaggedStatus; product_id: string; product_title: string; product_status: ProductStatus };
export type BadPreview = { id: string; product_id: string; product_title: string; product_status: ProductStatus; is_auto_preview: boolean; page_count: number | null; main_pages: number | null; issue: PreviewIssue };
export type ProductFlag = { id: string; title: string; status: ProductStatus; teacher_name: string | null };

export async function contentHealthReport() {
  const [flagged, previews, unpriced, noShare] = await Promise.all([
    sql<FlaggedFile[]>`
      select f.id, f.title, f.kind, f.check_status, p.id as product_id, p.title as product_title, p.status as product_status
      from product_files f join products p on p.id = f.product_id
      where f.check_status = any(${FLAGGED_STATUSES}::text[]) and p.status <> 'archived'
      order by (p.status = 'published') desc, p.title limit 200
    `,
    sql<(Omit<BadPreview, "issue"> & { check_status: string; source_file_id: string | null; first_main_id: string | null; first_main_status: string | null })[]>`
      select pf.id, pf.product_id, p.title as product_title, p.status as product_status, pf.is_auto_preview, pf.page_count, pf.check_status, pf.source_file_id,
        fm.id as first_main_id, fm.page_count as main_pages, fm.check_status as first_main_status
      from product_files pf
      join products p on p.id = pf.product_id
      left join lateral (
        select m.id, m.page_count, m.check_status from product_files m where m.product_id = pf.product_id and m.kind = 'main'
        order by m.sort_order, m.created_at, m.id limit 1
      ) fm on true
      where pf.kind = 'preview' and p.status <> 'archived' and not ${servablePreviewSql("pf")}
      order by (p.status = 'published') desc, p.title limit 200
    `,
    sql<ProductFlag[]>`
      select p.id, p.title, p.status, t.display_name as teacher_name from products p left join teachers t on t.id = p.teacher_id
      where p.status = 'published' and p.price_fils = 0 and not p.is_free order by p.title limit 200
    `,
    sql<ProductFlag[]>`
      select p.id, p.title, p.status, t.display_name as teacher_name from products p join teachers t on t.id = p.teacher_id
      where p.status = 'published' and not p.is_free and t.revenue_share_bps is null order by t.display_name, p.title limit 200
    `,
  ]);
  return {
    flagged,
    previews: previews.map((r): BadPreview => ({
      id: r.id,
      product_id: r.product_id,
      product_title: r.product_title,
      product_status: r.product_status,
      is_auto_preview: r.is_auto_preview,
      page_count: r.page_count,
      main_pages: r.main_pages,
      issue:
        previewIssue(
          { page_count: r.page_count, check_status: r.check_status, source_file_id: r.source_file_id },
          r.first_main_id ? { id: r.first_main_id, page_count: r.main_pages, check_status: r.first_main_status ?? "" } : undefined,
        ) ?? "stale",
    })),
    unpriced,
    noShare,
  };
}

export type ScanResult = { checked: number; flagged: number; errors: number; remaining: number };

/** فحص دفعة من الملفات القديمة، المنشور أولًا. خطأ التخزين يُعدّ ويترك الملف لدفعة لاحقة */
export async function scanUncheckedFiles(actorId: string, ip?: string, budgetMs = BATCH_BUDGET_MS): Promise<ScanResult> {
  const files = await sql<{ id: string; storage_key: string }[]>`
    select f.id, f.storage_key from product_files f join products p on p.id = f.product_id
    where f.check_status = 'unchecked' and p.status <> 'archived'
    order by (p.status = 'published') desc, f.kind, f.created_at limit 500
  `;
  const deadline = Date.now() + budgetMs;
  const result: ScanResult = { checked: 0, flagged: 0, errors: 0, remaining: 0 };
  for (const f of files) {
    if (Date.now() >= deadline) break;
    try {
      const status = await checkStoredFile(f);
      result.checked++;
      if (status !== "ok") result.flagged++;
    } catch (err) {
      console.error("[content-health] scan failed", f.id, err);
      result.errors++;
    }
  }
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from product_files f join products p on p.id = f.product_id where f.check_status = 'unchecked' and p.status <> 'archived'
  `;
  result.remaining = n;
  await audit({ actorId, action: "content.files_scan", entityType: "settings", entityId: "content_health", metadata: result, ip });
  return result;
}

export type RegenerateResult = { generated: number; removed: number; failed: number; remaining: number };

/** إعادة توليد دفعة من المعاينات المخالفة. تحل المعاينة التلقائية محل المخصصة المخالفة، وتُحذف إن كان الملف أقصر من أن تكون له معاينة */
export async function regenerateBadPreviews(actorId: string, ip?: string, budgetMs = BATCH_BUDGET_MS): Promise<RegenerateResult> {
  const pending = async () =>
    sql<{ product_id: string }[]>`
      select product_id from (
        select distinct on (pf.product_id) pf.product_id, (p.status = 'published') as live
        from product_files pf join products p on p.id = pf.product_id
        where pf.kind = 'preview' and p.status <> 'archived' and not ${servablePreviewSql("pf")}
        order by pf.product_id
      ) pending order by live desc
    `;
  const rows = await pending();
  const deadline = Date.now() + budgetMs;
  const result: RegenerateResult = { generated: 0, removed: 0, failed: 0, remaining: 0 };
  for (const { product_id } of rows) {
    if (Date.now() >= deadline) break;
    let outcome: PreviewResult;
    try {
      outcome = await regenerateAutoPreview(product_id, { replaceCustom: true });
    } catch (err) {
      console.error("[content-health] preview regenerate failed", product_id, err);
      result.failed++;
      continue;
    }
    if (outcome === "generated") result.generated++;
    else if (outcome === "unreadable") result.failed++;
    else result.removed++;
    await audit({ actorId, action: "product.preview_regenerate", entityType: "product", entityId: product_id, metadata: { result: outcome, bulk: true }, ip });
  }
  result.remaining = (await pending()).length;
  return result;
}
