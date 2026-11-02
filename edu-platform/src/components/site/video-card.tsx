import Image from "next/image";
import Link from "next/link";
import { Clock, Gift, PlayCircle } from "lucide-react";
import type { ProductCard } from "@/server/catalog/queries";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { ProductCover } from "./product-cover";
import { formatTotalDuration, lessonsLabel } from "./format";

/** بطاقة منتج فيديو: صورة مصغرة بنسبة 16:9 مع شارة تشغيل ومدة وعدد الدروس والمعلم */
export function VideoCard({ product, owned }: { product: ProductCard; owned?: boolean }) {
  return (
    <article data-testid="video-card" className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-lift">
      <div className="relative aspect-video overflow-hidden bg-brand-900">
        {product.thumbnailUrl ? (
          <Image src={product.thumbnailUrl} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="absolute inset-0 [&>div]:!aspect-auto [&>div]:h-full" aria-hidden>
            <ProductCover coverUrl={null} title={product.title} type={product.type} subjectName={product.subjectName} gradeName={product.gradeName} compact />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" aria-hidden />
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className="grid size-12 place-items-center rounded-full bg-white/90 text-brand-700 shadow-lift transition-transform group-hover:scale-110">
            <PlayCircle className="size-7" />
          </span>
        </span>
        <div className="absolute start-2 top-2 flex gap-1">
          <Badge tone="solid" className="bg-black/55 backdrop-blur-sm">
            {PRODUCT_TYPE_LABELS[product.type]}
          </Badge>
        </div>
        <div className="absolute end-2 top-2 flex flex-col items-end gap-1">
          {owned ? <Badge tone="success">في مكتبتك</Badge> : null}
          {product.previewLessonId && !owned ? (
            <Badge tone="accent">
              <Gift className="size-3" aria-hidden /> معاينة مجانية
            </Badge>
          ) : null}
        </div>
        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between text-[0.72rem] font-semibold text-white">
          <span>{product.lessonCount ? lessonsLabel(product.lessonCount) : ""}</span>
          {product.totalDurationSeconds ? (
            <span className="flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5">
              <Clock className="size-3" aria-hidden /> {formatTotalDuration(product.totalDurationSeconds)}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5 sm:p-4">
        <p className="text-xs font-semibold text-brand-700">
          {product.subjectName ?? "عدة مواد"} · {product.gradeName}
        </p>
        <h3 className="line-clamp-2 text-[0.95rem] leading-6 font-bold">
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {product.title}
          </Link>
        </h3>
        {product.teacherName ? <p className="text-xs text-muted">{product.teacherName}</p> : null}
        <div className="mt-auto pt-1">
          <Price fils={product.priceFils} compareAt={product.compareAtPriceFils} size="sm" />
        </div>
      </div>
    </article>
  );
}

export function VideoGrid({ products, ownedIds }: { products: ProductCard[]; ownedIds?: Set<string> }) {
  return (
    <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      {products.map((p) => (
        <VideoCard key={p.id} product={p} owned={ownedIds?.has(p.id)} />
      ))}
    </div>
  );
}
