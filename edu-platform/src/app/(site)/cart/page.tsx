import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Package, ShoppingCart, Ticket, Trash2, Wallet } from "lucide-react";
import { getCartIds, computeCart } from "@/server/commerce/cart";
import { getCurrentUser } from "@/server/auth/session";
import { removeFromCartAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageHeader, StatPill } from "@/components/ui/page-header";
import { ProductCover } from "@/components/site/product-cover";
import { listGrades } from "@/server/catalog/queries";
import { CompactPrice, Kicker, contentChips, shortTerm } from "@/components/site/card-parts";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { ar, count, savings, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { EmptyStart, Kwd, OwnedNote, SumRow, TiltedPosters, TrustList, pillParts } from "./_components/commerce";

export const metadata: Metadata = { title: "سلة المشتريات", robots: { index: false } };

export default async function CartPage() {
  const [ids, user] = await Promise.all([getCartIds(), getCurrentUser()]);
  const cart = await computeCart(ids, user?.id ?? null);
  const empty = cart.lines.length === 0;
  const grades = empty ? await listGrades() : [];
  // التوفير الحقيقي فقط: الفرق بين السعر قبل الخصم والسعر الحالي حين يكون أعلى منه
  const saved = cart.payableLines.reduce((sum, l) => sum + (savings(l.priceFils, l.compareAtPriceFils)?.fils ?? 0), 0);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "الرئيسية", href: "/" }, { label: "السلة" }]}
        eyebrow={{ icon: <ShoppingCart />, label: "سلة المشتريات", tone: "gold" }}
        title="السلة"
        sub={
          empty
            ? "كل ما تضيفه من شروحات ومذكرات يظهر هنا قبل الدفع."
            : "راجع اختياراتك ثم أكمل الشراء. يظهر كل شيء في مكتبتك فور تأكيد الدفع."
        }
        aside={
          empty ? undefined : (
            <TiltedPosters
              items={cart.lines.map((l) => ({ key: l.id, title: l.title, type: l.type, subjectName: l.subjectName, subjectSlug: l.subjectSlug, gradeName: l.gradeName, coverUrl: l.coverUrl }))}
              coin={cart.payableLines.length ? { label: "المجموع", value: filsToKwdString(cart.subtotalFils), unit: "د.ك" } : undefined}
            />
          )
        }
      >
        {empty ? null : (
          <div className="flex flex-wrap gap-3">
            <StatPill icon={<Package />} tone="teal" {...pillParts(cart.lines.length, W.product)} />
            {cart.payableLines.length ? <StatPill icon={<Wallet />} tone="gold" num={<span className="num">{filsToKwdString(cart.subtotalFils)}</span>} label="د.ك" /> : null}
          </div>
        )}
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        {empty ? (
          <EmptyStart
            art="cart"
            title="سلتك فارغة"
            description="اختر صفك ثم المادة، وأضف الشرح أو المذكرة التي تحتاجها."
            grades={grades}
            actions={
              <>
                <Button asChild size="lg">
                  <Link href="/#grades">
                    اختر صفك <ArrowLeft aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/bundles">تصفح الباقات</Link>
                </Button>
              </>
            }
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
            <section aria-labelledby="cart-items" className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="cart-items" className="font-display text-[1.6rem] font-black sm:text-[1.9rem]">
                  في سلتك <span className="text-hl">{count(cart.lines.length, W.product)}</span>
                </h2>
                <Link href="/#grades" className="btn btn-ghost btn-sm text-brand-800">
                  أضف المزيد <ArrowLeft aria-hidden />
                </Link>
              </div>
              {cart.notices.map((n) => (
                <Alert key={n} tone="info">
                  {n}
                </Alert>
              ))}
              <ul className="flex flex-col gap-5" data-testid="cart-lines">
                {cart.lines.map((l) => {
                  const chips = contentChips(l);
                  const meta = [l.subjectName, l.gradeName, shortTerm(l.term)].filter(Boolean).join(" · ");
                  return (
                    <li key={l.id} className={cn("tile-3d p-3 sm:p-4", toneClass(l.subjectSlug))}>
                      <div className="flex items-start gap-3.5 sm:items-center sm:gap-5">
                        <Link href={`/products/${l.slug}`} tabIndex={-1} aria-hidden className="shrink-0">
                          <ProductCover coverUrl={l.coverUrl} title={l.title} type={l.type} subjectName={l.subjectName} subjectSlug={l.subjectSlug} gradeName={l.gradeName} sizes="96px" compact className="size-[4.75rem] rounded-[1.1rem] sm:size-24 sm:rounded-[1.3rem]" />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <span className="chip">{PRODUCT_TYPE_LABELS[l.type]}</span>
                          <Link href={`/products/${l.slug}`} className="mt-1.5 block font-display text-[1.08rem] leading-snug font-extrabold text-ink hover:text-[var(--tink)] sm:text-[1.18rem]">
                            {l.title}
                          </Link>
                          <Kicker className="mt-1">{meta}</Kicker>
                          {l.teacherName ? <p className="mt-0.5 text-[0.88rem] text-muted">{l.teacherName}</p> : null}
                          {chips.length ? <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex">{chips}</div> : null}
                        </div>
                        <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
                          <LinePrice owned={l.owned} covered={!!l.coveredByBundleId} fils={l.priceFils} compareAt={l.compareAtPriceFils} />
                          <RemoveButton id={l.id} title={l.title} />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-dashed border-[var(--soft)] pt-3 sm:hidden">
                        <LinePrice owned={l.owned} covered={!!l.coveredByBundleId} fils={l.priceFils} compareAt={l.compareAtPriceFils} />
                        <RemoveButton id={l.id} title={l.title} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <aside className="panel panel-rainbow h-fit p-6 pt-9 sm:p-7 sm:pt-10 lg:sticky lg:top-28" aria-labelledby="summary">
              <h2 id="summary" className="font-display text-[1.6rem] font-black">
                ملخص الطلب
              </h2>
              <dl className="mt-5 space-y-3">
                <SumRow label="عدد المنتجات">{ar(cart.payableLines.length)}</SumRow>
                <SumRow label="المجموع">
                  <Kwd fils={cart.subtotalFils} className="font-extrabold" />
                </SumRow>
                {saved > 0 ? (
                  <SumRow label="وفّرت من الخصومات" tone="success">
                    <span className="num">{filsToKwdString(saved)}</span> د.ك
                  </SumRow>
                ) : null}
                <div className="flex items-baseline justify-between gap-3 border-t-2 border-dashed border-line-strong pt-4">
                  <dt className="font-display text-lg font-extrabold">الإجمالي</dt>
                  <dd>
                    <Kwd fils={cart.subtotalFils} className="text-[2rem] text-brand-800" unitClassName="text-[0.5em]" />
                  </dd>
                </div>
              </dl>
              <p className="mt-3 flex items-center gap-2 rounded-2xl bg-accent-100 px-3.5 py-2.5 text-[0.9rem] font-semibold text-accent-900">
                <Ticket className="size-4 shrink-0" aria-hidden />
                كود الخصم في الخطوة التالية.
              </p>
              {cart.payableLines.length ? (
                <Button asChild size="xl" className="mt-6 w-full">
                  <Link href="/checkout" data-testid="go-checkout">
                    {user ? "إتمام الشراء" : "سجّل الدخول وأتمم الشراء"}
                    <ArrowLeft aria-hidden />
                  </Link>
                </Button>
              ) : null}
              <TrustList className="mt-6 border-t border-line pt-5" />
            </aside>
          </div>
        )}
      </div>
    </>
  );
}

function LinePrice({ owned, covered, fils, compareAt }: { owned: boolean; covered: boolean; fils: number; compareAt: number | null }) {
  if (owned) return <OwnedNote>في مكتبتك</OwnedNote>;
  if (covered) return <span className="chip chip-mint">ضمن الباقة</span>;
  return <CompactPrice fils={fils} compareAt={compareAt} />;
}

function RemoveButton({ id, title }: { id: string; title: string }) {
  return (
    <form action={removeFromCartAction}>
      <input type="hidden" name="productId" value={id} />
      <Button variant="danger-outline" size="sm" type="submit" aria-label={`حذف ${title} من السلة`}>
        <Trash2 aria-hidden /> حذف
      </Button>
    </form>
  );
}
