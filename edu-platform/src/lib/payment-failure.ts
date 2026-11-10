/**
 * ما يراه المشتري عند فشل الدفع: جملة ثابتة لكل نوع فشل، تُشتق من حقائق صف الدفع.
 * نص البوابة أو الاستثناء (payments.error_message) للمالك وحده ولا يُقرأ في صفحات الطالب أبدًا.
 */
export type PaymentFailureKind = "declined" | "link_failed" | "expired";

export const PAYMENT_FAILURE_MESSAGES: Record<PaymentFailureKind, string> = {
  declined: "لم تكتمل العملية عند البنك أو بوابة الدفع.",
  link_failed: "تعذر فتح صفحة الدفع.",
  expired: "انتهت مدة رابط الدفع.",
};

export function paymentFailureKind(payment: { status: string; gateway_invoice_id: string | null } | null | undefined): PaymentFailureKind | null {
  if (payment?.status === "expired") return "expired";
  if (payment?.status !== "failed") return null;
  return payment.gateway_invoice_id ? "declined" : "link_failed";
}

export function paymentFailureMessage(payment: { status: string; gateway_invoice_id: string | null } | null | undefined): string | null {
  const kind = paymentFailureKind(payment);
  return kind ? PAYMENT_FAILURE_MESSAGES[kind] : null;
}
