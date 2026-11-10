"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ShoppingCart } from "lucide-react";
import { ar } from "@/lib/design";
import { getCartSnapshot, registerHeaderStamp, subscribeCart, visibleCartCount } from "./cart-store";

/** رابط السلة في الرأس، يتحدث رقمه فور الإضافة دون إعادة رسم الصفحة */
export function CartLink({ count, stamp }: { count: number; stamp: string }) {
  const snapshot = useSyncExternalStore(subscribeCart, getCartSnapshot, () => null);
  useEffect(() => registerHeaderStamp(stamp), [stamp]);
  const shown = visibleCartCount(count, stamp, snapshot);
  return (
    <Link prefetch={false}
      href="/cart"
      className="relative grid size-11 place-items-center rounded-[15px] border border-[rgb(23_32_38/0.07)] bg-white text-ink shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-lift sm:size-12"
      aria-label={`السلة (${ar(shown)})`}
    >
      <ShoppingCart className="size-5.5" aria-hidden />
      {shown ? (
        <span
          className="num absolute -end-1.5 -top-1.5 grid h-5.5 min-w-5.5 place-items-center rounded-full bg-coral px-1 font-display text-[0.75rem] leading-none font-black text-white shadow-[0_0_0_3px_#fff8ec]"
          data-testid="cart-count"
        >
          {ar(shown)}
        </span>
      ) : null}
    </Link>
  );
}
