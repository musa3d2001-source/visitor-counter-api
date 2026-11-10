import "server-only";
import { VIDEO_PRODUCT_TYPES } from "@/lib/labels";
import type { Db } from "../db";
import { env } from "../env";

/**
 * ما يجوز بيعه وعرضه من الفيديو، في مكان واحد يقرؤه النشر والسلة والدفع والصفحات.
 *
 * الملف الخام رابط MP4 يستطيع أي طالب تنزيله، فلا يُنشر ولا يُباع في الإنتاج إلا بإذن صريح (ALLOW_FILE_VIDEO=true).
 * الإغلاق يوقف البيع والمعاينات المجانية فقط: من له حق مشاهدة قائم يكمل المشاهدة دائمًا.
 */

/** فيديو ملف خام ممنوع على هذا النشر */
export function rawVideoForbidden(): boolean {
  const e = env();
  return e.NODE_ENV === "production" && !e.ALLOW_FILE_VIDEO;
}

/** الرفع الجديد على هذا النشر يذهب إلى ملف خام، فلا فيديو للبيع أصلًا. هذا هو مسار الإطلاق بالمذكرات فقط */
export function videoHostingBlocked(): boolean {
  return env().VIDEO_PROVIDER === "file" && rawVideoForbidden();
}

/**
 * عدد المنتجات المدفوعة المنشورة التي يُشاهَد فيديوها دون مزود بث: ملف خام، أو Bunny على نشر بلا مفاتيحه.
 * الملف الخام ليس للبيع: رابطه قابل للتنزيل، ولا جودات متعددة له، ولا استكمال لرفعه. لذلك تحذير صريح للمالك ما دام موجودًا.
 */
export async function paidVideoWithoutStreaming(db: Db, streamingReady: boolean): Promise<number> {
  const [{ n }] = await db<{ n: number }[]>`
    select count(distinct p.id)::int as n
    from products p join lessons l on l.product_id = p.id and l.is_published
    where p.status = 'published' and not p.is_free and (l.provider = 'file' or not ${streamingReady}::boolean)
  `;
  return n;
}

type VideoSwitch = { videos_enabled: boolean };

/** هل يُعرض الفيديو ويُباع على مستوى المنصة كلها؟ */
export function videoSalesOpen(settings: VideoSwitch): boolean {
  return settings.videos_enabled && !videoHostingBlocked();
}

export type VideoCloseFlags = {
  /** كل فيديو مغلق: أوقفه المالك، أو لا مزود آمن له */
  allClosed: boolean;
  /** الدروس المرفوعة كملف خام مغلقة حتى لو كان المزود الحالي Bunny */
  rawClosed: boolean;
};

export function videoCloseFlags(settings: VideoSwitch): VideoCloseFlags {
  return { allClosed: !videoSalesOpen(settings), rawClosed: rawVideoForbidden() };
}

/**
 * من ids: المنتجات التي تضم فيديو مغلقًا الآن، بنفسها أو في محتوياتها بأي عمق.
 * الجذر يُفحص دائمًا، والمحتويات المنشورة أو المخفية فقط، لأنها ما يصل فعلًا إلى المشتري.
 * db معامل حتى يعمل داخل معاملة الدفع على اتصالها هي.
 */
export async function closedVideoProductIds(db: Db, ids: string[], settings: VideoSwitch): Promise<Set<string>> {
  const { allClosed, rawClosed } = videoCloseFlags(settings);
  if (ids.length === 0 || (!allClosed && !rawClosed)) return new Set();
  const rows = await db<{ root: string }[]>`
    with recursive c(root, id) as (
      select r, r from unnest(${ids}::uuid[]) as r
      union
      select c.root, bi.product_id from c join bundle_items bi on bi.bundle_id = c.id
    )
    select distinct c.root
    from c join products item on item.id = c.id
    where (c.id = c.root or item.status in ('published', 'hidden'))
      and (
        (${allClosed}::boolean and (item.type = any(${VIDEO_PRODUCT_TYPES}::text[]) or exists (select 1 from lessons l where l.product_id = item.id and l.is_published)))
        or (${rawClosed}::boolean and exists (select 1 from lessons l where l.product_id = item.id and l.is_published and l.provider = 'file'))
      )
  `;
  return new Set(rows.map((r) => r.root));
}
