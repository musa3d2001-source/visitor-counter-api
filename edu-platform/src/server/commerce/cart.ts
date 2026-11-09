import "server-only";
import { cookies } from "next/headers";
import { sql, type Db } from "../db";
import { env } from "../env";
import { getPublishedProductsByIds, type ProductCard } from "../catalog/queries";
import { accessibleProductIds } from "../access/entitlements";
import { FLAGGED_STATUSES } from "../access/file-check";
import { getSettings } from "../platform/settings";
import { closedVideoProductIds } from "../video/policy";
import { isContainerType } from "@/lib/labels";

/**
 * السلة: قائمة معرفات منتجات في كوكي (تعمل للزائر قبل تسجيل الدخول).
 * الأسعار لا تُخزن في الكوكي أبدًا — تُحسب دائمًا من قاعدة البيانات.
 */
const CART_COOKIE = "cart";
const MAX_ITEMS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCartIds(): Promise<string[]> {
  const jar = await cookies();
  const raw = jar.get(CART_COOKIE)?.value;
  if (!raw) return [];
  return parseCartCookie(raw);
}

export function parseCartCookie(raw: string): string[] {
  try {
    const arr = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export async function writeCartIds(ids: string[]) {
  const jar = await cookies();
  const unique = [...new Set(ids)].slice(0, MAX_ITEMS);
  jar.set(CART_COOKIE, encodeURIComponent(JSON.stringify(unique)), {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export type CartLine = ProductCard & { owned: boolean; coveredByBundleId: string | null };
export type CartView = {
  lines: CartLine[];
  payableLines: CartLine[];
  subtotalFils: number;
  notices: string[];
};

/** محتويات الحاويات (باقة/دورة/وحدة) الموجودة في السلة بأي عمق: map productId -> containerId */
export async function containerCoverage(containerIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (containerIds.length === 0) return map;
  const rows = await sql<{ root: string; product_id: string }[]>`
    with recursive c(root, product_id) as (
      select bi.bundle_id, bi.product_id from bundle_items bi where bi.bundle_id = any(${containerIds}::uuid[])
      union
      select c.root, bi.product_id from c join bundle_items bi on bi.bundle_id = c.product_id
    )
    select root, product_id from c
  `;
  for (const r of rows) if (!map.has(r.product_id) && r.product_id !== r.root) map.set(r.product_id, r.root);
  return map;
}

/**
 * منتجات منشورة لا يصح بيعها الآن، بما فيها ما نُشر قبل هذه الضوابط:
 * ملف معيب فيها أو في محتوياتها، أو سعر صفر لم يُعلَّم مجانيًا، أو معلم بلا نسبة متفق عليها، أو محتوى معلم قبل اعتماد الرسوم، أو فيديو مغلق.
 */
export async function unsellableProductIds(ids: string[], db: Db = sql, settings?: SaleSettings): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const current = settings ?? (await getSettings());
  const defective = await defectiveProductIds(ids, db, current);
  const closed = await closedVideoProductIds(db, ids, current);
  return new Set([...defective, ...closed]);
}

type SaleSettings = { fee_rules_confirmed_at: string | null; videos_enabled: boolean };

/** لماذا توقف بيع منتج منشور، إن توقف: عيب فيه أو في محتوياته، أو إغلاق الفيديو على مستوى المنصة */
export async function saleStopReason(productId: string): Promise<"defect" | "video_closed" | null> {
  const settings = await getSettings();
  if ((await defectiveProductIds([productId], sql, settings)).has(productId)) return "defect";
  return (await closedVideoProductIds(sql, [productId], settings)).has(productId) ? "video_closed" : null;
}

/**
 * من ids: ما يمنع بيعه عيب فيه أو في محتوياته، دون إغلاق الفيديو على مستوى المنصة.
 * db معامل حتى يعمل داخل معاملة الدفع على اتصالها هي.
 */
export async function defectiveProductIds(ids: string[], db: Db, settings: Pick<SaleSettings, "fee_rules_confirmed_at">): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const feeRulesConfirmed = settings.fee_rules_confirmed_at !== null;
  const rows = await db<{ root: string }[]>`
    with recursive c(root, id) as (
      select r, r from unnest(${ids}::uuid[]) as r
      union
      select c.root, bi.product_id from c join bundle_items bi on bi.bundle_id = c.id
    )
    select distinct c.root
    from c
    join products item on item.id = c.id
    join products root on root.id = c.root
    left join teachers t on t.id = item.teacher_id
    where (root.price_fils = 0 and not root.is_free)
      or (t.id is not null and not item.is_free and not root.is_free and (t.revenue_share_bps is null or not ${feeRulesConfirmed}::boolean))
      or exists (select 1 from product_files f where f.product_id = c.id and f.kind = 'main' and f.check_status = any(${FLAGGED_STATUSES}::text[]))
  `;
  return new Set(rows.map((r) => r.root));
}

/**
 * حساب السلة: يستبعد المنتجات غير المنشورة، والمنتجات التي يملكها الطالب،
 * والمنتجات التي انتهى تاريخ إتاحتها، والمنتجات المضمنة في باقة موجودة في نفس السلة (منع الدفع المكرر).
 */
export async function computeCart(ids: string[], userId: string | null): Promise<CartView> {
  const blocked = await unsellableProductIds(ids);
  // الممنوع من البيع يأخذ مسار انتهاء البيع نفسه في السلة والدفع
  const products = (await getPublishedProductsByIds(ids)).map((p) => (blocked.has(p.id) ? { ...p, saleEnded: true } : p));
  const owned = userId ? await accessibleProductIds(userId) : new Set<string>();
  // باقة انتهى بيعها لا تُحتسب، فلا تغطي ما بداخلها
  const coverage = await containerCoverage(products.filter((p) => isContainerType(p.type) && !p.saleEnded).map((p) => p.id));
  const notices: string[] = [];
  const lines: CartLine[] = products.map((p) => ({
    ...p,
    owned: owned.has(p.id),
    coveredByBundleId: coverage.get(p.id) ?? null,
  }));
  if (products.length < ids.length) notices.push("تمت إزالة منتج لم يعد متاحًا من سلتك.");
  for (const l of lines) {
    if (blocked.has(l.id) && !l.owned) notices.push(`«${l.title}» غير متاح للبيع حاليًا ولن يُحتسب.`);
    else if (l.saleEnded && !l.owned) notices.push(`انتهى بيع «${l.title}» ولن يُحتسب.`);
    else if (l.owned) notices.push(`«${l.title}» موجود في مكتبتك مسبقًا ولن يُحتسب.`);
    else if (l.coveredByBundleId) notices.push(`«${l.title}» مضمّن في الباقة الموجودة في سلتك ولن يُحتسب مرتين.`);
  }
  const payableLines = lines.filter((l) => !l.owned && !l.coveredByBundleId && !l.saleEnded);
  const subtotalFils = payableLines.reduce((sum, l) => sum + l.priceFils, 0);
  return { lines, payableLines, subtotalFils, notices };
}
