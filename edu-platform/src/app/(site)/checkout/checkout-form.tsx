"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { placeOrderAction } from "./actions";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PaymentMethodOption } from "@/server/payments/service";
import { filsToKwdString } from "@/lib/money";

export function CheckoutForm({
  coupon,
  total,
  methods,
  disabled,
  sandbox,
}: {
  coupon: string;
  total: number;
  methods: PaymentMethodOption[];
  disabled: boolean;
  sandbox: boolean;
}) {
  const [state, action] = useActionState(placeOrderAction, null);
  return (
    <form action={action} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <input type="hidden" name="coupon" value={coupon} />
      {total > 0 && methods.length ? (
        <fieldset>
          <legend className="font-bold">طريقة الدفع</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {methods.map((m, i) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-strong p-3 transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
              >
                <input type="radio" name="paymentMethodId" value={m.id} defaultChecked={i === 0} className="accent-[var(--brand)]" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.imageUrl ? <img src={m.imageUrl} alt="" className="h-6 w-auto" referrerPolicy="no-referrer" /> : null}
                <span className="font-semibold">{m.nameAr}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {state?.error ? (
        <Alert tone="danger" className="mt-4">
          {state.error}
        </Alert>
      ) : null}
      <SubmitButton size="lg" className="mt-5 w-full" disabled={disabled} pendingText="جارٍ التحويل لصفحة الدفع…" data-testid="place-order">
        <Lock aria-hidden />
        {total === 0 ? "إتمام الطلب مجانًا" : `ادفع ${filsToKwdString(total)} د.ك`}
      </SubmitButton>
      <p className="mt-3 text-center text-xs text-muted">
        {sandbox ? "بيئة اختبار — لن يتم خصم أي مبلغ. " : ""}سيتم تحويلك لصفحة الدفع الآمنة، ولا نحتفظ ببيانات بطاقتك.
      </p>
    </form>
  );
}
