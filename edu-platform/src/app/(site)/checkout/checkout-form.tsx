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
    <form action={action}>
      <input type="hidden" name="coupon" value={coupon} />
      {total > 0 && methods.length ? (
        <fieldset>
          <legend className="text-sm font-semibold text-ink-soft">اختر طريقة الدفع</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {methods.map((m, i) => (
              <label
                key={m.id}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-line-strong p-3 transition-colors has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500"
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
      <SubmitButton size="lg" className="mt-5 w-full sm:w-auto sm:min-w-72" disabled={disabled} pendingText="جارٍ التحويل لصفحة الدفع…" data-testid="place-order">
        {total === 0 ? null : <Lock aria-hidden />}
        {total === 0 ? "إتمام الطلب مجانًا" : `ادفع ${filsToKwdString(total)} د.ك`}
      </SubmitButton>
      <p className="mt-3 text-xs leading-6 text-muted">
        {total === 0
          ? "يُضاف المحتوى إلى مكتبتك مباشرة بعد التأكيد."
          : `${sandbox ? "بيئة اختبار: لن يُخصم أي مبلغ. " : ""}ننقلك إلى صفحة الدفع الآمنة لدى ماي فاتورة، ولا نحتفظ ببيانات بطاقتك.`}
      </p>
    </form>
  );
}
