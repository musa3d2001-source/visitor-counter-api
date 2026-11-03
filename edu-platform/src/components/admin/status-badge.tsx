import { FlaskConical } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, PRODUCT_STATUS_LABELS, type OrderStatus, type ProductStatus } from "@/lib/labels";

/**
 * كبسولات الحالة في لوحة التحكم: خلفية ملوّنة فاتحة + نقطة بلون الحالة + نص Cairo عريض (تباين AA).
 * StatusPill عامة لأي حالة أخرى (اشتراك، معلم، رفع...).
 */
export type StatusTone = "success" | "warning" | "review" | "danger" | "neutral" | "info" | "violet";

const TONES: Record<StatusTone, { pill: string; dot: string }> = {
  success: { pill: "bg-success-50 text-success ring-success/15", dot: "bg-[#22b36b]" },
  warning: { pill: "bg-warning-50 text-warning ring-accent-700/20", dot: "bg-accent-600" },
  review: { pill: "bg-coral-50 text-coral-700 ring-coral/20", dot: "bg-coral" },
  danger: { pill: "bg-danger-50 text-danger ring-danger/15", dot: "bg-danger" },
  neutral: { pill: "bg-sand text-ink-soft ring-ink/10", dot: "bg-[#93a0a8]" },
  info: { pill: "bg-sky-50 text-sky-700 ring-sky/20", dot: "bg-sky" },
  violet: { pill: "bg-violet-50 text-violet-700 ring-violet/20", dot: "bg-violet" },
};

export function StatusPill({
  tone = "neutral",
  children,
  pulse,
  icon,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  /** نقطة نابضة للحالات الجارية (بانتظار الدفع، قيد المعالجة) */
  pulse?: boolean;
  icon?: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 font-display text-[0.8rem] leading-7 font-extrabold whitespace-nowrap ring-1 ring-inset [&_svg]:size-3.5",
        t.pill,
        className,
      )}
    >
      {icon ?? (
        <span className="relative grid size-2 shrink-0 place-items-center" aria-hidden>
          {pulse ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden", t.dot)} /> : null}
          <span className={cn("relative size-2 rounded-full", t.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const tone: StatusTone = status === "published" ? "success" : status === "draft" ? "warning" : status === "in_review" ? "review" : status === "hidden" ? "neutral" : status === "archived" ? "neutral" : "danger";
  return (
    <StatusPill tone={tone} pulse={status === "in_review"}>
      {PRODUCT_STATUS_LABELS[status]}
    </StatusPill>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const tone: StatusTone = status === "paid" ? "success" : status === "pending" ? "warning" : status === "refunded" ? "violet" : status === "cancelled" ? "neutral" : "danger";
  return (
    <StatusPill tone={tone} pulse={status === "pending"}>
      {ORDER_STATUS_LABELS[status as OrderStatus] ?? status}
    </StatusPill>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const tone: StatusTone =
    status === "paid" ? "success" : status === "pending" || status === "initiated" ? "warning" : status === "refunded" ? "violet" : status === "expired" ? "neutral" : "danger";
  return (
    <StatusPill tone={tone} pulse={status === "pending"}>
      {PAYMENT_STATUS_LABELS[status] ?? status}
    </StatusPill>
  );
}

export function TestBadge() {
  return (
    <StatusPill tone="info" icon={<FlaskConical aria-hidden />} className="border border-dashed border-sky/40 ring-0">
      تجريبي
    </StatusPill>
  );
}
