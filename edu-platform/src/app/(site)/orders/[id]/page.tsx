import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CircleCheck, Clock, RotateCcw, XCircle } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { getUserOrder } from "@/server/commerce/orders";
import { sql } from "@/server/db";
import { getSettings } from "@/server/platform/settings";
import { retryPaymentAction, refreshOrderStatusAction } from "../../checkout/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { PrintButton } from "@/components/site/print-button";
import { ORDER_STATUS_LABELS, PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "تفاصيل الطلب", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; error?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const found = await getUserOrder(id, user.id);
  if (!found) notFound();
  const { order, items } = found;
  const settings = await getSettings();
  const [payment] = await sql<{ payment_method: string | null; status: string; error_message: string | null; provider: string }[]>`
    select payment_method, status, error_message, provider from payments where order_id = ${order.id} order by created_at desc limit 1
  `;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {order.status === "paid" ? (
        <div className="mb-6 rounded-3xl border border-success/20 bg-success-50 p-6 text-center no-print">
          <CircleCheck className="mx-auto size-12 text-success" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold">تم الدفع بنجاح</h1>
          <p className="mt-2 text-ink-soft">مشترياتك جاهزة الآن في مكتبتك.</p>
          <Button asChild size="lg" className="mt-5">
            <Link href="/library" data-testid="go-library">
              <BookOpen aria-hidden /> اذهب إلى مكتبتي
            </Link>
          </Button>
        </div>
      ) : order.status === "pending" ? (
        <div className="mb-6 rounded-3xl border border-warning/25 bg-warning-50 p-6 text-center no-print">
          <Clock className="mx-auto size-12 text-warning" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold">بانتظار تأكيد الدفع</h1>
          <p className="mt-2 text-ink-soft">إذا أتممت الدفع، اضغط «تحديث الحالة». لن تُضاف المذكرات قبل تأكيد البوابة.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <form action={refreshOrderStatusAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <SubmitButton variant="outline">
                <RotateCcw aria-hidden /> تحديث الحالة
              </SubmitButton>
            </form>
            <form action={retryPaymentAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <SubmitButton>إكمال الدفع</SubmitButton>
            </form>
          </div>
        </div>
      ) : order.status === "failed" ? (
        <div className="mb-6 rounded-3xl border border-danger/20 bg-danger-50 p-6 text-center no-print">
          <XCircle className="mx-auto size-12 text-danger" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold" data-testid="payment-failed">لم تكتمل عملية الدفع</h1>
          <p className="mt-2 text-ink-soft">{payment?.error_message ? `السبب: ${payment.error_message}. ` : ""}لم يتم خصم أي مبلغ مقابل هذا الطلب. يمكنك المحاولة مرة أخرى.</p>
          <form action={retryPaymentAction} className="mt-5">
            <input type="hidden" name="orderId" value={order.id} />
            <SubmitButton size="lg">إعادة محاولة الدفع</SubmitButton>
          </form>
        </div>
      ) : null}

      {sp.error ? (
        <Alert tone="danger" className="mb-4 no-print">
          تعذر بدء الدفع حاليًا. حاول بعد قليل.
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{settings.site_name} — فاتورة</p>
            <h2 className="mt-1 text-xl font-bold">
              طلب رقم <span className="num">{order.number}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">{formatDateTime(order.created_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            {order.is_test ? <Badge tone="warning">طلب تجريبي</Badge> : null}
            <Badge tone={order.status === "paid" ? "success" : order.status === "failed" ? "danger" : order.status === "pending" ? "warning" : "neutral"} data-testid="order-status">
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
          </div>
        </div>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-semibold">{it.title}</p>
                <p className="text-xs text-muted">{PRODUCT_TYPE_LABELS[it.product_type as ProductType]}</p>
              </div>
              <span className="num shrink-0">{filsToKwdString(it.unit_price_fils)} د.ك</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">المجموع</dt>
            <dd className="num">{filsToKwdString(order.subtotal_fils)} د.ك</dd>
          </div>
          {order.discount_fils ? (
            <div className="flex justify-between">
              <dt className="text-muted">خصم {order.coupon_code ? `(${order.coupon_code})` : ""}</dt>
              <dd className="num">−{filsToKwdString(order.discount_fils)} د.ك</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-bold">
            <dt>الإجمالي</dt>
            <dd className="num">{filsToKwdString(order.total_fils)} د.ك</dd>
          </div>
          {order.paid_at ? (
            <div className="flex justify-between text-muted">
              <dt>تاريخ الدفع</dt>
              <dd>{formatDateTime(order.paid_at)}</dd>
            </div>
          ) : null}
          {payment?.payment_method && payment.provider === "myfatoorah" ? (
            <div className="flex justify-between text-muted">
              <dt>وسيلة الدفع</dt>
              <dd>{payment.payment_method === "all" ? "MyFatoorah" : payment.payment_method}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-6 flex flex-wrap gap-2 no-print">
          <PrintButton />
          <Button asChild variant="ghost">
            <Link href="/account">كل طلباتي</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
