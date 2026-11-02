import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, PRODUCT_STATUS_LABELS, type OrderStatus, type ProductStatus } from "@/lib/labels";

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const tone = status === "published" ? "success" : status === "draft" ? "warning" : status === "hidden" ? "neutral" : "danger";
  return <Badge tone={tone}>{PRODUCT_STATUS_LABELS[status]}</Badge>;
}

export function OrderStatusBadge({ status }: { status: string }) {
  const tone = status === "paid" ? "success" : status === "pending" ? "warning" : status === "refunded" ? "neutral" : "danger";
  return <Badge tone={tone}>{ORDER_STATUS_LABELS[status as OrderStatus] ?? status}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const tone = status === "paid" ? "success" : status === "pending" || status === "initiated" ? "warning" : status === "refunded" ? "neutral" : "danger";
  return <Badge tone={tone}>{PAYMENT_STATUS_LABELS[status] ?? status}</Badge>;
}

export function TestBadge() {
  return <Badge tone="warning">تجريبي</Badge>;
}
