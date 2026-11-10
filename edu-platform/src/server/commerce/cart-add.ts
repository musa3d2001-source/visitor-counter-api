import "server-only";
import { isContainerType } from "@/lib/labels";
import { uuidSchema } from "@/lib/validation";
import { getPublishedProductsByIds } from "../catalog/queries";
import { sql } from "../db";
import { containerCoverage, getCartIds, normalizeCartIds, unsellableProductIds, writeCartIds } from "./cart";

export type CartAddResult = {
  ok: boolean;
  message: string;
  /** محتوى السلة بعد المحاولة، كما كُتب في الكوكي */
  ids: string[];
};

async function containerItems(id: string): Promise<string[]> {
  const rows = await sql<{ product_id: string }[]>`
    with recursive c(product_id) as (
      select product_id from bundle_items where bundle_id = ${id}
      union
      select bi.product_id from c join bundle_items bi on bi.bundle_id = c.product_id
    )
    select product_id from c
  `;
  return rows.map((r) => r.product_id);
}

async function save(ids: string[], message: string): Promise<CartAddResult> {
  await writeCartIds(ids);
  return { ok: true, message, ids: normalizeCartIds(ids) };
}

/**
 * إضافة منتج للسلة، مع منع التكرار والتداخل مع الباقات. مصدر واحد لزر الصفحة (/api/cart) ولنموذج بلا JavaScript.
 * كل قراءة هنا مباشرة من قاعدة البيانات: منتج أُخفي قبل لحظات لا يدخل السلة.
 */
export async function addProductToCart(productId: string): Promise<CartAddResult> {
  const id = uuidSchema.safeParse(productId);
  if (!id.success) return { ok: false, message: "منتج غير صحيح", ids: [] };
  const [[product], unsellable, ids] = await Promise.all([getPublishedProductsByIds([id.data]), unsellableProductIds([id.data]), getCartIds()]);
  if (!product) return { ok: false, message: "هذا المنتج غير متاح حاليًا", ids };
  if (product.saleEnded) return { ok: false, message: "انتهى بيع هذا المنتج", ids };
  if (unsellable.has(product.id)) return { ok: false, message: "هذا المنتج غير متاح للبيع حاليًا", ids };
  if (ids.includes(product.id)) return { ok: true, message: "المنتج موجود في سلتك", ids };

  if (isContainerType(product.type)) {
    // إزالة المحتويات المضمّنة في الحاوية (بأي عمق) من السلة
    const inside = new Set(await containerItems(product.id));
    const kept = ids.filter((x) => !inside.has(x));
    // وإن كانت الحاوية نفسها مضمّنة في حاوية موجودة في السلة نرفض
    const cover = await containerCoverage(kept.filter((x) => x !== product.id));
    if (cover.has(product.id)) return { ok: false, message: "هذا المحتوى مضمّن في باقة موجودة في سلتك", ids };
    return save([...kept, product.id], kept.length < ids.length ? "أضيفت إلى السلة وأزلنا المحتويات المضمّنة فيها" : "أضيفت إلى السلة");
  }
  if (ids.length) {
    const cover = await containerCoverage(ids);
    if (cover.has(product.id)) return { ok: false, message: "هذا المحتوى مضمّن في باقة موجودة في سلتك", ids };
  }
  return save([...ids, product.id], "أضيفت إلى السلة");
}
