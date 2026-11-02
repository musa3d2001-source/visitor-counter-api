"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleCheck, ShoppingCart } from "lucide-react";
import { addToCartAction } from "@/app/(site)/cart/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

export function AddToCart({ productId, compact, className }: { productId: string; compact?: boolean; className?: string }) {
  const [state, action] = useActionState(addToCartAction, null);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className={cn("flex gap-2", compact ? "" : "flex-col sm:flex-row")}>
        <form action={action} className="flex-1">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="buyNow" value="1" />
          <SubmitButton size="lg" className="w-full" pendingText="لحظة…" data-testid="buy-now">
            اشترِ الآن
          </SubmitButton>
        </form>
        <form action={action} className={compact ? "" : "flex-1"}>
          <input type="hidden" name="productId" value={productId} />
          <SubmitButton size="lg" variant="outline" className="w-full" pendingText="…" data-testid="add-to-cart" aria-label="أضف إلى السلة">
            <ShoppingCart aria-hidden />
            {compact ? null : "أضف إلى السلة"}
          </SubmitButton>
        </form>
      </div>
      {state?.ok ? (
        <p className="flex items-center gap-1.5 text-sm text-success" role="status">
          <CircleCheck className="size-4" aria-hidden /> {state.message} —{" "}
          <Link href="/cart" className="font-semibold underline">
            عرض السلة
          </Link>
        </p>
      ) : state?.error ? (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
