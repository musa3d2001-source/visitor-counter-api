"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCartIds, writeCartIds } from "@/server/commerce/cart";
import { getPublishedProductsByIds } from "@/server/catalog/queries";
import { sql } from "@/server/db";
import { containerCoverage } from "@/server/commerce/cart";
import { isContainerType } from "@/lib/labels";

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
import { uuidSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";

/** إضافة منتج للسلة — مع منع التكرار والتداخل مع الباقات */
async function addProduct(productId: string): Promise<{ ok: boolean; message: string }> {
  const id = uuidSchema.safeParse(productId);
  if (!id.success) return { ok: false, message: "منتج غير صحيح" };
  const [product] = await getPublishedProductsByIds([id.data]);
  if (!product) return { ok: false, message: "هذا المنتج غير متاح حاليًا" };
  if (product.saleEnded) return { ok: false, message: "انتهى بيع هذا المنتج" };
  const ids = await getCartIds();
  if (ids.includes(product.id)) return { ok: true, message: "المنتج موجود في سلتك" };

  if (isContainerType(product.type)) {
    // إزالة المحتويات المضمّنة في الحاوية (بأي عمق) من السلة
    const inside = new Set(await containerItems(product.id));
    const kept = ids.filter((x) => !inside.has(x));
    // وإن كانت الحاوية نفسها مضمّنة في حاوية موجودة في السلة نرفض
    const cover = await containerCoverage(kept.filter((x) => x !== product.id));
    if (cover.has(product.id)) return { ok: false, message: "هذا المحتوى مضمّن في باقة موجودة في سلتك" };
    await writeCartIds([...kept, product.id]);
    return { ok: true, message: kept.length < ids.length ? "أضيفت إلى السلة وأزلنا المحتويات المضمّنة فيها" : "أضيفت إلى السلة" };
  }
  if (ids.length) {
    const cover = await containerCoverage(ids);
    if (cover.has(product.id)) return { ok: false, message: "هذا المحتوى مضمّن في باقة موجودة في سلتك" };
  }
  await writeCartIds([...ids, product.id]);
  return { ok: true, message: "أضيفت إلى السلة" };
}

export async function addToCartAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const res = await addProduct(String(fd.get("productId") ?? ""));
  revalidatePath("/", "layout");
  if (res.ok && fd.get("buyNow") === "1") redirect("/checkout");
  return res.ok ? { ok: true, message: res.message } : { error: res.message };
}

export async function removeFromCartAction(fd: FormData) {
  const id = String(fd.get("productId") ?? "");
  const ids = await getCartIds();
  await writeCartIds(ids.filter((x) => x !== id));
  revalidatePath("/", "layout");
}

export async function clearCartAction() {
  await writeCartIds([]);
  revalidatePath("/", "layout");
}
