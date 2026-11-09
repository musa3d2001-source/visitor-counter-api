import Link from "next/link";
import { RefreshCw, RotateCcw, XCircle } from "lucide-react";
import type { RefundQueueRow, RefundStatus } from "@/server/payments/refunds";
import { dismissRefundAction, recheckRefundAction, resendRefundAction } from "../actions";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { StatusPill, TestBadge, type StatusTone } from "@/components/admin/status-badge";
import { ToneIcon } from "@/components/admin/icon-tile";
import { REFUND_STATUS_LABELS, REFUND_STATUS_HINTS } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { Kwd } from "../../_components/people/bits";

const STATUS_TONE: Record<RefundStatus, StatusTone> = {
  recorded: "warning",
  sending: "warning",
  unknown: "danger",
  not_sent: "warning",
  requested: "neutral",
  completed: "success",
  failed: "danger",
  dismissed: "neutral",
};

/** قائمة سجلات الاسترداد: تُستخدم في قائمة المالك وفي صفحة الطلب، بالصفوف والأزرار نفسها */
export function RefundsList({ refunds, canAct, showOrder }: { refunds: RefundQueueRow[]; canAct: boolean; showOrder?: boolean }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="سجلات الاسترداد" data-testid="refund-queue">
      {refunds.map((r) => {
        const waitingOnResult = r.status === "unknown" || (r.status === "sending" && r.claim_stale);
        const recheckable = canAct && (waitingOnResult || r.status === "requested");
        const resendable = canAct && (r.status === "not_sent" || r.status === "failed" || r.status === "recorded");
        const dismissable = waitingOnResult || r.status === "not_sent" || r.status === "failed" || r.status === "recorded";
        const hint = REFUND_STATUS_HINTS[r.status];
        return (
          <li
            key={r.id}
            className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-[1.4rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3.5 shadow-xs sm:p-4"
            data-testid="refund-row"
            data-status={r.status}
          >
            <ToneIcon tone="violet" size="md" className="max-sm:size-11">
              <RotateCcw />
            </ToneIcon>
            <div className="min-w-[min(100%,13rem)] flex-1">
              <p className="flex flex-wrap items-center gap-1.5 font-display font-extrabold text-ink">
                <Kwd fils={r.amount_fils} />
                <StatusPill tone={STATUS_TONE[r.status]}>{REFUND_STATUS_LABELS[r.status]}</StatusPill>
                {r.source === "portal" ? <StatusPill tone="neutral">من لوحة البوابة</StatusPill> : null}
                {r.order_is_test ? <TestBadge /> : null}
              </p>
              <p className="text-[0.84rem] leading-6 text-muted">
                {showOrder ? (
                  <>
                    <Link href={`/admin/orders/${r.order_id}`} className="num font-bold text-brand-700 hover:underline">
                      {r.order_number}
                    </Link>
                    {" · "}
                  </>
                ) : null}
                {r.gateway_refund_id ? (
                  <>
                    استرداد <span className="num">{r.gateway_refund_id}</span>
                    {" · "}
                  </>
                ) : null}
                {r.admin_name ? (
                  <>
                    {r.admin_name}
                    {" · "}
                  </>
                ) : null}
                <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span>
              </p>
              <p className="text-[0.84rem] leading-6 break-words text-ink-soft">{r.reason}</p>
              {hint ? <p className="text-[0.84rem] leading-6 text-ink-soft">{hint}</p> : null}
              {r.error ? <p className="text-[0.84rem] leading-6 break-words text-danger">{r.error}</p> : null}
            </div>
            {recheckable || resendable || dismissable ? (
              <div className="flex flex-wrap items-center gap-2">
                {recheckable ? (
                  <ConfirmButton
                    action={recheckRefundAction}
                    hidden={{ refundId: r.id, orderId: r.order_id }}
                    label="إعادة التحقق"
                    icon={<RefreshCw aria-hidden />}
                    variant="outline"
                    title="سؤال البوابة عن هذا الاسترداد؟"
                    description="نسأل MyFatoorah عن حالة الطلب ونطبق ما تقوله. لا يُرسل أي طلب استرداد جديد."
                    confirmLabel="إعادة التحقق"
                  />
                ) : null}
                {resendable ? (
                  <ConfirmButton
                    action={resendRefundAction}
                    hidden={{ orderId: r.order_id }}
                    label="إعادة الإرسال"
                    icon={<RotateCcw aria-hidden />}
                    variant="outline"
                    title="إعادة إرسال طلب الاسترداد؟"
                    description="نسأل البوابة أولًا عن أي استرداد سابق، ثم نطلب إعادة كامل المبلغ إلى وسيلة الدفع الأصلية. عند قبولها فقط يتغير الطلب ويُغلق الوصول وتُعكس الأرباح. هذه عملية مالية حقيقية في وضع الإنتاج."
                    confirmLabel="إرسال طلب الاسترداد"
                  />
                ) : null}
                {dismissable ? (
                  <ConfirmButton
                    action={dismissRefundAction}
                    hidden={{ refundId: r.id, orderId: r.order_id }}
                    label="إغلاق دون إرسال"
                    icon={<XCircle aria-hidden />}
                    variant="ghost"
                    title="إغلاق هذا السجل دون إرسال؟"
                    description="راجع قائمة الاستردادات في لوحة MyFatoorah أولًا. يختفي السجل من القائمة ويُحفظ السبب في سجل التدقيق، ولا يتغير الطلب ولا يُعاد أي مبلغ."
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
