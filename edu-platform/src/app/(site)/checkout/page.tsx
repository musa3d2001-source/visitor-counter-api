import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { computeCart, getCartIds } from "@/server/commerce/cart";
import { evaluateCoupon } from "@/server/commerce/coupons";
import { getPaymentMethods, paymentsConfig, type PaymentMethodOption } from "@/server/payments/service";
import { getSettings } from "@/server/platform/settings";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { filsToKwdString } from "@/lib/money";
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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Breadcrumbs items={[{ label: "السلة", href: "/cart" }, { label: "إتمام الشراء" }]} />
      <h1 className="mt-4 text-3xl font-bold">إتمام الشراء</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-bold">بيانات المشتري</h2>
            <p className="mt-2 text-sm text-ink-soft">
              {user.fullName} — <span dir="ltr">{user.email}</span>
            </p>
            <p className="mt-1 text-xs text-muted">ستُضاف المشتريات إلى مكتبة هذا الحساب.</p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-bold">كود الخصم</h2>
            <form method="get" className="mt-3 flex gap-2">
              <Input name="coupon" defaultValue={couponCode} placeholder="أدخل الكود" dir="ltr" className="flex-1 uppercase" aria-label="كود الخصم" />
              <Button type="submit" variant="outline">
                تطبيق
              </Button>
            </form>
            {coupon && !coupon.ok ? <p className="mt-2 text-sm text-danger" role="alert">{coupon.error}</p> : null}
            {coupon?.ok ? <p className="mt-2 text-sm text-success" role="status">تم تطبيق الخصم بنجاح.</p> : null}
          </section>

          {total > 0 && !cfg.enabled ? (
            <Alert tone="warning" title="الدفع الإلكتروني غير متاح حاليًا">
              {cfg.reason}.{" "}
              {settings.whatsapp_number ? (
                <a href={`https://wa.me/${settings.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                  تواصل معنا عبر واتساب
                </a>
              ) : (
                <Link href="/contact">تواصل معنا</Link>
              )}{" "}
              لإتمام طلبك.
            </Alert>
          ) : null}
          {methodsError ? <Alert tone="warning">تعذر تحميل وسائل الدفع، سيتم عرض كل الوسائل المتاحة في صفحة الدفع.</Alert> : null}

          <CheckoutForm
            coupon={coupon?.ok ? couponCode : ""}
            total={total}
            methods={methods}
            disabled={total > 0 && !cfg.enabled}
            sandbox={cfg.enabled && cfg.environment === "sandbox"}
          />
        </div>

        <aside className="h-fit rounded-2xl border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
          <h2 className="text-lg font-bold">ملخص الطلب</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {cart.payableLines.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span className="text-ink-soft">{l.title}</span>
                <span className="num shrink-0 font-semibold">{filsToKwdString(l.priceFils)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">المجموع</dt>
              <dd className="num">{filsToKwdString(cart.subtotalFils)} د.ك</dd>
            </div>
            {discount ? (
              <div className="flex justify-between text-success">
                <dt>الخصم</dt>
                <dd className="num">−{filsToKwdString(discount)} د.ك</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-line pt-3 text-base font-bold">
              <dt>الإجمالي</dt>
              <dd data-testid="checkout-total">
                <span className="num">{filsToKwdString(total)}</span> د.ك
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
