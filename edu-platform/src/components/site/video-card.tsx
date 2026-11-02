import type { ProductCard } from "@/server/catalog/queries";
import { ProductCard as PosterCard, ProductList } from "./product-card";
import { cn } from "@/lib/utils";

/** بطاقة فيديو: ملصق بنسبة شاشة + النوع + العنوان + الدروس والمدة والمعلم + السعر */
export function VideoCard({ product, owned }: { product: ProductCard; owned?: boolean }) {
  return <PosterCard product={product} owned={owned} />;
}

/**
 * عرض منتجات الفيديو:
 *  - scroller: رف أفقي قابل للسحب على الجوال، وشبكة ملصقات على الشاشات الأكبر
 *  - وإلا: قائمة صفوف (الأسرع للقراءة والمقارنة)
 */
export function VideoGrid({ products, ownedIds, scroller }: { products: ProductCard[]; ownedIds?: Set<string>; scroller?: boolean }) {
  if (!scroller) return <ProductList products={products} ownedIds={ownedIds} columns={2} />;
  return (
    <div className={cn("-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2", "sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-4")}>
      {products.map((p) => (
        <div key={p.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
          <VideoCard product={p} owned={ownedIds?.has(p.id)} />
        </div>
      ))}
    </div>
  );
}
