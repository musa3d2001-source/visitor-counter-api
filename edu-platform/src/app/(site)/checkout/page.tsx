import type { Metadata } from "next";
import type * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Lock, Package, Ticket, Wallet } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { computeCart, getCartIds } from "@/server/commerce/cart";
import { evaluateCoupon } from "@/server/commerce/coupons";
import { getPaymentMethods, paymentsConfig, type PaymentMethodOption } from "@/server/payments/service";
import { getSettings } from "@/server/platform/settings";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { PageHeader, StatPill } from "@/components/ui/page-header";
import { PaymentUnavailableNotice } from "@/components/site/payment-unavailable-notice";
import { ProductCover } from "@/components/site/product-cover";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { ar, count, initial, savings, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { Kwd, SumRow, TiltedPosters, pillParts } from "../cart/_components/commerce";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "إتمام الشراء", robots: { index: false } };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ coupon?: string }> }) {
  const user = await requireUser("/checkout");
  const sp = await searchParams;
  const cart = await computeCart(await getCartIds(), user.id);
  if (cart.payableLines.length === 0) redirect("/cart");

  const couponCode = (sp.coupon ?? "").trim().slice(0, 32);
  const coupon = couponCode ? await evaluateCoupon(couponCode, user.id, cart.subtotalFils) : null;
  const discount = coupon?.ok ? coupon.discountFils : 0;
  const total = cart.subtotalFils - discount;
  // التوفير الحقيقي فقط (السعر قبل الخصم أعلى من الحالي)، بنفس حساب السلة
  const saved = cart.payableLines.reduce((sum, l) => sum + (savings(l.priceFils, l.compareAtPriceFils)?.fils ?? 0), 0);
  const cfg = paymentsConfig();
  const settings = await getSettings();

  let methods: PaymentMethodOption[] = [];
  let methodsError = false;
  if (cfg.enabled && total > 0) {
    try {
      methods = await getPaymentMethods(total);
    } catch (err) {
      console.error("[checkout] InitiatePayment failed", err);
      methodsError = true;
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "السلة", href: "/cart" }, { label: "إتمام الشراء" }]}
        eyebrow={{ icon: <Lock />, label: total > 0 ? (cfg.enabled ? "دفع آمن" : "الدفع غير متاح حاليًا") : "طلب مجاني", tone: "teal" }}
        title="إتمام الشراء"
        sub={total > 0 ? (cfg.enabled ? "ثلاث خطوات قصيرة، ثم ننقلك إلى صفحة الدفع الآمنة لإتمام العملية." : "يمكنك مراجعة طلبك هنا، لكن الدفع الإلكتروني متوقف في الوقت الحالي.") : "ثلاث خطوات قصيرة، ويُضاف المحتوى إلى مكتبتك مباشرة."}
        aside={
          <TiltedPosters
            items={cart.payableLines.map((l) => ({ key: l.id, title: l.title, type: l.type, subjectName: l.subjectName, subjectSlug: l.subjectSlug, gradeName: l.gradeName, coverUrl: l.coverUrl }))}
            coin={{ label: "الإجمالي", value: filsToKwdString(total), unit: "د.ك" }}
          />
        }
      >
        <div className="flex flex-wrap gap-3">
          <StatPill icon={<Package />} tone="teal" {...pillParts(cart.payableLines.length, W.product)} />
          <StatPill icon={<Wallet />} tone="gold" num={<span className="num">{filsToKwdString(total)}</span>} label="د.ك" />
        </div>
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
          {/* الملخص أولًا في الترتيب: على الجوال يرى الطالب ما يشتريه قبل الخطوات وزر الدفع، وعلى الحاسوب يبقى عمودًا جانبيًا ثابتًا */}
          <aside className="panel panel-rainbow h-fit p-5 pt-8 sm:p-7 sm:pt-10 lg:sticky lg:top-28 lg:order-last" aria-labelledby="summary">
            <div className="flex items-center justify-between gap-3">
              <h2 id="summary" className="font-display text-[1.6rem] font-black">
                ملخص الطلب
              </h2>
              <span className="chip chip-mint">{count(cart.payableLines.length, W.product)}</span>
            </div>
            <ul className="mt-5 space-y-3">
              {cart.payableLines.map((l) => (
                <li key={l.id} className="flex items-center gap-3">
                  <ProductCover coverUrl={l.coverUrl} title={l.title} type={l.type} subjectName={l.subjectName} subjectSlug={l.subjectSlug} gradeName={l.gradeName} sizes="52px" compact className="size-13 shrink-0 rounded-[0.9rem]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.95rem] leading-6 font-bold text-ink">{l.title}</span>
                    <span className="block text-[0.8rem] text-muted">{PRODUCT_TYPE_LABELS[l.type]}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end leading-tight">
                    <Kwd fils={l.priceFils} className="text-[1rem] text-ink" />
                    {savings(l.priceFils, l.compareAtPriceFils) ? (
                      <s className="text-[0.8rem] font-bold text-muted">
                        <span className="num">{filsToKwdString(l.compareAtPriceFils!)}</span>
                      </s>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-3 border-t-2 border-dashed border-line-strong pt-5">
              {saved > 0 ? (
                <>
                  {/* السعر قبل الخصم − التوفير (− كود الخصم) = الإجمالي، كما في السلة */}
                  <SumRow label="السعر قبل الخصم">
                    <span className="text-muted">
                      <s className="num decoration-2">{filsToKwdString(cart.subtotalFils + saved)}</s> د.ك
                    </span>
                  </SumRow>
                  <SumRow label="وفّرت من الخصومات" tone="success">
                    <span className="num">−{filsToKwdString(saved)}</span> د.ك
                  </SumRow>
                </>
              ) : (
                <SumRow label="المجموع">
                  <span className="num">{filsToKwdString(cart.subtotalFils)}</span> د.ك
                </SumRow>
              )}
              {discount ? (
                <SumRow label={`الخصم${coupon?.ok ? ` (${couponCode.toUpperCase()})` : ""}`} tone="success">
                  <span className="num">−{filsToKwdString(discount)}</span> د.ك
                </SumRow>
              ) : null}
              <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-3">
                <dt className="font-display text-lg font-extrabold text-brand-800">الإجمالي</dt>
                <dd data-testid="checkout-total">
                  <Kwd fils={total} className="text-[2rem] text-brand-800" unitClassName="text-[0.5em]" />
                </dd>
              </div>
            </dl>
            <Link href="/cart" className="btn btn-ghost btn-sm mt-4 text-brand-800">
              <ArrowRight aria-hidden /> تعديل السلة
            </Link>
          </aside>
          <ol className="flex min-w-0 flex-col gap-6">
            <CheckoutStep n={1} title="الحساب" tone="grade-7">
              <div className="flex items-center gap-3.5">
                <span className="grid size-13 shrink-0 place-items-center rounded-full bg-linear-to-br from-brand-400 to-brand-600 font-display text-[1.4rem] font-black text-white shadow-[0_4px_0_var(--brand-edge)]" aria-hidden>
                  {initial(user.fullName)}
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[1.08rem] font-extrabold text-ink">{user.fullName}</p>
                  <p className="truncate text-[0.95rem] text-ink-soft" dir="ltr">
                    {user.email}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[0.92rem] text-muted">تُضاف المشتريات إلى مكتبة هذا الحساب.</p>
            </CheckoutStep>

            <CheckoutStep n={2} title="كود الخصم" tone="grade-6">
              <form method="get" className="flex max-w-lg gap-2.5">
                <div className="relative min-w-0 flex-1">
                  <Ticket className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-accent-800" aria-hidden />
                  <Input name="coupon" defaultValue={couponCode} placeholder="أدخل الكود" dir="ltr" className="w-full pe-11 uppercase" aria-label="كود الخصم" />
                </div>
                <Button type="submit" variant="accent">
                  تطبيق
                </Button>
              </form>
              {coupon && !coupon.ok ? (
                <p className="mt-3 inline-flex rounded-full bg-danger-50 px-3.5 py-1.5 text-[0.92rem] font-semibold text-danger" role="alert">
                  {coupon.error}
                </p>
              ) : null}
              {coupon?.ok ? (
                <p className="mt-3 inline-flex rounded-full bg-success-50 px-3.5 py-1.5 text-[0.92rem] font-semibold text-success" role="status">
                  تم تطبيق الخصم بنجاح.
                </p>
              ) : null}
            </CheckoutStep>

            <CheckoutStep n={3} title={total > 0 ? "الدفع" : "التأكيد"} tone="grade-8">
              <div className="flex flex-col gap-4">
                {total > 0 && !cfg.enabled ? <PaymentUnavailableNotice settings={settings} /> : null}
                {methodsError ? <Alert tone="warning">تعذر تحميل وسائل الدفع، وستظهر كل الوسائل المتاحة في صفحة الدفع.</Alert> : null}
                <CheckoutForm
                  coupon={coupon?.ok ? couponCode : ""}
                  total={total}
                  methods={methods}
                  disabled={total > 0 && !cfg.enabled}
                  sandbox={cfg.enabled && cfg.environment === "sandbox"}
                />
              </div>
            </CheckoutStep>
          </ol>

        </div>
      </div>
    </>
  );
}

/** خطوات الشراء متسلسلة فعلًا، لذا الترقيم هنا معلومة لا زينة (رقم عربي في مربع ملون) */
function CheckoutStep({ n, title, tone, children }: { n: number; title: string; tone: string; children: React.ReactNode }) {
  return (
    <li className={cn("tile-3d p-5 sm:p-7", tone)}>
      <div className="flex items-center gap-3.5">
        <span className="num-tile shadow-[inset_0_-3px_0_rgb(0_0_0/0.12),0_8px_16px_-8px_var(--d)]" aria-hidden>
          {ar(n)}
        </span>
        <h2 className="font-display text-[1.45rem] leading-tight font-black sm:text-[1.6rem]">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </li>
  );
}
