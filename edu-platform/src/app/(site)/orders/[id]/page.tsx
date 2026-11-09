import type { Metadata } from "next";
import type * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CircleCheck, Clock, FileText, Headset, Library, Package, PlayCircle, Receipt, RotateCcw, XCircle } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { getUserOrder } from "@/server/commerce/orders";
import { sql } from "@/server/db";
import { getSettings } from "@/server/platform/settings";
import { paymentsConfig } from "@/server/payments/service";
import { canSayNothingWasCharged } from "@/server/payments/extras";
import { cancelOrderAction, retryPaymentAction, refreshOrderStatusAction } from "../../checkout/actions";
import { PaymentUnavailableNotice, realContactLinks } from "@/components/site/payment-unavailable-notice";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { PrintButton } from "@/components/site/print-button";
import { Sparkle, SpotArt } from "@/components/art";
import { ORDER_STATUS_LABELS, PRODUCT_TYPE_LABELS, REFUND_PUBLIC_STATUS_LABELS, isContainerType, isVideoType, paymentMethodLabel, type ProductType } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { ar } from "@/lib/design";
import { cn, formatDateTime } from "@/lib/utils";
import { Kwd, SumRow } from "../../cart/_components/commerce";

export const metadata: Metadata = { title: "تفاصيل الطلب", robots: { index: false } };

/** ألوان شريط الحالة: تدرجات داكنة بما يكفي لنص أبيض (AA)، والذهبي بنص داكن */
const HERO = {
  paid: { bg: "linear-gradient(150deg, #0e8f6a, #0a6b66 55%, #064a40)", dark: true },
  pending: { bg: "linear-gradient(150deg, #ffe08a, #ffc531 50%, #f5a70f)", dark: false },
  failed: { bg: "linear-gradient(150deg, #d9402f, #b4322a 55%, #8a221d)", dark: true },
  other: { bg: "linear-gradient(150deg, #8f7be8, #5a3fc9 55%, #3e2a96)", dark: true },
} as const;

/** سبب إغلاق الطلب كما يراه الطالب */
const CLOSED_COPY = {
  expired: { title: "انتهت مدة هذا الطلب", body: "مرت ٧٢ ساعة دون تأكيد دفع، فأغلقنا الطلب." },
  student_cancelled: { title: "ألغيت هذا الطلب", body: "يمكنك إنشاء طلب جديد من السلة متى شئت." },
  already_owned: { title: "هذا المنتج في مكتبتك", body: "أصبح أحد منتجات هذا الطلب في مكتبتك، فأغلقنا الطلب حتى لا تدفع مرتين." },
  coupon_unavailable: { title: "نفد كود الخصم قبل إكمال الطلب", body: "نفدت مرات استخدام كود الخصم، فأغلقنا الطلب. يمكنك إنشاء طلب جديد من السلة." },
  product_ended: { title: "انتهى بيع أحد منتجات هذا الطلب", body: "مضى تاريخ إتاحة أحد منتجات هذا الطلب، فأغلقناه حتى لا تدفع مقابل منتج انتهى." },
} as const;

function itemLook(type: string) {
  if (isContainerType(type as ProductType)) return { icon: <Package />, tone: "tone-default" };
  if (isVideoType(type as ProductType)) return { icon: <PlayCircle />, tone: "tone-math" };
  return { icon: <FileText />, tone: "tone-social" };
}

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
  // الدفعة التي أكملت الطلب، لا آخر محاولة ولا دفعة زائدة
  const [settled] = await sql<{ gateway_payment_id: string | null; gateway_invoice_id: string | null; payment_method: string | null }[]>`
    select p.gateway_payment_id, p.gateway_invoice_id, p.payment_method from payments p
    where p.order_id = ${order.id} and p.provider = 'myfatoorah' and p.status in ('paid', 'refunded')
      and not exists (select 1 from payment_extras e where e.payment_id = p.id)
    order by coalesce(p.paid_at, p.created_at) desc limit 1
  `;
  // الطالب يرى الاسترداد فقط بعد أن تقبله البوابة. المحاولات غير المؤكدة لا تخصه ولا تغير طلبه
  const [refund] = await sql<{ status: string; amount_fils: number; accepted_at: Date | null; completed_at: Date | null; created_at: Date }[]>`
    select status, amount_fils, accepted_at, completed_at, created_at from refunds
    where order_id = ${order.id} and status in ('recorded', 'requested', 'completed') order by created_at desc limit 1
  `;
  const methodName = paymentMethodLabel(settled?.payment_method ?? payment?.payment_method) ?? (settled ? "MyFatoorah" : null);
  const statusTone = order.status === "paid" ? "success" : order.status === "failed" ? "danger" : order.status === "pending" ? "warning" : "neutral";
  const heroKey = order.status === "paid" || order.status === "pending" || order.status === "failed" ? order.status : "other";
  const hero = HERO[heroKey];
  // الدفع متوقف: لا نعرض أزرارًا لا تعمل
  const paymentsOn = paymentsConfig().enabled;
  const unpaid = order.status === "pending" || order.status === "failed";
  const hasContact = realContactLinks(settings).length > 0;
  const showHelp = unpaid && hasContact;
  // هذه الجملة لا تُقال إلا بعد فحص كل الفواتير لدى البوابة
  const nothingCharged = await canSayNothingWasCharged(order.id);
  const [extraPayment] = await sql`select 1 from payment_extras where order_id = ${order.id} and state not in ('refunded', 'dismissed') limit 1`;
  const closedCopy = order.status === "cancelled" && order.closed_reason ? CLOSED_COPY[order.closed_reason] : null;

  return (
    <div className="bg-sunny">
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
        <section
          className={cn("poster relative overflow-hidden rounded-[2rem] px-6 py-9 sm:rounded-[2.5rem] sm:px-10 sm:py-12 no-print", hero.dark ? "on-dark text-white" : "text-accent-900")}
          style={{ background: hero.bg }}
        >
          <Sparkle className="animate-twinkle absolute end-[8%] top-8 size-7" />
          <Sparkle className="animate-twinkle absolute end-[20%] bottom-10 size-4 [animation-delay:1.1s]" color="#ffffff" />
          <Sparkle className="animate-twinkle absolute start-[46%] top-6 hidden size-3.5 [animation-delay:.6s] sm:block" color="#ffffff" />
          <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-start">
            <span
              className={cn(
                "grid size-24 shrink-0 place-items-center rounded-[1.8rem] bg-white shadow-[0_8px_0_rgb(0_0_0/0.14),0_24px_40px_-18px_rgb(0_0_0/0.5)] sm:size-28 [&_svg]:size-14",
                order.status === "paid" ? "text-[#0b8462]" : order.status === "failed" ? "text-[#c23a2f]" : order.status === "pending" ? "text-[#c27c00]" : "text-[#5a3fc9]",
              )}
              aria-hidden
            >
              {order.status === "paid" ? <CircleCheck /> : order.status === "pending" ? <Clock /> : order.status === "failed" ? <XCircle /> : <Receipt />}
            </span>
            <div className="min-w-0 flex-1">
              {order.status === "paid" ? (
                <>
                  <h1 className="font-display text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] leading-tight font-black">تم الدفع بنجاح</h1>
                  <p className="mt-2 text-[1.08rem] leading-8 text-white/90">مشترياتك جاهزة الآن في مكتبتك.</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start">
                    <Button asChild size="xl" variant="accent">
                      <Link href="/library" data-testid="go-library">
                        <BookOpen aria-hidden /> افتح مكتبتي
                      </Link>
                    </Button>
                  </div>
                </>
              ) : order.status === "pending" && !paymentsOn ? (
                <>
                  <h1 className="font-display text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] leading-tight font-black">هذا الطلب لم يكتمل بعد</h1>
                  <p className="mt-2 max-w-2xl text-[1.05rem] leading-8 font-semibold text-accent-900/90">لا يمكن إكمال الدفع الآن، ولن تُضاف مشترياتك إلى مكتبتك قبل تأكيد بوابة الدفع.</p>
                </>
              ) : order.status === "pending" ? (
                <>
                  <h1 className="font-display text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] leading-tight font-black">بانتظار تأكيد الدفع</h1>
                  <p className="mt-2 max-w-2xl text-[1.05rem] leading-8 font-semibold text-accent-900/90">إذا أتممت الدفع، اضغط «تحديث الحالة». لن تُضاف مشترياتك إلى مكتبتك قبل تأكيد بوابة الدفع.</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start">
                    <form action={refreshOrderStatusAction}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <SubmitButton size="lg">
                        <RotateCcw aria-hidden /> تحديث الحالة
                      </SubmitButton>
                    </form>
                    <form action={retryPaymentAction}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <SubmitButton variant="outline" size="lg">
                        إكمال الدفع
                      </SubmitButton>
                    </form>
                  </div>
                </>
              ) : order.status === "failed" ? (
                <>
                  <h1 className="font-display text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] leading-tight font-black" data-testid="payment-failed">
                    لم تكتمل عملية الدفع
                  </h1>
                  <p className="mt-2 max-w-2xl text-[1.05rem] leading-8 text-white/90">
                    {payment?.error_message ? `السبب: ${payment.error_message}. ` : ""}
                    {nothingCharged
                      ? `لم يتم خصم أي مبلغ مقابل هذا الطلب.${paymentsOn ? " يمكنك المحاولة مرة أخرى." : ""}`
                      : paymentsOn
                        ? "إذا خُصم مبلغ من حسابك، اضغط «تحديث الحالة» لنتحقق منه لدى بوابة الدفع."
                        : "إذا خُصم مبلغ من حسابك، تواصل معنا واذكر رقم الطلب."}
                  </p>
                  {paymentsOn ? (
                    <div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start">
                      <form action={retryPaymentAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <SubmitButton size="xl" variant="light">
                          <RotateCcw aria-hidden /> إعادة محاولة الدفع
                        </SubmitButton>
                      </form>
                      <form action={refreshOrderStatusAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <SubmitButton size="xl" variant="outline">
                          تحديث الحالة
                        </SubmitButton>
                      </form>
                    </div>
                  ) : null}
                </>
              ) : order.status === "refunded" ? (
                <>
                  <h1 className="font-display text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] leading-tight font-black" data-testid="order-refunded">
                    تم استرداد هذا الطلب
                  </h1>
                  <p className="mt-2 max-w-2xl text-[1.05rem] leading-8 text-white/90">
                    {refund?.status === "completed" ? "نفذت بوابة الدفع الاسترداد. " : refund?.status === "requested" ? "الاسترداد قيد التنفيذ لدى بوابة الدفع. " : ""}
                    يعود المبلغ إلى وسيلة الدفع الأصلية، ويعتمد وقت ظهوره في حسابك على البوابة والبنك. توقف الوصول إلى منتجات هذا الطلب.
                  </p>
                </>
              ) : closedCopy ? (
                <>
                  <h1 className="font-display text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] leading-tight font-black" data-testid="order-closed">
                    {closedCopy.title}
                  </h1>
                  <p className="mt-2 max-w-2xl text-[1.05rem] leading-8 text-white/90">
                    {closedCopy.body}
                    {nothingCharged ? " لم يتم خصم أي مبلغ مقابل هذا الطلب." : ""}
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start">
                    <Button asChild size="lg" variant="light">
                      <Link href={order.closed_reason === "already_owned" ? "/library" : "/cart"}>{order.closed_reason === "already_owned" ? "افتح مكتبتي" : "العودة إلى السلة"}</Link>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="font-display text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] leading-tight font-black">تفاصيل الطلب</h1>
                  <p className="mt-2 text-[1.05rem] leading-8 text-white/90">حالة هذا الطلب: {ORDER_STATUS_LABELS[order.status]}.</p>
                </>
              )}
            </div>
            <div className="relative hidden size-52 shrink-0 lg:block" aria-hidden>
              <span className="absolute inset-0 rounded-full bg-white/22 ring-[14px] ring-white/10" />
              <span className={cn("absolute inset-6", order.status === "pending" ? "text-[#b06d00]" : order.status === "paid" ? "text-white" : "text-[#a92c25]")}>
                <SpotArt kind={order.status === "paid" ? "library" : "cart"} />
              </span>
            </div>
          </div>
        </section>

        {unpaid && !paymentsOn ? <PaymentUnavailableNotice settings={settings} className="mt-6 no-print" /> : null}

        {sp.from === "open-order" && unpaid ? (
          <Alert tone="info" className="mt-6 no-print" title="لديك طلب مفتوح لهذا المنتج">
            أكمل الدفع من هنا، أو ألغِ الطلب لتبدأ من جديد. لا ننشئ طلبًا ثانيًا حتى لا تدفع مرتين.
          </Alert>
        ) : null}

        {extraPayment ? (
          <Alert tone="warning" className="mt-6 no-print" title="وصلتنا دفعة أخرى على هذا الطلب">
            سجّلناها وسيراجعها فريقنا. إن كان لديك سؤال عنها، تواصل معنا واذكر رقم الطلب <span className="num font-bold">{order.number}</span>.
          </Alert>
        ) : null}

        {sp.error === "mode" ? (
          <Alert tone="danger" className="mt-6 no-print" title="لا يمكن إكمال دفع هذا الطلب">
            أُنشئ هذا الطلب في وضع دفع مختلف عن الوضع الحالي. يمكنك إنشاء طلب جديد من <Link href="/cart">السلة</Link>.
          </Alert>
        ) : sp.error === "inprogress" ? (
          <Alert tone="warning" className="mt-6 no-print" title="توجد عملية دفع لم تكتمل بعد">
            انتظر قليلًا ثم اضغط «تحديث الحالة». لا ننشئ عملية دفع جديدة قبل أن تتضح نتيجتها.
          </Alert>
        ) : sp.error === "check" ? (
          <Alert tone="warning" className="mt-6 no-print" title="تعذر التأكد من حالة الدفع الآن">
            لم تصلنا إجابة كاملة من بوابة الدفع. حاول بعد قليل.
          </Alert>
        ) : sp.error === "rate" ? (
          <Alert tone="warning" className="mt-6 no-print">
            محاولات كثيرة. حاول بعد قليل.
          </Alert>
        ) : sp.error && sp.error !== "closed" ? (
          <Alert tone="danger" className="mt-6 no-print">
            تعذر بدء الدفع حاليًا. حاول بعد قليل.
          </Alert>
        ) : null}

        <div className={cn("mt-8 grid gap-6", (order.status === "paid" || showHelp) && "lg:grid-cols-[minmax(0,1fr)_20rem]")}>
          <section className="panel p-5 sm:p-8" aria-labelledby="invoice-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span className="icon-tile tone-brand size-13 [&_svg]:size-6" aria-hidden>
                  <Receipt />
                </span>
                <div>
                  <p className="text-[0.9rem] font-semibold text-muted">فاتورة {settings.site_name}</p>
                  <h2 id="invoice-title" className="font-display text-[1.45rem] leading-tight font-black sm:text-[1.65rem]">
                    طلب رقم <span className="num">{order.number}</span>
                  </h2>
                  <p className="mt-0.5 text-[0.88rem] text-muted">{formatDateTime(order.created_at)}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {order.is_test ? (
                  <Badge tone="warning" size="lg">
                    طلب تجريبي
                  </Badge>
                ) : null}
                <Badge tone={statusTone} size="lg" data-testid="order-status">
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
              </div>
            </div>

            <h3 className="sr-only">المنتجات</h3>
            <ul className="mt-7 space-y-3">
              {items.map((it) => {
                const look = itemLook(it.product_type);
                return (
                  <li key={it.id} className={cn("flex items-center gap-3.5 rounded-[1.25rem] bg-[var(--soft)] p-3 sm:p-3.5", look.tone)}>
                    <span className="icon-tile size-11 rounded-[0.9rem] [&_svg]:size-5" aria-hidden>
                      {look.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display leading-snug font-extrabold text-ink">{it.title}</p>
                      <p className="text-[0.82rem] font-bold text-[var(--tink)]">{PRODUCT_TYPE_LABELS[it.product_type as ProductType]}</p>
                    </div>
                    <Kwd fils={it.unit_price_fils} className="shrink-0 text-[1.05rem] font-extrabold" />
                  </li>
                );
              })}
            </ul>

            <dl className="mt-6 space-y-3 border-t-2 border-dashed border-line-strong pt-5">
              <SumRow label="المجموع">
                <span className="num">{filsToKwdString(order.subtotal_fils)}</span> د.ك
              </SumRow>
              {order.discount_fils ? (
                <SumRow label={`خصم ${order.coupon_code ? `(${order.coupon_code})` : ""}`} tone="success">
                  <span className="num">−{filsToKwdString(order.discount_fils)}</span> د.ك
                </SumRow>
              ) : null}
              <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3">
                <dt className="font-display text-lg font-extrabold text-brand-800">الإجمالي</dt>
                <dd>
                  <Kwd fils={order.total_fils} className="text-[1.8rem] text-brand-800" unitClassName="text-[0.5em]" />
                </dd>
              </div>
              {order.paid_at ? (
                <SumRow label="تاريخ الدفع">
                  <span className="font-sans text-[0.92rem] font-semibold text-ink-soft">{formatDateTime(order.paid_at)}</span>
                </SumRow>
              ) : null}
              {methodName && (settled || payment?.provider === "myfatoorah") ? (
                <SumRow label="وسيلة الدفع">
                  <span className="font-sans text-[0.92rem] font-semibold text-ink-soft" data-testid="receipt-method">
                    {methodName}
                  </span>
                </SumRow>
              ) : null}
              {settled?.gateway_invoice_id ? (
                <SumRow label="رقم الفاتورة">
                  <span className="num text-[0.92rem] font-semibold text-ink-soft" data-testid="receipt-invoice">
                    {settled.gateway_invoice_id}
                  </span>
                </SumRow>
              ) : null}
              {settled?.gateway_payment_id ? (
                <SumRow label="رقم عملية الدفع">
                  <span className="num text-[0.92rem] font-semibold break-all text-ink-soft" data-testid="receipt-payment-id">
                    {settled.gateway_payment_id}
                  </span>
                </SumRow>
              ) : null}
              {refund ? (
                <>
                  <SumRow label="المبلغ المسترد">
                    <span data-testid="receipt-refund-amount">
                      <span className="num">{filsToKwdString(refund.amount_fils)}</span> د.ك
                    </span>
                  </SumRow>
                  <SumRow label="تاريخ الاسترداد">
                    <span className="font-sans text-[0.92rem] font-semibold text-ink-soft" data-testid="receipt-refund-date">
                      {formatDateTime(refund.completed_at ?? refund.accepted_at ?? refund.created_at)}
                    </span>
                  </SumRow>
                  <SumRow label="حالة الاسترداد">
                    <span className="font-sans text-[0.92rem] font-semibold text-ink-soft" data-testid="receipt-refund-state">
                      {REFUND_PUBLIC_STATUS_LABELS[refund.status]}
                    </span>
                  </SumRow>
                </>
              ) : null}
            </dl>
            <div className="mt-7 flex flex-wrap gap-3 no-print">
              <PrintButton />
              <Button asChild variant="outline">
                <Link href="/account">كل طلباتي</Link>
              </Button>
              {unpaid && paymentsOn ? (
                <form action={cancelOrderAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <SubmitButton variant="ghost">إلغاء هذا الطلب</SubmitButton>
                </form>
              ) : null}
            </div>
          </section>

          {order.status === "paid" ? (
            <aside className="panel h-fit p-6 no-print" aria-labelledby="next-title">
              <h2 id="next-title" className="font-display text-[1.35rem] font-black">
                ماذا بعد؟
              </h2>
              <ol className="mt-5 space-y-4">
                <NextStep n={1} tone="grade-7" title="ادخل مكتبتي" text="كل ما اشتريته في مكان واحد، ويفتح من أي جهاز." />
                <NextStep n={2} tone="grade-6" title="ادرس براحتك" text="تكمل الدروس والمذكرات من حيث توقفت." />
                <NextStep n={3} tone="grade-8" title="فاتورتك محفوظة" text="تجدها دائمًا في صفحة «حسابي»." />
              </ol>
              <Button asChild variant="soft" className="mt-6 w-full">
                <Link href="/library">
                  <Library aria-hidden /> مكتبتي
                </Link>
              </Button>
            </aside>
          ) : showHelp ? (
            <aside className="panel h-fit p-6 no-print" aria-labelledby="help-title">
              <span className="icon-tile tone-arabic size-12 rounded-[0.95rem] [&_svg]:size-6" aria-hidden>
                <Headset />
              </span>
              <h2 id="help-title" className="mt-4 font-display text-[1.35rem] font-black">
                تحتاج مساعدة؟
              </h2>
              <p className="mt-2 text-[0.95rem] leading-7 text-ink-soft">
                إذا خُصم المبلغ ولم يتأكد الطلب، تواصل معنا واذكر رقم الطلب <span className="num font-bold text-ink">{order.number}</span>.
              </p>
              <Button asChild variant="outline" className="mt-5 w-full">
                {settings.whatsapp_number ? (
                  <a href={`https://wa.me/${settings.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                    تواصل عبر واتساب
                  </a>
                ) : (
                  <Link href="/contact">تواصل معنا</Link>
                )}
              </Button>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NextStep({ n, tone, title, text }: { n: number; tone: string; title: string; text: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-3", tone)}>
      <span className="num-tile size-11 rounded-[0.85rem] text-[1.3rem]" aria-hidden>
        {ar(n)}
      </span>
      <span className="min-w-0">
        <span className="block font-display font-extrabold text-ink">{title}</span>
        <span className="block text-[0.9rem] leading-7 text-ink-soft">{text}</span>
      </span>
    </li>
  );
}
