import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";
import type { ProductCard as ProductCardData } from "@/server/catalog/queries";
import { PRODUCT_TYPE_LABELS, termLabel } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProductCover } from "./product-cover";
import { formatTotalDuration, lessonsLabel } from "./format";

/** سطر وصفي مختصر: المعلم، المدة/الدروس أو الصفحات، الفصل — بفواصل عربية */
export function productMeta(p: ProductCardData, opts: { teacher?: boolean; grade?: boolean } = {}): string {
  const parts: string[] = [];
  if (opts.teacher !== false && p.teacherName) parts.push(p.teacherName);
  if (opts.grade) parts.push(p.gradeName);
  if (p.isVideo && p.lessonCount) parts.push(`${lessonsLabel(p.lessonCount)}${p.totalDurationSeconds ? ` في ${formatTotalDuration(p.totalDurationSeconds)}` : ""}`);
  else if (p.pageCount) parts.push(`${p.pageCount} صفحة`);
  if (p.term) parts.push(termLabel(p.term).replace("الفصل الدراسي ", "الفصل "));
  return parts.join("، ");
}

function PriceInline({ p }: { p: ProductCardData }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-[1.05rem] font-bold text-ink">
        {p.priceFils === 0 ? "مجانًا" : (
          <>
            <span className="num">{filsToKwdString(p.priceFils)}</span> <span className="text-xs font-semibold text-muted">د.ك</span>
          </>
        )}
      </span>
      {p.compareAtPriceFils && p.compareAtPriceFils > p.priceFils ? (
        <span className="ms-2 text-xs text-muted line-through decoration-muted/60">
          <span className="sr-only">السعر قبل الخصم </span>
          <span className="num">{filsToKwdString(p.compareAtPriceFils)}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * صف «جدول الحصص»: ملصق صغير، النوع، العنوان، سطر وصفي، السعر، والمعاينة.
 * الرابط الرئيسي على العنوان؛ زر المعاينة مستقل (لا روابط متداخلة).
 */
export function ProductRow({ product: p, owned, showGrade, showTeacher = true, wide }: { product: ProductCardData; owned?: boolean; showGrade?: boolean; showTeacher?: boolean; wide?: boolean }) {
  const thumb = p.thumbnailUrl ?? p.coverUrl;
  const meta = productMeta(p, { teacher: showTeacher, grade: showGrade });
  return (
    <article
      data-testid={p.isVideo ? "video-card" : "product-row"}
      className={cn(
        "group relative grid grid-cols-[5.5rem_1fr] items-start gap-x-4 gap-y-2 py-4 sm:grid-cols-[8.5rem_1fr_auto] sm:items-center",
        wide && "lg:grid-cols-[8.5rem_minmax(0,1fr)_16rem_auto] lg:gap-x-8",
      )}
    >
      <span className="relative block overflow-hidden rounded-md" aria-hidden>
        {thumb ? (
          <span className="relative block aspect-[16/10] bg-mist">
            <Image src={thumb} alt="" fill sizes="136px" className="object-cover" />
          </span>
        ) : (
          <ProductCover coverUrl={null} title={p.title} type={p.type} subjectName={p.subjectName} gradeName={p.gradeName} compact wide />
        )}
        {p.isVideo ? (
          <span className="absolute end-1.5 bottom-1.5 grid size-6 place-items-center rounded-full bg-white text-ink">
            <Play className="size-3 fill-current" />
          </span>
        ) : null}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-brand-700">{PRODUCT_TYPE_LABELS[p.type]}</p>
        <h3 className="mt-0.5 text-[1rem] leading-7 font-semibold">
          {/* الرابط يغطي الصف كاملًا (مساحة لمس كبيرة)، وزر المعاينة فوقه بطبقة مستقلة */}
          <Link href={`/products/${p.slug}`} className="after:absolute after:inset-0 group-hover:text-brand-700 group-hover:underline group-hover:decoration-brand-300 group-hover:underline-offset-4">
            {p.title}
          </Link>
        </h3>
        {meta ? <p className={cn("mt-0.5 text-sm leading-6 text-muted", wide && "lg:hidden")}>{meta}</p> : null}
      </div>
      {wide && meta ? <p className="hidden text-sm leading-6 text-muted lg:block">{meta}</p> : null}
      <div className={cn("col-start-2 flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-start-3 sm:justify-end", wide && "lg:col-start-4")}>
        {owned ? <span className="text-sm font-semibold text-success">في مكتبتك</span> : <PriceInline p={p} />}
        {p.previewLessonId && !owned ? (
          <Link
            href={`/watch/${p.id}?lesson=${p.previewLessonId}`}
            className="relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink-soft transition-colors hover:border-brand-500 hover:text-brand-700"
          >
            <Play className="size-3.5" aria-hidden /> معاينة مجانية
          </Link>
        ) : null}
      </div>
    </article>
  );
}

/** قائمة صفوف بخطوط فاصلة — بديل شبكات البطاقات المتطابقة */
export function ProductList({ products, ownedIds, columns = 1, showGrade, showTeacher }: { products: ProductCardData[]; ownedIds?: Set<string>; columns?: 1 | 2; showGrade?: boolean; showTeacher?: boolean }) {
  return (
    <ul className={cn("border-t border-line", columns === 2 && "lg:grid lg:grid-cols-2 lg:gap-x-12")}>
      {products.map((p) => (
        <li key={p.id} className="border-b border-line">
          <ProductRow product={p} owned={ownedIds?.has(p.id)} showGrade={showGrade} showTeacher={showTeacher} wide={columns === 1} />
        </li>
      ))}
    </ul>
  );
}

/** بطاقة ملصق (للرفوف الأفقية ومحتويات الباقات) */
export function ProductCard({ product: p, owned }: { product: ProductCardData; owned?: boolean }) {
  const thumb = p.thumbnailUrl ?? p.coverUrl;
  return (
    <article data-testid={p.isVideo ? "video-card" : undefined} className="group relative flex flex-col">
      <div className="overflow-hidden rounded-md">
        {thumb ? (
          <span className={cn("relative block bg-mist", p.isVideo ? "aspect-[16/10]" : "aspect-[4/5]")}>
            <Image src={thumb} alt="" fill sizes="(max-width: 640px) 70vw, 25vw" className="object-cover" />
          </span>
        ) : (
          <ProductCover coverUrl={null} title={p.title} type={p.type} subjectName={p.subjectName} gradeName={p.gradeName} wide={p.isVideo} />
        )}
      </div>
      <p className="mt-3 text-xs font-semibold text-brand-700">{PRODUCT_TYPE_LABELS[p.type]}</p>
      <h3 className="mt-0.5 line-clamp-2 text-[0.98rem] leading-7 font-semibold">
        <Link href={`/products/${p.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
          {p.title}
        </Link>
      </h3>
      <p className="text-sm text-muted">{productMeta(p)}</p>
      <div className="mt-1.5">{owned ? <span className="text-sm font-semibold text-success">في مكتبتك</span> : <PriceInline p={p} />}</div>
    </article>
  );
}

/** للتوافق: الشبكة القديمة أصبحت قائمة صفوف بعمودين على الشاشات الكبيرة */
export function ProductGrid({ products, ownedIds }: { products: ProductCardData[]; ownedIds?: Set<string> }) {
  return <ProductList products={products} ownedIds={ownedIds} columns={2} />;
}

/** رف أفقي على الجوال، وشبكة ملصقات على الشاشات الأكبر */
export function ProductShelf({ products, ownedIds }: { products: ProductCardData[]; ownedIds?: Set<string> }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {products.map((p) => (
        <div key={p.id} className="w-[68%] shrink-0 snap-start sm:w-auto">
          <ProductCard product={p} owned={ownedIds?.has(p.id)} />
        </div>
      ))}
    </div>
  );
}
