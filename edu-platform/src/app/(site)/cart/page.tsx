import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { getCartIds, computeCart } from "@/server/commerce/cart";
import { getCurrentUser } from "@/server/auth/session";
import { removeFromCartAction } from "./actions";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ProductCover } from "@/components/site/product-cover";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";

export const metadata: Metadata = { title: "سلة المشتريات", robots: { index: false } };

export default async function CartPage() {
  const [ids, user] = await Promise.all([getCartIds(), getCurrentUser()]);
  const cart = await computeCart(ids, user?.id ?? null);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "السلة" }]} />
      <h1 className="mt-6 text-[clamp(2.2rem,5vw,3.2rem)]">السلة</h1>
      {cart.lines.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="سلتك فارغة"
          description="اختر صفك ثم المادة، وأضف الشرح أو المذكرة التي تحتاجها."
          action={
            <Button asChild>
              <Link href="/#grades">اختر صفك</Link>
            </Button>
          }
        />
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-12">
          <div className="flex flex-col gap-3">
            {cart.notices.map((n) => (
              <Alert key={n} tone="info">
                {n}
              </Alert>
            ))}
            <ul className="border-t-2 border-ink" data-testid="cart-lines">
              {cart.lines.map((l) => (
                <li key={l.id} className="grid grid-cols-[4.5rem_1fr] gap-4 border-b border-line py-4 sm:grid-cols-[5.5rem_1fr_auto] sm:items-center">
                  <Link href={`/products/${l.slug}`} tabIndex={-1} aria-hidden className="overflow-hidden rounded-md">
                    <ProductCover coverUrl={l.coverUrl} title={l.title} type={l.type} subjectName={l.subjectName} gradeName={l.gradeName} sizes="88px" compact />
                  </Link>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-brand-700">{PRODUCT_TYPE_LABELS[l.type]}</p>
                    <Link href={`/products/${l.slug}`} className="mt-0.5 block leading-7 font-semibold hover:text-brand-700">
                      {l.title}
                    </Link>
                    <p className="text-sm text-muted">{l.gradeName}</p>
                  </div>
                  <div className="col-start-2 flex items-center justify-between gap-4 sm:col-start-3 sm:flex-col sm:items-end sm:gap-1">
                    {l.owned ? (
                      <span className="text-sm font-semibold text-success">في مكتبتك</span>
                    ) : l.coveredByBundleId ? (
                      <span className="text-sm text-muted">ضمن الباقة</span>
                    ) : (
                      <span className="font-bold">
                        <span className="num">{filsToKwdString(l.priceFils)}</span> <span className="text-xs font-semibold text-muted">د.ك</span>
                      </span>
                    )}
                    <form action={removeFromCartAction}>
                      <input type="hidden" name="productId" value={l.id} />
                      <Button variant="ghost" size="sm" type="submit" aria-label={`حذف ${l.title} من السلة`}>
                        <Trash2 aria-hidden /> حذف
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <aside className="h-fit rounded-lg bg-mist p-5 sm:p-6 lg:sticky lg:top-24" aria-labelledby="summary">
            <h2 id="summary" className="text-[1.7rem]">
              ملخص الطلب
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">عدد المنتجات</dt>
                <dd className="num font-semibold">{cart.payableLines.length}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-line-strong pt-3">
                <dt className="font-semibold">الإجمالي</dt>
                <dd className="text-2xl font-bold">
                  <span className="num">{filsToKwdString(cart.subtotalFils)}</span> <span className="text-sm font-semibold text-muted">د.ك</span>
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">كود الخصم في الخطوة التالية.</p>
            {cart.payableLines.length ? (
              <Button asChild size="lg" className="mt-5 w-full">
                <Link href="/checkout" data-testid="go-checkout">
                  {user ? "إتمام الشراء" : "سجّل الدخول وأتمم الشراء"}
                </Link>
              </Button>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
