"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCartIds, writeCartIds } from "@/server/commerce/cart";
import { getPublishedProductsByIds } from "@/server/catalog/queries";
import { sql } from "@/server/db";
import { uuidSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/action-state";

/** إضافة منتج للسلة — مع منع التكرار والتداخل مع الباقات */
async function addProduct(productId: string): Promise<{ ok: boolean; message: string }> {
  const id = uuidSchema.safeParse(productId);
  if (!id.success) return { ok: false, message: "منتج غير صحيح" };
  const [product] = await getPublishedProductsByIds([id.data]);
  if (!product) return { ok: false, message: "هذا المنتج غير متاح حاليًا" };
  const ids = await getCartIds();
  if (ids.includes(product.id)) return { ok: true, message: "المنتج موجود في سلتك" };

  if (product.type === "bundle") {
    // إزالة عناصر الباقة الموجودة في السلة لأنها مضمّنة فيها
    const items = await sql<{ product_id: string }[]>`select product_id from bundle_items where bundle_id = ${product.id}`;
    const inBundle = new Set(items.map((i) => i.product_id));
    const kept = ids.filter((x) => !inBundle.has(x));
    await writeCartIds([...kept, product.id]);
    return { ok: true, message: kept.length < ids.length ? "أضيفت الباقة وأزلنا المذكرات المضمّنة فيها من السلة" : "أضيفت الباقة إلى السلة" };
  }
  if (ids.length) {
    const covering = await sql<{ bundle_id: string }[]>`
      select bundle_id from bundle_items where product_id = ${product.id} and bundle_id = any(${ids}::uuid[]) limit 1
    `;
    if (covering.length) return { ok: false, message: "هذه المذكرة مضمّنة في باقة موجودة في سلتك" };
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
