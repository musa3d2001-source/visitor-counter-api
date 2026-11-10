"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { cartPageIsStale } from "./cart-store";

/**
 * زر الرجوع يعرض صفحة السلة أو الدفع من ذاكرة المتصفح. إن أُضيف منتج بعد حفظها، نطلب نسختها الجديدة مرة واحدة،
 * فلا يرى المشتري مجموعًا غير الذي سيدفعه. الملاحة العادية تأتي بنسخة جديدة أصلًا، فلا طلب إضافي فيها.
 */
export function CartFreshness({ signature }: { signature: string }) {
  const router = useRouter();
  useEffect(() => {
    if (cartPageIsStale(signature)) router.refresh();
  }, [signature, router]);
  return null;
}
