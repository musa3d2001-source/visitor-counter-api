"use client";

import { useActionState } from "react";
import { CircleCheck, Gift, Lock, ShieldCheck } from "lucide-react";
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
          <legend className="font-display text-[1rem] font-extrabold text-ink-soft">اختر طريقة الدفع</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {methods.map((m, i) => (
              <label
                key={m.id}
                className="group relative flex min-h-[4.5rem] cursor-pointer items-center gap-3.5 rounded-[1.25rem] border-2 border-line-strong bg-white px-4 py-3 shadow-[0_4px_0_var(--color-line-strong)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:shadow-[0_4px_0_var(--brand-edge)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-brand-600 motion-reduce:hover:translate-y-0"
              >
                <input type="radio" name="paymentMethodId" value={m.id} defaultChecked={i === 0} className="size-5 shrink-0 accent-[var(--brand)] focus-visible:outline-none" />
                {m.imageUrl ? (
                  <span className="grid h-10 w-14 shrink-0 place-items-center rounded-xl bg-white shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.imageUrl} alt="" className="max-h-7 w-auto max-w-12" referrerPolicy="no-referrer" />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 font-display text-[1.05rem] font-extrabold text-ink">{m.nameAr}</span>
                <CircleCheck className="size-6 shrink-0 text-brand-600 opacity-0 transition-opacity group-has-[:checked]:opacity-100" aria-hidden />
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
      <SubmitButton size="xl" variant={total === 0 ? "accent" : "primary"} className="mt-6 w-full" disabled={disabled} pendingText="جارٍ التحويل لصفحة الدفع…" data-testid="place-order">
        {total === 0 ? <Gift aria-hidden /> : <Lock aria-hidden />}
        {total === 0 ? "إتمام الطلب مجانًا" : disabled ? "الدفع غير متاح حاليًا" : `ادفع ${filsToKwdString(total)} د.ك`}
      </SubmitButton>
      {disabled ? null : (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-brand-50 p-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[0.8rem] bg-linear-to-br from-brand-400 to-brand-600 text-white" aria-hidden>
            <ShieldCheck className="size-[1.15rem]" />
          </span>
          <p className="text-[0.9rem] leading-7 font-semibold text-brand-800">
            {total === 0
              ? "يُضاف المحتوى إلى مكتبتك مباشرة بعد التأكيد."
              : `${sandbox ? "بيئة اختبار: لن يُخصم أي مبلغ. " : ""}ننقلك إلى صفحة الدفع الآمنة لدى ماي فاتورة، ولا نحتفظ ببيانات بطاقتك.`}
          </p>
        </div>
      )}
    </form>
  );
}
