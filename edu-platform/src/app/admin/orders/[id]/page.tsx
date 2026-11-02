import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshCw, RotateCcw, Send } from "lucide-react";
import { getAdminOrder } from "@/server/admin/records";
import { paymentsConfig } from "@/server/payments/service";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { OrderStatusBadge, PaymentStatusBadge, TestBadge } from "@/components/admin/status-badge";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { displayPhone } from "@/lib/phone";
import { formatDateTime } from "@/lib/utils";
import { gatewayRefundAction, refundOrderAction, reverifyPaymentAction } from "../actions";

export const metadata = { title: "تفاصيل الطلب" };

const REFUND_STATUS: Record<string, string> = { recorded: "مسجل محليًا", requested: "مُرسل للبوابة", completed: "مكتمل", failed: "فشل" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getAdminOrder(id);
  if (!data) notFound();
  const { order, items, payments, events, refunds } = data;
  const cfg = paymentsConfig();
  const pendingInvoice = order.status !== "paid" && order.status !== "refunded" ? payments.find((p) => p.provider === "myfatoorah" && p.gateway_invoice_id) : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`الطلب ${order.number}`}
        description={`أُنشئ ${formatDateTime(order.created_at)}${order.paid_at ? ` · دُفع ${formatDateTime(order.paid_at)}` : ""}`}
        crumbs={[{ label: "الطلبات والمدفوعات", href: "/admin/orders" }, { label: order.number }]}
        actions={
          <div className="flex flex-wrap gap-1">
            <OrderStatusBadge status={order.status} />
            {order.is_test ? <TestBadge /> : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Section title="المنتجات">
          <ul className="divide-y divide-line">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/products/${it.product_id}`} className="font-semibold hover:text-brand-700">
                    {it.title}
                  </Link>
                  <p className="text-xs text-muted">{PRODUCT_TYPE_LABELS[it.product_type as ProductType] ?? it.product_type}</p>
                </div>
                <span className="num whitespace-nowrap">{filsToKwdString(it.unit_price_fils)} د.ك</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">المجموع</dt>
              <dd className="num">{filsToKwdString(order.subtotal_fils)} د.ك</dd>
            </div>
            {order.discount_fils ? (
              <div className="flex justify-between">
                <dt className="text-muted">الخصم {order.coupon_code ? <Badge tone="accent">{order.coupon_code}</Badge> : null}</dt>
                <dd className="num text-success">- {filsToKwdString(order.discount_fils)} د.ك</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold">
              <dt>الإجمالي</dt>
              <dd className="num">{filsToKwdString(order.total_fils)} د.ك</dd>
            </div>
          </dl>
        </Section>

        <Section title="بيانات المشتري">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted">الاسم</dt>
              <dd className="font-semibold">
                <Link href={`/admin/students/${order.user_id}`} className="hover:text-brand-700">
                  {order.customer_name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">البريد</dt>
              <dd dir="ltr" className="text-end">
                {order.customer_email}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">الهاتف</dt>
              <dd className="num">{order.customer_phone ? displayPhone(order.customer_phone) : "—"}</dd>
            </div>
          </dl>
        </Section>
      </div>

      <Section
        title="المدفوعات"
        description="الحالة تُؤكَّد دائمًا من خادم MyFatoorah (GetPaymentStatus) وليس من صفحة العودة."
        actions={
          pendingInvoice && cfg.enabled ? (
            <ConfirmButton
              action={reverifyPaymentAction}
              hidden={{ orderId: order.id, invoiceId: pendingInvoice.gateway_invoice_id! }}
              label="إعادة التحقق من البوابة"
              icon={<RefreshCw aria-hidden />}
              variant="outline"
              title="إعادة التحقق من حالة الدفع؟"
              description="سيتم الاستعلام من MyFatoorah عن الفاتورة. إذا كانت مدفوعة فعليًا ستُمنح الصلاحيات تلقائيًا."
              confirmLabel="تحقق الآن"
            />
          ) : null
        }
      >
        {payments.length === 0 ? (
          <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">لم تبدأ أي محاولة دفع لهذا الطلب.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>التاريخ</TH>
                <TH>المزود</TH>
                <TH>الحالة</TH>
                <TH>المبلغ</TH>
                <TH>رقم الفاتورة</TH>
                <TH>رقم الدفع</TH>
                <TH>الوسيلة</TH>
                <TH>ملاحظات</TH>
              </tr>
            </THead>
            <tbody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD className="text-xs text-muted">{formatDateTime(p.created_at)}</TD>
                  <TD>
                    {p.provider === "free" ? "مجاني" : "MyFatoorah"}
                    {p.environment === "sandbox" ? <Badge tone="warning" className="ms-1">Sandbox</Badge> : null}
                  </TD>
                  <TD>
                    <PaymentStatusBadge status={p.status} />
                  </TD>
                  <TD className="num">{filsToKwdString(p.amount_fils)}</TD>
                  <TD className="num text-xs">{p.gateway_invoice_id ?? "—"}</TD>
                  <TD className="num text-xs">{p.gateway_payment_id ?? "—"}</TD>
                  <TD className="text-xs">{p.payment_method ?? "—"}</TD>
                  <TD className="max-w-56 text-xs text-danger">{p.error_message ?? ""}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        {events.length ? (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-bold">إشعارات البوابة (Webhook)</h3>
            <ul className="space-y-1 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-2 rounded-lg bg-canvas px-3 py-2">
                  <span className="text-muted">{formatDateTime(e.received_at)}</span>
                  <span className="font-semibold" dir="ltr">
                    {e.event_name}
                  </span>
                  <span>{e.signature_valid ? "توقيع صحيح" : "توقيع غير صحيح"}</span>
                  <span className="text-muted" dir="ltr">
                    {e.result ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="الاسترداد" description="تسجيل الاسترداد يسحب صلاحيات المنتجات المرتبطة بهذا الطلب ويُحفظ في سجل التدقيق.">
        {refunds.length ? (
          <ul className="mb-4 space-y-2">
            {refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
                <span className="num font-bold">{filsToKwdString(r.amount_fils)} د.ك</span>
                <Badge tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "neutral"}>{REFUND_STATUS[r.status] ?? r.status}</Badge>
                <span className="min-w-0 flex-1 text-ink-soft">{r.reason}</span>
                <span className="text-xs text-muted">
                  {r.admin_name ?? ""} · {formatDateTime(r.created_at)}
                </span>
                {cfg.enabled && r.payment_id && (r.status === "recorded" || r.status === "failed") && payments.some((p) => p.id === r.payment_id && p.provider === "myfatoorah") ? (
                  <ConfirmButton
                    action={gatewayRefundAction}
                    hidden={{ refundId: r.id, orderId: order.id }}
                    label="طلب الاسترداد من البوابة"
                    icon={<Send aria-hidden />}
                    variant="outline"
                    title="إرسال طلب استرداد إلى MyFatoorah؟"
                    description="سيتم طلب إعادة المبلغ إلى وسيلة دفع العميل عبر البوابة. هذه عملية مالية حقيقية في وضع الإنتاج."
                    confirmLabel="إرسال"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {order.status === "paid" ? (
          <ConfirmButton
            action={refundOrderAction}
            hidden={{ orderId: order.id }}
            label="تسجيل استرداد"
            icon={<RotateCcw aria-hidden />}
            title="تسجيل استرداد لهذا الطلب؟"
            description="ستتغير حالة الطلب إلى «مسترد» وتُسحب صلاحيات الوصول المرتبطة به. يمكنك بعدها إرسال طلب الاسترداد المالي للبوابة."
            requireReason
            reasonLabel="سبب الاسترداد (إلزامي)"
            confirmLabel="تسجيل الاسترداد"
            fields={[{ name: "amount", label: "المبلغ بالدينار (اختياري — الافتراضي كامل المبلغ)", placeholder: filsToKwdString(order.total_fils), ltr: true }]}
          />
        ) : refunds.length === 0 ? (
          <p className="text-sm text-muted">الاسترداد متاح للطلبات المدفوعة فقط.</p>
        ) : null}
      </Section>
    </div>
  );
}
