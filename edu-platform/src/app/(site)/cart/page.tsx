import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart, Trash2 } from "lucide-react";
import { getCartIds, computeCart } from "@/server/commerce/cart";
import { getCurrentUser } from "@/server/auth/session";
import { removeFromCartAction } from "./actions";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { ProductCover } from "@/components/site/product-cover";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";

export const metadata: Metadata = { title: "سلة المشتريات", robots: { index: false } };

export default async function CartPage() {
  const [ids, user] = await Promise.all([getCartIds(), getCurrentUser()]);
  const cart = await computeCart(ids, user?.id ?? null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Breadcrumbs items={[{ label: "الرئيسية", href: "/" }, { label: "السلة" }]} />
      <h1 className="mt-4 text-3xl font-bold">سلة المشتريات</h1>
      {cart.lines.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<ShoppingCart />}
          title="سلتك فارغة"
          description="تصفح المذكرات حسب صفك وأضف ما تحتاجه."
          action={
            <Button asChild>
              <Link href="/#grades">تصفح المذكرات</Link>
            </Button>
          }
        />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-3">
            {cart.notices.map((n) => (
              <Alert key={n} tone="info">
                {n}
              </Alert>
            ))}
            <ul className="flex flex-col gap-3" data-testid="cart-lines">
              {cart.lines.map((l) => (
                <li key={l.id} className="flex gap-4 rounded-2xl border border-line bg-surface p-3 shadow-card">
                  <Link href={`/products/${l.slug}`} className="w-20 shrink-0 overflow-hidden rounded-xl sm:w-24">
                    <ProductCover coverUrl={l.coverUrl} title={l.title} type={l.type} subjectName={l.subjectName} gradeName={l.gradeName} sizes="96px" compact />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-xs font-semibold text-brand-700">
                      {PRODUCT_TYPE_LABELS[l.type]} · {l.gradeName}
                    </p>
                    <Link href={`/products/${l.slug}`} className="leading-6 font-bold hover:text-brand-700">
                      {l.title}
                    </Link>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      {l.owned ? <Badge tone="success">في مكتبتك</Badge> : l.coveredByBundleId ? <Badge tone="neutral">ضمن الباقة</Badge> : <Price fils={l.priceFils} size="sm" />}
                      <form action={removeFromCartAction}>
                        <input type="hidden" name="productId" value={l.id} />
                        <Button variant="ghost" size="sm" type="submit" aria-label={`حذف ${l.title} من السلة`}>
                          <Trash2 aria-hidden /> حذف
                        </Button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <aside className="h-fit rounded-2xl border border-line bg-surface p-5 shadow-card lg:sticky lg:top-24">
            <h2 className="text-lg font-bold">ملخص الطلب</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">عدد المنتجات</dt>
                <dd className="num font-semibold">{cart.payableLines.length}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base">
                <dt className="font-bold">الإجمالي</dt>
                <dd className="font-bold">
                  <span className="num">{filsToKwdString(cart.subtotalFils)}</span> د.ك
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">يمكنك إضافة كود الخصم في الخطوة التالية.</p>
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
