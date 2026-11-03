"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert, CircleCheck, ShoppingCart, Zap } from "lucide-react";
import { addToCartAction } from "@/app/(site)/cart/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

export function AddToCart({ productId, compact, className }: { productId: string; compact?: boolean; className?: string }) {
  const [state, action] = useActionState(addToCartAction, null);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className={cn("flex gap-2", compact ? "" : "flex-col sm:flex-row sm:flex-wrap")}>
        <form action={action} className={compact ? "min-w-0 flex-1" : "flex-[1_1_auto]"}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="buyNow" value="1" />
          <SubmitButton size={compact ? "md" : "lg"} className="w-full" pendingText="لحظة…" data-testid="buy-now">
            <Zap aria-hidden />
            اشترِ الآن
          </SubmitButton>
        </form>
        <form action={action} className={compact ? "shrink-0" : "flex-[1_1_auto]"}>
          <input type="hidden" name="productId" value={productId} />
          <SubmitButton size={compact ? "icon" : "lg"} variant="outline" className={compact ? "size-12" : "w-full"} pendingText="…" data-testid="add-to-cart" aria-label="أضف إلى السلة">
            <ShoppingCart aria-hidden />
            {compact ? null : "أضف إلى السلة"}
          </SubmitButton>
        </form>
      </div>
      {state?.ok ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-success-50 px-3.5 py-2 font-display text-sm font-bold text-success animate-fade-up" role="status">
          <CircleCheck className="size-[1.1rem] shrink-0" aria-hidden /> {state.message}،{" "}
          <Link href="/cart" className="inline-flex min-h-8 items-center font-extrabold underline decoration-2 underline-offset-4">
            عرض السلة
          </Link>
        </p>
      ) : state?.error ? (
        <p className="flex items-center gap-2 rounded-2xl bg-danger-50 px-3.5 py-2 font-display text-sm font-bold text-danger" role="alert">
          <CircleAlert className="size-[1.1rem] shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
