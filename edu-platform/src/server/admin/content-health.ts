import "server-only";
import { sql } from "../db";
import { audit } from "../platform/audit";
import { reportError } from "../platform/report-error";
import { checkStoredFile, FLAGGED_STATUSES, type FileCheckStatus, type FlaggedStatus } from "../access/file-check";
import { servablePreviewSql } from "../access/preview-rule";
import { AdminError } from "./common";
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

export type ContentHealthCounts = { flagged: number; unchecked: number; badPreviews: number; unpriced: number; noShare: number; stoppedBundles: number };

/**
 * باقات منشورة مدفوعة توقف بيعها بسبب ما بداخلها: معلم بلا نسبة أو ملف معيب، بأي عمق.
 * القائمتان الأخريان تعرضان المنتج نفسه، ولا يظهر فيهما أن الباقة التي تضمه توقفت أيضًا.
 */
const stoppedBundlesSql = () => sql`
  with recursive c(root, id) as (
    select b.id, bi.product_id from products b join bundle_items bi on bi.bundle_id = b.id where b.status = 'published' and not b.is_free
    union
    select c.root, bi.product_id from c join bundle_items bi on bi.bundle_id = c.id
  )
  select distinct c.root as id
  from c
  join products item on item.id = c.id
  left join teachers t on t.id = item.teacher_id
  where (t.id is not null and not item.is_free and t.revenue_share_bps is null)
    or exists (select 1 from product_files f where f.product_id = c.id and f.kind = 'main' and f.check_status = any(${FLAGGED_STATUSES}::text[]))
`;

export async function contentHealthCounts(): Promise<ContentHealthCounts> {
  const [row] = await sql<ContentHealthCounts[]>`
    select
      (select count(*)::int from product_files f join products p on p.id = f.product_id where f.check_status = any(${FLAGGED_STATUSES}::text[]) and p.status <> 'archived') as flagged,
      (select count(*)::int from product_files f join products p on p.id = f.product_id where f.check_status = 'unchecked' and p.status <> 'archived') as unchecked,
      (select count(*)::int from product_files pf join products p on p.id = pf.product_id where pf.kind = 'preview' and p.status <> 'archived' and not ${servablePreviewSql("pf")}) as "badPreviews",
      (select count(*)::int from products p where p.status = 'published' and p.price_fils = 0 and not p.is_free) as unpriced,
      (select count(*)::int from products p join teachers t on t.id = p.teacher_id where p.status = 'published' and not p.is_free and t.revenue_share_bps is null) as "noShare",
      (select count(*)::int from (${stoppedBundlesSql()}) s) as "stoppedBundles"
  `;
  return row;
}

export const needsOwnerAttention = (c: ContentHealthCounts) => c.flagged + c.badPreviews + c.unpriced + c.noShare + c.stoppedBundles > 0;

export type FlaggedFile = { id: string; title: string; kind: "main" | "preview"; check_status: FlaggedStatus; product_id: string; product_title: string; product_status: ProductStatus };
export type BadPreview = { id: string; product_id: string; product_title: string; product_status: ProductStatus; is_auto_preview: boolean; page_count: number | null; main_pages: number | null; issue: PreviewIssue };
export type ProductFlag = { id: string; title: string; status: ProductStatus; teacher_name: string | null };

export async function contentHealthReport() {
  const [flagged, previews, unpriced, noShare, stoppedBundles] = await Promise.all([
    sql<FlaggedFile[]>`
      select f.id, f.title, f.kind, f.check_status, p.id as product_id, p.title as product_title, p.status as product_status
      from product_files f join products p on p.id = f.product_id
      where f.check_status = any(${FLAGGED_STATUSES}::text[]) and p.status <> 'archived'
      order by (p.status = 'published') desc, p.title limit 200
    `,
    sql<(Omit<BadPreview, "issue"> & { check_status: string; source_file_id: string | null; pages_isolated: boolean; first_main_id: string | null; first_main_status: string | null })[]>`
      select pf.id, pf.product_id, p.title as product_title, p.status as product_status, pf.is_auto_preview, pf.page_count, pf.check_status, pf.source_file_id, pf.pages_isolated,
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
    sql<ProductFlag[]>`
      select p.id, p.title, p.status, t.display_name as teacher_name
      from (${stoppedBundlesSql()}) s join products p on p.id = s.id left join teachers t on t.id = p.teacher_id
      order by p.title limit 200
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
          { page_count: r.page_count, check_status: r.check_status, source_file_id: r.source_file_id, pages_isolated: r.pages_isolated },
          r.first_main_id ? { id: r.first_main_id, page_count: r.main_pages, check_status: r.first_main_status ?? "" } : undefined,
        ) ?? "stale",
    })),
    unpriced,
    noShare,
    stoppedBundles,
  };
}

/**
 * إعادة فحص ملف بطلب المالك. الحكم يُسجل فقط إن كان حقيقيًا، أما تعذر الوصول إلى التخزين فيترك الحالة كما هي.
 */
export async function recheckFile(
  fileId: string,
  actorId: string,
  ip?: string,
): Promise<{ outcome: "cleared" } | { outcome: "still_flagged"; problem: FlaggedStatus } | { outcome: "storage_error" }> {
  const [f] = await sql<{ id: string; storage_key: string; check_status: string; product_id: string }[]>`select id, storage_key, check_status, product_id from product_files where id = ${fileId}`;
  if (!f) throw new AdminError("الملف غير موجود");
  let status: FileCheckStatus;
  try {
    status = await checkStoredFile(f);
  } catch (err) {
    await reportError("content-health:recheck", err);
    await audit({ actorId, action: "content.file_recheck", entityType: "product", entityId: f.product_id, metadata: { fileId, from: f.check_status, to: null, storageError: true }, ip });
    return { outcome: "storage_error" };
  }
  await audit({ actorId, action: "content.file_recheck", entityType: "product", entityId: f.product_id, metadata: { fileId, from: f.check_status, to: status }, ip });
  return status === "ok" ? { outcome: "cleared" } : { outcome: "still_flagged", problem: status as FlaggedStatus };
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
      await reportError("content-health:scan", err);
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

export type RegenerateResult = { generated: number; tooShort: number; none: number; failed: number; remaining: number };

/**
 * إعادة توليد دفعة من المعاينات المخالفة. تحل المعاينة التلقائية محل المخصصة المخالفة، وتُحذف إن كان الملف أقصر من أن تكون له معاينة.
 * مخصصة لا عيب فيها سوى أنها أقدم من فحص العزل تُعزل في مكانها ولا تُستبدل.
 */
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
  const result: RegenerateResult = { generated: 0, tooShort: 0, none: 0, failed: 0, remaining: 0 };
  for (const { product_id } of rows) {
    if (Date.now() >= deadline) break;
    let outcome: PreviewResult;
    try {
      outcome = await regenerateAutoPreview(product_id, { replaceCustom: true, keepRepairable: true });
    } catch (err) {
      await reportError("content-health:preview", err);
      result.failed++;
      continue;
    }
    if (outcome === "generated" || outcome === "repaired") result.generated++;
    else if (outcome === "too_short") result.tooShort++;
    else if (outcome === "none") result.none++;
    else if (outcome === "unreadable" || outcome === "not_isolated") result.failed++;
    await audit({ actorId, action: "product.preview_regenerate", entityType: "product", entityId: product_id, metadata: { result: outcome, bulk: true }, ip });
  }
  result.remaining = (await pending()).length;
  return result;
}
