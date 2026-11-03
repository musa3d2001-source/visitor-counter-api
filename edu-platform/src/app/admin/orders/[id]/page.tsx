import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import type * as React from "react";
import {
  Bell,
  CircleCheck,
  CircleX,
  CreditCard,
  FilePlus2,
  History,
  Mail,
  Package,
  Phone,
  Receipt,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Tag,
  UserRound,
  Wallet,
} from "lucide-react";
import { getAdminOrder } from "@/server/admin/records";
import { paymentsConfig } from "@/server/payments/service";
import { Section } from "@/components/admin/page-header";
import { InfoList } from "@/components/admin/data-list";
import { OrderStatusBadge, PaymentStatusBadge, StatusPill, TestBadge } from "@/components/admin/status-badge";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { ToneIcon } from "@/components/admin/icon-tile";
import type { AdminTone } from "@/components/admin/tones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_TYPE_LABELS, PAYMENT_STATUS_LABELS, type ProductType } from "@/lib/labels";
import { displayPhone } from "@/lib/phone";
import { count, W } from "@/lib/design";
import { formatDateTime } from "@/lib/utils";
import { gatewayRefundAction, refundOrderAction, reverifyPaymentAction } from "../actions";
import { BandChip, ProfileHero } from "../../_components/people/band";
import { OrdersArt } from "../../_components/people/art";
import { Kwd, PersonAvatar, SoftNote, Timeline, TimelineItem, TypeIcon } from "../../_components/people/bits";
import { orderTone } from "../../_components/people/helpers";

export const metadata = { title: "تفاصيل الطلب" };

const REFUND_STATUS: Record<string, string> = { recorded: "مسجل محليًا", requested: "مُرسل للبوابة", completed: "مكتمل", failed: "فشل" };

function paymentTone(status: string): AdminTone {
  return status === "paid" ? "green" : status === "pending" || status === "initiated" ? "gold" : status === "refunded" ? "violet" : status === "expired" ? "slate" : "coral";
}

type Step = { key: string; at: Date; tone: AdminTone; icon: React.ReactNode; title: React.ReactNode; body?: React.ReactNode };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getAdminOrder(id);
  if (!data) notFound();
  const { order, items, payments, events, refunds } = data;
  const cfg = paymentsConfig();
  const pendingInvoice = order.status !== "paid" && order.status !== "refunded" ? payments.find((p) => p.provider === "myfatoorah" && p.gateway_invoice_id) : null;
  const tone = orderTone(order.status);

  // مسار الطلب: يُبنى من التواريخ المسجلة فعلًا فقط (الإنشاء، محاولات الدفع، تأكيد الدفع، الاسترداد)
  const steps = ([
    { key: "created", at: new Date(order.created_at), tone: "sky" as AdminTone, icon: <FilePlus2 />, title: "أُنشئ الطلب", body: count(items.length, W.product) },
    ...payments.map<Step>((p) => ({
      key: `p-${p.id}`,
      at: new Date(p.created_at),
      tone: paymentTone(p.status),
      icon: <CreditCard />,
      title: `محاولة دفع: ${PAYMENT_STATUS_LABELS[p.status] ?? p.status}`,
      body: (
        <>
          {p.provider === "free" ? "مجاني" : "MyFatoorah"} · <Kwd fils={p.amount_fils} />
        </>
      ),
    })),
    ...(order.paid_at ? [{ key: "paid", at: new Date(order.paid_at), tone: "green" as AdminTone, icon: <CircleCheck />, title: "تأكد الدفع ومُنحت الصلاحيات" }] : []),
    ...refunds.map<Step>((r) => ({
      key: `r-${r.id}`,
      at: new Date(r.created_at),
      tone: "violet",
      icon: <RotateCcw />,
      title: `استرداد: ${REFUND_STATUS[r.status] ?? r.status}`,
      body: <Kwd fils={r.amount_fils} />,
    })),
  ] as Step[]).sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="space-y-6">
      <ProfileHero
        tone={tone}
        crumbs={[{ label: "الطلبات والمدفوعات", href: "/admin/orders" }, { label: order.number }]}
        avatar={
          <ToneIcon tone={tone} size="lg" className="size-20 rounded-[1.6rem] [&_svg]:size-10 max-sm:size-16 max-sm:rounded-[1.3rem]">
            <Receipt />
          </ToneIcon>
        }
        eyebrow={{ label: order.is_test ? "طلب تجريبي (Sandbox)" : "تفاصيل الطلب", icon: <Receipt aria-hidden />, tone: order.is_test ? "violet" : undefined }}
        title={
          <>
            الطلب <bdi className="num">{order.number}</bdi>
          </>
        }
        description={`أُنشئ ${formatDateTime(order.created_at)}${order.paid_at ? `، دُفع ${formatDateTime(order.paid_at)}` : ""}`}
        chips={
          <>
            <OrderStatusBadge status={order.status} />
            {order.is_test ? <TestBadge /> : null}
            <BandChip tone="gold" icon={<Wallet aria-hidden />}>
              الإجمالي <Kwd fils={order.total_fils} />
            </BandChip>
            <BandChip tone="sky" icon={<Package aria-hidden />}>
              {count(items.length, W.product)}
            </BandChip>
            {order.coupon_code ? (
              <BandChip tone="pink" icon={<Tag aria-hidden />}>
                <bdi dir="ltr">{order.coupon_code}</bdi>
              </BandChip>
            ) : null}
          </>
        }
        art={<OrdersArt className="size-full motion-safe:animate-bob" />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Section title="المنتجات" icon={<ShoppingBag />} tone="sky">
          <ul className="flex flex-col gap-2.5">
            {items.map((it) => (
              <li key={it.id} className="relative flex items-center gap-3 rounded-[1.2rem] border border-line bg-canvas/50 p-3 transition-colors hover:bg-canvas">
                <TypeIcon type={it.product_type} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/products/${it.product_id}`} className="line-clamp-2 font-display font-extrabold text-ink hover:text-brand-700">
                    {it.title}
                  </Link>
                  <p className="text-[0.8rem] text-muted">{PRODUCT_TYPE_LABELS[it.product_type as ProductType] ?? it.product_type}</p>
                </div>
                <Kwd fils={it.unit_price_fils} className="font-display font-black text-ink" />
              </li>
            ))}
          </ul>
          <dl className="relative mt-5 space-y-2 rounded-[1.3rem] border-2 border-dashed border-line-strong bg-[linear-gradient(180deg,#fffaf2,#fff4e4)] p-4 text-[0.95rem]">
            <div className="flex items-center justify-between gap-3">
              <dt className="font-display font-bold text-muted">المجموع</dt>
              <dd>
                <Kwd fils={order.subtotal_fils} className="font-bold text-ink" />
              </dd>
            </div>
            {order.discount_fils ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="flex flex-wrap items-center gap-2 font-display font-bold text-muted">
                  الخصم {order.coupon_code ? <Badge tone="accent">{order.coupon_code}</Badge> : null}
                </dt>
                <dd className="font-bold whitespace-nowrap text-success">
                  - <span className="num">{filsToKwdString(order.discount_fils)}</span> د.ك
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 border-t border-dashed border-line-strong pt-3">
              <dt className="font-display text-[1.05rem] font-black text-ink">الإجمالي</dt>
              <dd>
                <Kwd fils={order.total_fils} className="font-display text-[1.5rem] font-black text-brand-800" />
              </dd>
            </div>
          </dl>
        </Section>

        <div className="space-y-6">
          <Section title="بيانات المشتري" icon={<UserRound />} tone="violet">
            <div className="flex items-center gap-3.5 rounded-[1.3rem] bg-violet-50/70 p-3">
              <PersonAvatar name={order.customer_name} size={56} ring />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/students/${order.user_id}`} className="font-display text-[1.05rem] font-black text-ink hover:text-brand-700">
                  {order.customer_name}
                </Link>
                <p className="text-[0.8rem] text-muted">المشتري</p>
              </div>
            </div>
            <InfoList
              cols={1}
              className="mt-2"
              items={[
                {
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="size-3.5" aria-hidden /> البريد
                    </span>
                  ),
                  value: (
                    <span dir="ltr" className="block text-end break-all">
                      {order.customer_email}
                    </span>
                  ),
                },
                {
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5" aria-hidden /> الهاتف
                    </span>
                  ),
                  value: <span className="num">{order.customer_phone ? displayPhone(order.customer_phone) : "—"}</span>,
                },
              ]}
            />
            <Button asChild variant="soft" size="sm" className="mt-4">
              <Link href={`/admin/students/${order.user_id}`}>
                <UserRound aria-hidden /> ملف الطالب
              </Link>
            </Button>
          </Section>

          <Section title="مسار الطلب" description="من التواريخ المسجلة لهذا الطلب" icon={<History />} tone="teal">
            <Timeline>
              {steps.map((s, i) => (
                <TimelineItem key={s.key} tone={s.tone} icon={s.icon} title={s.title} meta={formatDateTime(s.at)} last={i === steps.length - 1}>
                  {s.body}
                </TimelineItem>
              ))}
            </Timeline>
          </Section>
        </div>
      </div>

      <Section
        title="المدفوعات"
        icon={<CreditCard />}
        tone="green"
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
          <SoftNote icon={<CreditCard aria-hidden />}>لم تبدأ أي محاولة دفع لهذا الطلب.</SoftNote>
        ) : (
          <ul className={payments.length > 1 ? "grid gap-3 md:grid-cols-2" : "grid gap-3"}>
            {payments.map((p) => (
              <li key={p.id} className="min-w-0 rounded-[1.4rem] border border-line bg-surface p-4 shadow-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <ToneIcon tone={paymentTone(p.status)} size="sm">
                    <CreditCard />
                  </ToneIcon>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-display font-extrabold text-ink">
                      {p.provider === "free" ? "مجاني" : "MyFatoorah"}
                      {p.environment === "sandbox" ? <Badge tone="warning">Sandbox</Badge> : null}
                    </p>
                    <p className="text-[0.78rem] text-muted">{formatDateTime(p.created_at)}</p>
                  </div>
                  <PaymentStatusBadge status={p.status} />
                </div>
                <p className="mt-3 font-display text-[1.45rem] leading-tight font-black text-ink">
                  <Kwd fils={p.amount_fils} />
                </p>
                <InfoList
                  cols={2}
                  className="mt-1"
                  items={[
                    { label: "رقم الفاتورة", value: <span className="num text-[0.88rem]">{p.gateway_invoice_id ?? "—"}</span> },
                    { label: "رقم الدفع", value: <span className="num text-[0.88rem] break-all">{p.gateway_payment_id ?? "—"}</span> },
                    { label: "الوسيلة", value: <span className="text-[0.88rem]">{p.payment_method ?? "—"}</span>, wide: true },
                  ]}
                />
                {p.error_message ? (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-danger-50 px-3 py-2 text-[0.84rem] leading-6 text-danger">
                    <ShieldAlert className="mt-1 size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{p.error_message}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {events.length ? (
          <div className="mt-6">
            <h3 className="mb-3 flex items-center gap-2 font-display text-[1.05rem] font-black text-ink">
              <Bell className="size-4 text-brand-600" aria-hidden /> إشعارات البوابة (Webhook)
            </h3>
            <Timeline>
              {events.map((e, i) => (
                <TimelineItem
                  key={e.id}
                  tone={e.signature_valid ? "green" : "coral"}
                  icon={e.signature_valid ? <ShieldCheck /> : <ShieldAlert />}
                  title={<bdi dir="ltr">{e.event_name}</bdi>}
                  meta={formatDateTime(e.received_at)}
                  last={i === events.length - 1}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={e.signature_valid ? "success" : "danger"}>{e.signature_valid ? "توقيع صحيح" : "توقيع غير صحيح"}</StatusPill>
                    {e.result ? (
                      <span className="text-muted" dir="ltr">
                        {e.result}
                      </span>
                    ) : null}
                  </span>
                </TimelineItem>
              ))}
            </Timeline>
          </div>
        ) : null}
      </Section>

      <Section title="الاسترداد" icon={<RotateCcw />} tone="violet" description="تسجيل الاسترداد يسحب صلاحيات المنتجات المرتبطة بهذا الطلب ويُحفظ في سجل التدقيق.">
        {refunds.length ? (
          <ul className="mb-4 flex flex-col gap-2.5">
            {refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[1.3rem] border border-violet/15 bg-violet-50/60 p-3.5 text-sm">
                <ToneIcon tone={r.status === "failed" ? "coral" : "violet"} size="sm">
                  {r.status === "failed" ? <CircleX /> : <RotateCcw />}
                </ToneIcon>
                <Kwd fils={r.amount_fils} className="font-display text-[1.1rem] font-black text-ink" />
                <Badge tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "neutral"}>{REFUND_STATUS[r.status] ?? r.status}</Badge>
                <span className="min-w-[10rem] flex-1 text-ink-soft">{r.reason}</span>
                <span className="text-xs text-muted">
                  {r.admin_name ?? ""}، {formatDateTime(r.created_at)}
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
            fields={[{ name: "amount", label: "المبلغ بالدينار (اختياري، الافتراضي كامل المبلغ)", placeholder: filsToKwdString(order.total_fils), ltr: true }]}
          />
        ) : refunds.length === 0 ? (
          <SoftNote icon={<RotateCcw aria-hidden />}>الاسترداد متاح للطلبات المدفوعة فقط.</SoftNote>
        ) : null}
      </Section>
    </div>
  );
}
