import "server-only";
import { cookies } from "next/headers";
import { sql } from "../db";
import { env } from "../env";
import { getPublishedProductsByIds, type ProductCard } from "../catalog/queries";
import { accessibleProductIds } from "../access/entitlements";

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

/** عناصر الباقات الموجودة في السلة: map productId -> bundleId */
async function bundleCoverage(bundleIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (bundleIds.length === 0) return map;
  const rows = await sql<{ bundle_id: string; product_id: string }[]>`
    select bundle_id, product_id from bundle_items where bundle_id = any(${bundleIds}::uuid[])
  `;
  for (const r of rows) if (!map.has(r.product_id)) map.set(r.product_id, r.bundle_id);
  return map;
}

/**
 * حساب السلة: يستبعد المنتجات غير المنشورة، والمنتجات التي يملكها الطالب،
 * والمنتجات المضمنة في باقة موجودة في نفس السلة (منع الدفع المكرر).
 */
export async function computeCart(ids: string[], userId: string | null): Promise<CartView> {
  const products = await getPublishedProductsByIds(ids);
  const owned = userId ? await accessibleProductIds(userId) : new Set<string>();
  const coverage = await bundleCoverage(products.filter((p) => p.type === "bundle").map((p) => p.id));
  const notices: string[] = [];
  const lines: CartLine[] = products.map((p) => ({
    ...p,
    owned: owned.has(p.id),
    coveredByBundleId: p.type !== "bundle" ? (coverage.get(p.id) ?? null) : null,
  }));
  if (products.length < ids.length) notices.push("تمت إزالة منتج لم يعد متاحًا من سلتك.");
  for (const l of lines) {
    if (l.owned) notices.push(`«${l.title}» موجود في مكتبتك مسبقًا ولن يُحتسب.`);
    else if (l.coveredByBundleId) notices.push(`«${l.title}» مضمّن في الباقة الموجودة في سلتك ولن يُحتسب مرتين.`);
  }
  const payableLines = lines.filter((l) => !l.owned && !l.coveredByBundleId);
  const subtotalFils = payableLines.reduce((sum, l) => sum + l.priceFils, 0);
  return { lines, payableLines, subtotalFils, notices };
}
