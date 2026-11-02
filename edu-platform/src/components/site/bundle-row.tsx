import Link from "next/link";
import type { ProductCard } from "@/server/catalog/queries";
import { filsToKwdString } from "@/lib/money";
import { productMeta } from "./product-card";

/** صف باقة: العنوان والوصف، والسعر مع الوفر الفعلي (الفرق عن السعر قبل الخصم فقط إن وُجد) */
export function BundleRow({ b, owned, showGrade = true }: { b: ProductCard; owned?: boolean; showGrade?: boolean }) {
  const saving = b.compareAtPriceFils && b.compareAtPriceFils > b.priceFils ? b.compareAtPriceFils - b.priceFils : 0;
  return (
    <Link
      href={`/products/${b.slug}`}
      data-testid="bundle-row"
      className="grid gap-4 rounded-lg bg-mist p-5 transition-colors hover:bg-brand-50 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"
    >
      <span>
        <span className="block text-[1.1rem] leading-7 font-semibold">{b.title}</span>
        <span className="mt-1 block text-sm leading-6 text-muted">{b.summary || productMeta(b, { grade: showGrade })}</span>
      </span>
      <span className="sm:text-end">
        {owned ? (
          <span className="font-semibold text-success">في مكتبتك</span>
        ) : (
          <>
            <span className="block text-xl font-bold">
              <span className="num">{filsToKwdString(b.priceFils)}</span> <span className="text-sm font-semibold text-muted">د.ك</span>
            </span>
            {saving ? (
              <span className="text-sm text-brand-800">
                توفّر <span className="num">{filsToKwdString(saving)}</span> د.ك
              </span>
            ) : null}
          </>
        )}
      </span>
    </Link>
  );
}
