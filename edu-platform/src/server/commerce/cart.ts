import "server-only";
import { cookies } from "next/headers";
import { sql } from "../db";
import { env } from "../env";
import { getPublishedProductsByIds, type ProductCard } from "../catalog/queries";
import { accessibleProductIds } from "../access/entitlements";
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
 * حساب السلة: يستبعد المنتجات غير المنشورة، والمنتجات التي يملكها الطالب،
 * والمنتجات التي انتهى تاريخ إتاحتها، والمنتجات المضمنة في باقة موجودة في نفس السلة (منع الدفع المكرر).
 */
export async function computeCart(ids: string[], userId: string | null): Promise<CartView> {
  const products = await getPublishedProductsByIds(ids);
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
    if (l.saleEnded && !l.owned) notices.push(`انتهى بيع «${l.title}» ولن يُحتسب.`);
    else if (l.owned) notices.push(`«${l.title}» موجود في مكتبتك مسبقًا ولن يُحتسب.`);
    else if (l.coveredByBundleId) notices.push(`«${l.title}» مضمّن في الباقة الموجودة في سلتك ولن يُحتسب مرتين.`);
  }
  const payableLines = lines.filter((l) => !l.owned && !l.coveredByBundleId && !l.saleEnded);
  const subtotalFils = payableLines.reduce((sum, l) => sum + l.priceFils, 0);
  return { lines, payableLines, subtotalFils, notices };
}
