import Link from "next/link";
import { Banknote, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import type { ExtraPayment, ExtraPaymentState } from "@/server/payments/extras";
import { recheckExtraPaymentAction, refundExtraPaymentAction, dismissExtraPaymentAction } from "../actions";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { StatusPill, TestBadge, type StatusTone } from "@/components/admin/status-badge";
import { ToneIcon } from "@/components/admin/icon-tile";
import { EXTRA_PAYMENT_KIND_LABELS, EXTRA_PAYMENT_STATE_LABELS } from "@/lib/labels";
import { STEP_UP_CONFIRM_FIELD } from "@/lib/two-factor";
import { formatDateTime } from "@/lib/utils";
import { Kwd } from "../../_components/people/bits";

const STATE_TONE: Record<ExtraPaymentState, StatusTone> = {
  open: "warning",
  refund_sending: "warning",
  refund_unknown: "danger",
  refund_requested: "neutral",
  refunded: "success",
  refund_failed: "danger",
  dismissed: "neutral",
};

/** لماذا لم تكمل الدفعة المتأخرة طلبها */
function blockerText(blocker: string): string {
  const kind = blocker.split(":")[0];
  if (kind === "price") return "ارتفع سعر منتج";
  if (kind === "unavailable") return "منتج لم يعد متاحًا";
  if (kind === "access_ended") return "انتهت مدة الوصول لمنتج";
  if (kind === "owned") return "الطالب يملك المنتج من طريق آخر";
  return "سبب إغلاق الطلب لا يسمح بإكماله";
}

export function ExtraPaymentsList({ extras, canRefund, showOrder, stepUp }: { extras: ExtraPayment[]; canRefund: boolean; showOrder?: boolean; stepUp: boolean }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="الدفعات الزائدة" data-testid="extra-payments">
      {extras.map((e) => {
        const refundable = canRefund && (e.state === "open" || e.state === "refund_failed" || e.state === "refund_unknown" || e.state === "refund_sending");
        const recheckable = canRefund && e.state === "refund_requested";
        const dismissable = e.state === "open" || e.state === "refund_failed";
        const blockers = [...new Set((e.details.blockers ?? []).map(blockerText))];
        return (
          <li
            key={e.id}
            className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-[1.4rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3.5 shadow-xs sm:p-4"
            data-testid="extra-payment"
          >
            <ToneIcon tone="coral" size="md" className="max-sm:size-11">
              <Banknote />
            </ToneIcon>
            <div className="min-w-[min(100%,13rem)] flex-1">
              <p className="flex flex-wrap items-center gap-1.5 font-display font-extrabold text-ink">
                {EXTRA_PAYMENT_KIND_LABELS[e.kind]}
                <StatusPill tone={STATE_TONE[e.state]}>{EXTRA_PAYMENT_STATE_LABELS[e.state]}</StatusPill>
                {e.order_is_test ? <TestBadge /> : null}
              </p>
              <p className="text-[0.84rem] leading-6 text-muted">
                {showOrder ? (
                  <>
                    <Link href={`/admin/orders/${e.order_id}`} className="num font-bold text-brand-700 hover:underline">
                      {e.order_number}
                    </Link>
                    {" · "}
                  </>
                ) : null}
                {e.gateway_invoice_id ? (
                  <>
                    فاتورة <span className="num">{e.gateway_invoice_id}</span>
                    {" · "}
                  </>
                ) : null}
                <Kwd fils={e.amount_fils} className="font-bold text-ink" />
                {" · "}
                <span className="whitespace-nowrap">{formatDateTime(e.created_at)}</span>
              </p>
              {blockers.length ? <p className="text-[0.84rem] leading-6 text-ink-soft">لم يكتمل الطلب لأن: {blockers.join("، ")}</p> : null}
              {e.refund_error ? <p className="text-[0.84rem] leading-6 break-words text-danger">{e.refund_error}</p> : null}
            </div>
            {refundable || recheckable || dismissable ? (
              <div className="flex flex-wrap items-center gap-2">
                {recheckable ? (
                  <ConfirmButton
                    action={recheckExtraPaymentAction}
                    hidden={{ extraId: e.id }}
                    label="إعادة التحقق"
                    icon={<RefreshCw aria-hidden />}
                    variant="outline"
                    title="سؤال البوابة عن هذا الاسترداد؟"
                    description="نسأل MyFatoorah عن حالة الطلب ونطبق ما تقوله. لا يُرسل أي طلب استرداد جديد."
                    confirmLabel="إعادة التحقق"
                  />
                ) : null}
                {refundable ? (
                  <ConfirmButton
                    action={refundExtraPaymentAction}
                    hidden={{ extraId: e.id }}
                    label={e.state === "open" ? "استرداد هذه الدفعة" : "إعادة المحاولة"}
                    icon={<RotateCcw aria-hidden />}
                    variant="outline"
                    title="استرداد هذه الدفعة من البوابة؟"
                    description="يُطلب من MyFatoorah إعادة هذا المبلغ إلى وسيلة دفع الطالب. لا يتغير الطلب ولا وصول الطالب ولا الأرباح. هذه عملية مالية حقيقية في وضع الإنتاج."
                    requireReason
                    reasonLabel="سبب الاسترداد (إلزامي)"
                    confirmLabel="إرسال طلب الاسترداد"
                    fields={stepUp ? [STEP_UP_CONFIRM_FIELD] : undefined}
                  />
                ) : null}
                {dismissable ? (
                  <ConfirmButton
                    action={dismissExtraPaymentAction}
                    hidden={{ extraId: e.id }}
                    label="إغلاق دون استرداد"
                    icon={<XCircle aria-hidden />}
                    variant="ghost"
                    title="إغلاق هذا السجل دون استرداد؟"
                    description="يختفي السجل من القائمة ويُحفظ السبب في سجل التدقيق. لا يُعاد أي مبلغ من خلال البوابة."
                    requireReason
                    reasonLabel="سبب الإغلاق (إلزامي)"
                    confirmLabel="إغلاق السجل"
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
