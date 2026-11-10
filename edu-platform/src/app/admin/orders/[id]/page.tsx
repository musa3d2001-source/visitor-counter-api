import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import type * as React from "react";
import {
  Banknote,
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
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Tag,
  UserRound,
  Wallet,
} from "lucide-react";
import { getAdminOrder } from "@/server/admin/records";
import { paymentsConfig } from "@/server/payments/service";
import { openPaymentAlerts } from "@/server/payments/monitoring";
import { orderExtraPayments } from "@/server/payments/extras";
import { orderRefunds } from "@/server/payments/refunds";
import { refundStepUpActive } from "@/server/auth/step-up";
import { ExtraPaymentsList } from "../_components/extra-payments";
import { RefundsList } from "../_components/refunds-list";
import { Alert } from "@/components/ui/alert";
import { Section } from "@/components/admin/page-header";
import { EmptyValue, InfoList } from "@/components/admin/data-list";
import { OrderStatusBadge, PaymentStatusBadge, StatusPill, TestBadge } from "@/components/admin/status-badge";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { ToneIcon } from "@/components/admin/icon-tile";
import type { AdminTone } from "@/components/admin/tones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { filsToKwdString } from "@/lib/money";
import { DISPUTE_STATUS_LABELS, DISPUTE_TYPE_LABELS, PRODUCT_TYPE_LABELS, PAYMENT_STATUS_LABELS, REFUND_ALERT_REASON_LABELS, REFUND_STATUS_LABELS, paymentMethodLabel, type ProductType } from "@/lib/labels";
import { displayPhone } from "@/lib/phone";
import { count, W } from "@/lib/design";
import { formatDateTime } from "@/lib/utils";
import { refundOrderAction, reverifyPaymentAction } from "../actions";
import { StepUpOffNote } from "../_components/step-up-off-note";
import { STEP_UP_CONFIRM_FIELD } from "@/lib/two-factor";
import { BandChip, ProfileHero } from "../../_components/people/band";
import { OrdersArt } from "../../_components/people/art";
import { Kwd, PersonAvatar, SoftNote, Timeline, TimelineItem, TypeIcon } from "../../_components/people/bits";
import { orderTone } from "../../_components/people/helpers";
import { isUuid } from "@/lib/uuid";

export const metadata = { title: "تفاصيل الطلب" };

function paymentTone(status: string): AdminTone {
  return status === "paid" ? "green" : status === "pending" || status === "initiated" ? "gold" : status === "refunded" ? "violet" : status === "expired" ? "slate" : "coral";
}

type Step = { key: string; at: Date; tone: AdminTone; icon: React.ReactNode; title: React.ReactNode; body?: React.ReactNode };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await getAdminOrder(id);
  if (!data) notFound();
  const { order, items, payments, events } = data;
  const [alerts, extras, refunds, stepUp] = await Promise.all([openPaymentAlerts({ orderId: order.id }), orderExtraPayments(order.id), orderRefunds(order.id), refundStepUpActive(owner.userId)]);
  const cfg = paymentsConfig();
  const hasInvoice = payments.some((p) => p.provider === "myfatoorah" && p.gateway_invoice_id);
  const tone = orderTone(order.status);
  // يبدأ استرداد جديد فقط إن لم يبق سجل حي: السجلات المرفوضة تُعاد من صفها
  const canStartRefund = !refunds.some((r) => r.status !== "dismissed") && payments.some((p) => p.provider === "myfatoorah" && p.status === "paid" && p.gateway_invoice_id);

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
      title: `استرداد: ${REFUND_STATUS_LABELS[r.status] ?? r.status}`,
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

      {alerts.map((a) =>
        a.kind === "dispute" ? (
          <Alert key={a.id} tone="danger" title={`نزاع مفتوح على هذا الطلب: ${DISPUTE_TYPE_LABELS[a.details.type ?? ""] ?? "نزاع على دفعة"}`}>
            الحالة لدى البوابة: {DISPUTE_STATUS_LABELS[a.details.status ?? ""] ?? a.details.status ?? "غير معروفة"}. لم يتغير الطلب ولا وصول الطالب تلقائيًا. <Link href="/admin/orders#payment-alerts">كل تنبيهات الدفع</Link>
          </Alert>
        ) : (
          <Alert key={a.id} tone="danger" title="حدث استرداد من البوابة لم يُطبق تلقائيًا">
            السبب: {REFUND_ALERT_REASON_LABELS[a.details.reason] ?? a.details.reason}. لم يتغير الطلب ولا وصول الطالب. راجعه في لوحة MyFatoorah. <Link href="/admin/orders#payment-alerts">كل تنبيهات الدفع</Link>
          </Alert>
        ),
      )}

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
                  value: order.customer_phone ? <span className="num">{displayPhone(order.customer_phone)}</span> : <EmptyValue label="غير مسجل" />,
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
          hasInvoice && cfg.enabled ? (
            <ConfirmButton
              action={reverifyPaymentAction}
              hidden={{ orderId: order.id }}
              label="إعادة التحقق من البوابة"
              icon={<RefreshCw aria-hidden />}
              variant="outline"
              title="إعادة التحقق من حالة الدفع؟"
              description="سيتم الاستعلام من MyFatoorah عن كل فواتير هذا الطلب غير المؤكدة. أي دفعة مؤكدة تُطبق فورًا: تُمنح الصلاحيات إن كان الطلب غير مدفوع، وتُسجل كدفعة زائدة إن كان مكتملًا."
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
                    { label: "رقم الفاتورة", value: p.gateway_invoice_id ? <span className="num text-[0.88rem]">{p.gateway_invoice_id}</span> : <EmptyValue className="text-[0.88rem]" /> },
                    { label: "رقم الدفع", value: p.gateway_payment_id ? <span className="num text-[0.88rem] break-all">{p.gateway_payment_id}</span> : <EmptyValue className="text-[0.88rem]" /> },
                    { label: "الوسيلة", value: paymentMethodLabel(p.payment_method) ? <span className="text-[0.88rem]">{paymentMethodLabel(p.payment_method)}</span> : <EmptyValue className="text-[0.88rem]" />, wide: true },
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

      {extras.length ? (
        <Section title="دفعات زائدة على هذا الطلب" description="استرداد الدفعة الزائدة لا يغيّر الطلب ولا وصول الطالب ولا الأرباح." icon={<Banknote />} tone="coral">
          <ExtraPaymentsList extras={extras} canRefund={cfg.enabled} stepUp={stepUp} />
        </Section>
      ) : null}

      <Section
        title="الاسترداد"
        icon={<RotateCcw />}
        tone="violet"
        description="استرداد كامل قيمة الطلب إلى وسيلة الدفع الأصلية. يذهب الطلب إلى فريق مالية MyFatoorah إلا إن كان الاسترداد التلقائي مفعلًا في حسابك، ويحتاج رصيدًا متاحًا في حساب البوابة، والمبالغ المقبوضة اليوم قد لا تدخل فيه. الاسترداد الجزئي يتم من لوحة البوابة."
      >
        {refunds.length ? (
          <div className="mb-4">
            <RefundsList refunds={refunds} canAct={cfg.enabled} stepUp={stepUp} />
          </div>
        ) : null}
        {!stepUp && (order.status === "paid" || refunds.length > 0) && cfg.enabled ? <StepUpOffNote /> : null}
        {order.status === "paid" && cfg.enabled && canStartRefund ? (
          <ConfirmButton
            action={refundOrderAction}
            hidden={{ orderId: order.id }}
            label="استرداد كامل المبلغ"
            icon={<RotateCcw aria-hidden />}
            title={`استرداد ${filsToKwdString(order.total_fils)} د.ك؟`}
            description="يُطلب من MyFatoorah إعادة كامل قيمة الطلب إلى وسيلة الدفع الأصلية. عند قبولها فقط تتغير حالة الطلب ويُغلق وصول الطالب وتُعكس أرباح المعلم، وإن رفضت يبقى الطلب كما هو. هذه عملية مالية حقيقية في وضع الإنتاج."
            requireReason
            reasonLabel="سبب الاسترداد (إلزامي)"
            confirmLabel="إرسال طلب الاسترداد"
            fields={stepUp ? [STEP_UP_CONFIRM_FIELD] : undefined}
          />
        ) : order.status === "paid" && cfg.enabled && !refunds.some((r) => r.status !== "dismissed") ? (
          <SoftNote icon={<RotateCcw aria-hidden />}>لا توجد دفعة إلكترونية على هذا الطلب، فلا يمكن استرداده عبر البوابة.</SoftNote>
        ) : order.status === "paid" && !cfg.enabled ? (
          <SoftNote icon={<RotateCcw aria-hidden />}>بوابة الدفع غير مفعلة: {cfg.reason}</SoftNote>
        ) : refunds.length === 0 ? (
          <SoftNote icon={<RotateCcw aria-hidden />}>الاسترداد متاح للطلبات المدفوعة فقط.</SoftNote>
        ) : null}
      </Section>
    </div>
  );
}
