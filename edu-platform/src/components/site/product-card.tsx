import Link from "next/link";
import { Eye, PlayCircle } from "lucide-react";
import { formatTotalDuration, lessonsLabel } from "./format";
import type { ProductCard as ProductCardData } from "@/server/catalog/queries";
import { PRODUCT_TYPE_LABELS, termLabel } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { ProductCover } from "./product-cover";

export function ProductCard({ product, owned }: { product: ProductCardData; owned?: boolean }) {
  const discount =
    product.compareAtPriceFils && product.compareAtPriceFils > product.priceFils
      ? Math.round(100 - (product.priceFils / product.compareAtPriceFils) * 100)
      : 0;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-lift">
      <div className="relative">
        <ProductCover
          coverUrl={product.coverUrl ?? (product.isVideo ? product.thumbnailUrl : null)}
          title={product.title}
          type={product.type}
          subjectName={product.subjectName}
          gradeName={product.gradeName}
          className="transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute end-2 top-2 flex flex-col items-end gap-1">
          {discount > 0 ? <Badge tone="accent">خصم {discount}%</Badge> : null}
          {owned ? <Badge tone="success">في مكتبتك</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <p className="text-xs font-semibold text-brand-700">
          {PRODUCT_TYPE_LABELS[product.type]} · {termLabel(product.term).replace("الفصل الدراسي ", "الفصل ")}
        </p>
        <h3 className="line-clamp-2 text-[0.95rem] leading-6 font-bold">
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {product.title}
          </Link>
        </h3>
        {product.teacherName ? <p className="-mt-1 text-xs text-muted">{product.teacherName}</p> : null}
        {product.isVideo && product.lessonCount ? (
          <p className="flex items-center gap-1 text-xs font-semibold text-ink-soft">
            <PlayCircle className="size-3.5 text-brand-600" aria-hidden /> {lessonsLabel(product.lessonCount)}
            {product.totalDurationSeconds ? <> · {formatTotalDuration(product.totalDurationSeconds)}</> : null}
          </p>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="sm" />
          {product.hasPreview || product.previewLessonId ? (
            <span className="flex items-center gap-1 text-xs text-muted">
              <Eye className="size-3.5" aria-hidden /> معاينة
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, ownedIds }: { products: ProductCardData[]; ownedIds?: Set<string> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} owned={ownedIds?.has(p.id)} />
      ))}
    </div>
  );
}
