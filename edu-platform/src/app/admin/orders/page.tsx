import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { Banknote, CircleCheck, Clock3, FlaskConical, Package, Receipt, RotateCcw, ShieldAlert } from "lucide-react";
import { listAdminOrders } from "@/server/admin/records";
import { openPaymentAlerts } from "@/server/payments/monitoring";
import { openExtraPayments } from "@/server/payments/extras";
import { openRefunds } from "@/server/payments/refunds";
import { openOrderHolds } from "@/server/payments/holds";
import { paymentsConfig } from "@/server/payments/service";
import { refundStepUpActive } from "@/server/auth/step-up";
import { ExtraPaymentsList } from "./_components/extra-payments";
import { RefundsList } from "./_components/refunds-list";
import { resolvePaymentAlertAction } from "./actions";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FilterBar, FilterSearch, FilterSubmit, ResultCount, Toolbar } from "@/components/admin/filter-bar";
import { OrderStatusBadge, PaymentStatusBadge, StatusPill, TestBadge, type StatusTone } from "@/components/admin/status-badge";
import { STRETCHED_FOCUS } from "@/components/admin/tones";
import { ToneIcon } from "@/components/admin/icon-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/form";
import { DISPUTE_STATUS_LABELS, DISPUTE_TYPE_LABELS, HOLD_KIND_LABELS, ORDER_STATUSES, ORDER_STATUS_LABELS, REFUND_ALERT_REASON_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { count, W } from "@/lib/design";
import { cn, formatDateTime } from "@/lib/utils";
import { PeopleBand, BandChip, BandChips } from "../_components/people/band";
import { OrdersArt } from "../_components/people/art";
import { Kwd } from "../_components/people/bits";
import { StepUpOffNote } from "./_components/step-up-off-note";
import { orderTone } from "../_components/people/helpers";

export const metadata = { title: "الطلبات والمدفوعات" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; test?: string }> }) {
  const owner = await requireOwnerPage();
  const sp = await searchParams;
  const status = ORDER_STATUSES.includes(sp.status as never) ? sp.status : undefined;
  const test = sp.test === "real" || sp.test === "test" ? sp.test : undefined;
  const [orders, alerts, extras, refunds, stepUp, holds] = await Promise.all([listAdminOrders({ q: sp.q?.slice(0, 80), status, test }), openPaymentAlerts(), openExtraPayments(), openRefunds(), refundStepUpActive(owner.userId), openOrderHolds()]);
  const filtered = Boolean(sp.q || status || test);
  const paid = orders.filter((o) => o.status === "paid").length;
  const pending = orders.filter((o) => o.status === "pending").length;
  const tests = orders.filter((o) => o.is_test).length;

  return (
    <div className="space-y-6">
      <PeopleBand
        tone="green"
        art={<OrdersArt className="size-full motion-safe:animate-bob" />}
        footer={
          orders.length ? (
            <BandChips>
              <BandChip tone="green" icon={<Receipt aria-hidden />}>
                {count(orders.length, W.order)} {filtered ? "مطابقة" : "في القائمة"}
              </BandChip>
              {paid ? (
                <BandChip tone="green" icon={<CircleCheck aria-hidden />}>
                  مدفوعة: {count(paid, W.order)}
                </BandChip>
              ) : null}
              {pending ? (
                <BandChip tone="gold" icon={<Clock3 aria-hidden />}>
                  بانتظار الدفع: {count(pending, W.order)}
                </BandChip>
              ) : null}
              {tests ? (
                <BandChip tone="sky" icon={<FlaskConical aria-hidden />}>
                  تجريبية: {count(tests, W.order)}
                </BandChip>
              ) : null}
            </BandChips>
          ) : null
        }
      >
        <AdminPageHeader
          className="mb-0"
          title="الطلبات والمدفوعات"
          description="كل الطلبات مع حالة الدفع. الطلبات التجريبية (Sandbox) مميزة بشارة."
        />
      </PeopleBand>

      {holds.length ? (
        <Section id="payment-holds" title="دفعات موقوفة تحتاج إلى قرارك" description="نزاع أو استرداد جزئي وصل من بوابة الدفع. أوقفنا وصول الطلب وأرباحه، ولن يتغير شيء آخر حتى تقرر." icon={<ShieldAlert />} tone="coral">
          <ul className="flex flex-col gap-3" aria-label="الدفعات الموقوفة" data-testid="payment-holds">
            {holds.map((h) => (
              <li key={h.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[1.4rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3.5 shadow-xs sm:p-4">
                <div className="min-w-[min(100%,13rem)] flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-display font-extrabold text-ink">
                    {HOLD_KIND_LABELS[h.kind]}
                    {h.is_test ? <TestBadge /> : null}
                  </p>
                  <p className="text-[0.84rem] leading-6 text-muted">
                    <span className="num font-bold">{h.order_number}</span> · <span className="whitespace-nowrap">منذ {formatDateTime(h.held_at)}</span>
                  </p>
                </div>
                <Link prefetch={false} href={`/admin/orders/${h.order_id}#hold-decision`} className="inline-flex min-h-11 items-center font-bold text-brand-700 hover:underline">
                  افتح الطلب واتخذ القرار
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {alerts.length ? (
        <Section id="payment-alerts" title="تنبيهات الدفع" description="نزاعات واستردادات أبلغت عنها بوابة الدفع ولم تُطبق تلقائيًا. النزاع على طلب مدفوع والاسترداد الجزئي يوقفان وصوله حتى تقرر، وما عداهما لا يغيّر شيئًا." icon={<ShieldAlert />} tone="coral">
          <ul className="flex flex-col gap-3" aria-label="تنبيهات الدفع المفتوحة" data-testid="payment-alerts">
            {alerts.map((a) => {
              const status = a.details.status ?? "";
              const tone: StatusTone = status === "RESOLVED" ? "success" : status === "LOST" ? "danger" : "warning";
              const isDispute = a.kind === "dispute";
              return (
                <li key={a.id} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-[1.4rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3.5 shadow-xs sm:p-4">
                  <ToneIcon tone="coral" size="md" className="max-sm:size-11">
                    <ShieldAlert />
                  </ToneIcon>
                  <div className="min-w-[min(100%,13rem)] flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-display font-extrabold text-ink">
                      {isDispute ? (DISPUTE_TYPE_LABELS[a.details.type ?? ""] ?? "نزاع على دفعة") : "استرداد لم يُطبق تلقائيًا"}
                      <StatusPill tone={isDispute ? tone : "warning"}>{isDispute ? (DISPUTE_STATUS_LABELS[status] ?? (status || "غير معروفة")) : status === "CANCELED" ? "ملغى لدى البوابة" : "منفذ لدى البوابة"}</StatusPill>
                      {a.order_is_test ? <TestBadge /> : null}
                    </p>
                    <p className="text-[0.84rem] leading-6 text-muted">
                      {a.order_id ? (
                        <Link prefetch={false} href={`/admin/orders/${a.order_id}`} className="num font-bold text-brand-700 hover:underline">
                          {a.order_number}
                        </Link>
                      ) : (
                        <>فاتورة غير مرتبطة بطلب</>
                      )}
                      {a.details.invoiceId ? (
                        <>
                          {" · "}فاتورة <span className="num">{a.details.invoiceId}</span>
                        </>
                      ) : null}
                      {isDispute && a.details.amount ? (
                        <>
                          {" · "}
                          <span className="num">{a.details.amount}</span> {a.details.currency === "KWD" || a.details.currency === "KD" ? "د.ك" : a.details.currency}
                        </>
                      ) : null}
                      {!isDispute && a.details.amountFils !== null ? (
                        <>
                          {" · "}
                          <span className="num">{filsToKwdString(a.details.amountFils)}</span> د.ك
                        </>
                      ) : null}
                      {" · "}
                      <span className="whitespace-nowrap">{formatDateTime(a.updated_at)}</span>
                    </p>
                    {isDispute && a.details.reason ? (
                      <p className="text-[0.84rem] leading-6 text-ink-soft">
                        السبب حسب البوابة: <bdi dir="ltr">{a.details.reason}</bdi>
                      </p>
                    ) : null}
                    {!isDispute ? <p className="text-[0.84rem] leading-6 text-ink-soft">السبب: {REFUND_ALERT_REASON_LABELS[a.details.reason] ?? a.details.reason}. راجعه في لوحة MyFatoorah.</p> : null}
                  </div>
                  <ConfirmButton
                    action={resolvePaymentAlertAction}
                    hidden={{ alertId: a.id }}
                    label="تمت المراجعة"
                    icon={<CircleCheck aria-hidden />}
                    variant="outline"
                    title="إغلاق هذا التنبيه؟"
                    description={isDispute ? "يختفي التنبيه من القائمة ويُسجَّل الإغلاق في سجل التدقيق. هذا لا يعيد وصولًا موقوفًا، فالقرار في «دفعات موقوفة». يعود التنبيه إذا غيّرت البوابة حالة النزاع." : "يختفي التنبيه من القائمة ويُسجَّل الإغلاق في سجل التدقيق. هذا لا يعيد وصولًا موقوفًا، فالقرار في «دفعات موقوفة»."}
                    confirmLabel="إغلاق التنبيه"
                  />
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {refunds.length ? (
        <Section
          id="refund-queue"
          title="استردادات لم تكتمل"
          description="كل استرداد لم تؤكد البوابة تنفيذه بعد. يذهب الطلب إلى فريق مالية MyFatoorah إلا إن كان الاسترداد التلقائي مفعلًا في حسابك، ويُعاد المبلغ إلى وسيلة الدفع الأصلية."
          icon={<RotateCcw />}
          tone="violet"
        >
          {stepUp ? null : <StepUpOffNote />}
          <RefundsList refunds={refunds} canAct={paymentsConfig().enabled} showOrder stepUp={stepUp} />
        </Section>
      ) : null}

      {extras.length ? (
        <Section id="extra-payments" title="دفعات زائدة" description="مبالغ أكدتها البوابة ولا تكمل طلبًا. استرداد الدفعة لا يغيّر الطلب ولا وصول الطالب ولا الأرباح." icon={<Banknote />} tone="coral">
          {stepUp ? null : <StepUpOffNote />}
          <ExtraPaymentsList extras={extras} canRefund={paymentsConfig().enabled} showOrder stepUp={stepUp} />
        </Section>
      ) : null}

      <div>
        <FilterBar label="تصفية الطلبات">
          <FilterSearch name="q" defaultValue={sp.q} placeholder="رقم الطلب أو البريد أو الاسم" label="بحث" />
          <Select name="status" defaultValue={status ?? ""} aria-label="الحالة">
            <option value="">كل الحالات</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select name="test" defaultValue={test ?? ""} aria-label="النوع">
            <option value="">حقيقية وتجريبية</option>
            <option value="real">حقيقية فقط</option>
            <option value="test">تجريبية فقط</option>
          </Select>
          <FilterSubmit resetHref="/admin/orders" active={filtered} />
        </FilterBar>

        {orders.length === 0 ? (
          <EmptyState
            art={filtered ? "search" : "receipt"}
            title={filtered ? "لا توجد طلبات مطابقة" : "لا توجد طلبات بعد"}
            description={filtered ? "جرّب تغيير معايير البحث." : "ستظهر هنا طلبات الطلاب فور إنشائها."}
          />
        ) : (
          <>
            <Toolbar start={<ResultCount>{count(orders.length, W.order)}</ResultCount>} end={<p className="text-[0.82rem] text-muted">الأحدث أولًا</p>} />
            <ul className="flex flex-col gap-3" aria-label="قائمة الطلبات">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className={cn(
                    "relative grid min-w-0 items-center gap-x-4 gap-y-3 rounded-[1.4rem] border border-[rgb(23_32_38/0.06)] bg-surface p-3.5 shadow-xs transition-shadow hover:shadow-card sm:p-4",
                    "grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1.2fr)_auto_minmax(9.5rem,auto)]",
                    STRETCHED_FOCUS,
                  )}
                >
                  <ToneIcon tone={orderTone(o.status)} size="md" className="max-sm:size-11">
                    <Receipt />
                  </ToneIcon>
                  <div className="min-w-0">
                    <Link prefetch={false} href={`/admin/orders/${o.id}`} className="stretched num font-display text-[1.02rem] font-black text-ink hover:text-brand-700">
                      {o.number}
                    </Link>
                    <p className="text-[0.78rem] leading-5 text-muted">{formatDateTime(o.created_at)}</p>
                  </div>
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <p className="truncate font-display font-extrabold text-ink">{o.customer_name}</p>
                    <p className="truncate text-end text-[0.8rem] leading-5 text-muted" dir="ltr">
                      {o.customer_email}
                    </p>
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center gap-1.5 lg:col-span-1 lg:max-w-[15rem]">
                    <OrderStatusBadge status={o.status} />
                    {o.last_payment_status ? (
                      <span className="inline-flex items-center gap-1 font-display text-[0.76rem] font-bold text-muted">
                        <span>آخر دفع</span>
                        <PaymentStatusBadge status={o.last_payment_status} />
                      </span>
                    ) : null}
                    {o.is_test ? <TestBadge /> : null}
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-3 border-t border-dashed border-line pt-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-center sm:gap-0.5 sm:border-0 sm:pt-0">
                    <span className="chip chip-mint min-h-7">
                      <Package aria-hidden />
                      {count(o.item_count, W.product)}
                    </span>
                    <Kwd fils={o.total_fils} className="font-display text-[1.2rem] font-black text-ink" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
