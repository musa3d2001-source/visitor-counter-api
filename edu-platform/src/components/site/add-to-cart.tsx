"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { CircleAlert, CircleCheck, ShoppingCart, Zap } from "lucide-react";
import { addToCartAction } from "@/app/(site)/cart/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import { recordCart } from "./cart-store";

type Kind = "buy" | "add";

const FAILED = "تعذرت الإضافة إلى السلة الآن. حاول مرة أخرى.";

/**
 * النماذج تبقى تعمل بلا JavaScript عبر Server Action.
 * ومع JavaScript يرسل الزر طلبًا صغيرًا، فلا يعاد رسم الصفحة ولا تفرغ ذاكرة المتصفح: يتغير رقم السلة والرسالة فقط.
 */
export function AddToCart({ productId, compact, className }: { productId: string; compact?: boolean; className?: string }) {
  const [formState, action] = useActionState(addToCartAction, null);
  const [result, setResult] = useState<ActionState>(null);
  const [sending, setSending] = useState<Kind | null>(null);
  const [navigating, startNavigation] = useTransition();
  const router = useRouter();
  const state = result ?? formState;
  const busy = sending !== null || navigating;

  async function submit(event: FormEvent<HTMLFormElement>, kind: Kind) {
    event.preventDefault();
    if (busy) return;
    setSending(kind);
    setResult(null);
    try {
      const res = await fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId }) });
      if (!res.ok) throw new Error(`cart ${res.status}`);
      const out = (await res.json()) as { ok: boolean; message: string; count: number; signature: string };
      if (!out.ok) {
        setResult({ error: out.message });
      } else {
        recordCart(out.count, out.signature);
        if (kind === "buy") startNavigation(() => router.push("/checkout"));
        else setResult({ ok: true, message: out.message });
      }
    } catch {
      setResult({ error: FAILED });
    } finally {
      setSending(null);
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className={cn("flex gap-2", compact ? "" : "flex-col sm:flex-row sm:flex-wrap")}>
        <form action={action} onSubmit={(e) => submit(e, "buy")} className={compact ? "min-w-0 flex-1" : "flex-[1_1_auto]"}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="buyNow" value="1" />
          <SubmitButton size={compact ? "md" : "lg"} className="w-full" pendingText="لحظة…" pending={sending === "buy" || navigating} disabled={busy} data-testid="buy-now">
            <Zap aria-hidden />
            اشترِ الآن
          </SubmitButton>
        </form>
        <form action={action} onSubmit={(e) => submit(e, "add")} className={compact ? "shrink-0" : "flex-[1_1_auto]"}>
          <input type="hidden" name="productId" value={productId} />
          <SubmitButton size={compact ? "icon" : "lg"} variant="outline" className={compact ? "size-12" : "w-full"} pendingText="…" pending={sending === "add"} disabled={busy} data-testid="add-to-cart" aria-label="أضف إلى السلة">
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
