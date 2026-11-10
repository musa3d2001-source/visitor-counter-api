"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCartIds, writeCartIds } from "@/server/commerce/cart";
import { addProductToCart } from "@/server/commerce/cart-add";
import type { ActionState } from "@/lib/action-state";

/**
 * مسار النموذج العادي: متصفح بلا JavaScript، أو نقرة قبل اكتمال تحميل الصفحة.
 * مع JavaScript يذهب الزر إلى /api/cart، لأن كتابة كوكي داخل Server Action تعيد رسم الصفحة كاملة وتفرغ ذاكرة المتصفح.
 */
export async function addToCartAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const res = await addProductToCart(String(fd.get("productId") ?? ""));
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
